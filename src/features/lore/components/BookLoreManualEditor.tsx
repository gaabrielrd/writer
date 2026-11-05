import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { Alert, Button, Dialog, ErrorState, LoadingState } from '@/shared/ui';
import { bookLoreReadSession } from '../services/bookLoreReadService';
import { bookLoreEditSession } from '../services/bookLoreEditService';
import {
  planBookLoreEdit,
  type BookLoreEditSource,
  type BookLoreEditChange,
} from '../services/bookLoreWritePlan';
import type { BookLoreManualSnapshot } from '../services/bookLoreManualOperation';
import type { LoreMentionEntity } from '../model/loreEntity';
import { BookLoreLiteralFields } from './BookLoreLiteralFields';
import { loreFieldLabels } from '../model/loreManualFields';
import styles from './BookLoreManualEditor.module.css';
export interface BookLoreManualEditorProps {
  open: boolean;
  bookId: string;
  loreId: string;
  resumeWriteId?: string;
  entities?: readonly LoreMentionEntity[];
  onClose: () => void;
  onApplied?: () => void;
}
type Operation = ReturnType<ReturnType<typeof bookLoreEditSession>['manual']>;
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível concluir. Seus dados foram preservados.';
/** Ready for coordinated authoring rollout; intentionally not mounted by legacy entries. */
export function BookLoreManualEditor(props: BookLoreManualEditorProps) {
  const actorKey = useBookLoreActor();
  return props.open && actorKey !== null ? (
    <Content
      key={JSON.stringify([actorKey, props.bookId, props.loreId, props.resumeWriteId])}
      {...props}
    />
  ) : null;
}
function Content({
  bookId,
  loreId,
  resumeWriteId: originalResumeId,
  entities,
  onClose,
  onApplied,
}: BookLoreManualEditorProps) {
  const [creatingNew, setCreatingNew] = useState(false),
    resumeWriteId = creatingNew ? undefined : originalResumeId;
  const [source, setSource] = useState<BookLoreEditSource | null>(null),
    [changes, setChanges] = useState<readonly BookLoreEditChange[]>([]),
    [loading, setLoading] = useState(!originalResumeId),
    [error, setError] = useState(''),
    [state, setState] = useState<BookLoreManualSnapshot | null>(null),
    [busy, setBusy] = useState(false),
    [closingBusy, setClosingBusy] = useState(false),
    [confirm, setConfirm] = useState<'leave' | 'discard' | null>(null),
    [reload, setReload] = useState(0),
    [hasOperation, setHasOperation] = useState(false);
  const epoch = useRef(0),
    alive = useRef(true),
    operation = useRef<Operation | null>(null),
    stop = useRef(false),
    notified = useRef(new Set<string>()),
    productionLock = useRef(false),
    closingLock = useRef(false),
    errorRef = useRef<HTMLDivElement>(null),
    warningRef = useRef<HTMLDivElement>(null),
    confirmationOpener = useRef<HTMLElement | null>(null);
  const current = () => alive.current;
  const blocker = useBlocker(
    (changes.length > 0 || hasOperation || busy || closingBusy) && !state?.copyDiscarded,
  );
  const leaving = confirm === 'leave' || blocker.state === 'blocked';
  const remain = () => {
    setConfirm(null);
    if (blocker.state === 'blocked') blocker.reset();
    requestAnimationFrame(() => confirmationOpener.current?.focus());
  };
  const ask = (kind: 'leave' | 'discard') => {
    confirmationOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirm(kind);
  };
  useEffect(() => {
    if (leaving || confirm === 'discard') warningRef.current?.focus();
  }, [leaving, confirm]);
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
    if (originalResumeId) return;
    let live = true;
    const session = bookLoreReadSession(() => live && current());
    void session
      .capture(bookId, loreId)
      .then((value) => {
        if (!live) return;
        if (!value) throw Error('A ficha não está disponível.');
        setSource(value);
      })
      .catch((e) => {
        if (live) setError(message(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [bookId, loreId, originalResumeId, reload]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!changes.length && !busy && !closingBusy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changes.length, busy, closingBusy]);
  function publish(op: Operation) {
    if (!current()) return;
    let s: BookLoreManualSnapshot;
    try {
      s = op.snapshot();
    } catch {
      return;
    }
    setState(s);
    if (s.phase === 'applied' && !s.savePending && !notified.current.has(s.writeId)) {
      notified.current.add(s.writeId);
      onApplied?.();
    }
    return s;
  }
  async function existing() {
    if (operation.current) return operation.current;
    const token = epoch.current,
      session = bookLoreEditSession(() => current() && epoch.current === token);
    if (!resumeWriteId) throw Error('Prepare as alterações primeiro.');
    const ticket = await session.preparation(resumeWriteId);
    if (!ticket || ticket.intent.bookId !== bookId || ticket.intent.loreId !== loreId)
      throw Error('Esta recuperação pertence a outra ficha.');
    if (!current() || epoch.current !== token) throw Error('O contexto mudou.');
    if (operation.current) return operation.current;
    const op = session.resumeManual(resumeWriteId);
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
        if (!source) throw Error('Aguarde a ficha carregar.');
        if (planBookLoreEdit(source, changes).empty) {
          setChanges([]);
          return;
        }
        const session = bookLoreEditSession(() => current() && epoch.current === token);
        op = session.manual({ writeId: crypto.randomUUID(), source, changes });
        operation.current = op;
        setHasOperation(true);
      }
      op ??= await existing();
      if (apply) await op.apply();
      else await op.initialize();
      if (!current() || stop.current || epoch.current !== token) return;
      let s = publish(op)!;
      if (!source && s.hasRecoveryCopy && !s.requiresInput && !s.keyReleased) {
        const draft = await op.readDraft();
        if (!current() || stop.current || epoch.current !== token) return;
        if (draft.source.bookId !== bookId || draft.source.id !== loreId)
          throw Error('O rascunho pertence a outra ficha.');
        setSource(draft.source);
        setChanges(draft.changes);
      }
      while (
        current() &&
        !stop.current &&
        epoch.current === token &&
        !s.requiresInput &&
        s.phase !== 'cancelled' &&
        (s.savePending || ['opening', 'reserving', 'preparing'].includes(s.phase))
      ) {
        await op.advance();
        if (!current() || stop.current) return;
        s = publish(op)!;
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
  async function closeOperation(discard: boolean) {
    if (closingLock.current) return;
    closingLock.current = true;
    stop.current = true;
    setClosingBusy(true);
    setError('');
    setConfirm(null);
    const token = epoch.current;
    try {
      const op = await existing();
      do {
        const s = discard ? await op.discard() : await op.cancel();
        if (!current() || epoch.current !== token) return;
        publish(op);
        if (s.copyDiscarded) {
          setSource(null);
          setChanges([]);
        }
        if (discard ? s.copyDiscarded : ['cancelled', 'applied'].includes(s.phase)) break;
      } while (current());
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
    if (state?.copyDiscarded) {
      onClose();
      return;
    }
    if (changes.length || hasOperation || resumeWriteId || busy || closingBusy) ask('leave');
    else onClose();
  }
  const readonly = hasOperation || !!resumeWriteId || busy || closingBusy;
  return (
    <Dialog
      open
      title="Editar lore do livro"
      description="Prepare as alterações, revise e confirme a aplicação na ficha."
      maxWidthClass="max-w-5xl"
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
              <Button variant="secondary" onClick={close}>
                Fechar
              </Button>
              {(hasOperation || resumeWriteId) && !state?.copyDiscarded && (
                <>
                  <Button
                    variant="secondary"
                    disabled={closingBusy}
                    onClick={() => void closeOperation(false)}
                  >
                    Cancelar edição
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={closingBusy}
                    onClick={() => ask('discard')}
                  >
                    Descartar cópia
                  </Button>
                </>
              )}
              {state?.phase === 'cancelled' &&
                source &&
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
                    }}
                  >
                    Usar rascunho em nova preparação
                  </Button>
                )}
              {!state?.copyDiscarded && (
                <>
                  {state?.canApply ? (
                    <Button disabled={busy || closingBusy} onClick={() => void drive(true)}>
                      Aplicar alterações
                    </Button>
                  ) : (
                    !['cancelled', 'applied'].includes(state?.phase ?? '') && (
                      <Button
                        disabled={
                          busy ||
                          closingBusy ||
                          loading ||
                          (!source && !resumeWriteId) ||
                          state?.requiresInput
                        }
                        onClick={() => void drive()}
                      >
                        {busy
                          ? 'Preparando...'
                          : hasOperation || resumeWriteId
                            ? 'Retomar preparação'
                            : 'Preparar alterações'}
                      </Button>
                    )
                  )}
                </>
              )}
            </>
          )}
        </div>
      }
    >
      <div className={styles.fields}>
        {busy && !state && (
          <p role="status">Preparando a cópia protegida. A confirmação ainda está pendente.</p>
        )}
        {changes.length > 0 && (
          <p className={styles.status}>
            Campos com alterações: {changes.map((c) => loreFieldLabels[c.field]).join(', ')}.
          </p>
        )}
        {leaving && (
          <Alert ref={warningRef} tabIndex={-1} variant="warning" title="Fechar edição?">
            {state?.hasRecoveryCopy
              ? 'A cópia protegida e os pedidos pendentes serão mantidos para retomada.'
              : hasOperation || resumeWriteId
                ? 'Os controles da preparação serão mantidos. Texto ainda sem cópia confirmada pode ser perdido ao sair.'
                : 'As alterações ainda estão somente nesta aba e serão perdidas ao sair.'}
          </Alert>
        )}
        {confirm === 'discard' && (
          <Alert
            ref={warningRef}
            tabIndex={-1}
            variant="warning"
            title="Descartar a cópia de recuperação?"
          >
            O texto já aplicado à ficha será mantido. Os pedidos serão encerrados antes de apagar a
            chave e a cópia deste dispositivo. Esta cópia não poderá ser recuperada.
          </Alert>
        )}
        {loading && <LoadingState label="Carregando ficha completa..." />}
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
        {!loading && !source && !resumeWriteId && error && (
          <ErrorState
            title="Ficha indisponível"
            description="Tente carregar novamente."
            action={
              <Button
                onClick={() => {
                  setLoading(true);
                  setError('');
                  setReload((n) => n + 1);
                }}
              >
                Tentar novamente
              </Button>
            }
          />
        )}
        {state && (
          <p role="status" className={styles.status}>
            {state.copyDiscarded
              ? 'Cópia removida deste dispositivo.'
              : closingBusy
                ? 'Encerrando pedidos e preparando o descarte...'
                : state.phase === 'applied'
                  ? 'Alterações aplicadas à ficha.'
                  : state.phase === 'cancelled'
                    ? state.hasRecoveryCopy
                      ? 'Edição cancelada. A cópia protegida foi mantida.'
                      : 'Edição cancelada. O texto não chegou a ser confirmado na cópia protegida.'
                    : state.requiresInput
                      ? 'O texto não chegou a ser confirmado neste dispositivo. Você pode encerrar esta preparação.'
                      : state.canApply
                        ? 'Preparação concluída. Confira os campos antes de aplicar.'
                        : state.hasRecoveryCopy
                          ? 'Cópia protegida disponível neste dispositivo.'
                          : 'A cópia protegida ainda não foi confirmada.'}
          </p>
        )}
        {!hasOperation && !resumeWriteId && source && (
          <p className={styles.status}>Até preparar, as alterações ficam somente nesta aba.</p>
        )}
        {source && !state?.copyDiscarded && (
          <BookLoreLiteralFields
            source={source}
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
