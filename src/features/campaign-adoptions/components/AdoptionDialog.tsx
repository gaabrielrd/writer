import { useLayoutEffect, useRef, useState } from 'react';
import { CampaignComparisonReader } from '@/features/campaign-comparisons';
import { CampaignLoreOperationControls } from '@/features/campaign-lore';
import { Alert, Button, Dialog, LoadingState } from '@/shared/ui';
import type {
  AdoptionSelection,
  AdoptionDecision,
  AdoptionChoice,
  AdoptionControl,
} from '../model/campaignAdoption';
import { useAdoptionOperation } from '../hooks/useAdoptionOperation';
import * as api from '../services/campaignAdoptionService';
import { adoptionStorageAvailable } from '../services/campaignAdoptionRecovery';
import { AdoptionDecisions } from './AdoptionDecisions';
import styles from './Adoptions.module.css';
export function AdoptionDialog({
  uid,
  selection,
  open,
  isActive,
  onClose,
  onAdopted,
  onAdaptLore,
  onPendingChange,
}: {
  uid: string;
  selection: AdoptionSelection;
  open: boolean;
  isActive: () => boolean;
  onClose: () => void;
  onAdopted?: () => void;
  onAdaptLore?: () => void;
  onPendingChange?: (value: boolean) => void;
}) {
  const alive = useRef(true),
    initialControl = useRef<AdoptionControl | null>(null),
    shown = useRef(open),
    [confirm, setConfirm] = useState<
      'activate' | 'cancel' | 'initial' | { row: AdoptionDecision; choice: AdoptionChoice } | null
    >(null),
    [reviewedCheckpoint, setReviewedCheckpoint] = useState<number | null>(null),
    [compare, setCompare] = useState(false);
  // eslint-disable-next-line react-hooks/refs
  shown.current = open;
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive(),
    op = useAdoptionOperation({
      uid,
      selection,
      isActive: active,
      isOpen: () => shown.current,
      onAdopted,
      onPendingChange,
    });
  const p = op.progress,
    pending = op.control && op.control.scope.kind !== 'known' ? op.control : null,
    locked = op.busy || !op.ready || !adoptionStorageAvailable(),
    fenced = p?.state === 'preparing' || p?.state === 'ready';
  function close() {
    setConfirm(null);
    setCompare(false);
    setReviewedCheckpoint(null);
    onClose();
  }
  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        title="Atualizar base da campanha"
        description="Revise a captura e as escolhas da mesa. A base atual permanece disponível até a confirmação final."
        maxWidthClass="max-w-5xl"
        footer={
          <Button variant="secondary" onClick={close}>
            Fechar atualização
          </Button>
        }
      >
        <div className={styles.stack}>
          {op.error && <Alert variant="warning">{op.error}</Alert>}
          {op.notice && <p role="status">{op.notice}</p>}
          {op.loading && <LoadingState label="Carregando controle da atualização..." />}
          {op.busy && p && ['preparing', 'deleting'].includes(p.state) && (
            <Button variant="outline" disabled={op.paused} onClick={op.pause}>
              Pausar após esta etapa
            </Button>
          )}
          {op.paused && (
            <p role="status">
              A execução será pausada após confirmar a etapa em andamento. Uma nova ação explícita
              poderá continuar.
            </p>
          )}
          {!adoptionStorageAvailable() && (
            <Alert variant="warning">
              A leitura permanece disponível. Para enviar escolhas, use um navegador com reserva
              segura entre abas.
            </Alert>
          )}
          {pending && (
            <Alert variant="warning">
              <p>
                Há um pedido de adoção aguardando confirmação. Nenhum novo pedido substituirá esse
                controle.
              </p>
              <Button disabled={op.busy} onClick={() => void op.recover()}>
                Confirmar pedido de adoção
              </Button>
              {'phase' in pending && (
                <Button
                  disabled={op.busy}
                  variant="outline"
                  onClick={() => {
                    initialControl.current = op.control;
                    setConfirm('initial');
                  }}
                >
                  Encerrar pedido inicial de adoção
                </Button>
              )}
              {op.conflict && 'method' in pending && (
                <Button
                  disabled={op.busy}
                  variant="outline"
                  onClick={() => void op.resolveConflict()}
                >
                  Encerrar tentativa e consultar progresso atual
                </Button>
              )}
            </Alert>
          )}
          {!p && !pending && selection.context && (
            <>
              <p>
                Base atual capturada em{' '}
                {new Date(selection.context.currentCapturedAt).toLocaleString('pt-BR')}. Candidata
                capturada em{' '}
                {new Date(selection.context.candidateCapturedAt).toLocaleString('pt-BR')}.
              </p>
              <p>
                Iniciar a revisão ainda permite adaptar o lore atual. Alterações posteriores
                exigirão nova comparação.
              </p>
              <Button disabled={locked} onClick={() => void op.start({ ...selection.context! })}>
                Iniciar revisão da adoção
              </Button>
            </>
          )}
          {!pending && (selection.adoptionId || op.control?.scope.kind === 'known') && (
            <Button disabled={op.busy} onClick={() => void op.refresh()}>
              Consultar progresso da adoção
            </Button>
          )}
          {p && (
            <>
              <section className={styles.stack} aria-label="Progresso da adoção">
                <h3>{api.stateLabels[p.state]}</h3>
                <p>Etapa: {api.phaseLabels[p.phase]}</p>
                {p.sourceAvailable ? (
                  <p>Registros processados: {p.processed}</p>
                ) : (
                  <p>
                    Apenas o controle próprio está disponível; conteúdo e nomes não serão exibidos.
                  </p>
                )}
                {p.reason && (
                  <Alert variant="warning">
                    {p.reason === 'pending-operations'
                      ? 'Há pedidos de lore preservados. Resolva-os e inicie uma nova revisão.'
                      : p.reason === 'lore-changed'
                        ? 'O lore da mesa mudou. Compare novamente antes de iniciar outra revisão.'
                        : 'A preparação precisa de nova conferência; a base anterior foi preservada.'}
                  </Alert>
                )}
                {fenced && (
                  <p>
                    A preparação reservou esta base. Recuperar ou aplicar texto de lore ficará
                    bloqueado até concluir ou cancelar esta preparação.
                  </p>
                )}
              </section>
              {open && p.sourceAvailable && p.state === 'reviewing' && (
                <AdoptionDecisions
                  uid={uid}
                  progress={p}
                  result={op.result}
                  onReviewed={setReviewedCheckpoint}
                  disabled={locked || !!pending}
                  isActive={() => active() && shown.current}
                  onDecide={(row, choice) => setConfirm({ row, choice })}
                  onRefresh={() => void op.refresh()}
                  onAdapt={() => {
                    close();
                    onAdaptLore?.();
                  }}
                />
              )}
              {p.state !== 'adopted' && p.state !== 'deleted' && (
                <CampaignLoreOperationControls
                  scope={{
                    campaignId: p.campaignId,
                    campaignToken: p.campaignToken,
                    baseId: p.currentBaseId,
                  }}
                  mode={fenced ? 'metadata-only' : 'normal'}
                  onRecoverLocal={() => {
                    close();
                    onAdaptLore?.();
                  }}
                />
              )}
              {!pending && (
                <div className={styles.actions}>
                  {p.state === 'reviewing' && (
                    <Button
                      disabled={locked || !p.sourceAvailable || reviewedCheckpoint !== p.checkpoint}
                      onClick={() => void op.execute('prepare')}
                    >
                      Preparar atualização
                    </Button>
                  )}
                  {p.state === 'preparing' && (
                    <Button
                      disabled={locked || !p.sourceAvailable}
                      onClick={() => void op.execute('advance')}
                    >
                      {p.phase === 'authorization'
                        ? 'Conferir permissões novamente'
                        : 'Continuar preparação da atualização'}
                    </Button>
                  )}
                  {p.state === 'ready' && (
                    <Button
                      disabled={locked || !p.sourceAvailable}
                      onClick={() => setConfirm('activate')}
                    >
                      Adotar esta base
                    </Button>
                  )}
                  {p.sourceAvailable && !['deleted', 'adopted'].includes(p.state) && (
                    <Button
                      variant="outline"
                      disabled={op.busy}
                      onClick={() => setCompare((v) => !v)}
                    >
                      Consultar bases comparadas
                    </Button>
                  )}
                  {!['deleted', 'adopted'].includes(p.state) && (
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => setConfirm('cancel')}
                    >
                      {p.state === 'deleting'
                        ? 'Continuar cancelamento'
                        : 'Cancelar preparação da adoção'}
                    </Button>
                  )}
                </div>
              )}
              {p.state === 'adopted' && (
                <p>
                  A base e o lore da mesa foram adotados juntos. Suas notas próprias foram
                  preservadas.
                </p>
              )}
              {p.state === 'deleted' && (
                <p>Preparação cancelada. A candidata e a base anterior foram preservadas.</p>
              )}
              {open && compare && p.sourceAvailable && (
                <CampaignComparisonReader
                  identity={{
                    schemaVersion: 1,
                    ownerId: p.ownerId,
                    comparisonId: p.comparisonId,
                    campaignId: p.campaignId,
                    campaignToken: p.campaignToken,
                    currentBaseId: p.currentBaseId,
                    candidateBaseId: p.candidateBaseId,
                  }}
                  isActive={() => active() && shown.current}
                />
              )}
            </>
          )}
        </div>
      </Dialog>
      <Dialog
        open={confirm !== null && open}
        children={
          <p>
            A escolha vale para a ficha inteira. Nenhuma alteração será promovida ao universo ou às
            notas próprias.
          </p>
        }
        onClose={() => setConfirm(null)}
        title={
          typeof confirm === 'object' && confirm !== null
            ? 'Confirmar escolha da ficha inteira?'
            : confirm === 'activate'
              ? 'Adotar a nova base?'
              : confirm === 'initial'
                ? 'Encerrar pedido inicial?'
                : 'Cancelar preparação?'
        }
        description={
          typeof confirm === 'object' && confirm !== null
            ? confirm.choice === 'discard-local'
              ? 'A ficha ausente e sua adaptação particular não integrarão o novo lore da mesa.'
              : confirm.choice === 'use-candidate'
                ? 'A ficha inteira da candidata substituirá a variante e a retirada local.'
                : 'A ficha inteira e seu modo serão preservados. Legado conserva origem e permissões.'
            : confirm === 'activate'
              ? 'Esta confirmação troca a base e o lore da mesa juntos, preservando notas e descrição próprias.'
              : 'Esta ação não exclui a candidata, a base atual ou suas notas.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Voltar à revisão
            </Button>
            <Button
              disabled={locked}
              onClick={() => {
                const value = confirm;
                setConfirm(null);
                if (typeof value === 'object' && value)
                  void op.execute('decide', {
                    sourceKey: value.row.sourceKey,
                    expectedRevision: value.row.revision,
                    choice: value.choice,
                  });
                else if (value === 'initial') void op.cancelStart(initialControl.current);
                else if (value === 'activate') void op.execute('activate');
                else if (value === 'cancel') void op.execute('cancel');
              }}
            >
              Confirmar{' '}
              {typeof confirm === 'object'
                ? 'escolha'
                : confirm === 'activate'
                  ? 'adoção'
                  : 'encerramento'}
            </Button>
          </>
        }
      />
    </>
  );
}
