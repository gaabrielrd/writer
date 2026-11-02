import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { bookLoreRemovalSelectionSession } from '../services/bookLoreRemovalSelectionService';
import { freezeLoreEditValue } from '../services/bookLoreWritePlan';
import type { RemovalSelectionReview } from '../services/bookLoreRemovalSelectionReview';
import styles from './BookLoreManualEditor.module.css';

export interface BookLoreRemovalSelectionResult {
  phase: 'complete' | 'partial' | 'cancelled';
  total: number;
  conflicts: number;
  cancelled: number;
}
export interface BookLoreRemovalSelectionDialogProps {
  open: boolean;
  bookId: string;
  /** Origins from explicit v2 captures; changing props does not replace an open attempt. */
  targets?: readonly { readonly loreId: string; readonly sourceToken: string }[];
  resumeSelectionId?: string;
  onClose: () => void;
  onCompleted?: (removedIds: string[], result: BookLoreRemovalSelectionResult) => void;
}
type Operation = Awaited<
  ReturnType<ReturnType<typeof bookLoreRemovalSelectionSession>['createSelection']>
>;
type Snapshot = ReturnType<Operation['snapshot']>;
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível conferir a seleção.';
const finished = (phase?: string) => ['complete', 'partial', 'cancelled'].includes(phase ?? '');
const yieldControl = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function BookLoreRemovalSelectionDialog(props: BookLoreRemovalSelectionDialogProps) {
  const actor = useBookLoreActor();
  return props.open && actor !== null ? (
    <Content key={JSON.stringify([actor, props.bookId, props.resumeSelectionId])} {...props} />
  ) : null;
}
function Content({
  bookId,
  targets,
  resumeSelectionId,
  onClose,
  onCompleted,
}: BookLoreRemovalSelectionDialogProps) {
  const [original] = useState(() => {
    try {
      const value = freezeLoreEditValue(targets ?? []);
      if (!Array.isArray(value)) throw Error('Selecione as fichas para continuar.');
      return {
        targets: value as NonNullable<BookLoreRemovalSelectionDialogProps['targets']>,
        error: '',
      };
    } catch (e) {
      return { targets: [], error: message(e) };
    }
  });
  const [state, setState] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(!!resumeSelectionId),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [closingBusy, setClosingBusy] = useState(false),
    [cancelRetry, setCancelRetry] = useState(false),
    [allowResend, setAllowResend] = useState(false),
    [review, setReview] = useState<RemovalSelectionReview | null>(null),
    [reviewProgress, setReviewProgress] = useState(false),
    [error, setError] = useState(original.error);
  const alive = useRef(true),
    run = useRef(0),
    producer = useRef<number | null>(null),
    closing = useRef(false),
    id = useRef(resumeSelectionId),
    operation = useRef<Operation | null>(null),
    opening = useRef<Promise<Operation> | null>(null),
    owner = useRef<string | undefined>(undefined),
    notified = useRef(new Set<string>()),
    errorRef = useRef<HTMLDivElement>(null),
    warningRef = useRef<HTMLDivElement>(null),
    statusRef = useRef<HTMLParagraphElement>(null),
    reviewButton = useRef<HTMLButtonElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const active = (n: number) => alive.current && run.current === n;
  const invalidate = useCallback(() => {
    run.current++;
  }, []);
  const scope = useCallback(
    (s: Snapshot) => {
      if (
        s.identity.bookId !== bookId ||
        s.identity.selectionId !== id.current ||
        (owner.current !== undefined && s.identity.uid !== owner.current)
      )
        throw Error('A recuperação não pertence à seleção deste livro.');
    },
    [bookId],
  );
  const publish = useCallback(
    (op: Operation) => {
      const next = op.snapshot();
      scope(next);
      if (alive.current) setState(next);
      return next;
    },
    [scope],
  );
  const getOperation = useCallback(async () => {
    if (operation.current) return operation.current;
    if (!opening.current) {
      if (original.error) throw Error(original.error);
      const session = bookLoreRemovalSelectionSession(() => alive.current);
      owner.current = session.actor.uid;
      if (resumeSelectionId) opening.current = session.resumeSelection(bookId, resumeSelectionId);
      else {
        if (!original.targets.length) throw Error('Selecione ao menos uma ficha para continuar.');
        id.current ??= crypto.randomUUID();
        opening.current = session.createSelection({
          bookId,
          selectionId: id.current,
          members: original.targets,
        });
      }
    }
    const op = await opening.current;
    scope(op.snapshot());
    operation.current = op;
    return op;
  }, [bookId, original, resumeSelectionId, scope]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      invalidate();
    };
  }, [invalidate]);
  useEffect(() => {
    if (!resumeSelectionId) return;
    let live = true;
    void getOperation()
      .then((op) => {
        if (live) publish(op);
      })
      .catch((e: unknown) => {
        if (live) {
          opening.current = null;
          setError(message(e));
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [getOperation, publish, reload, resumeSelectionId]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (review) warningRef.current?.focus();
  }, [review]);
  useEffect(() => {
    if (finished(state?.phase)) statusRef.current?.focus();
  }, [state?.phase]);
  async function notify(op: Operation, n: number) {
    const s = op.snapshot();
    scope(s);
    if (
      !finished(s.phase) ||
      s.savePending ||
      s.verifiedCount !== s.count ||
      notified.current.has(s.identity.selectionId)
    )
      return;
    const ids: string[] = [];
    let total = 0;
    for (let index = 0; index < Math.ceil(s.count / 50); index++) {
      const page = await op.page(index);
      if (!active(n)) return;
      if (
        page.root.manifest.manifestHash !== s.manifestHash ||
        page.root.manifest.identity.bookId !== bookId ||
        page.root.manifest.identity.selectionId !== s.identity.selectionId ||
        page.root.manifest.identity.uid !== s.identity.uid
      )
        throw Error('O resultado não pertence à seleção.');
      for (const [offset, outcome] of page.outcomes.entries()) {
        if (!outcome) throw Error('O resultado da seleção ainda precisa ser conferido.');
        total++;
        if (outcome.kind === 'removed') ids.push(page.page.items[offset]!.loreId);
      }
    }
    if (total !== s.count || new Set(ids).size !== ids.length || ids.length !== s.recordedRemoved)
      throw Error('Não foi possível conferir os resultados da seleção.');
    if (!active(n)) return;
    notified.current.add(s.identity.selectionId);
    onCompleted?.(ids, {
      phase: s.phase as BookLoreRemovalSelectionResult['phase'],
      total: s.count,
      conflicts: s.recordedConflicts,
      cancelled: s.recordedCancelled,
    });
  }
  async function checkSelection() {
    if (producer.current !== null || closing.current || state?.savePending) return;
    const n = ++run.current;
    producer.current = n;
    setBusy(true);
    setReviewProgress(true);
    setReview(null);
    setError('');
    try {
      const op = await getOperation();
      if (!active(n)) return;
      publish(op);
      const checked = await bookLoreRemovalSelectionSession(() => active(n)).review(op);
      if (!active(n)) return;
      const s = publish(op);
      if (
        checked.selectionId !== s.identity.selectionId ||
        checked.manifestHash !== s.manifestHash ||
        checked.count !== s.count
      )
        throw Error('A revisão não pertence à seleção.');
      setReview(checked);
    } catch (e) {
      if (active(n)) {
        opening.current = operation.current ? opening.current : null;
        setError(message(e));
      }
    } finally {
      if (active(n)) {
        producer.current = null;
        setBusy(false);
        setReviewProgress(false);
      }
    }
  }
  async function drive(kind: 'apply' | 'verify' | 'retry') {
    if (producer.current !== null || closing.current) return;
    if (kind !== 'verify' && (!review || (kind === 'retry' && !allowResend))) return;
    const n = ++run.current;
    producer.current = n;
    setBusy(true);
    setError('');
    setReview(null);
    if (kind === 'verify') setAllowResend(false);
    try {
      const op = await getOperation();
      if (!active(n)) return;
      let first = true;
      while (active(n)) {
        const before = op.snapshot();
        scope(before);
        if (kind === 'apply') await op.apply();
        else if (kind === 'retry' && first) await op.retry();
        else await op.advance();
        if (!active(n)) return;
        const next = publish(op);
        if (
          kind === 'verify' &&
          before.phase === 'uncertain' &&
          next.phase === 'uncertain' &&
          !before.savePending &&
          !next.savePending
        )
          setAllowResend(true);
        if (
          before.savePending ||
          next.savePending ||
          finished(next.phase) ||
          next.phase === 'uncertain' ||
          (kind !== 'apply' && next.phase === 'ready')
        )
          break;
        first = false;
        await yieldControl();
      }
      if (active(n)) await notify(op, n);
    } catch (e) {
      if (active(n)) {
        if (operation.current) publish(operation.current);
        else opening.current = null;
        setAllowResend(false);
        setError(message(e));
      }
    } finally {
      if (active(n)) {
        producer.current = null;
        setBusy(false);
      }
    }
  }
  async function cancel() {
    if (closing.current || !id.current) return;
    const n = ++run.current;
    producer.current = null;
    closing.current = true;
    setBusy(false);
    setReviewProgress(false);
    setReview(null);
    setClosingBusy(true);
    setError('');
    setAllowResend(false);
    try {
      const session = bookLoreRemovalSelectionSession(() => alive.current);
      owner.current = session.actor.uid;
      const fresh = await session.resumeSelection(bookId, id.current);
      if (!active(n)) return;
      scope(fresh.snapshot());
      operation.current = fresh;
      opening.current = Promise.resolve(fresh);
      await fresh.cancel();
      while (active(n)) {
        const next = publish(fresh);
        if (next.savePending || finished(next.phase)) break;
        await yieldControl();
        await fresh.advance();
      }
      if (active(n)) {
        setCancelRetry(false);
        await notify(fresh, n);
      }
    } catch (e) {
      if (active(n)) {
        setCancelRetry(true);
        if (operation.current) publish(operation.current);
        setError(message(e));
      }
    } finally {
      closing.current = false;
      if (active(n)) setClosingBusy(false);
    }
  }
  const close = () => {
    invalidate();
    onClose();
  };
  const back = () => {
    setReview(null);
    requestAnimationFrame(() => (reviewButton.current ?? closeButton.current)?.focus());
  };
  const phase = state?.phase,
    count = state?.count ?? original.targets.length,
    terminal = finished(phase),
    blocked = busy || closingBusy,
    canReview =
      !terminal &&
      phase !== 'verifying' &&
      !state?.cancelRequested &&
      (phase !== 'uncertain' || allowResend) &&
      !state?.savePending &&
      !cancelRetry,
    status = state?.savePending
      ? 'A recuperação aguarda gravação neste dispositivo.'
      : closingBusy || phase === 'cancelling'
        ? 'Conferindo o cancelamento da seleção...'
        : reviewProgress
          ? 'Conferindo os nomes e as origens das fichas...'
          : busy
            ? 'Conferindo o progresso da seleção...'
            : phase === 'complete'
              ? `${state!.recordedRemoved} de ${count} fichas retiradas.`
              : phase === 'partial'
                ? `${state!.recordedRemoved} de ${count} fichas retiradas. Há fichas com conflito para revisar em uma nova seleção.`
                : phase === 'cancelled'
                  ? `Operação cancelada. ${state!.recordedRemoved} retiradas já aceitas foram preservadas.`
                  : phase === 'verifying'
                    ? 'Há resultados registrados neste dispositivo. Verifique para confirmar.'
                    : phase === 'uncertain'
                      ? 'O resultado de um pedido ainda não foi confirmado. Verifique antes de decidir reenviar.'
                      : phase === 'resolving-conflict'
                        ? 'Uma ficha mudou. O encerramento do pedido precisa ser conferido.'
                        : 'Confira as fichas pendentes antes de confirmar a retirada.';
  return (
    <Dialog
      open
      title="Retirar seleção de fichas"
      onClose={close}
      footer={
        <div className={styles.actions}>
          <Button ref={closeButton} variant="secondary" onClick={close}>
            Fechar
          </Button>
          {state && !terminal && (
            <Button variant="ghost" disabled={closingBusy} onClick={() => void cancel()}>
              {cancelRetry ? 'Repetir cancelamento' : 'Cancelar operação'}
            </Button>
          )}
          {!loading &&
            (review ? (
              <>
                <Button variant="secondary" disabled={blocked} onClick={back}>
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  disabled={blocked}
                  onClick={() => void drive(phase === 'uncertain' ? 'retry' : 'apply')}
                >
                  {phase === 'uncertain'
                    ? 'Reenviar pedido desta ficha'
                    : 'Confirmar retirada da seleção'}
                </Button>
              </>
            ) : (
              <>
                {state && (
                  <Button disabled={blocked || cancelRetry} onClick={() => void drive('verify')}>
                    {state.savePending
                      ? 'Salvar recuperação'
                      : terminal
                        ? 'Conferir resultado'
                        : 'Verificar progresso'}
                  </Button>
                )}
                {canReview && (
                  <Button
                    ref={reviewButton}
                    disabled={blocked || !count || !!original.error}
                    onClick={() => void checkSelection()}
                  >
                    {phase === 'uncertain' ? 'Revisar reenvio' : 'Conferir seleção'}
                  </Button>
                )}
              </>
            ))}
        </div>
      }
    >
      <div className={styles.fields}>
        {loading ? (
          <LoadingState label="Abrindo a recuperação da seleção..." />
        ) : (
          <>
            <p>
              {count} {count === 1 ? 'ficha nesta seleção' : 'fichas nesta seleção'}
            </p>
            {!count && !error && (
              <EmptyState
                title="Nenhuma ficha selecionada"
                description="Selecione fichas no compêndio para conferir uma retirada."
              />
            )}
            <p ref={statusRef} tabIndex={-1} role="status">
              {status}
            </p>
            {state && (
              <p className={styles.status}>
                Retiradas registradas: {state.recordedRemoved}. Conflitos registrados:{' '}
                {state.recordedConflicts}.
              </p>
            )}
            {(busy || closingBusy) && (
              <LoadingState
                label={reviewProgress ? 'Conferindo a seleção...' : 'Conferindo a operação...'}
              />
            )}
            {error && (
              <div ref={errorRef} tabIndex={-1}>
                <ErrorState
                  title="Não foi possível concluir"
                  description={error}
                  action={
                    resumeSelectionId && !state ? (
                      <Button
                        onClick={() => {
                          setError('');
                          setLoading(true);
                          setReload((v) => v + 1);
                        }}
                      >
                        Tentar novamente
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            )}
            {review && (
              <div ref={warningRef} tabIndex={-1} className={styles.fields}>
                <Alert variant="warning" title="Confirmar retirada irreversível?">
                  As fichas pendentes abaixo serão retiradas deste livro. O processo confirma cada
                  ficha separadamente; as que falharem continuam disponíveis para revisar. Retiradas
                  já aceitas não são desfeitas ao cancelar. Se houver fichas públicas, poderá ser
                  necessário republicar o livro.
                </Alert>
                <ul className={styles.list} aria-label="Fichas conferidas">
                  {review.members.map((m) => (
                    <li key={m.index} className={styles.row}>
                      <span className={styles.label}>{m.name || 'Sem nome'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {phase === 'uncertain' && allowResend && !review && (
              <Alert variant="warning">
                A consulta ainda não encontrou confirmação. Reenviar exige revisar a mesma ficha e
                confirmar novamente.
              </Alert>
            )}
            {state && (
              <p className={styles.status}>
                Você pode fechar e retomar em Seleções neste dispositivo.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
