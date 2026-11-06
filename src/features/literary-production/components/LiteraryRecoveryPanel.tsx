import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { getLiteraryOperation } from '../services/literaryProductionService';
import {
  finishLiteraryOperation,
  listLiteraryPendingOperations,
  LITERARY_RECOVERY_EVENT,
  type LiteraryPendingOperation,
} from '../services/literaryRecoveryStorage';
import {
  getLiterarySequenceOperation,
  verifyLiterarySequenceOperation,
  resumeLiterarySequenceOperation,
} from '../services/literarySequenceService';
import styles from './EditorialContractPanel.module.css';

export function LiteraryRecoveryPanel({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  return (
    <RecoverySession
      key={JSON.stringify([user?.uid ?? null, bookId])}
      bookId={bookId}
      actorId={user?.uid ?? null}
    />
  );
}
function RecoverySession({ bookId, actorId }: { bookId: string; actorId: string | null }) {
  const [resumable, setResumable] = useState<string[]>([]);
  const [pending, setPending] = useState<LiteraryPendingOperation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    const current = ++epoch.current;
    const refresh = () => {
      if (!actorId) return;
      try {
        setPending(listLiteraryPendingOperations(actorId, bookId));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Falha ao consultar pendências locais.');
      }
    };
    queueMicrotask(() => {
      if (epoch.current === current) refresh();
    });
    window.addEventListener('storage', refresh);
    window.addEventListener(LITERARY_RECOVERY_EVENT, refresh);
    return () => {
      epoch.current = current + 1;
      window.removeEventListener('storage', refresh);
      window.removeEventListener(LITERARY_RECOVERY_EVENT, refresh);
    };
  }, [bookId, actorId]);
  const inspect = async (entry: LiteraryPendingOperation) => {
    if (busy || entry.actorId !== actorId) return;
    const current = epoch.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (entry.kind === 'sequence') {
        const result = await getLiterarySequenceOperation(bookId, entry.id, entry.operationId);
        if (epoch.current !== current) return;
        verifyLiterarySequenceOperation(entry, result);
        if (result.state === 'unconfirmed') {
          setNotice(
            'Este pedido de sequência ainda não tem confirmação. Nenhum avanço foi reenviado.',
          );
          return;
        }
        if (result.state === 'running') {
          setResumable((ids) => [...new Set([...ids, entry.operationId])]);
          setNotice(
            'O avanço original está pendente. Você pode consultá-lo novamente ou retomar explicitamente o mesmo passo registrado no servidor.',
          );
          return;
        }
        finishLiteraryOperation(entry);
        setNotice(
          result.state === 'superseded'
            ? 'O passo original foi encerrado por um controle posterior. Consulte a sequência; nenhum avanço foi reenviado.'
            : 'Comando da sequência confirmado. Consulte o checkpoint atual; esta confirmação não comprova aplicação de texto.',
        );
        return;
      }
      const result = await getLiteraryOperation(bookId, entry.operationId);
      if (epoch.current !== current) return;
      if (result.state === 'unconfirmed') {
        setNotice(
          'Este salvamento ainda não tem confirmação. Consulte novamente; nenhum pedido foi reenviado.',
        );
        return;
      }
      if (
        result.kind !== entry.kind ||
        result.id !== entry.id ||
        (result.revision !== entry.expectedRevision + 1 &&
          !(result.noOp && result.revision === entry.expectedRevision))
      )
        throw new Error(
          'A confirmação não corresponde ao pedido acompanhado. Preserve a pendência.',
        );
      finishLiteraryOperation(entry);
      setNotice(
        entry.kind === 'workflow'
          ? 'Operação do ciclo encerrada. Consulte o checkpoint atual do capítulo antes de continuar.'
          : entry.kind === 'draftExecution'
            ? 'Autorização de redação confirmada. Consulte o checkpoint atual do capítulo.'
            : entry.kind === 'draft'
              ? 'Redação registrada. Consulte o checkpoint do capítulo.'
              : entry.kind === 'review'
                ? 'Revisão registrada. Consulte o checkpoint do capítulo para retomá-la.'
                : entry.kind === 'prose' || entry.kind === 'proseApply'
                  ? 'Pedido confirmado. Consulte a proposta e seu recibo no capítulo.'
                  : entry.kind === 'milestone'
                    ? 'Captura registrada. Consulte as versões do capítulo para retomá-la.'
                    : 'Salvamento confirmado na revisão ' +
                      result.revision +
                      '. Consulte o documento e compare antes de editar.',
      );
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar.');
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  const resume = async (entry: LiteraryPendingOperation) => {
    if (busy || !actorId || entry.actorId !== actorId) return;
    const current = epoch.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await resumeLiterarySequenceOperation(entry, actorId, () => epoch.current === current);
      if (epoch.current === current)
        setNotice(
          'O passo original foi consultado ou retomado. Confira o checkpoint da sequência antes de continuar; nenhum capítulo seguinte foi autorizado por esta recuperação.',
        );
    } catch (cause) {
      if (epoch.current === current)
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível retomar o passo original.',
        );
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  if (!pending.length && !error && !notice) return null;
  return (
    <section className={styles.panel} aria-label="Recuperação de salvamentos editoriais">
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}
      {!!pending.length && (
        <>
          <h3>Salvamentos a confirmar</h3>
          <p>
            A consulta recupera o resultado sem reenviar alterações. Este registro guarda apenas a
            identificação do pedido.
          </p>
          {pending.map((entry) => (
            <div key={entry.operationId} className={styles.actions}>
              <Button
                variant="outline"
                className={styles.sourceButton}
                disabled={busy}
                onClick={() => void inspect(entry)}
              >
                Consultar{' '}
                {entry.kind === 'sequence'
                  ? 'sequência'
                  : entry.kind === 'contract'
                    ? 'contrato'
                    : entry.kind === 'gate'
                      ? 'verificação'
                      : entry.kind === 'milestone'
                        ? 'captura'
                        : entry.kind === 'prose'
                          ? 'pedido de prosa'
                          : entry.kind === 'proseApply'
                            ? 'aplicação'
                            : entry.kind === 'review'
                              ? 'revisão'
                              : entry.kind === 'draftExecution'
                                ? 'autorização de redação'
                                : entry.kind === 'draft'
                                  ? 'redação'
                                  : entry.kind === 'integration'
                                    ? 'integração'
                                    : entry.kind === 'integrationRecheck'
                                      ? 'reconferência'
                                      : entry.kind === 'finding'
                                        ? 'decisão de achado'
                                        : entry.kind === 'progress'
                                          ? 'checkpoint de progresso'
                                          : entry.kind === 'publication'
                                            ? 'manifesto de publicação'
                                            : entry.kind === 'publicationGuide'
                                              ? 'entrada do guia'
                                              : entry.kind === 'publicationConfirm'
                                                ? 'publicação'
                                                : 'documento'}{' '}
                · revisão esperada {entry.expectedRevision + 1}
              </Button>
              {entry.kind === 'sequence' && resumable.includes(entry.operationId) && (
                <Button
                  variant="outline"
                  className={styles.sourceButton}
                  disabled={busy}
                  onClick={() => void resume(entry)}
                >
                  Retomar passo original da sequência
                </Button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
