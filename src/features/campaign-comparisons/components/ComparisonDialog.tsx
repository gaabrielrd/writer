import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, LoadingState } from '@/shared/ui';
import type {
  ComparisonSelection,
  ComparisonSource,
  ComparisonReadEnvelope,
} from '../model/campaignComparison';
import { useComparisonOperation } from '../hooks/useComparisonOperation';
import * as api from '../services/campaignComparisonService';
import { comparisonStorageAvailable } from '../services/campaignComparisonRecovery';
import { ComparisonReader } from './ComparisonReader';
import styles from './Comparisons.module.css';
export function ComparisonDialog({
  uid,
  selection,
  open,
  onClose,
  isActive,
  onReviewAdoption,
}: {
  uid: string;
  selection: ComparisonSelection;
  open: boolean;
  onClose: () => void;
  isActive: () => boolean;
  onReviewAdoption?: (context: ComparisonReadEnvelope) => void;
}) {
  const alive = useRef(true),
    shown = useRef(open),
    [source, setSource] = useState<ComparisonSource | null>(null),
    [sourceBusy, setSourceBusy] = useState(false),
    [sourceError, setSourceError] = useState(''),
    [sourceAttempt, setSourceAttempt] = useState(0),
    [confirm, setConfirm] = useState<'start' | 'candidate' | null>(null),
    [comparing, setComparing] = useState(false);
  // Stop subsequent capture steps already when the host renders closed.
  // eslint-disable-next-line react-hooks/refs
  shown.current = open;
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive();
  const operation = useComparisonOperation({
    uid,
    campaignId: selection.campaignId,
    comparisonId: selection.comparisonId,
    expected: selection.expected,
    currentBaseId: selection.currentBaseId,
    isActive: active,
    isOpen: () => shown.current,
  });
  const hasControl = Boolean(operation.control),
    hasProgress = Boolean(operation.progress);
  useEffect(() => {
    if (!open || !operation.ready || hasControl || hasProgress || !selection.currentBaseId) return;
    let current = true;
    queueMicrotask(() => {
      if (current && active()) {
        setSourceBusy(true);
        setSourceError('');
      }
    });
    void api
      .getCampaignComparisonSource({
        campaignId: selection.campaignId,
        currentBaseId: selection.currentBaseId,
      })
      .then((value) => {
        if (!current || !active()) return;
        if (value) api.validateSource(value, uid, selection.campaignId, selection.currentBaseId!);
        setSource(value);
        if (!value) setSourceError('A origem não está disponível para preparar outra candidata.');
      })
      .catch((cause) => {
        if (current && active()) {
          setSource(null);
          setSourceError(api.message(cause));
        }
      })
      .finally(() => {
        if (current && active()) setSourceBusy(false);
      });
    return () => {
      current = false;
    };
    // Session identity is keyed by the host; boolean presence changes trigger the source read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    uid,
    selection.campaignId,
    selection.currentBaseId,
    open,
    operation.ready,
    hasControl,
    hasProgress,
    sourceAttempt,
  ]);
  const progress = operation.progress,
    pending =
      operation.control && operation.control.scope.kind !== 'known' ? operation.control : null;
  const locked = operation.busy || !operation.ready || !comparisonStorageAvailable();
  const sourceAvailable = progress?.sourceAvailable ?? false;
  return (
    <>
      <Dialog
        open={open}
        onClose={() => {
          setConfirm(null);
          setComparing(false);
          onClose();
        }}
        title="Candidata de base da campanha"
        description="Prepare e compare uma captura completa. A base atual e as anotações da mesa permanecem separadas."
        maxWidthClass="max-w-5xl"
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setConfirm(null);
              setComparing(false);
              onClose();
            }}
          >
            Fechar candidata
          </Button>
        }
      >
        <div className={styles.stack}>
          {operation.error && <Alert variant="warning">{operation.error}</Alert>}
          {operation.notice && <p role="status">{operation.notice}</p>}
          {!comparisonStorageAvailable() && (
            <Alert variant="warning">
              A leitura continua disponível. Este navegador não permite preservar pedidos com
              reserva segura entre abas.
            </Alert>
          )}
          {operation.loading && <LoadingState label="Carregando controle da candidata..." />}
          {pending ? (
            <Alert variant="warning">
              <p>Há um pedido aguardando confirmação. Nenhum novo passo substituirá esse pedido.</p>
              <div className={styles.actions}>
                <Button disabled={operation.busy} onClick={() => void operation.recover()}>
                  Confirmar pedido da candidata
                </Button>
                {'phase' in pending && (
                  <Button
                    variant="outline"
                    disabled={operation.busy}
                    onClick={() => setConfirm('start')}
                  >
                    Encerrar pedido inicial
                  </Button>
                )}
                {operation.conflict && 'method' in pending && (
                  <Button
                    variant="outline"
                    disabled={operation.busy}
                    onClick={() => void operation.resolveConflict()}
                  >
                    Encerrar tentativa e usar progresso atual
                  </Button>
                )}
              </div>
            </Alert>
          ) : null}
          {!progress && !pending && (
            <>
              {sourceBusy && <LoadingState label="Conferindo origem para a candidata..." />}
              {sourceError && (
                <Alert variant="warning">
                  {sourceError}
                  <Button
                    disabled={sourceBusy}
                    variant="outline"
                    onClick={() => setSourceAttempt((n) => n + 1)}
                  >
                    Conferir origem novamente
                  </Button>
                </Alert>
              )}
              {source && !sourceBusy && (
                <>
                  <p>
                    A base atual foi capturada em{' '}
                    {new Date(source.currentCapturedAt).toLocaleString('pt-BR')}. A nova candidata
                    incluirá material, narrativa, arquivo, ilustrações e lore explicitamente
                    vinculado.
                  </p>
                  <Button
                    disabled={locked}
                    onClick={() => {
                      setComparing(false);
                      void operation.start(source);
                    }}
                  >
                    Iniciar preparação da candidata
                  </Button>
                </>
              )}
            </>
          )}
          {!pending &&
            (selection.comparisonId || operation.control?.scope.kind === 'known') &&
            operation.error && (
              <Button
                disabled={operation.loading || operation.busy}
                onClick={() => void operation.refresh()}
              >
                Consultar controle novamente
              </Button>
            )}
          {progress && (
            <section className={styles.stack} aria-label="Progresso da candidata">
              <h3>{api.stateLabels[progress.state]}</h3>
              <p>Etapa: {api.phaseLabels[progress.phase]}</p>
              {sourceAvailable ? (
                <p>Recursos processados: {progress.processed}</p>
              ) : (
                <p>
                  A origem ou a campanha não está disponível. Apenas o controle próprio e a limpeza
                  permanecem acessíveis.
                </p>
              )}
              {progress.reason && (
                <Alert variant="warning">
                  {progress.reason === 'source-changed'
                    ? 'A origem mudou durante a preparação. Esta candidata foi interrompida.'
                    : progress.reason === 'base-changed'
                      ? 'A base ativa mudou. Esta candidata não pode continuar a preparação.'
                      : 'A preparação não pode continuar com sua origem atual.'}
                </Alert>
              )}
              {!pending && (
                <div className={styles.actions}>
                  {progress.state === 'preparing' && (
                    <Button
                      disabled={locked || !sourceAvailable}
                      onClick={() => void operation.continuePreparation()}
                    >
                      Continuar preparação
                    </Button>
                  )}
                  {progress.state === 'ready' && (
                    <Button
                      disabled={operation.busy || !sourceAvailable}
                      onClick={() => setComparing(true)}
                    >
                      Comparar candidata
                    </Button>
                  )}
                  {progress.state === 'deleting' ? (
                    <Button disabled={locked} onClick={() => void operation.discard()}>
                      Continuar descarte
                    </Button>
                  ) : (
                    !['deleted', 'adopted'].includes(progress.state) && (
                      <Button
                        variant="outline"
                        disabled={locked}
                        onClick={() => setConfirm('candidate')}
                      >
                        Descartar candidata
                      </Button>
                    )
                  )}
                </div>
              )}
              {progress.cleanupComplete && (
                <p>O descarte e a liberação dos usos desta candidata foram confirmados.</p>
              )}
            </section>
          )}
          {open && comparing && progress?.state === 'ready' && sourceAvailable && (
            <ComparisonReader
              key={progress.comparisonId}
              identity={api.identityOf(progress)}
              isActive={() => active() && shown.current}
              onReviewAdoption={
                onReviewAdoption
                  ? (context) => {
                      if (!active() || !shown.current) return;
                      setComparing(false);
                      onClose();
                      onReviewAdoption(context);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </Dialog>
      <Dialog
        open={confirm !== null && open}
        onClose={() => setConfirm(null)}
        title={confirm === 'start' ? 'Encerrar pedido inicial?' : 'Descartar candidata?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Manter candidata
            </Button>
            <Button
              variant="destructive"
              disabled={operation.busy}
              onClick={() => {
                const choice = confirm;
                setConfirm(null);
                setComparing(false);
                if (choice === 'start') void operation.cancelStart();
                else void operation.discard();
              }}
            >
              Confirmar {confirm === 'start' ? 'encerramento inicial' : 'descarte da candidata'}
            </Button>
          </>
        }
      >
        <p>
          {confirm === 'start'
            ? 'Se o pedido ainda não criou uma candidata, ele será impedido de criar. Se já existe uma candidata, seu controle será recuperado e você poderá descartá-la em outra ação explícita.'
            : 'A candidata e seus usos de imagens serão apagados por etapas. A base atual, as variantes e as notas próprias da campanha serão preservadas.'}
        </p>
      </Dialog>
    </>
  );
}
