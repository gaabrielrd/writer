import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { Alert, Button, Dialog } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { bookLoreEditSession } from '../services/bookLoreEditService';
import { freezeBookLoreCreationData } from '../services/bookLoreWritePlan';
import type { BookLoreEditChange } from '../services/bookLoreWritePlan';
import type { DurableBookLoreCreationSnapshot } from '../services/bookLoreCreationDurableOperation';
import type { LoreMentionEntity } from '../model/loreEntity';
import { BookLoreLiteralFields } from './BookLoreLiteralFields';
import styles from './BookLoreManualEditor.module.css';

export interface BookLoreCreationEditorProps {
  open: boolean;
  bookId: string;
  resumeWriteId?: string;
  /** Literal seed for a new attempt; ignored when resuming a protected draft. */
  initialName?: string;
  entities?: readonly LoreMentionEntity[];
  onClose: () => void;
  onCreated?: (loreId: string) => void;
}
type Operation = ReturnType<ReturnType<typeof bookLoreEditSession>['createLore']>;
const initial = (name?: string) =>
  Object.freeze({ name: name ?? '', category: 'character', isPublic: false });
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível concluir. Seus dados foram preservados.';
/** Prepared host; mount only with coordinated native authoring entries. */
export function BookLoreCreationEditor(props: BookLoreCreationEditorProps) {
  const actor = useBookLoreActor();
  return props.open && actor !== null ? (
    <Content key={JSON.stringify([actor, props.bookId, props.resumeWriteId])} {...props} />
  ) : null;
}
function Content({
  bookId,
  resumeWriteId: originalResumeId,
  initialName,
  entities,
  onClose,
  onCreated,
}: BookLoreCreationEditorProps) {
  const [creatingNew, setCreatingNew] = useState(false),
    resumeWriteId = creatingNew ? undefined : originalResumeId,
    [data, setData] = useState<Readonly<Record<string, unknown>> | null>(() =>
      originalResumeId ? null : initial(initialName),
    ),
    [changes, setChanges] = useState<readonly BookLoreEditChange[]>([]),
    [state, setState] = useState<DurableBookLoreCreationSnapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [closingBusy, setClosingBusy] = useState(false),
    [hasOperation, setHasOperation] = useState(false),
    [confirm, setConfirm] = useState<'leave' | 'discard' | null>(null);
  const alive = useRef(true),
    epoch = useRef(0),
    stop = useRef(false),
    operation = useRef<Operation | null>(null),
    productionLock = useRef(false),
    closingLock = useRef(false),
    loreId = useRef<string | null>(null),
    notified = useRef(new Set<string>()),
    errorRef = useRef<HTMLDivElement>(null),
    warningRef = useRef<HTMLDivElement>(null),
    opener = useRef<HTMLElement | null>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    discardButton = useRef<HTMLButtonElement>(null);
  const current = () => alive.current;
  const blocker = useBlocker(
    (!!changes.length || hasOperation || !!resumeWriteId || busy || closingBusy) &&
      !state?.copyDiscarded &&
      state?.phase !== 'applied',
  );
  const leaving = confirm === 'leave' || blocker.state === 'blocked';
  const ask = (kind: 'leave' | 'discard') => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirm(kind);
  };
  const remain = () => {
    setConfirm(null);
    if (blocker.state === 'blocked') blocker.reset();
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
      else if (confirm === 'discard') discardButton.current?.focus();
      else closeButton.current?.focus();
    });
  };
  const leave = () => {
    stop.current = true;
    if (blocker.state === 'blocked') blocker.proceed();
    else onClose();
  };
  useEffect(() => {
    alive.current = true;
    const token = epoch.current;
    return () => {
      alive.current = false;
      epoch.current = token + 1;
      stop.current = true;
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (leaving || confirm === 'discard') warningRef.current?.focus();
  }, [leaving, confirm]);
  useEffect(() => {
    if (
      state?.phase === 'applied' ||
      state?.copyDiscarded ||
      (!changes.length && !busy && !closingBusy)
    )
      return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length, busy, closingBusy, state?.phase, state?.copyDiscarded]);
  function publish(op: Operation) {
    if (!current()) return;
    let s: DurableBookLoreCreationSnapshot;
    try {
      s = op.snapshot();
    } catch {
      return;
    }
    if (s.operation?.loreId) loreId.current = s.operation.loreId;
    setState(s);
    if (
      s.phase === 'applied' &&
      s.jobsClosed &&
      !s.savePending &&
      loreId.current &&
      !notified.current.has(s.writeId)
    ) {
      notified.current.add(s.writeId);
      onCreated?.(loreId.current);
    }
    return s;
  }
  async function existing() {
    if (operation.current) return operation.current;
    if (!resumeWriteId) throw Error('Prepare a ficha primeiro.');
    const token = epoch.current,
      session = bookLoreEditSession(() => current() && epoch.current === token),
      ticket = await session.creationTicket(resumeWriteId);
    if (!ticket || ticket.bookId !== bookId || ticket.writeId !== resumeWriteId)
      throw Error('Esta recuperação pertence a outro livro.');
    if (!current() || epoch.current !== token) throw Error('O contexto mudou.');
    if (operation.current) return operation.current;
    loreId.current = ticket.loreId;
    const op = session.resumeLoreCreation(resumeWriteId);
    operation.current = op;
    setHasOperation(true);
    return op;
  }
  async function drive(apply = false) {
    if (productionLock.current || closingLock.current) return;
    productionLock.current = true;
    stop.current = false;
    setBusy(true);
    setError('');
    const token = epoch.current;
    try {
      let op = operation.current;
      if (!op && !resumeWriteId) {
        if (!data) throw Error('O rascunho não está disponível.');
        const fields: Record<string, unknown> = { ...data };
        for (const change of changes) {
          if ('remove' in change) delete fields[change.field];
          else fields[change.field] = change.value;
        }
        const draft = freezeBookLoreCreationData(fields),
          session = bookLoreEditSession(() => current() && epoch.current === token);
        op = session.createLore({ writeId: crypto.randomUUID(), bookId, data: draft });
        operation.current = op;
        setHasOperation(true);
      }
      op ??= await existing();
      if (apply) await op.apply();
      else await op.initialize();
      if (!current() || stop.current || epoch.current !== token) return;
      let s = publish(op);
      if (!s) return;
      if (!data && s.hasRecoveryCopy && !s.requiresInput && !s.keyReleased) {
        const draft = await op.readDraft();
        if (!current() || stop.current || epoch.current !== token) return;
        if (draft.bookId !== bookId || draft.writeId !== s.writeId)
          throw Error('O rascunho pertence a outra preparação.');
        setData(draft.data);
        setChanges([]);
      }
      const verify =
        !apply &&
        (s.phase === 'resolving' ||
          s.operation?.pending.production?.method === 'adoptBookLoreEditGeneration');
      if (verify) {
        await op.advance();
        if (!current() || stop.current || epoch.current !== token) return;
        s = publish(op);
        if (!s) return;
      }
      while (
        current() &&
        !stop.current &&
        epoch.current === token &&
        !s.requiresInput &&
        !['cancelled', 'applied', 'conflict', 'resolving', 'ready'].includes(s.phase) &&
        (s.savePending || ['opening', 'preparing'].includes(s.phase))
      ) {
        await op.advance();
        if (!current() || stop.current || epoch.current !== token) return;
        s = publish(op);
        if (!s) return;
      }
    } catch (e) {
      if (current() && !stop.current && epoch.current === token) {
        setError(message(e));
        if (operation.current) publish(operation.current);
      }
    } finally {
      if (current() && epoch.current === token) {
        setBusy(false);
        productionLock.current = false;
      }
    }
  }
  async function closeOperation(discard = false) {
    if (closingLock.current) return;
    closingLock.current = true;
    stop.current = true;
    setClosingBusy(true);
    setError('');
    setConfirm(null);
    const token = epoch.current;
    try {
      const op = await existing();
      let rejected = 0;
      do {
        let s: DurableBookLoreCreationSnapshot;
        try {
          s = discard ? await op.discard() : await op.cancel();
        } catch (e) {
          if (
            current() &&
            epoch.current === token &&
            e &&
            typeof e === 'object' &&
            'code' in e &&
            ['failed-precondition', 'functions/failed-precondition'].includes(String(e.code)) &&
            ++rejected === 1
          )
            continue;
          throw e;
        }
        if (!current() || epoch.current !== token) return;
        publish(op);
        if (s.copyDiscarded) {
          setData(null);
          setChanges([]);
        }
        if ((discard ? s.copyDiscarded : s.jobsClosed) || s.phase === 'conflict') break;
      } while (current() && epoch.current === token);
    } catch (e) {
      if (current() && epoch.current === token) {
        setError(message(e));
        if (operation.current) publish(operation.current);
      }
    } finally {
      if (current() && epoch.current === token) {
        setClosingBusy(false);
        closingLock.current = false;
      }
    }
  }
  function close() {
    if (state?.copyDiscarded || state?.phase === 'applied') {
      onClose();
      return;
    }
    if (changes.length || hasOperation || resumeWriteId || busy || closingBusy) ask('leave');
    else onClose();
  }
  const readonly = hasOperation || !!resumeWriteId || busy || closingBusy,
    terminal = ['cancelled', 'applied', 'conflict'].includes(state?.phase ?? ''),
    pendingApply = state?.operation?.pending.production?.method === 'adoptBookLoreEditGeneration';
  return (
    <Dialog
      open
      title="Nova ficha de lore"
      description="Prepare os campos, revise e confirme a criação no livro."
      maxWidthClass="max-w-3xl"
      onClose={close}
      footer={
        <div className={styles.actions}>
          {leaving ? (
            <>
              <Button variant="secondary" onClick={remain}>
                Continuar aqui
              </Button>
              <Button onClick={leave}>
                {state?.hasRecoveryCopy
                  ? 'Fechar e manter recuperação'
                  : hasOperation || resumeWriteId
                    ? 'Fechar preparação'
                    : 'Sair sem salvar'}
              </Button>
            </>
          ) : confirm === 'discard' ? (
            <>
              <Button variant="secondary" onClick={remain}>
                Manter cópia
              </Button>
              <Button variant="destructive" onClick={() => void closeOperation(true)}>
                Confirmar descarte da cópia
              </Button>
            </>
          ) : (
            <>
              <Button ref={closeButton} variant="secondary" onClick={close}>
                Fechar
              </Button>
              {(hasOperation || resumeWriteId) && !state?.copyDiscarded && (
                <>
                  {!state?.jobsClosed && state?.phase !== 'conflict' && (
                    <Button
                      variant="secondary"
                      disabled={closingBusy}
                      onClick={() => void closeOperation()}
                    >
                      Cancelar preparação
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={closingBusy}
                    ref={discardButton}
                    onClick={() => ask('discard')}
                  >
                    Descartar cópia
                  </Button>
                </>
              )}
              {state?.phase === 'cancelled' &&
                data &&
                state.hasRecoveryCopy &&
                !state.keyReleased && (
                  <Button
                    disabled={busy || closingBusy}
                    onClick={() => {
                      operation.current = null;
                      setHasOperation(false);
                      setCreatingNew(true);
                      setState(null);
                      setError('');
                      loreId.current = null;
                    }}
                  >
                    Usar rascunho em nova criação
                  </Button>
                )}
              {!state?.copyDiscarded && (
                <>
                  {(pendingApply || state?.phase === 'resolving') && (
                    <Button
                      variant="secondary"
                      disabled={busy || closingBusy}
                      onClick={() => void drive()}
                    >
                      Verificar resultado
                    </Button>
                  )}
                  {state?.canApply ? (
                    <Button disabled={busy || closingBusy} onClick={() => void drive(true)}>
                      {pendingApply ? 'Confirmar criação' : 'Criar ficha'}
                    </Button>
                  ) : (
                    !terminal &&
                    state?.phase !== 'resolving' && (
                      <Button
                        disabled={
                          busy || closingBusy || (!data && !resumeWriteId) || state?.requiresInput
                        }
                        onClick={() => void drive()}
                      >
                        {busy
                          ? 'Preparando...'
                          : hasOperation || resumeWriteId
                            ? 'Retomar preparação'
                            : 'Preparar ficha'}
                      </Button>
                    )
                  )}
                  {state?.phase === 'cancelled' &&
                    !data &&
                    state.hasRecoveryCopy &&
                    !state.keyReleased && (
                      <Button disabled={busy || closingBusy} onClick={() => void drive()}>
                        Consultar rascunho
                      </Button>
                    )}
                </>
              )}
            </>
          )}
        </div>
      }
    >
      <div className={styles.fields}>
        {leaving && (
          <Alert ref={warningRef} tabIndex={-1} variant="warning" title="Fechar criação?">
            {state?.hasRecoveryCopy
              ? 'A cópia protegida e os pedidos pendentes serão mantidos para retomada.'
              : hasOperation || resumeWriteId
                ? 'Os controles serão mantidos. Texto ainda sem cópia confirmada pode ser perdido ao sair.'
                : 'Os campos estão somente nesta aba e serão perdidos ao sair.'}
          </Alert>
        )}
        {confirm === 'discard' && (
          <Alert
            ref={warningRef}
            tabIndex={-1}
            variant="warning"
            title="Descartar a cópia de recuperação?"
          >
            Uma ficha já criada será mantida no livro. Os pedidos serão encerrados antes de apagar a
            chave e a cópia deste dispositivo. Esta cópia não poderá ser recuperada.
          </Alert>
        )}
        {error && (
          <Alert
            ref={errorRef}
            tabIndex={-1}
            variant="destructive"
            title="Não foi possível concluir"
          >
            {error}
          </Alert>
        )}
        <p role="status" className={styles.status}>
          {state?.copyDiscarded
            ? 'Cópia removida deste dispositivo.'
            : closingBusy
              ? 'Encerrando a preparação...'
              : state?.phase === 'applied'
                ? 'Ficha criada no livro.'
                : state?.phase === 'conflict'
                  ? 'A criação exige revisão. A cópia foi preservada.'
                  : state?.phase === 'cancelled'
                    ? state.hasRecoveryCopy
                      ? 'Preparação cancelada. A cópia protegida foi mantida.'
                      : 'Preparação cancelada. A primeira cópia não chegou a ser confirmada.'
                    : state?.requiresInput
                      ? 'A primeira cópia não chegou a ser confirmada. Você pode encerrar esta preparação.'
                      : state?.phase === 'resolving' || pendingApply
                        ? 'Verifique o resultado do pedido de criação antes de continuar.'
                        : state?.canApply
                          ? 'Preparação concluída. Confira os campos antes de criar a ficha.'
                          : busy
                            ? 'Preparando a ficha e a cópia protegida...'
                            : resumeWriteId && !data
                              ? 'Retome para abrir a cópia protegida, ou encerre os pedidos sem abrir o texto.'
                              : hasOperation
                                ? 'Cópia protegida disponível neste dispositivo.'
                                : 'Até preparar, os campos ficam somente nesta aba.'}
        </p>
        {data && !state?.copyDiscarded && (
          <BookLoreLiteralFields
            source={{ data }}
            changes={changes}
            onChange={setChanges}
            disabled={readonly}
            entities={entities}
          />
        )}
      </div>
    </Dialog>
  );
}
