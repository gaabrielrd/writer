import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { bookLoreVisibilitySelectionSession } from '../services/bookLoreVisibilitySelectionService';
import { freezeLoreEditValue } from '../services/bookLoreWritePlan';
import type { VisibilitySelectionReview } from '../services/bookLoreVisibilitySelectionReview';
import styles from './BookLoreManualEditor.module.css';

export interface BookLoreVisibilitySelectionResult {
  phase: 'complete' | 'partial' | 'cancelled';
  total: number;
  value: boolean;
  applied: number;
  unchanged: number;
  unchangedIds: string[];
  conflicts: number;
  cancelled: number;
}
export interface BookLoreVisibilitySelectionDialogProps {
  open: boolean;
  bookId: string;
  /** Origins from explicit v2 captures; changing props does not replace an open attempt. */
  value?: boolean;
  targets?: readonly { readonly loreId: string; readonly sourceToken: string }[];
  resumeSelectionId?: string;
  onClose: () => void;
  onCompleted?: (appliedIds: string[], result: BookLoreVisibilitySelectionResult) => void;
}
type Operation = Awaited<
  ReturnType<ReturnType<typeof bookLoreVisibilitySelectionSession>['createSelection']>
>;
type Snapshot = ReturnType<Operation['snapshot']>;
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível conferir a seleção.';
const finished = (phase?: string) => ['complete', 'partial', 'cancelled'].includes(phase ?? '');
const yieldControl = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function BookLoreVisibilitySelectionDialog(props: BookLoreVisibilitySelectionDialogProps) {
  const actor = useBookLoreActor();
  return props.open && actor !== null ? (
    <Content key={JSON.stringify([actor, props.bookId, props.resumeSelectionId])} {...props} />
  ) : null;
}
function Content({
  bookId,
  value,
  targets,
  resumeSelectionId,
  onClose,
  onCompleted,
}: BookLoreVisibilitySelectionDialogProps) {
  const [original] = useState(() => {
    try {
      const capturedTargets = freezeLoreEditValue(targets ?? []);
      if (!Array.isArray(capturedTargets)) throw Error('Selecione as fichas para continuar.');
      if (!resumeSelectionId && typeof value !== 'boolean')
        throw Error('Escolha a visibilidade da seleção.');
      return {
        targets: capturedTargets as NonNullable<BookLoreVisibilitySelectionDialogProps['targets']>,
        value: typeof value === 'boolean' ? value : undefined,
        error: '',
      };
    } catch (e) {
      return { targets: [], value: undefined, error: message(e) };
    }
  });
  const [state, setState] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(!!resumeSelectionId),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [closingBusy, setClosingBusy] = useState(false),
    [cancelRetry, setCancelRetry] = useState(false),
    [allowResend, setAllowResend] = useState(false),
    [review, setReview] = useState<VisibilitySelectionReview | null>(null),
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
    targetValue = useRef<boolean | undefined>(resumeSelectionId ? undefined : original.value),
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
        typeof s.value !== 'boolean' ||
        (targetValue.current !== undefined && s.value !== targetValue.current) ||
        s.identity.bookId !== bookId ||
        s.identity.selectionId !== id.current ||
        (owner.current !== undefined && s.identity.uid !== owner.current)
      )
        throw Error('A recuperação não pertence à seleção deste livro.');
      targetValue.current ??= s.value;
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
      const session = bookLoreVisibilitySelectionSession(() => alive.current);
      owner.current = session.actor.uid;
      if (resumeSelectionId) opening.current = session.resumeSelection(bookId, resumeSelectionId);
      else {
        if (!original.targets.length) throw Error('Selecione ao menos uma ficha para continuar.');
        id.current ??= crypto.randomUUID();
        opening.current = session.createSelection({
          bookId,
          selectionId: id.current,
          value: original.value!,
          members: [...original.targets],
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
    const current = op.snapshot();
    scope(current);
    if (
      !finished(current.phase) ||
      current.savePending ||
      current.verifiedCount !== current.count ||
      notified.current.has(current.identity.selectionId)
    )
      return;
    const appliedIds: string[] = [],
      unchangedIds: string[] = [],
      all = new Set<string>();
    let conflicts = 0,
      cancelled = 0;
    for (let index = 0; index < Math.ceil(current.count / 50); index++) {
      const batch = await op.page(index);
      if (!active(n)) return;
      if (
        batch.root.manifest.manifestHash !== current.manifestHash ||
        batch.root.manifest.value !== current.value ||
        batch.root.manifest.identity.bookId !== bookId ||
        batch.root.manifest.identity.selectionId !== current.identity.selectionId ||
        batch.root.manifest.identity.uid !== current.identity.uid ||
        batch.states.length !== batch.page.items.length
      )
        throw Error('O resultado não pertence à seleção.');
      for (const [offset, row] of batch.states.entries()) {
        const member = batch.page.items[offset]!,
          outcome = row.outcome;
        if (!outcome || all.has(member.loreId))
          throw Error('O resultado da seleção ainda precisa ser conferido.');
        all.add(member.loreId);
        if (outcome.kind === 'applied') appliedIds.push(member.loreId);
        else if (outcome.kind === 'unchanged') unchangedIds.push(member.loreId);
        else if (outcome.kind === 'conflict') conflicts++;
        else if (outcome.kind === 'cancelled') cancelled++;
        else throw Error('Resultado de visibilidade inválido.');
      }
    }
    if (
      all.size !== current.count ||
      appliedIds.length !== current.recordedApplied ||
      unchangedIds.length !== current.recordedUnchanged ||
      conflicts !== current.recordedConflicts ||
      cancelled !== current.recordedCancelled
    )
      throw Error('Não foi possível conferir os resultados da seleção.');
    if (!active(n)) return;
    notified.current.add(current.identity.selectionId);
    onCompleted?.(appliedIds, {
      phase: current.phase as BookLoreVisibilitySelectionResult['phase'],
      total: current.count,
      value: current.value,
      applied: appliedIds.length,
      unchanged: unchangedIds.length,
      unchangedIds,
      conflicts,
      cancelled,
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
      const checked = await bookLoreVisibilitySelectionSession(() => active(n)).review(op);
      if (!active(n)) return;
      const s = publish(op);
      if (
        checked.selectionId !== s.identity.selectionId ||
        checked.manifestHash !== s.manifestHash ||
        checked.count !== s.count ||
        checked.value !== s.value ||
        (checked.mode === 'retry' && !s.canRetry)
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
    if (
      kind !== 'verify' &&
      (!review || (kind === 'retry' && (!allowResend || review.mode !== 'retry')))
    )
      return;
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
        if (kind === 'verify') setAllowResend(next.canRetry && !next.savePending);
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
      const session = bookLoreVisibilitySelectionSession(() => alive.current);
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
  const desired = state?.value ?? (resumeSelectionId ? undefined : original.value),
    phase = state?.phase,
    count = state?.count ?? original.targets.length,
    terminal = finished(phase),
    blocked = busy || closingBusy,
    canReview =
      !terminal &&
      phase !== 'verifying' &&
      phase !== 'resolving-conflict' &&
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
              ? `Visibilidade concluída. Alterações aplicadas: ${state!.recordedApplied}. Sem mudança: ${state!.recordedUnchanged}.`
              : phase === 'partial'
                ? `Alterações aplicadas: ${state!.recordedApplied}. Sem mudança: ${state!.recordedUnchanged}. Há fichas com conflito para revisar em uma nova seleção.`
                : phase === 'cancelled'
                  ? `Operação cancelada. Alterações já aceitas preservadas: ${state!.recordedApplied}. Sem mudança: ${state!.recordedUnchanged}.`
                  : phase === 'verifying'
                    ? 'Há resultados registrados neste dispositivo. Verifique para confirmar.'
                    : phase === 'uncertain'
                      ? 'O resultado de um pedido ainda não foi confirmado. Verifique antes de decidir reenviar.'
                      : phase === 'resolving-conflict'
                        ? 'Conferindo o encerramento de uma ficha...'
                        : 'Confira as fichas pendentes antes de confirmar a visibilidade.';
  return (
    <Dialog
      open
      title="Visibilidade da seleção"
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
                  variant="primary"
                  disabled={blocked}
                  onClick={() => void drive(review.mode === 'retry' ? 'retry' : 'apply')}
                >
                  {review.mode === 'retry'
                    ? 'Reenviar pedido desta ficha'
                    : 'Confirmar visibilidade da seleção'}
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
            {desired !== undefined && (
              <p>Visibilidade desejada: {desired ? 'Pública' : 'Privada'}</p>
            )}
            <p>
              {count} {count === 1 ? 'ficha nesta seleção' : 'fichas nesta seleção'}
            </p>
            {!count && !error && (
              <EmptyState
                title="Nenhuma ficha selecionada"
                description="Selecione fichas no compêndio para conferir sua visibilidade."
              />
            )}
            <p ref={statusRef} tabIndex={-1} role="status">
              {status}
            </p>
            {state && (
              <p className={styles.status}>
                Alterações registradas: {state.recordedApplied}. Sem mudança:{' '}
                {state.recordedUnchanged}. Conflitos registrados: {state.recordedConflicts}.
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
                <Alert variant="warning" title="Confirmar visibilidade?">
                  As fichas conferidas ficarão {review.value ? 'públicas' : 'privadas'}. Fichas
                  públicas podem aparecer na publicação do livro. Esta ação não publica nem
                  republica automaticamente; tornar fichas privadas pode exigir republicar o livro.
                  A seleção é processada ficha a ficha, incluindo as que já estão nesta
                  visibilidade. Cancelar preserva as alterações já aceitas.
                </Alert>
                <ul className={styles.list} aria-label="Fichas conferidas">
                  {review.members.map((m) => (
                    <li key={m.index} className={styles.row}>
                      <div className={styles.label}>
                        <span>{m.name || 'Sem nome'}</span>
                        <p className={styles.status}>
                          {m.currentValue === null
                            ? 'Privada por padrão'
                            : m.currentValue
                              ? 'Pública'
                              : 'Privada'}
                          {' → '}
                          {review.value ? 'Pública' : 'Privada'}
                        </p>
                      </div>
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
                Você pode fechar e retomar em Visibilidade neste dispositivo.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
