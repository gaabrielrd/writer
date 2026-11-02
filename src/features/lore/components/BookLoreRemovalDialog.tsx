import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, ErrorState, LoadingState } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { bookLoreRemovalSession } from '../services/bookLoreRemovalService';
import styles from './BookLoreManualEditor.module.css';

export interface BookLoreRemovalDialogProps {
  open: boolean;
  bookId: string;
  loreId: string;
  /** New attempts require the token and display name from the same raw C1 capture. */
  sourceToken?: string;
  entityName?: string;
  resumeWriteId?: string;
  onClose: () => void;
  onRemoved?: (loreId: string) => void;
}
type Operation = Awaited<ReturnType<ReturnType<typeof bookLoreRemovalSession>['createRemoval']>>;
type Snapshot = ReturnType<Operation['snapshot']>;
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível concluir a operação.';
function scope(s: Snapshot, bookId: string, loreId: string, writeId?: string) {
  if (
    s.identity.bookId !== bookId ||
    s.identity.loreId !== loreId ||
    s.identity.writeId !== writeId
  )
    throw Error('A recuperação não pertence à ficha selecionada.');
}
export function BookLoreRemovalDialog(props: BookLoreRemovalDialogProps) {
  const actor = useBookLoreActor();
  return props.open && actor !== null ? (
    <Content
      key={JSON.stringify([
        actor,
        props.bookId,
        props.loreId,
        props.sourceToken,
        props.resumeWriteId,
      ])}
      {...props}
    />
  ) : null;
}
function Content({
  bookId,
  loreId,
  sourceToken,
  entityName,
  resumeWriteId,
  onClose,
  onRemoved,
}: BookLoreRemovalDialogProps) {
  const [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [sourceChecked, setSourceChecked] = useState(false),
    [hasRecovery, setHasRecovery] = useState(false),
    [state, setState] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [work, setWork] = useState<'prepare' | 'verify' | 'apply' | 'review' | null>(null),
    [closingBusy, setClosingBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [allowResend, setAllowResend] = useState(false),
    [cancelRetry, setCancelRetry] = useState(false),
    [error, setError] = useState('');
  const alive = useRef(true),
    run = useRef(0),
    producer = useRef<number | null>(null),
    closing = useRef(false),
    operation = useRef<Operation | null>(null),
    opening = useRef<Promise<Operation> | null>(null),
    writeId = useRef(resumeWriteId),
    notified = useRef(new Set<string>()),
    errorRef = useRef<HTMLDivElement>(null),
    warningRef = useRef<HTMLDivElement>(null),
    statusRef = useRef<HTMLParagraphElement>(null),
    reviewButton = useRef<HTMLButtonElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const invalidate = useCallback(() => {
    run.current++;
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      invalidate();
    };
  }, [invalidate]);
  useEffect(() => {
    let live = true;
    const guard = () => live && alive.current;
    void (async () => {
      const session = bookLoreRemovalSession(guard);
      if (resumeWriteId) {
        const promise = session.resumeRemoval(bookId, resumeWriteId);
        opening.current = promise;
        const op = await promise,
          next = op.snapshot();
        scope(next, bookId, loreId, resumeWriteId);
        if (guard()) {
          operation.current = op;
          setHasRecovery(true);
          setState(next);
        }
      } else {
        if (!sourceToken) throw Error('Selecione novamente a ficha para conferir sua origem.');
        const view = await session.metadata(bookId, loreId, sourceToken);
        if (!view) throw Error('A ficha selecionada está indisponível.');
        if (guard()) setSourceChecked(true);
      }
    })()
      .catch((e: unknown) => {
        if (guard()) {
          opening.current = null;
          setError(message(e));
        }
      })
      .finally(() => {
        if (guard()) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [bookId, loreId, sourceToken, resumeWriteId, retry]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (reviewed) warningRef.current?.focus();
  }, [reviewed]);
  useEffect(() => {
    if (state?.phase === 'complete' || state?.phase === 'cancelled') statusRef.current?.focus();
  }, [state?.phase]);
  const active = (n: number) => alive.current && run.current === n;
  const publish = (op: Operation) => {
    const next = op.snapshot();
    scope(next, bookId, loreId, writeId.current);
    if (alive.current) {
      setState(next);
      if (
        next.removal?.removed &&
        next.verified &&
        !next.savePending &&
        !notified.current.has(next.identity.writeId)
      ) {
        notified.current.add(next.identity.writeId);
        onRemoved?.(next.identity.loreId);
      }
    }
    return next;
  };
  async function getOperation() {
    if (operation.current) return operation.current;
    if (!opening.current) {
      const session = bookLoreRemovalSession(() => alive.current);
      if (resumeWriteId) opening.current = session.resumeRemoval(bookId, resumeWriteId);
      else {
        if (!sourceChecked || !sourceToken)
          throw Error('Confira a origem da ficha antes de preparar.');
        writeId.current ??= crypto.randomUUID();
        setHasRecovery(true);
        opening.current = session.createRemoval({
          bookId,
          loreId,
          sourceToken,
          writeId: writeId.current,
        });
      }
    }
    const op = await opening.current;
    scope(op.snapshot(), bookId, loreId, writeId.current);
    operation.current = op;
    return op;
  }
  async function drive(kind: 'prepare' | 'verify' | 'apply') {
    if (producer.current !== null || closing.current) return;
    if (
      kind === 'apply' &&
      (!reviewed || (state?.phase !== 'ready' && !(state?.phase === 'uncertain' && allowResend)))
    )
      return;
    const n = ++run.current;
    producer.current = n;
    setBusy(true);
    setWork(kind);
    setError('');
    setReviewed(false);
    if (kind === 'verify') setAllowResend(false);
    try {
      const op = await getOperation();
      if (!active(n)) return;
      let first = true;
      while (active(n)) {
        const before = op.snapshot();
        if (first && kind === 'apply') await op.apply();
        else await op.advance();
        if (!active(n)) return;
        const next = publish(op);
        if (
          first &&
          kind === 'verify' &&
          before.phase === 'uncertain' &&
          !before.savePending &&
          next.phase === 'uncertain'
        )
          setAllowResend(true);
        if (before.savePending || !['inspecting', 'cleaning', 'cancelling'].includes(next.phase))
          break;
        first = false;
      }
    } catch (e) {
      if (active(n)) {
        if (operation.current) publish(operation.current);
        else opening.current = null;
        setError(message(e));
      }
    } finally {
      if (active(n)) {
        producer.current = null;
        setBusy(false);
        setWork(null);
      }
    }
  }
  async function review() {
    if (producer.current !== null || closing.current) return;
    const n = ++run.current;
    producer.current = n;
    setBusy(true);
    setWork('review');
    setError('');
    try {
      const op = await getOperation(),
        s = op.snapshot();
      if (!active(n)) return;
      if (s.phase !== 'ready' && !(s.phase === 'uncertain' && allowResend)) return;
      const view = await bookLoreRemovalSession(() => alive.current).metadata(
        bookId,
        loreId,
        s.identity.sourceToken,
      );
      if (!view) throw Error('A ficha selecionada está indisponível.');
      if (active(n)) {
        setSourceChecked(true);
        setReviewed(true);
      }
    } catch (e) {
      if (active(n)) {
        setSourceChecked(false);
        setReviewed(false);
        setError(message(e));
      }
    } finally {
      if (active(n)) {
        producer.current = null;
        setBusy(false);
        setWork(null);
      }
    }
  }
  async function cancel() {
    if (closing.current) return;
    closing.current = true;
    const n = ++run.current;
    producer.current = null;
    setBusy(false);
    setWork(null);
    setClosingBusy(true);
    setReviewed(false);
    setAllowResend(false);
    setError('');
    try {
      const old = await getOperation();
      if (!active(n)) return;
      await old.cancel();
      if (!active(n)) return;
      const next = publish(old);
      if (!next.savePending) {
        const fresh = await bookLoreRemovalSession(() => alive.current).resumeRemoval(
          bookId,
          next.identity.writeId,
        );
        scope(fresh.snapshot(), bookId, loreId, writeId.current);
        if (!active(n)) return;
        operation.current = fresh;
        opening.current = Promise.resolve(fresh);
        setCancelRetry(false);
        if (next.cancelRequested && next.inspectionClosed && !next.cancellationChecked) {
          await fresh.advance();
          if (active(n)) publish(fresh);
        }
      }
    } catch (e) {
      if (active(n)) {
        setCancelRetry(true);
        if (operation.current) {
          const next = publish(operation.current);
          if (next.cancelRequested && !next.savePending) {
            try {
              const fresh = await bookLoreRemovalSession(() => alive.current).resumeRemoval(
                bookId,
                next.identity.writeId,
              );
              scope(fresh.snapshot(), bookId, loreId, writeId.current);
              if (active(n)) {
                operation.current = fresh;
                opening.current = Promise.resolve(fresh);
                setCancelRetry(false);
              }
            } catch {
              /* Preserve the original error and the current recovery handle. */
            }
          }
        } else opening.current = null;
        if (active(n)) setError(message(e));
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
    setReviewed(false);
    requestAnimationFrame(() => (reviewButton.current ?? closeButton.current)?.focus());
  };
  const initialError = !!error && !sourceChecked && !hasRecovery;
  const phase = state?.phase;
  const canReview = phase === 'ready' || (phase === 'uncertain' && allowResend);
  const canCancel = hasRecovery && !state?.removal && phase !== 'cancelled';
  const status = closingBusy
    ? 'Conferindo o cancelamento e o resultado da retirada...'
    : busy && work === 'apply'
      ? 'Aguardando confirmação da retirada...'
      : busy && work === 'verify'
        ? 'Verificando o resultado da operação...'
        : state?.removal && !state.verified && phase !== 'verifying'
          ? 'Há uma retirada registrada neste dispositivo. Verifique o resultado para continuar.'
          : phase === 'complete'
            ? 'Retirada concluída.'
            : phase === 'verifying'
              ? 'Há uma conclusão registrada neste dispositivo. Verifique o resultado.'
              : phase === 'cleaning'
                ? 'A ficha foi retirada. A limpeza pode ser continuada.'
                : phase === 'handed-off'
                  ? 'A exclusão do livro assumiu a limpeza desta ficha.'
                  : phase === 'uncertain'
                    ? 'A retirada ainda não foi confirmada. Verifique o resultado antes de decidir reenviar.'
                    : phase === 'cancelled'
                      ? 'Esta tentativa foi cancelada.'
                      : phase === 'cancelling'
                        ? 'O cancelamento precisa ser conferido.'
                        : phase === 'ready'
                          ? 'Preparação concluída. A ficha permanece no livro.'
                          : phase === 'inspecting'
                            ? busy
                              ? 'Preparando a retirada...'
                              : 'A preparação pode ser continuada.'
                            : 'Confira a ficha e prepare a retirada.';
  return (
    <Dialog
      open
      title="Retirar ficha do livro"
      onClose={close}
      footer={
        <div className={styles.actions}>
          <Button ref={closeButton} variant="secondary" onClick={close}>
            Fechar
          </Button>
          {canCancel && (
            <Button variant="ghost" disabled={closingBusy} onClick={() => void cancel()}>
              {cancelRetry ? 'Repetir cancelamento' : 'Cancelar preparação'}
            </Button>
          )}
          {!loading &&
            !initialError &&
            !cancelRetry &&
            (reviewed ? (
              <>
                <Button variant="secondary" onClick={back} disabled={busy || closingBusy}>
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy || closingBusy}
                  onClick={() => void drive('apply')}
                >
                  {phase === 'uncertain' ? 'Confirmar reenvio' : 'Confirmar retirada'}
                </Button>
              </>
            ) : (
              <>
                {(!hasRecovery || !state) && (
                  <Button
                    disabled={busy || closingBusy || !sourceChecked}
                    onClick={() => void drive('prepare')}
                  >
                    Preparar retirada
                  </Button>
                )}
                {state?.savePending ? (
                  <Button disabled={busy || closingBusy} onClick={() => void drive('verify')}>
                    Salvar recuperação
                  </Button>
                ) : phase === 'inspecting' ? (
                  <Button disabled={busy || closingBusy} onClick={() => void drive('prepare')}>
                    Continuar preparação
                  </Button>
                ) : phase && !['ready', 'cancelled'].includes(phase) ? (
                  <Button disabled={busy || closingBusy} onClick={() => void drive('verify')}>
                    {phase === 'cleaning' && state?.verified
                      ? 'Continuar limpeza'
                      : 'Verificar resultado'}
                  </Button>
                ) : null}
                {canReview && (
                  <Button
                    ref={reviewButton}
                    disabled={busy || closingBusy || !!state?.savePending}
                    onClick={() => void review()}
                  >
                    {phase === 'uncertain' ? 'Revisar reenvio' : 'Revisar retirada'}
                  </Button>
                )}
              </>
            ))}
        </div>
      }
    >
      <div className={styles.fields}>
        {loading ? (
          <LoadingState label="Conferindo recuperação da ficha..." />
        ) : initialError ? (
          <div ref={errorRef} tabIndex={-1}>
            <ErrorState
              title="Não foi possível abrir a retirada"
              description={error}
              action={
                <Button
                  onClick={() => {
                    setLoading(true);
                    setError('');
                    setRetry((v) => v + 1);
                  }}
                >
                  Tentar novamente
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {sourceChecked && entityName !== undefined && (
              <p className={styles.label}>
                <strong>{entityName}</strong>
              </p>
            )}
            <p className={styles.status}>Ficha: {loreId}</p>
            <p ref={statusRef} tabIndex={-1} role="status">
              {status}
            </p>
            {busy && <LoadingState label="Conferindo a operação..." />}
            {closingBusy && <LoadingState label="Encerrando a preparação..." />}
            {error && (
              <div ref={errorRef} tabIndex={-1}>
                <Alert variant="destructive" title="Não foi possível concluir">
                  {error}
                </Alert>
              </div>
            )}
            {reviewed && (
              <div ref={warningRef} tabIndex={-1}>
                <Alert
                  variant="warning"
                  title={
                    phase === 'uncertain'
                      ? 'Confirmar o reenvio da retirada?'
                      : 'Confirmar a retirada irreversível?'
                  }
                >
                  A ficha será retirada deste livro de forma irreversível. Se estiver pública, será
                  necessário republicar o livro para disponibilizar a publicação novamente.
                </Alert>
              </div>
            )}
            {canCancel && (work === 'apply' || phase === 'uncertain' || closingBusy) && (
              <p className={styles.status}>
                Uma retirada já registrada permanece mesmo após cancelar a preparação.
              </p>
            )}
            {hasRecovery && (
              <p className={styles.status}>
                Você pode fechar e retomar esta operação em Retiradas neste dispositivo.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
