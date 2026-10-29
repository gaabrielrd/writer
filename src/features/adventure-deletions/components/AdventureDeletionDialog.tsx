import { useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Dialog, LoadingState } from '@/shared/ui';
import type {
  AdventureDeletionProgress as Progress,
  AdventureDeletionStartPending as StartPending,
} from '../model/adventureDeletion';
import { phaseLabels } from '../model/adventureDeletionContracts';
import { useAdventureDeletion } from '../hooks/useAdventureDeletion';
import styles from './AdventureDeletion.module.css';

export interface AdventureDeletionDialogProps {
  adventureId: string;
  open: boolean;
  onClose: () => void;
  onRevoked?: (progress: Progress) => void;
}
export function AdventureDeletionDialog(props: AdventureDeletionDialogProps) {
  const { user } = useAuth(),
    actor = useRef(''),
    presentation = useRef({ open: props.open, epoch: 0 });
  // A new opening gets a new source/session before any delayed effect can adopt the previous one.
  // eslint-disable-next-line react-hooks/refs
  if (props.open && !presentation.current.open) presentation.current.epoch++;
  // eslint-disable-next-line react-hooks/refs
  presentation.current.open = props.open;
  // eslint-disable-next-line react-hooks/refs
  const key = JSON.stringify([user?.uid, props.adventureId, presentation.current.epoch]);
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  return user ? (
    <DeletionSession key={key} {...props} uid={user.uid} isActive={() => actor.current === key} />
  ) : null;
}
function DeletionSession({
  uid,
  adventureId,
  open,
  onClose,
  onRevoked,
  isActive,
}: AdventureDeletionDialogProps & { uid: string; isActive: () => boolean }) {
  const shown = useRef(open),
    [cancelInitial, setCancelInitial] = useState<StartPending | null>(null);
  // Render-time visibility prevents a close from allowing another unit before effect cleanup.
  // eslint-disable-next-line react-hooks/refs
  shown.current = open;
  const op = useAdventureDeletion({
    uid,
    adventureId,
    open,
    isActive,
    isOpen: () => shown.current,
    onRevoked,
  });
  const pending = op.control && op.control.kind !== 'known' ? op.control : null,
    p = op.progress,
    disabled = op.busy || !op.ready || op.readOnly;
  function close() {
    op.pause();
    setCancelInitial(null);
    onClose();
  }
  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        title="Excluir aventura"
        description="A exclusão confirmada é definitiva. Fechar pausa a limpeza após a etapa em andamento."
        footer={
          <Button variant="secondary" onClick={close}>
            {p || pending || op.busy ? 'Fechar e pausar' : 'Cancelar'}
          </Button>
        }
      >
        <div className={styles.stack}>
          {op.error && <Alert variant="warning">{op.error}</Alert>}
          {op.notice && <p role="status">{op.notice}</p>}
          {op.loading && (p || pending) && (
            <LoadingState label="Consultando exclusão da aventura..." />
          )}
          {op.readOnly && (
            <Alert variant="warning">
              A consulta continua disponível. Este navegador não permite preservar pedidos com
              reserva segura.
            </Alert>
          )}
          {pending && (
            <Alert variant="warning">
              <p>
                Há um pedido aguardando confirmação. Confirme o mesmo pedido antes de continuar.
              </p>
              <div className={styles.actions}>
                <Button
                  disabled={disabled}
                  onClick={() => void op.recover(structuredClone(pending))}
                >
                  Confirmar pedido e continuar
                </Button>
                {pending.kind === 'start' && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => setCancelInitial(structuredClone(pending))}
                  >
                    Encerrar início não confirmado
                  </Button>
                )}
                {pending.kind === 'step' && op.conflict && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void op.resolveConflict()}
                  >
                    Encerrar tentativa e usar progresso atual
                  </Button>
                )}
              </div>
            </Alert>
          )}
          {!pending && !p && (
            <>
              <p>
                Serão removidos partes, cenas, blocos, lore da aventura, planejamento, metas,
                checklist e histórico.
              </p>
              <p>
                Campanhas, universos, personas e arquivos independentes da biblioteca permanecem. As
                perguntas próprias do chat são preservadas; respostas e contextos derivados serão
                removidos.
              </p>
              {op.loading || (!op.ready && !op.error) ? (
                <LoadingState label="Conferindo aventura para exclusão..." />
              ) : op.source && op.ready ? (
                <>
                  <h3 className={styles.text}>{op.source.title}</h3>
                  <Button
                    variant="destructive"
                    disabled={disabled}
                    onClick={() => {
                      if (op.source) void op.start(structuredClone(op.source));
                    }}
                  >
                    Excluir aventura definitivamente
                  </Button>
                </>
              ) : !op.error ? (
                <Alert variant="warning">
                  Esta aventura não está disponível para excluir. Consulte novamente antes de
                  confirmar.
                </Alert>
              ) : null}
            </>
          )}
          {p && (
            <section className={styles.stack} aria-label="Progresso da exclusão da aventura">
              <h3>{p.complete ? 'Aventura excluída' : 'Acesso à aventura encerrado'}</h3>
              <p className={styles.text}>{p.title}</p>
              <p role="status">Etapa: {phaseLabels[p.phase]}</p>
              <p>A exclusão não pode ser desfeita por esta operação.</p>
              {!pending && !p.complete && !op.busy && (
                <Button disabled={disabled} onClick={() => void op.advance()}>
                  Continuar limpeza
                </Button>
              )}
            </section>
          )}
          {op.busy && !p?.complete && (
            <Button variant="outline" disabled={op.paused} onClick={() => op.pause()}>
              Pausar após esta etapa
            </Button>
          )}
          {op.paused && (p || op.busy) && (
            <p role="status">
              A execução para após confirmar a etapa em andamento. Reabra esta tela para retomar.
            </p>
          )}
          {!pending && (
            <Button
              variant="outline"
              disabled={op.busy || op.loading}
              onClick={() => void op.refresh()}
            >
              Consultar progresso da exclusão
            </Button>
          )}
        </div>
      </Dialog>
      <Dialog
        open={open && cancelInitial !== null}
        onClose={() => setCancelInitial(null)}
        title="Encerrar início não confirmado?"
        description="Se a exclusão já começou, ela será confirmada e não será desfeita. Se nunca começou, este pedido será impedido de iniciá-la."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelInitial(null)}>
              Manter pedido
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                const captured = cancelInitial;
                setCancelInitial(null);
                if (captured) void op.cancelStart(captured);
              }}
            >
              Confirmar encerramento inicial
            </Button>
          </>
        }
      >
        A confirmação vale somente para o pedido que estava nesta tela.
      </Dialog>
    </>
  );
}
