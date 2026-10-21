import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Dialog, LoadingState } from '@/shared/ui';
import type {
  DeletionControl,
  DeletionLookup,
  DeletionProgress,
  DeletionSource,
} from '../model/campaignDeletion';
import * as api from '../services/campaignDeletionService';
import { recoveryAvailable } from '../services/campaignDeletionRecovery';
import { useDeletionOperation } from '../hooks/useDeletionOperation';
import styles from './Deletions.module.css';
export interface CampaignDeletionDialogProps {
  campaignId: string;
  open: boolean;
  onClose: () => void;
  onRevoked?: (progress: DeletionProgress) => void;
  onReviewRecovery?: (proof: DeletionLookup) => void;
  recoveryActions?: ReactNode;
}
export function CampaignDeletionDialog(props: CampaignDeletionDialogProps) {
  const { user } = useAuth(),
    actor = useRef('');
  const key = JSON.stringify([user?.uid, props.campaignId]);
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  return user ? (
    <DeletionSession key={key} {...props} uid={user.uid} isActive={() => actor.current === key} />
  ) : null;
}
function DeletionSession({
  uid,
  campaignId,
  open,
  onClose,
  onRevoked,
  onReviewRecovery,
  recoveryActions,
  isActive,
}: CampaignDeletionDialogProps & { uid: string; isActive: () => boolean }) {
  const shown = useRef(open),
    epoch = useRef(0),
    alive = useRef(true),
    [source, setSource] = useState<{
      epoch: number;
      value: DeletionSource | null;
      error?: string;
    } | null>(null),
    [sourceAttempt, setSourceAttempt] = useState(0),
    [cancelInitial, setCancelInitial] = useState<DeletionControl | null>(null),
    [reviewing, setReviewing] = useState<number | null>(null),
    [reviewError, setReviewError] = useState('');
  // Presentation changes invalidate delayed reads before effect cleanup.
  // eslint-disable-next-line react-hooks/refs
  if (shown.current !== open) {
    // eslint-disable-next-line react-hooks/refs
    epoch.current++;
    // eslint-disable-next-line react-hooks/refs
    shown.current = open;
  }
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive(),
    op = useDeletionOperation({
      uid,
      campaignId,
      isActive: active,
      isOpen: () => shown.current,
      onRevoked,
    });
  useEffect(() => {
    let current = true;
    const own = epoch.current;
    if (open)
      void api
        .getCampaignDeletionSource({ campaignId })
        .then((value) => {
          if (!current || !active() || !shown.current || epoch.current !== own) return;
          api.validateSource(value, uid, campaignId);
          setSource({ epoch: own, value });
        })
        .catch((cause: unknown) => {
          if (current && active() && shown.current && epoch.current === own)
            setSource({ epoch: own, value: null, error: api.message(cause) });
        });
    return () => {
      current = false;
    };
  }, [uid, campaignId, open, sourceAttempt]); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/refs
  const presentationEpoch = epoch.current;
  // The same render-time epoch keeps closed presentation reads from being reused on reopen.
  // eslint-disable-next-line react-hooks/refs
  const currentSource = source?.epoch === presentationEpoch ? source : null;
  const pending = op.control && op.control.kind !== 'known' ? op.control : null,
    p = op.progress,
    disabled = op.busy || !op.ready || !recoveryAvailable();
  function close() {
    setCancelInitial(null);
    onClose();
  }
  async function review() {
    const own = epoch.current;
    setReviewing(own);
    setReviewError('');
    try {
      const value = await op.proof();
      if (active() && shown.current && epoch.current === own) onReviewRecovery?.(value);
    } catch (cause) {
      if (active() && epoch.current === own) setReviewError(api.message(cause));
    } finally {
      if (active() && epoch.current === own) setReviewing(null);
    }
  }
  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        title="Excluir campanha"
        description="A exclusão confirmada é definitiva. A limpeza pode ser retomada sem restaurar o acesso."
        footer={
          <Button variant="secondary" onClick={close}>
            {p || pending ? 'Fechar exclusão' : 'Cancelar'}
          </Button>
        }
      >
        <div className={styles.stack}>
          {op.error && <Alert variant="warning">{op.error}</Alert>}
          {op.notice && <p role="status">{op.notice}</p>}
          {op.loading && <LoadingState label="Consultando exclusão da campanha..." />}
          {!recoveryAvailable() && (
            <Alert variant="warning">
              A consulta continua disponível. Este navegador não permite preservar uma exclusão com
              reserva segura.
            </Alert>
          )}
          {pending && (
            <Alert variant="warning">
              <p>
                Há um pedido de exclusão aguardando confirmação. Repita o mesmo pedido antes de
                outro.
              </p>
              <Button disabled={op.busy} onClick={() => void op.recover()}>
                Confirmar pedido de exclusão
              </Button>
              {pending.kind === 'start' && (
                <Button
                  disabled={op.busy}
                  variant="outline"
                  onClick={() => setCancelInitial(structuredClone(pending))}
                >
                  Encerrar início não confirmado
                </Button>
              )}
              {pending.kind === 'step' && op.conflict && (
                <Button
                  disabled={op.busy}
                  variant="outline"
                  onClick={() => void op.resolveConflict()}
                >
                  Encerrar tentativa e usar progresso atual
                </Button>
              )}
            </Alert>
          )}
          {!pending && !p && (
            <>
              <p>
                Serão excluídos descrição, notas próprias, checklist, bases, variantes, candidatas e
                vínculos de ilustração desta campanha. A aventura, o universo e os arquivos da
                biblioteca permanecem.
              </p>
              {!currentSource ? (
                <LoadingState label="Conferindo campanha para exclusão..." />
              ) : currentSource.value ? (
                <>
                  <h3 className={styles.text}>{currentSource.value.title}</h3>
                  <Button
                    variant="destructive"
                    disabled={disabled || op.loading}
                    onClick={() => void op.start(structuredClone(currentSource.value!))}
                  >
                    Excluir definitivamente
                  </Button>
                </>
              ) : (
                <Alert variant="warning">
                  {currentSource.error || 'Esta campanha não está disponível para excluir.'}
                  <Button
                    variant="outline"
                    onClick={() => {
                      epoch.current++;
                      setSourceAttempt((n) => n + 1);
                    }}
                  >
                    Consultar campanha novamente
                  </Button>
                </Alert>
              )}
            </>
          )}
          {p && (
            <section className={styles.stack} aria-label="Progresso da exclusão">
              <h3>{p.complete ? 'Campanha excluída' : 'Acesso revogado; limpeza em andamento'}</h3>
              <p>Etapa: {api.phaseLabels[p.phase]}</p>
              <p>A campanha não pode ser restaurada por esta operação.</p>
              {!pending && !p.complete && (
                <Button disabled={disabled} onClick={() => void op.advance()}>
                  Continuar limpeza
                </Button>
              )}
              {op.busy && !p.complete && (
                <Button variant="outline" disabled={op.paused} onClick={op.pause}>
                  Pausar após esta etapa
                </Button>
              )}
              {op.paused && (
                <p role="status">A execução será pausada após confirmar a etapa em andamento.</p>
              )}
              {recoveryActions}
            </section>
          )}
          {onReviewRecovery && (p || op.control || op.error) && (
            <section className={styles.stack} aria-label="Encerramento de controles locais">
              {!p && (
                <p>
                  O encerramento exige comprovar a exclusão da campanha e confirmar os rascunhos
                  mostrados.
                </p>
              )}
              <Button
                disabled={op.busy || reviewing === presentationEpoch}
                variant="outline"
                onClick={() => void review()}
              >
                Encerrar controles antigos deste navegador
              </Button>
              {reviewError && <Alert variant="warning">{reviewError}</Alert>}
            </section>
          )}
          {!pending && (
            <Button variant="outline" disabled={op.busy} onClick={() => void op.refresh()}>
              Consultar progresso da exclusão
            </Button>
          )}
        </div>
      </Dialog>
      <Dialog
        open={cancelInitial !== null && open}
        onClose={() => setCancelInitial(null)}
        title="Encerrar início não confirmado?"
        description="Se a exclusão já começou, ela será confirmada e não será desfeita. Se nunca começou, este pedido será impedido de iniciá-la."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelInitial(null)}>
              Manter pedido
            </Button>
            <Button
              disabled={op.busy}
              onClick={() => {
                const expected = cancelInitial;
                setCancelInitial(null);
                void op.cancelStart(expected);
              }}
            >
              Confirmar encerramento inicial
            </Button>
          </>
        }
      >
        Nenhum pedido diferente substituirá o que você está confirmando.
      </Dialog>
    </>
  );
}
