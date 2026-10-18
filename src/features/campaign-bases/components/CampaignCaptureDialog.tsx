import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { UniverseSelect } from '@/features/universes';
import { Alert, Button, Dialog, Input, LoadingState, Textarea } from '@/shared/ui';
import {
  capturePhaseLabels,
  type CampaignCaptureProgress,
  type CampaignCaptureSource,
} from '../model/campaignBase';
import {
  useCampaignCaptureOperation,
  type CampaignCaptureResult,
} from '../hooks/useCampaignCaptureOperation';
import * as api from '../services/campaignBaseService';
import styles from './CampaignBases.module.css';

export interface CampaignCaptureDialogProps {
  open: boolean;
  onClose: () => void;
  adventureId: string;
  initialCaptureId?: string;
  onActivated: (campaignId: string) => void;
  onPendingChange?: (pending: boolean) => void;
}
export function CampaignCaptureDialog(props: CampaignCaptureDialogProps) {
  const { user } = useAuth();
  return user ? (
    <CaptureSession
      key={JSON.stringify([user.uid, props.adventureId, props.initialCaptureId])}
      {...props}
    />
  ) : null;
}
function CaptureSession(props: CampaignCaptureDialogProps) {
  const [captureId, setCaptureId] = useState(props.initialCaptureId);
  return captureId ? (
    <Preparation key={captureId} {...props} captureId={captureId} />
  ) : (
    <Creation {...props} onPrepared={setCaptureId} />
  );
}
function Recovery({ controller }: { controller: ReturnType<typeof useCampaignCaptureOperation> }) {
  return (
    <>
      {controller.error && <Alert variant="destructive">{controller.error}</Alert>}
      {controller.pending && (
        <Alert variant="warning">
          A resposta ainda não foi confirmada. O pedido original foi preservado.{' '}
          <Button disabled={controller.busy} onClick={() => void controller.recover()}>
            Confirmar mesmo pedido
          </Button>
          {controller.pending.method === 'activateCampaignCapture' && (
            <Button
              disabled={controller.busy}
              variant="outline"
              onClick={() => void controller.resolveActivation()}
            >
              Confirmar registro histórico da ativação
            </Button>
          )}
        </Alert>
      )}
      {controller.historical && (
        <Alert>
          {controller.historical.outcome === 'activated'
            ? 'O registro histórico confirma que a campanha foi criada.'
            : 'O registro histórico confirma que a ativação foi interrompida.'}{' '}
          Isso não confirma a existência ou a identidade atual da campanha. O pedido local
          correspondente foi encerrado.
        </Alert>
      )}
    </>
  );
}
function Creation({
  onPrepared,
  ...props
}: CampaignCaptureDialogProps & { onPrepared: (id: string) => void }) {
  const [source, setSource] = useState<CampaignCaptureSource | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const controller = useCampaignCaptureOperation(
    { kind: 'start', adventureId: props.adventureId },
    {
      onPendingChange: props.onPendingChange,
      onResult: (value) => {
        if (!('kind' in value)) {
          if (value.state === 'activated' && value.campaignId) props.onActivated(value.campaignId);
          else onPrepared(value.captureId);
        }
      },
    },
  );
  const [recovery] = useState(() =>
    controller.pending?.method === 'startCampaignCapture' ? controller.pending.input : null,
  );
  const initialReadBlocked = useRef(Boolean(controller.pending) || controller.blocked);
  const reserved = useRef(controller.isReserved);
  useLayoutEffect(() => {
    reserved.current = controller.isReserved;
  });
  const initialized = useRef(Boolean(recovery));
  const [title, setTitle] = useState(recovery?.title ?? ''),
    [description, setDescription] = useState(recovery?.description ?? ''),
    [universeId, setUniverseId] = useState<string | null>(recovery?.universeId ?? null);
  useEffect(() => {
    if (!props.open || reserved.current() || (initialReadBlocked.current && attempt === 0)) return;
    let active = true;
    void api
      .getCampaignCaptureSource({ adventureId: props.adventureId })
      .then((value) => {
        if (!active) return;
        if (!value) {
          setSource(null);
          setError(
            'Esta aventura não está disponível para sua conta. Nenhuma preparação foi iniciada.',
          );
          return;
        }
        api.assertCampaignProjection(value.sourceToken);
        if (value.adventureId !== props.adventureId || value.loreSelection !== 'referenced')
          throw new Error('A origem da captura não pôde ser confirmada.');
        setSource(value);
        setError('');
        if (!initialized.current) {
          setTitle(value.title);
          setUniverseId(value.universeId);
          initialized.current = true;
        }
      })
      .catch((cause) => {
        if (active) setError(api.captureErrorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [props.open, props.adventureId, attempt]);
  const locked =
    controller.busy || Boolean(controller.pending) || controller.blocked || controller.conflict;
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Criar campanha desta aventura"
      description="Uma base privada e congelada para esta mesa. O original permanece intacto."
      footer={
        <div className={styles.actions}>
          <Button variant="outline" onClick={props.onClose}>
            Fechar
          </Button>
          <Button
            disabled={locked || !source || !title.trim()}
            onClick={() => {
              if (source)
                void controller.execute({
                  method: 'startCampaignCapture',
                  input: {
                    operationId: crypto.randomUUID(),
                    adventureId: props.adventureId,
                    expectedSourceToken: source.sourceToken,
                    title,
                    description,
                    universeId,
                  },
                });
            }}
          >
            Preparar campanha
          </Button>
        </div>
      }
    >
      <div className={styles.stack}>
        <Recovery controller={controller} />
        {controller.conflict && (
          <Alert variant="warning">
            O pedido não pôde continuar com a origem conferida. Seus campos foram preservados.{' '}
            <Button
              onClick={() => {
                controller.clearConflict();
                setSource(null);
                setAttempt((n) => n + 1);
              }}
            >
              Conferir aventura atual para novo pedido
            </Button>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            {error}
            <Button onClick={() => setAttempt((n) => n + 1)}>Tentar novamente</Button>
          </Alert>
        )}
        {!source && !error && !controller.pending && !controller.blocked && (
          <LoadingState label="Conferindo aventura…" />
        )}
        <p>
          A preparação inclui a aventura completa e seu arquivo. Inclui as fichas vinculadas às
          cenas, aos arcos e à cronologia. Reconhecer um nome no texto não cria um vínculo. Outras
          fichas relacionadas ficam de fora. Histórico e checklist não são copiados.
        </p>
        <Input
          label="Título da campanha"
          value={title}
          maxLength={300}
          disabled={locked || !source}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Textarea
          label="Descrição da campanha"
          value={description}
          maxLength={4000}
          disabled={locked || !source}
          onChange={(event) => setDescription(event.target.value)}
        />
        <UniverseSelect
          value={universeId}
          onChange={setUniverseId}
          disabled={locked || !source}
          alwaysShow
          hint="Organiza a campanha; não altera a origem da base."
        />
      </div>
    </Dialog>
  );
}
function Preparation(props: CampaignCaptureDialogProps & { captureId: string }) {
  const [progress, setProgress] = useState<CampaignCaptureProgress | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [running, setRunning] = useState(false);
  const keepRunning = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      keepRunning.current = false;
    };
  }, []);
  const accept = (value: CampaignCaptureResult) => {
    if ('kind' in value) {
      if (value.kind === 'aborted') setProgress(value.preparation);
      else props.onActivated(value.kind === 'activated' ? value.campaign.id : value.campaignId);
    } else if (value.state === 'activated' && value.campaignId) props.onActivated(value.campaignId);
    else setProgress(value);
  };
  const controller = useCampaignCaptureOperation(
    { kind: 'capture', captureId: props.captureId },
    {
      onResult: accept,
      onPendingChange: props.onPendingChange,
      expectedAdventureId: props.adventureId,
    },
  );
  const initialReadBlocked = useRef(Boolean(controller.pending) || controller.blocked);
  const reserved = useRef(controller.isReserved);
  useLayoutEffect(() => {
    reserved.current = controller.isReserved;
  });
  useEffect(() => {
    if (!props.open || reserved.current() || (initialReadBlocked.current && attempt === 0)) return;
    let valid = true;
    void api
      .getCampaignCapture({ captureId: props.captureId })
      .then((value) => {
        if (valid) {
          const confirmed = api.validateCampaignCapture(value, props.captureId);
          if (confirmed.request.adventureId !== props.adventureId)
            throw new Error('A preparação não pertence a esta aventura.');
          setProgress(confirmed);
          setError('');
        }
      })
      .catch((cause) => {
        if (valid) setError(api.captureErrorMessage(cause));
      });
    return () => {
      valid = false;
    };
  }, [props.open, props.captureId, props.adventureId, attempt]);
  async function advance(cleanup: boolean) {
    if (!progress || controller.isReserved() || controller.conflict || running) return;
    keepRunning.current = true;
    setRunning(true);
    let current = progress;
    try {
      while (active.current && keepRunning.current) {
        const value = await controller.execute({
          method: cleanup ? 'cancelCampaignCapture' : 'advanceCampaignCapture',
          expected: { ...current.reserved, adventureId: current.request.adventureId },
          input: {
            captureId: props.captureId,
            operationId: crypto.randomUUID(),
            expectedCheckpoint: current.checkpoint,
          },
        });
        if (!active.current || !value || 'kind' in value) break;
        current = value;
        if (cleanup ? value.cleanupComplete : value.state !== 'preparing') break;
      }
    } finally {
      if (active.current) setRunning(false);
      keepRunning.current = false;
    }
  }
  const locked =
    controller.busy ||
    Boolean(controller.pending) ||
    controller.blocked ||
    running ||
    controller.conflict;
  const close = () => {
    keepRunning.current = false;
    props.onClose();
  };
  return (
    <Dialog
      open={props.open}
      onClose={close}
      title="Preparação da campanha"
      description={progress?.request.title ?? 'Retomar uma preparação privada'}
      footer={
        <Button variant="outline" onClick={close}>
          Fechar e manter preparação
        </Button>
      }
    >
      <div className={styles.stack}>
        <Recovery controller={controller} />
        {error && (
          <Alert variant="destructive">
            {error}
            <Button onClick={() => setAttempt((n) => n + 1)}>Tentar novamente</Button>
          </Alert>
        )}
        {!progress && !error && !controller.pending && !controller.historical && (
          <LoadingState label="Carregando preparação…" />
        )}
        {progress && !controller.historical && (
          <>
            <p role="status">
              {capturePhaseLabels[progress.phase]} · Etapa confirmada {progress.checkpoint}
              {progress.sourceAvailable ? ` · ${progress.processed} recursos processados` : ''}
            </p>
            {!progress.sourceAvailable && (
              <Alert variant="warning">
                A origem está indisponível. Os conteúdos e as contagens da aventura não estão
                acessíveis. Você pode cancelar e concluir a limpeza.
              </Alert>
            )}
            {progress.reason === 'source-changed' && (
              <Alert variant="warning">
                A aventura mudou durante a preparação. Esta captura foi interrompida; cancele para
                limpar os dados antes de iniciar outra captura.
              </Alert>
            )}
            {progress.state === 'deleted' ? (
              <p>A preparação foi cancelada e a limpeza foi concluída.</p>
            ) : (
              <div className={styles.actions}>
                {progress.state === 'activated' && progress.campaignId && (
                  <Button disabled={locked} onClick={() => props.onActivated(progress.campaignId!)}>
                    Abrir campanha criada
                  </Button>
                )}
                {progress.state === 'preparing' && (
                  <Button disabled={locked} onClick={() => void advance(false)}>
                    Continuar preparação
                  </Button>
                )}
                {running && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      keepRunning.current = false;
                    }}
                  >
                    Pausar após esta etapa
                  </Button>
                )}
                {progress.state === 'prepared' && (
                  <Button
                    disabled={locked}
                    onClick={() =>
                      void controller.execute({
                        method: 'activateCampaignCapture',
                        expected: {
                          ...progress.reserved,
                          adventureId: progress.request.adventureId,
                        },
                        input: {
                          captureId: props.captureId,
                          operationId: crypto.randomUUID(),
                          expectedCheckpoint: progress.checkpoint,
                        },
                      })
                    }
                  >
                    Criar campanha com esta base
                  </Button>
                )}
                {progress.state !== 'activated' && (
                  <Button variant="outline" disabled={locked} onClick={() => void advance(true)}>
                    {progress.state === 'deleting'
                      ? 'Continuar limpeza'
                      : 'Cancelar preparação e limpar'}
                  </Button>
                )}
                {controller.conflict && (
                  <Button
                    disabled={controller.busy || Boolean(controller.pending) || running}
                    variant="outline"
                    onClick={() => {
                      controller.clearConflict();
                      setProgress(null);
                      setAttempt((n) => n + 1);
                    }}
                  >
                    Conferir progresso atual
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
