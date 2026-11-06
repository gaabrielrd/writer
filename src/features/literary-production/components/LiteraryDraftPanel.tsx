import { normalizeLiteraryDraftExecution } from '../../../../functions/src/literaryDraftExecution.mjs';
import type { LiteraryCollaborationMode } from '../model/editorial';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { renderRichText } from '@/shared/lib';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Dropdown,
  EmptyState,
  Input,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import {
  startLiteraryDraft,
  setLiteraryDraftExecution,
  type SetLiteraryDraftExecution,
  getLiteraryDraft,
  advanceLiteraryDraft,
  cancelLiteraryDraft,
  cancelPendingLiteraryDraft,
  acceptLiteraryDraftScene,
  adoptLiteraryDraftScene,
  regenerateLiteraryDraftScene,
  restartLiteraryDraftPreservation,
  listLiteraryDrafts,
  type LiteraryDraftFrame,
  type LiteraryDraft,
  type StartLiteraryDraft,
  type AcceptLiteraryDraft,
  type AdoptLiteraryDraft,
} from '../services/literaryDraftService';
import type { ProseApplication } from '../services/literaryProseService';
import styles from './EditorialContractPanel.module.css';
const labels: Record<LiteraryDraft['state'], string> = {
  planning: 'Identificando cenas',
  writing: 'Próxima cena pendente',
  awaitingAcceptance: 'Proposta aguardando aceite',
  existingText: 'Texto existente aguardando adoção',
  attention: 'Etapa interrompida',
  preserving: 'Preservando primeira versão',
  done: 'Primeira versão preservada',
  stale: 'Fontes alteradas; confira a preparação',
  canceled: 'Redação cancelada',
};
const active = (frame: LiteraryDraftFrame) =>
  !frame.job.paused &&
  !frame.job.executionStop &&
  (['planning', 'writing', 'preserving'].includes(frame.job.state) ||
    (frame.job.execution?.mode === 'continuous' &&
      frame.job.state === 'awaitingAcceptance' &&
      frame.proposal?.applicable === true));
const definitive = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  [
    'functions/invalid-argument',
    'functions/not-found',
    'functions/permission-denied',
    'functions/unauthenticated',
    'functions/failed-precondition',
    'functions/resource-exhausted',
  ].includes(String(cause.code));
interface Props {
  coordinated?: boolean;
  coordinatedFrame?: LiteraryDraftFrame;
  coordinatorBusy?: boolean;
  initialJobId?: string;
  collaborationMode?: LiteraryCollaborationMode;
  bookId: string;
  chapterId: string;
  captureGeneration?: () => unknown;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
}
export function LiteraryDraftPanel(props: Props) {
  const { user } = useAuth();
  return (
    <DraftSession
      key={JSON.stringify([user?.uid ?? null, props.bookId, props.chapterId])}
      {...props}
    />
  );
}
function DraftSession({
  coordinated = false,
  coordinatedFrame,
  coordinatorBusy = false,
  bookId,
  chapterId,
  captureGeneration,
  onWorkChange,
  collaborationMode = 'supervised',
  initialJobId,
}: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'supervised' | 'continuous'>('supervised');
  const [maxApplications, setMaxApplications] = useState('2'),
    [maxCredits, setMaxCredits] = useState('2');
  const [controlPending, setControlPending] = useState<SetLiteraryDraftExecution | null>(null),
    [controlling, setControlling] = useState(false);
  const [instruction, setInstruction] = useState(''),
    [pending, setPending] = useState<StartLiteraryDraft | null>(null);
  const [frame, setFrame] = useState<LiteraryDraftFrame | null>(null),
    [page, setPage] = useState<Awaited<ReturnType<typeof listLiteraryDrafts>> | null>(null);
  const [application, setApplication] = useState<ProseApplication | null>(null),
    [applyPending, setApplyPending] = useState<AcceptLiteraryDraft | null>(null);
  const [adoptPending, setAdoptPending] = useState<AdoptLiteraryDraft | null>(null),
    [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false),
    [canceling, setCanceling] = useState(false),
    [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false),
    sequence = useRef(0),
    pause = useRef(false);
  const collaborationAllowed =
    collaborationMode !== 'guidance' &&
    (mode !== 'continuous' || collaborationMode === 'continuous');
  const limitsValid =
    mode === 'supervised' ||
    [Number(maxApplications), Number(maxCredits)].every(
      (value) => Number.isSafeInteger(value) && value > 0 && value <= 1000000,
    );
  const selectedExecution = () =>
    normalizeLiteraryDraftExecution(
      mode === 'continuous'
        ? {
            version: 1,
            mode,
            maxApplications: Number(maxApplications),
            maxCredits: Number(maxCredits),
          }
        : undefined,
    );
  const executionDirty = frame
    ? mode !== (frame.job.execution?.mode ?? 'supervised') ||
      (mode === 'continuous' &&
        (Number(maxApplications) !== frame.job.execution?.maxApplications ||
          Number(maxCredits) !== frame.job.execution?.maxCredits))
    : mode === 'continuous';
  useEffect(() => {
    onWorkChange?.({
      dirty: !!instruction || executionDirty,
      pending:
        pending !== null ||
        applyPending !== null ||
        adoptPending !== null ||
        controlPending !== null ||
        controlling ||
        (busy && frame?.job.execution?.mode === 'continuous'),
    });
  }, [
    instruction,
    pending,
    applyPending,
    adoptPending,
    controlPending,
    controlling,
    busy,
    executionDirty,
    frame?.job.execution?.mode,
    onWorkChange,
  ]);
  useEffect(() => {
    const generation = ++epoch.current;
    return () => {
      epoch.current = generation + 1;
      pause.current = true;
    };
  }, [bookId, chapterId, user?.uid]);
  const run = async (task: (current: number, runId: number) => Promise<void>) => {
    if (working.current || canceling || controlling || controlPending) return;
    const current = epoch.current,
      runId = ++sequence.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task(current, runId);
    } catch (cause) {
      if (epoch.current === current && sequence.current === runId)
        setError(cause instanceof Error ? cause.message : 'Redação indisponível.');
    } finally {
      if (epoch.current === current && sequence.current === runId) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const start = () =>
    run(async (current, runId) => {
      const input = pending ?? {
        target: { kind: 'book' as const, id: bookId },
        jobId: crypto.randomUUID(),
        chapterId,
        instruction,
        ...(mode === 'continuous' ? { execution: selectedExecution() } : {}),
        ...(captureGeneration ? { generation: captureGeneration() } : {}),
      };
      setPending(input);
      let result;
      try {
        result = await startLiteraryDraft(input, user?.uid ?? '');
      } catch (cause) {
        if (epoch.current === current && sequence.current === runId && definitive(cause))
          setPending(null);
        throw cause;
      }
      if (epoch.current === current && sequence.current === runId) {
        setPending(null);
        setFrame(result);
        setInstruction('');
        setApplication(null);
      }
    });
  const open = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryDraft(bookId, id);
      if (epoch.current !== current) return;
      if ('state' in result)
        throw new Error('Criação ainda sem confirmação. Recupere o mesmo pedido.');
      setFrame(result);
      setMode(result.job.execution?.mode ?? 'supervised');
      setMaxApplications(String(result.job.execution?.maxApplications ?? 2));
      setMaxCredits(String(result.job.execution?.maxCredits ?? 2));
      if (adoptPending && result.job.accepted > adoptPending.unitIndex) setAdoptPending(null);
    });
  const lastCoordinated = useRef<LiteraryDraftFrame | undefined>(undefined);
  const adoptCoordinated = useCallback((next: LiteraryDraftFrame) => {
    setFrame(next);
    setMode(next.job.execution?.mode ?? 'supervised');
    setMaxApplications(String(next.job.execution?.maxApplications ?? 2));
    setMaxCredits(String(next.job.execution?.maxCredits ?? 2));
  }, []);
  useEffect(() => {
    if (
      coordinated &&
      coordinatedFrame &&
      coordinatedFrame !== lastCoordinated.current &&
      !busy &&
      !canceling &&
      !controlling &&
      !pending &&
      !controlPending &&
      !applyPending &&
      !adoptPending &&
      !confirm
    ) {
      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        lastCoordinated.current = coordinatedFrame;
        if (
          frame &&
          frame.job.jobId === coordinatedFrame.job.jobId &&
          coordinatedFrame.job.accepted < frame.job.accepted
        )
          return;
        adoptCoordinated(coordinatedFrame);
      });
      return () => {
        active = false;
      };
    }
  }, [
    coordinated,
    coordinatedFrame,
    frame,
    busy,
    canceling,
    controlling,
    pending,
    controlPending,
    applyPending,
    adoptPending,
    confirm,
    adoptCoordinated,
  ]);
  useEffect(() => {
    if (!initialJobId || coordinatedFrame) return;
    let alive = true;
    void getLiteraryDraft(bookId, initialJobId)
      .then((result) => {
        if (!alive) return;
        if ('job' in result) {
          setFrame(result);
          setMode(result.job.execution?.mode ?? 'supervised');
          setMaxApplications(String(result.job.execution?.maxApplications ?? 2));
          setMaxCredits(String(result.job.execution?.maxCredits ?? 2));
        }
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível abrir a redação do ciclo.',
          );
      });
    return () => {
      alive = false;
    };
  }, [bookId, initialJobId, coordinatedFrame]);
  const load = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryDrafts(bookId, chapterId, afterId);
      if (epoch.current === current)
        setPage((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const resume = () =>
    run(async (current, runId) => {
      if (!frame) return;
      pause.current = false;
      let latest = frame;
      while (
        epoch.current === current &&
        sequence.current === runId &&
        !pause.current &&
        active(latest)
      ) {
        latest = await advanceLiteraryDraft(bookId, frame.job.jobId);
        if (epoch.current === current && sequence.current === runId) setFrame(latest);
        if (latest.waitingForResult) break;
      }
    });
  const accept = () =>
    run(async (current) => {
      if (!frame) return;
      const proposal = frame.proposal;
      if (!applyPending && (!proposal?.applicable || proposal.sourceRevision === undefined)) return;
      const input = applyPending ?? {
        target: { kind: 'book' as const, id: bookId },
        jobId: frame.job.jobId,
        requestId: proposal!.requestId,
        operationId: crypto.randomUUID(),
        expectedRevision: proposal!.sourceRevision!,
      };
      setApplyPending(input);
      setConfirm(false);
      let result;
      try {
        result = await acceptLiteraryDraftScene(input, user?.uid ?? '');
      } catch (cause) {
        if (epoch.current === current && definitive(cause)) setApplyPending(null);
        throw cause;
      }
      if (epoch.current === current) {
        setFrame(result.frame);
        setApplication(result.application);
        setApplyPending(null);
      }
    });
  const adopt = () =>
    run(async (current) => {
      if (!frame) return;
      if (!adoptPending && (!frame.existing || !frame.unit)) return;
      const input = adoptPending ?? {
        target: { kind: 'book' as const, id: bookId },
        jobId: frame.job.jobId,
        unitIndex: frame.unit!.index,
        expectedSourceToken: frame.existing!.sourceToken,
      };
      setAdoptPending(input);
      let result;
      try {
        result = await adoptLiteraryDraftScene(input);
      } catch (cause) {
        if (epoch.current === current && definitive(cause)) setAdoptPending(null);
        throw cause;
      }
      if (epoch.current === current) {
        setAdoptPending(null);
        setFrame(result);
      }
    });
  const regenerate = () =>
    run(async (current) => {
      if (!frame) return;
      const result = await regenerateLiteraryDraftScene(bookId, frame.job.jobId);
      if (epoch.current === current) setFrame(result);
    });
  const recapture = () =>
    run(async (current) => {
      if (!frame) return;
      const result = await restartLiteraryDraftPreservation(bookId, frame.job.jobId);
      if (epoch.current === current) setFrame(result);
    });
  const control = async (paused: boolean, amend = false) => {
    if (!frame || canceling || controlling || applyPending || adoptPending || pending) return;
    pause.current = true;
    sequence.current += 1;
    working.current = false;
    setBusy(false);
    setControlling(true);
    setConfirm(false);
    setError(null);
    const current = epoch.current,
      controlRunId = sequence.current;
    let input: SetLiteraryDraftExecution;
    try {
      input = controlPending ?? {
        target: { kind: 'book', id: bookId },
        jobId: frame.job.jobId,
        operationId: crypto.randomUUID(),
        expectedRevision: frame.job.controlRevision ?? 0,
        paused,
        ...(amend ? { execution: selectedExecution() } : {}),
      };
      setControlPending(input);
      const result = await setLiteraryDraftExecution(input, user?.uid ?? '');
      if (epoch.current !== current || sequence.current !== controlRunId) return;
      setFrame(result);
      setControlPending(null);
      setMode(result.job.execution?.mode ?? 'supervised');
      setMaxApplications(String(result.job.execution?.maxApplications ?? 2));
      setMaxCredits(String(result.job.execution?.maxCredits ?? 2));
    } catch (cause) {
      if (epoch.current === current && sequence.current === controlRunId) {
        if (definitive(cause)) setControlPending(null);
        setError(cause instanceof Error ? cause.message : 'Autorização sem confirmação.');
      }
    } finally {
      if (epoch.current === current && sequence.current === controlRunId) setControlling(false);
    }
  };
  const cancel = async () => {
    const id = pending?.jobId ?? frame?.job.jobId;
    if (!id || canceling || applyPending) return;
    const current = epoch.current,
      cancelRunId = ++sequence.current;
    pause.current = true;
    working.current = false;
    setBusy(false);
    setCanceling(true);
    setError(null);
    try {
      const result = pending
        ? await cancelPendingLiteraryDraft(pending, user?.uid ?? '')
        : await cancelLiteraryDraft(bookId, id);
      if (epoch.current === current && sequence.current === cancelRunId) {
        setControlling(false);
        working.current = false;
        setBusy(false);
        setPending(null);
        setAdoptPending(null);
        setFrame(result);
      }
    } catch (cause) {
      if (epoch.current === current && sequence.current === cancelRunId)
        setError(cause instanceof Error ? cause.message : 'Cancelamento sem confirmação.');
    } finally {
      if (epoch.current === current && sequence.current === cancelRunId) {
        setCanceling(false);
        setControlling(false);
      }
    }
  };
  const locked =
    coordinatorBusy ||
    busy ||
    canceling ||
    controlling ||
    controlPending !== null ||
    pending !== null ||
    applyPending !== null ||
    adoptPending !== null;
  return (
    <section className={styles.panel} aria-label="Redação do capítulo por cenas">
      <h3>Redação do capítulo por cenas</h3>
      <p>
        A preparação atual precisa estar aceita. No supervisionado, cada cena espera seu aceite. No
        contínuo, você autoriza aplicações dentro dos limites deste capítulo. Gerar não debita; cada
        aplicação custa 1 crédito. Texto existente e impedimentos pedem decisão explícita.
      </p>
      <p>
        Ao terminar, o texto é preservado como primeira versão no histórico. Revisão, integração e
        publicação são etapas seguintes.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Avançando a redação…" />}
      {pending && <Alert>Confirme o início desta redação antes de criar outra.</Alert>}
      {applyPending && (
        <Alert>
          Há um aceite sem confirmação. Recupere o mesmo pedido para conferir gravação e débito.
        </Alert>
      )}
      {adoptPending && (
        <Alert>
          A adoção precisa de confirmação. Consulte o checkpoint ou repita o mesmo pedido.
        </Alert>
      )}
      {controlPending && (
        <Alert>
          A autorização aguarda confirmação. Recupere o mesmo pedido antes de continuar. Uma etapa
          já em andamento pode ter concluído antes da pausa.
        </Alert>
      )}
      {controlPending && (
        <Button
          disabled={controlling || canceling}
          onClick={() => void control(controlPending.paused)}
        >
          Recuperar a mesma autorização
        </Button>
      )}
      {collaborationMode === 'guidance' && (
        <Alert>
          Orientação: conduza a escrita usando as análises de estrutura e prosa abaixo. A redação
          automática e a aplicação de prosa ficam indisponíveis neste modo.
        </Alert>
      )}
      {collaborationMode === 'supervised' && mode === 'continuous' && (
        <Alert>
          Para autorizar o contínuo, escolha e salve esse método no contrato; depois confira
          novamente a preparação.
        </Alert>
      )}
      {!coordinated && (
        <>
          <Dropdown
            mode="select"
            label="Execução da primeira versão"
            value={mode}
            disabled={locked}
            options={[
              { value: 'supervised', label: 'Supervisionado por cena' },
              { value: 'continuous', label: 'Contínuo com limites' },
            ]}
            onValueChange={(value) => setMode(value as typeof mode)}
          />
          {mode === 'continuous' && (
            <>
              <Input
                label="Limite total de aplicações"
                type="number"
                min={1}
                max={1000000}
                value={maxApplications}
                disabled={locked}
                onChange={(event) => setMaxApplications(event.target.value)}
              />
              <Input
                label="Limite total de créditos"
                type="number"
                min={1}
                max={1000000}
                value={maxCredits}
                disabled={locked}
                onChange={(event) => setMaxCredits(event.target.value)}
              />
              <p>
                Os limites incluem o que esta redação já aplicou e debitou. A execução termina na
                primeira versão preservada; revisão e publicação têm decisões próprias.
              </p>
            </>
          )}
          <Textarea
            label="Orientação para a redação do capítulo"
            maxLength={4000}
            value={instruction}
            disabled={locked}
            onChange={(event) => setInstruction(event.target.value)}
          />
          {!!instruction && (
            <Button variant="ghost" disabled={locked} onClick={() => setInstruction('')}>
              Descartar orientação de redação
            </Button>
          )}
          <div className={styles.actions}>
            <Button
              disabled={
                busy ||
                canceling ||
                controlling ||
                controlPending !== null ||
                applyPending !== null ||
                adoptPending !== null ||
                (!pending && (!limitsValid || !collaborationAllowed))
              }
              hidden={!!initialJobId}
              onClick={() => void start()}
            >
              {pending
                ? 'Recuperar o mesmo início de redação'
                : mode === 'continuous'
                  ? 'Autorizar redação contínua do capítulo'
                  : 'Registrar redação do capítulo'}
            </Button>
            <Button variant="outline" disabled={locked} onClick={() => void load()}>
              Consultar redações do capítulo
            </Button>
            {busy && (
              <Button
                variant="outline"
                onClick={() => {
                  if (frame?.job.execution?.mode === 'continuous') void control(true);
                  else pause.current = true;
                }}
              >
                {frame?.job.execution?.mode === 'continuous'
                  ? 'Pausar execução contínua'
                  : 'Pausar após a etapa atual'}
              </Button>
            )}
          </div>
          {page && !page.items.length && (
            <EmptyState
              title="Nenhuma redação registrada"
              description="Prepare o capítulo e confira o gate antes de iniciar."
            />
          )}
          {page && (
            <ul>
              {page.items.map((item) => (
                <li key={item.jobId}>
                  <Button variant="ghost" disabled={locked} onClick={() => void open(item.jobId)}>
                    {new Date(item.createdAt).toLocaleString('pt-BR')} · {labels[item.state]}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {page?.nextAfterId && (
            <Button variant="outline" disabled={locked} onClick={() => void load(page.nextAfterId)}>
              Mais redações
            </Button>
          )}
        </>
      )}
      {frame && (
        <section className={styles.comparison}>
          <Badge>{labels[frame.job.state]}</Badge>
          {frame.job.execution?.mode === 'continuous' && (
            <p>
              Contínuo: {frame.job.drafted} de {frame.job.execution.maxApplications} aplicações ·{' '}
              {frame.job.chargedCredits ?? frame.job.drafted} de {frame.job.execution.maxCredits}{' '}
              créditos.
            </p>
          )}
          {frame.job.paused && (
            <Alert>
              Autorização pausada no servidor. Uma resposta em andamento fica para conferência antes
              de nova aplicação.
            </Alert>
          )}
          {frame.job.executionStop && (
            <Alert variant="warning">
              {frame.job.executionStop === 'budget'
                ? 'Limite autorizado atingido. Confira o checkpoint antes de autorizar novos limites.'
                : frame.job.executionStop === 'credits'
                  ? 'Saldo insuficiente. A proposta foi preservada; confira o saldo e retome a autorização.'
                  : 'A aplicação exige conferência. O manuscrito e os recibos foram preservados.'}
            </Alert>
          )}
          {!coordinated && !['done', 'stale', 'canceled'].includes(frame.job.state) && (
            <div className={styles.actions}>
              {!controlPending && (
                <>
                  <Button
                    variant="outline"
                    disabled={
                      controlling || canceling || !!applyPending || !!adoptPending || !!pending
                    }
                    onClick={() => void control(!frame.job.paused)}
                  >
                    {frame.job.paused
                      ? 'Retomar autorização no servidor'
                      : 'Pausar autorização no servidor'}
                  </Button>
                  {frame.job.executionStop && !frame.job.paused && (
                    <Button variant="outline" disabled={locked} onClick={() => void control(false)}>
                      Reconferir autorização atual
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={locked || !limitsValid || !executionDirty || !collaborationAllowed}
                    onClick={() => void control(false, true)}
                  >
                    Autorizar estes limites e modo
                  </Button>
                </>
              )}
            </div>
          )}
          <p>
            {frame.job.accepted} de {frame.job.units} cenas aceitas · {frame.job.drafted} redigidas
            neste fluxo · {frame.job.adopted} existentes adotadas
          </p>
          <div className={styles.actions}>
            {!coordinated && active(frame) && (
              <Button
                disabled={locked || collaborationMode === 'guidance'}
                onClick={() => void resume()}
              >
                Retomar até a próxima decisão
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy || canceling || applyPending !== null}
              onClick={() => void open(frame.job.jobId)}
            >
              Consultar checkpoint da redação
            </Button>
            {!coordinated && !['done', 'stale', 'canceled'].includes(frame.job.state) && (
              <Button
                variant="outline"
                disabled={canceling || applyPending !== null}
                onClick={() => void cancel()}
              >
                Cancelar próximas etapas
              </Button>
            )}
            {!coordinated && frame.job.pendingRequestId && (
              <Button
                variant="outline"
                disabled={locked || !!frame.proposal?.hasBlockingFindings}
                onClick={() => void regenerate()}
              >
                Gerar outra proposta para esta cena
              </Button>
            )}
            {!coordinated &&
              frame.job.state === 'attention' &&
              !frame.job.pendingRequestId &&
              frame.job.accepted === frame.job.units && (
                <Button variant="outline" disabled={locked} onClick={() => void recapture()}>
                  Preparar nova tentativa de preservação
                </Button>
              )}
          </div>
          {frame.waitingForResult && (
            <Alert>
              Pedido registrado sem resultado terminal. Consulte novamente ou cancele; nenhuma nova
              geração será reenviada automaticamente.
            </Alert>
          )}
          {frame.job.state === 'stale' && (
            <Alert variant="warning">
              O texto, a preparação ou as fontes mudaram. As cenas já salvas e suas versões foram
              preservadas; confira o impacto antes de continuar.
            </Alert>
          )}
          {frame.existing && (
            <section aria-label="Cena existente para adoção">
              <h4>{frame.existing.title}</h4>
              <div dangerouslySetInnerHTML={{ __html: renderRichText(frame.existing.content) }} />
              <Button disabled={locked} onClick={() => void adopt()}>
                Preservar este texto e avançar
              </Button>
            </section>
          )}
          {frame.proposal && (
            <section aria-label="Proposta da cena atual">
              {frame.proposal.sceneTitle && <h4>{frame.proposal.sceneTitle}</h4>}
              {frame.proposal.message && <p>{frame.proposal.message}</p>}
              {frame.proposal.result && (
                <>
                  <p className={styles.contextText}>{frame.proposal.result.rationale}</p>
                  <p className={styles.contextText}>{frame.proposal.result.text}</p>
                  {frame.proposal.result.findings.map((finding, index) => (
                    <div key={index}>
                      <Badge>
                        {finding.severity === 'blocking'
                          ? 'Impedimento'
                          : finding.severity === 'warning'
                            ? 'Atenção'
                            : 'Sugestão'}
                      </Badge>
                      <blockquote>{finding.quote}</blockquote>
                      <p>{finding.problem}</p>
                      <p>{finding.action}</p>
                    </div>
                  ))}
                </>
              )}
              {frame.proposal.hasBlockingFindings && (
                <Alert variant="warning">
                  Resolva os impedimentos e confira a preparação antes de prosseguir.
                </Alert>
              )}
              {frame.proposal.applicable &&
                frame.job.state === 'awaitingAcceptance' &&
                frame.job.execution?.mode !== 'continuous' && (
                  <Button
                    disabled={locked || frame.job.paused || collaborationMode === 'guidance'}
                    onClick={() => setConfirm(true)}
                  >
                    Revisar aceite desta cena · 1 crédito
                  </Button>
                )}
            </section>
          )}
          {applyPending && (
            <Button disabled={busy || canceling} onClick={() => void accept()}>
              Recuperar o mesmo aceite de cena
            </Button>
          )}
          {adoptPending && (
            <Button disabled={busy || canceling} onClick={() => void adopt()}>
              Recuperar a mesma adoção
            </Button>
          )}
          {frame.job.state === 'done' && (
            <Alert variant="success">
              Primeira versão preservada. Registre a revisão integral para conferir as duas camadas
              e as correções necessárias.
            </Alert>
          )}
        </section>
      )}
      {application && (
        <Alert variant="success">
          Cena salva na revisão {application.revision}; débito confirmado de{' '}
          {application.chargedCredits} crédito. Checkpoint confirmado junto da gravação.
        </Alert>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Aceitar a cena proposta"
        description="O texto proposto será salvo nesta cena. O checkpoint e o débito serão gravados na mesma transação, com conferência das fontes."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Voltar à leitura
            </Button>
            <Button disabled={locked} onClick={() => void accept()}>
              Salvar esta cena · 1 crédito
            </Button>
          </>
        }
      >
        <p>
          O texto anterior fica no histórico. Este aceite não autoriza aplicar as próximas cenas sem
          sua revisão.
        </p>
      </Dialog>
    </section>
  );
}
