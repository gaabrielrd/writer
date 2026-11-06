import { LiteraryWorkflowPassageFields } from './LiteraryWorkflowPassageFields';
import {
  LiteraryWorkflowAdmissionFields,
  type WorkflowAdmissionSelection,
} from './LiteraryWorkflowAdmissionFields';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import {
  Alert,
  Badge,
  Button,
  Dropdown,
  EmptyState,
  Input,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import type { EditorialState, LiteraryCollaborationMode } from '../model/editorial';
import {
  getLiteraryWorkflowScope,
  startLiteraryWorkflow,
  getLiteraryWorkflow,
  advanceLiteraryWorkflow,
  setLiteraryWorkflowControl,
  listLiteraryWorkflows,
  type WorkflowFrame,
  type StartLiteraryWorkflow,
  type AdvanceLiteraryWorkflow,
  type ControlLiteraryWorkflow,
  type WorkflowAction,
  type WorkflowAuthorizedPhase,
  type WorkflowPassageInput,
} from '../services/literaryWorkflowService';
import { LiteraryDraftPanel } from './LiteraryDraftPanel';
import { LiteraryReviewPanel } from './LiteraryReviewPanel';
import styles from './EditorialContractPanel.module.css';
const phaseLabels = {
  preparation: 'Preparação e gate',
  firstVersion: 'Primeira versão',
  review: 'Revisão de estrutura e prosa',
  revisedVersion: 'Versão revisada',
  done: 'Ciclo do capítulo concluído',
  stale: 'Contrato ou origem alterados',
  canceled: 'Ciclo cancelado',
};
const stopLabels: Record<string, string> = {
  preparation: 'Complete e aceite a preparação abaixo antes de continuar.',
  firstVersionAuthorization: 'Confira a preparação antes de autorizar a primeira versão.',
  manualConfirmation: 'Escreva o capítulo e confirme quando sua primeira versão estiver completa.',
  firstVersionAcceptance: 'Confira a primeira versão preservada antes de iniciar a revisão.',
  scene: 'A cena aguarda seu aceite no checkpoint de redação.',
  existingText: 'Há texto existente. Confira e adote-o explicitamente no checkpoint de redação.',
  reviewAcceptance: 'Confira o relatório integral antes de aceitar a revisão.',
  revisedVersionAuthorization: 'Autorize a preservação da versão revisada.',
  corrections: 'Há impedimentos estruturais. Resolva-os e reinicie a revisão sobre o texto atual.',
  reconciliation: 'As fontes mudaram. Confira o texto e reconcilie a etapa antes de continuar.',
  budget: 'Limite autorizado atingido. Amplie explicitamente os limites para continuar.',
  attention: 'A etapa precisa de atenção. Confira o checkpoint de redação ou revisão.',
};
const continuousPhases: Record<WorkflowAuthorizedPhase, string> = {
  firstVersion: 'Primeira versão',
  review: 'Revisão integral',
  revisedVersion: 'Versão revisada',
};
const isActive = (f: WorkflowFrame) =>
  f.job.registrationState === 'active' &&
  !f.job.paused &&
  !f.job.stop &&
  !f.waitingForResult &&
  !['done', 'stale', 'canceled'].includes(f.job.phase);
const definitive = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  [
    'invalid-argument',
    'failed-precondition',
    'not-found',
    'permission-denied',
    'unauthenticated',
  ].some((code) => String(cause.code) === code || String(cause.code) === 'functions/' + code);
interface Props {
  managedFrame?: WorkflowFrame;
  managedBusy?: boolean;
  onCheckpointChange?: () => void;
  bookId: string;
  chapterId: string;
  collaborationMode?: LiteraryCollaborationMode;
  editorialState?: EditorialState | null;
  captureGeneration?: () => unknown;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
}
export function LiteraryWorkflowPanel(props: Props) {
  const { user } = useAuth();
  return (
    <WorkflowSession
      key={JSON.stringify([
        user?.uid ?? null,
        props.bookId,
        props.chapterId,
        props.managedFrame?.job.jobId ?? null,
      ])}
      {...props}
    />
  );
}
function WorkflowSession({
  managedFrame,
  managedBusy = false,
  onCheckpointChange,
  bookId,
  chapterId,
  collaborationMode = 'supervised',
  editorialState,
  captureGeneration,
  onWorkChange,
}: Props) {
  const { user } = useAuth();
  const [frame, setFrame] = useState<WorkflowFrame | null>(managedFrame ?? null),
    [page, setPage] = useState<Awaited<ReturnType<typeof listLiteraryWorkflows>> | null>(null);
  const [instruction, setInstruction] = useState(''),
    [applications, setApplications] = useState('2'),
    [credits, setCredits] = useState('2'),
    [steps, setSteps] = useState('200');
  const [passageEnabled, setPassageEnabled] = useState(false),
    [passage, setPassage] = useState<WorkflowPassageInput | null>(null),
    [passageValid, setPassageValid] = useState(true);
  const [admissionSelection, setAdmissionSelection] = useState<WorkflowAdmissionSelection | null>(
      null,
    ),
    [inspectionWork, setInspectionWork] = useState({ dirty: false, pending: false });
  const publicationRequired =
    editorialState?.contract.publicationPolicy?.requirePreviousPublication === true;
  const admissionValid =
    !publicationRequired ||
    (!!admissionSelection &&
      admissionSelection.contractRevision === editorialState?.revision &&
      (!admissionSelection.previousChapterId || (passageEnabled && !!passage)));
  const [authorizedPhases, setAuthorizedPhases] = useState<WorkflowAuthorizedPhase[]>([]);
  const [startPending, setStartPending] = useState<StartLiteraryWorkflow | null>(null),
    [stepPending, setStepPending] = useState<AdvanceLiteraryWorkflow | null>(null),
    [controlPending, setControlPending] = useState<ControlLiteraryWorkflow | null>(null);
  const [busy, setBusy] = useState(false),
    [controlling, setControlling] = useState(false),
    [canceling, setCanceling] = useState(false),
    [error, setError] = useState<string | null>(null),
    [details, setDetails] = useState(false),
    [detailsVisited, setDetailsVisited] = useState(false),
    [draftWork, setDraftWork] = useState({ dirty: false, pending: false }),
    [reviewWork, setReviewWork] = useState({ dirty: false, pending: false });
  const alive = useRef(true),
    sequence = useRef(0),
    working = useRef(false),
    controlWorking = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const mode = frame?.job.collaboration.mode ?? collaborationMode;
  const limits = {
    maxApplications: mode === 'guidance' ? 0 : Number(applications),
    maxCredits: mode === 'guidance' ? 0 : Number(credits),
    maxSteps: Number(steps),
  };
  const valid =
    [limits.maxApplications, limits.maxCredits, limits.maxSteps].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000,
    ) && limits.maxSteps > 0;
  const dirty =
    !!instruction ||
    (!frame && passageEnabled) ||
    (frame
      ? JSON.stringify(limits) !== JSON.stringify(frame.job.limits) ||
        JSON.stringify(authorizedPhases) !== JSON.stringify(frame.job.authorizedPhases)
      : authorizedPhases.length > 0);
  useEffect(() => {
    onWorkChange?.({
      dirty: dirty || draftWork.dirty || reviewWork.dirty || inspectionWork.dirty,
      pending:
        busy ||
        controlling ||
        !!startPending ||
        !!stepPending ||
        !!controlPending ||
        draftWork.pending ||
        reviewWork.pending ||
        inspectionWork.pending,
    });
  }, [
    dirty,
    busy,
    controlling,
    startPending,
    stepPending,
    controlPending,
    draftWork,
    reviewWork,
    inspectionWork,
    onWorkChange,
  ]);
  const sync = useCallback((f: WorkflowFrame) => {
    setFrame(f);
    setAdmissionSelection(null);
    setInspectionWork({ dirty: false, pending: false });
    setPassage(f.job.passage?.input ?? null);
    setPassageEnabled(!!f.job.passage);
    setApplications(String(f.job.limits.maxApplications));
    setCredits(String(f.job.limits.maxCredits));
    setSteps(String(f.job.limits.maxSteps));
    setAuthorizedPhases(f.job.authorizedPhases);
  }, []);
  const lastManaged = useRef<WorkflowFrame | undefined>(undefined);
  useEffect(() => {
    if (
      managedFrame &&
      managedFrame !== lastManaged.current &&
      !draftWork.dirty &&
      !reviewWork.dirty &&
      !draftWork.pending &&
      !reviewWork.pending &&
      !controlPending &&
      !controlling
    ) {
      lastManaged.current = managedFrame;
      sync(managedFrame);
    }
  }, [managedFrame, draftWork, reviewWork, controlPending, controlling, sync]);
  async function run(task: (seq: number) => Promise<void>) {
    if (working.current || controlWorking.current) return;
    const seq = ++sequence.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task(seq);
    } catch (cause) {
      if (alive.current && seq === sequence.current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível continuar o ciclo.');
    } finally {
      if (alive.current && seq === sequence.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  const start = () =>
    run(async (seq) => {
      if (!startPending && (editorialState === null || !admissionValid))
        throw new Error('Confira o contrato e selecione a inspeção de entrada antes de registrar.');
      if (!startPending && passageEnabled && (!passageValid || !passage))
        throw new Error('Escolha e confira as condições de entrada antes de registrar.');
      let input: StartLiteraryWorkflow = startPending ?? {
        target: { kind: 'book' as const, id: bookId },
        jobId: crypto.randomUUID(),
        chapterId,
        ...(admissionSelection ? { admissionInspectionId: admissionSelection.inspectionId } : {}),
        ...(passageEnabled && passage
          ? {
              passage: {
                ...passage,
                ...(admissionSelection ? { inspectionId: admissionSelection.inspectionId } : {}),
              },
            }
          : {}),
        instruction,
        expectedScopeToken: '',
        limits,
        authorizedPhases: mode === 'continuous' ? [...authorizedPhases] : [],
        ...(captureGeneration ? { generation: captureGeneration() } : {}),
      };
      if (!startPending) {
        const source = input.admissionInspectionId
          ? await getLiteraryWorkflowScope(
              bookId,
              chapterId,
              input.passage,
              input.admissionInspectionId,
            )
          : await getLiteraryWorkflowScope(bookId, chapterId, input.passage);
        if (!alive.current || seq !== sequence.current) return;
        input = { ...input, expectedScopeToken: source.originToken };
      }
      setStartPending(input);
      try {
        const f = await startLiteraryWorkflow(input, user?.uid ?? '');
        if (!alive.current || seq !== sequence.current) return;
        sync(f);
        setStartPending(null);
        setInstruction('');
        setDetails(false);
      } catch (cause) {
        if (definitive(cause) && alive.current && seq === sequence.current) setStartPending(null);
        throw cause;
      }
    });
  const childDirty = draftWork.dirty || reviewWork.dirty;
  const open = (id: string) =>
    run(async (seq) => {
      const f = await getLiteraryWorkflow(bookId, id);
      if (alive.current && seq === sequence.current) {
        sync(f);
        setDetails(false);
      }
    });
  const list = (after: string | null = null) =>
    run(async (seq) => {
      const result = await listLiteraryWorkflows(bookId, chapterId, after);
      if (alive.current && seq === sequence.current)
        setPage((old) => ({
          ...result,
          items: after ? [...(old?.items ?? []), ...result.items] : result.items,
        }));
    });
  const resume = (recover = false) =>
    run(async (seq) => {
      if (!frame) return;
      let latest = frame,
        request = recover
          ? (stepPending ??
            (frame.job.busyStep
              ? {
                  target: { kind: 'book' as const, id: bookId },
                  jobId: frame.job.jobId,
                  operationId: frame.job.busyStep,
                  expectedRevision: frame.job.revision,
                  expectedOriginToken: frame.job.originToken,
                }
              : null))
          : null;
      do {
        const input = request ?? {
          target: { kind: 'book' as const, id: bookId },
          jobId: latest.job.jobId,
          operationId: crypto.randomUUID(),
          expectedRevision: latest.job.revision,
          expectedOriginToken: latest.job.originToken,
        };
        setStepPending(input);
        try {
          latest = await advanceLiteraryWorkflow(input, user?.uid ?? '');
          if (alive.current)
            setStepPending((old) => (old?.operationId === input.operationId ? null : old));
        } catch (cause) {
          if (definitive(cause) && alive.current)
            setStepPending((old) => (old?.operationId === input.operationId ? null : old));
          throw cause;
        }
        if (!alive.current || seq !== sequence.current) return;
        setFrame(latest);
        request = null;
      } while (isActive(latest));
    });
  async function control(action: WorkflowAction, recover = false, amend = false) {
    if (!frame || canceling || (controlWorking.current && action !== 'cancel')) return;
    const seq = ++sequence.current;
    working.current = false;
    controlWorking.current = true;
    setControlling(true);
    setCanceling(action === 'cancel');
    setBusy(false);
    setError(null);
    let input: ControlLiteraryWorkflow =
      recover && controlPending
        ? controlPending
        : {
            target: { kind: 'book' as const, id: bookId },
            jobId: frame.job.jobId,
            operationId: crypto.randomUUID(),
            expectedRevision: frame.job.revision,
            expectedOriginToken: frame.job.originToken,
            action,
            ...(amend
              ? { limits, authorizedPhases: mode === 'continuous' ? [...authorizedPhases] : [] }
              : {}),
            ...(action === 'startFirstVersion' || action === 'confirmManual'
              ? { expectedGateToken: frame.job.gate?.stateToken }
              : {}),
            ...(action === 'acceptFirstVersion'
              ? { expectedFirstVersionId: frame.job.firstVersionId ?? undefined }
              : {}),
            ...(action === 'acceptReview'
              ? { expectedReviewSourceToken: frame.review?.sourceToken ?? undefined }
              : {}),
          };
    try {
      if (action === 'cancel' && !recover) {
        const latest = await getLiteraryWorkflow(bookId, frame.job.jobId);
        if (!alive.current || seq !== sequence.current) return;
        if (['done', 'canceled'].includes(latest.job.phase)) {
          sync(latest);
          setControlPending(null);
          return;
        }
        input = {
          ...input,
          expectedRevision: latest.job.revision,
          expectedOriginToken: latest.job.originToken,
        };
      }
      setControlPending(input);
      const f = await setLiteraryWorkflowControl(input, user?.uid ?? '');
      if (!alive.current || seq !== sequence.current) return;
      sync(f);
      setControlPending(null);
      onCheckpointChange?.();
    } catch (cause) {
      if (alive.current && seq === sequence.current) {
        if (definitive(cause)) setControlPending(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Controle sem confirmação. Recupere a mesma operação.',
        );
      }
    } finally {
      if (alive.current && seq === sequence.current) {
        controlWorking.current = false;
        setControlling(false);
        setCanceling(false);
      }
    }
  }
  const locked =
    managedBusy ||
    busy ||
    controlling ||
    !!startPending ||
    !!stepPending ||
    !!controlPending ||
    draftWork.pending ||
    reviewWork.pending;
  const formLocked =
    locked || inspectionWork.pending || frame?.job.registrationState === 'registering';
  const job = frame?.job,
    terminal = job && ['done', 'stale', 'canceled'].includes(job.phase);
  return (
    <section className={styles.panel} aria-label="Ciclo editorial do capítulo">
      <h3>Ciclo editorial do capítulo</h3>
      <p>
        Conecte preparação, primeira versão, revisão de estrutura e prosa e versão revisada deste
        capítulo. Registrar o ciclo não inicia geração. Alterações feitas fora dele exigem
        reconferência antes de continuar.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Avançando o ciclo até a próxima decisão…" />}
      {startPending && (
        <Alert>
          <p>Registro sem confirmação. Preserve a mesma operação.</p>
          <Button disabled={busy || controlling} onClick={() => void start()}>
            Recuperar registro do ciclo
          </Button>
        </Alert>
      )}
      {stepPending && (
        <Alert>
          <p>Passo sem confirmação. A recuperação consulta o mesmo passo.</p>
          <Button disabled={busy || controlling} onClick={() => void resume(true)}>
            Recuperar o mesmo passo
          </Button>
        </Alert>
      )}
      {controlPending && (
        <Alert>
          <p>Controle sem confirmação. Preserve a decisão original.</p>
          <Button disabled={controlling} onClick={() => void control(controlPending.action, true)}>
            Recuperar controle do ciclo
          </Button>
        </Alert>
      )}
      {managedFrame && (
        <Alert>
          Este capítulo pertence à sequência. Avanço, limites, pausa e cancelamento são coordenados
          pelos controles da sequência; as decisões autorais permanecem abaixo.
        </Alert>
      )}
      {!managedFrame && (
        <>
          {mode !== 'guidance' && (
            <>
              <Input
                label="Limite total de aplicações do ciclo"
                type="number"
                min={0}
                max={1000000}
                value={applications}
                disabled={formLocked}
                onChange={(e) => setApplications(e.target.value)}
              />
              <Input
                label="Limite total de créditos do ciclo"
                type="number"
                min={0}
                max={1000000}
                value={credits}
                disabled={formLocked}
                onChange={(e) => setCredits(e.target.value)}
              />
            </>
          )}
          <Input
            label="Limite total de passos do ciclo"
            type="number"
            min={1}
            max={1000000}
            value={steps}
            disabled={formLocked}
            onChange={(e) => setSteps(e.target.value)}
          />
          {mode === 'continuous' &&
            Object.entries(continuousPhases).map(([key, label]) => (
              <Dropdown
                key={key}
                mode="select"
                label={'Passagem: ' + label}
                value={
                  authorizedPhases.includes(key as WorkflowAuthorizedPhase)
                    ? 'continuous'
                    : 'manual'
                }
                disabled={formLocked}
                options={[
                  { value: 'manual', label: 'Aguardar minha decisão' },
                  { value: 'continuous', label: 'Autorizar passagem contínua' },
                ]}
                onValueChange={(value) =>
                  setAuthorizedPhases((old) =>
                    value === 'continuous'
                      ? [...old.filter((p) => p !== key), key as WorkflowAuthorizedPhase].sort(
                          (a, b) =>
                            Object.keys(continuousPhases).indexOf(a) -
                            Object.keys(continuousPhases).indexOf(b),
                        )
                      : old.filter((p) => p !== key),
                  )
                }
              />
            ))}
          {!job && editorialState === null && (
            <Alert>
              Contrato ainda indisponível. Abra Contrato e decisões para consultar novamente.
            </Alert>
          )}
          {!job && editorialState && (
            <LiteraryWorkflowAdmissionFields
              actorId={user?.uid ?? ''}
              bookId={bookId}
              chapterId={chapterId}
              contractRevision={editorialState.revision}
              required={publicationRequired}
              unit={editorialState.contract.publicationPolicy?.unit ?? null}
              disabled={locked}
              onChange={setAdmissionSelection}
              onWorkChange={setInspectionWork}
            />
          )}
          {!job &&
            publicationRequired &&
            admissionSelection?.previousChapterId &&
            !passageEnabled && (
              <Alert>
                Selecione a continuação após o capítulo revisado e escolha o ciclo da predecessora
                conferida.
              </Alert>
            )}
          {!job && (
            <LiteraryWorkflowPassageFields
              bookId={bookId}
              chapterId={chapterId}
              targetActId={admissionSelection?.chapterActId}
              enabled={passageEnabled}
              value={passage}
              disabled={formLocked}
              onEnabledChange={setPassageEnabled}
              onChange={setPassage}
              onValidityChange={setPassageValid}
            />
          )}
          {!job && (
            <Textarea
              label="Orientação para este ciclo"
              value={instruction}
              maxLength={4000}
              disabled={locked}
              onChange={(e) => setInstruction(e.target.value)}
            />
          )}
          <div className={styles.actions}>
            <Button
              disabled={
                locked ||
                childDirty ||
                !valid ||
                (!job && passageEnabled && !passageValid) ||
                (!job && (editorialState === null || !admissionValid || inspectionWork.pending)) ||
                (!!job && !terminal && !job.paused)
              }
              onClick={() => {
                if (job) {
                  setFrame(null);
                  setAdmissionSelection(null);
                  setInspectionWork({ dirty: false, pending: false });
                  setPassage(null);
                  setPassageEnabled(false);
                  setPassageValid(true);
                  setDetails(false);
                  setDetailsVisited(false);
                  setDraftWork({ dirty: false, pending: false });
                  setReviewWork({ dirty: false, pending: false });
                } else void start();
              }}
            >
              {job ? 'Preparar novo ciclo deste capítulo' : 'Registrar novo ciclo deste capítulo'}
            </Button>
            <Button variant="outline" disabled={locked || childDirty} onClick={() => void list()}>
              Consultar ciclos do capítulo
            </Button>
          </div>
          {page && !page.items.length && (
            <EmptyState
              title="Nenhum ciclo registrado"
              description="Registre o escopo e os limites para acompanhar as fases deste capítulo."
            />
          )}
          {page && (
            <ul>
              {page.items.map((item) => (
                <li key={item.jobId}>
                  <Button variant="ghost" disabled={locked} onClick={() => void open(item.jobId)}>
                    {phaseLabels[item.phase]} · {new Date(item.createdAt).toLocaleString('pt-BR')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {page?.nextAfterId && (
            <Button disabled={locked} variant="outline" onClick={() => void list(page.nextAfterId)}>
              Mais ciclos
            </Button>
          )}
        </>
      )}
      {job && (
        <section className={styles.comparison} aria-label="Checkpoint do ciclo">
          <Badge>{phaseLabels[job.phase]}</Badge>
          {!managedFrame && job.busyStep && !stepPending && (
            <Alert>
              <p>Há um passo registrado no servidor. Recupere esse passo antes de iniciar outro.</p>
              <Button disabled={busy || controlling} onClick={() => void resume(true)}>
                Recuperar passo registrado no servidor
              </Button>
            </Alert>
          )}
          <p>
            {job.bookTitle} · {job.chapterTitle}
          </p>
          {job.admission && (
            <Alert>
              <p>
                Política de entrada conferida no contrato {job.admission.policy.revision}:{' '}
                {job.admission.condition === 'firstUnit'
                  ? 'primeira unidade sem predecessora'
                  : job.admission.condition === 'continuedAct'
                    ? 'continuação do ato já admitido'
                    : 'unidade anterior com publicação integral conferida'}
                .
              </p>
              <p>
                {job.admissionEntered
                  ? 'Ingresso confirmado antes da primeira versão.'
                  : 'A prova será reconferida antes do ingresso.'}
              </p>
            </Alert>
          )}
          {job.passage && (
            <Alert>
              <p>
                Entrada vinculada ao capítulo {job.passage.previous.title}: revisão integral
                preservada
                {job.passage.condition === 'integratedAct'
                  ? ' e integração aceita do ato anterior'
                  : ''}
                .
              </p>
              <p>
                {job.passageEntered
                  ? 'Passagem de entrada conferida.'
                  : 'As condições serão reconferidas antes de iniciar a primeira versão.'}
              </p>
            </Alert>
          )}
          {!managedFrame && job.registrationState === 'registering' && (
            <Alert>
              <p>
                Registro aguardando confirmação de sua origem. Confira o capítulo, as fases e os
                limites antes de finalizar.
              </p>
              <Button disabled={locked} onClick={() => void control('confirmRegistration')}>
                Conferir e finalizar registro do ciclo
              </Button>
            </Alert>
          )}
          <p>
            {job.steps} de {job.limits.maxSteps} passos ·{' '}
            {job.priorApplications + (frame.draft?.job.drafted ?? 0)} de{' '}
            {job.limits.maxApplications} aplicações ·{' '}
            {job.priorCredits + (frame.draft?.job.chargedCredits ?? 0)} de {job.limits.maxCredits}{' '}
            créditos.
          </p>
          {job.stop && (
            <Alert>{stopLabels[job.stop] ?? 'Confira o checkpoint antes de continuar.'}</Alert>
          )}
          {job.paused && !terminal && (
            <Alert>
              Ciclo pausado no servidor. Uma geração já registrada pode terminar; a pausa impede a
              aplicação.
            </Alert>
          )}
          {frame.waitingForResult && (
            <Alert>Há uma resposta pendente. Consulte o checkpoint antes de retomar.</Alert>
          )}
          {!managedFrame && (
            <div className={styles.actions}>
              <Button variant="outline" disabled={locked} onClick={() => void open(job.jobId)}>
                Consultar checkpoint do ciclo
              </Button>
              {!terminal && (
                <>
                  <Button
                    disabled={
                      locked || job.paused || !!job.busyStep || job.registrationState !== 'active'
                    }
                    onClick={() => void resume()}
                  >
                    Retomar ciclo até a próxima decisão
                  </Button>
                  <Button
                    variant="outline"
                    disabled={controlling || !!controlPending || job.registrationState !== 'active'}
                    onClick={() => void control('pause')}
                  >
                    Pausar ciclo no servidor
                  </Button>
                  <Button
                    variant="outline"
                    disabled={locked || !valid || job.registrationState !== 'active'}
                    onClick={() => void control('resume', false, true)}
                  >
                    Autorizar estes limites e retomar ciclo
                  </Button>
                  <Button
                    variant="outline"
                    disabled={canceling}
                    onClick={() => void control('cancel')}
                  >
                    Cancelar ciclo
                  </Button>
                </>
              )}
            </div>
          )}
          {!terminal && job.stop === 'firstVersionAuthorization' && (
            <Button
              disabled={locked || job.paused}
              onClick={() => void control('startFirstVersion')}
            >
              Autorizar primeira versão deste ciclo
            </Button>
          )}
          {!terminal && job.stop === 'manualConfirmation' && (
            <Button disabled={locked || job.paused} onClick={() => void control('confirmManual')}>
              Confirmar primeira versão escrita manualmente
            </Button>
          )}
          {!terminal && job.stop === 'firstVersionAcceptance' && (
            <Button
              disabled={locked || job.paused}
              onClick={() => void control('acceptFirstVersion')}
            >
              Aceitar primeira versão e iniciar revisão
            </Button>
          )}
          {!terminal && job.stop === 'reviewAcceptance' && (
            <Button disabled={locked || job.paused} onClick={() => void control('acceptReview')}>
              Aceitar revisão e preservar versão revisada
            </Button>
          )}
          {!terminal && job.stop === 'revisedVersionAuthorization' && (
            <Button
              disabled={locked || job.paused}
              onClick={() => void control('startRevisedVersion')}
            >
              Autorizar preservação da versão revisada
            </Button>
          )}
          {!terminal && ['attention', 'reconciliation', 'corrections'].includes(job.stop ?? '') && (
            <Button
              disabled={locked}
              onClick={() =>
                void control(
                  job.phase === 'review' || job.phase === 'revisedVersion'
                    ? 'reconcileReview'
                    : 'reconcileDraft',
                )
              }
            >
              Reconciliar etapa com o texto atual
            </Button>
          )}
          {job.firstVersionId && (
            <p>
              Primeira versão preservada no histórico do capítulo. Confira as versões e o relatório
              antes de aceitar a passagem.
            </p>
          )}
          {job.phase === 'done' && (
            <Alert variant="success">
              Primeira versão e versão revisada preservadas. Confira a integração deste capítulo ao
              ato e ao livro para seguir o processo editorial.
            </Alert>
          )}
          {(frame.draft || frame.review) && (
            <Button
              variant="ghost"
              onClick={() => {
                setDetailsVisited(true);
                setDetails((old) => !old);
              }}
            >
              {details ? 'Fechar checkpoints nativos' : 'Conferir redação e relatório deste ciclo'}
            </Button>
          )}
          {detailsVisited && frame.draft && (
            <div hidden={!details}>
              <LiteraryDraftPanel
                key={job.draftId}
                bookId={bookId}
                chapterId={chapterId}
                collaborationMode={mode}
                initialJobId={job.draftId}
                coordinated={!!managedFrame}
                coordinatedFrame={managedFrame ? frame.draft : undefined}
                coordinatorBusy={managedBusy}
                onWorkChange={setDraftWork}
              />
            </div>
          )}
          {detailsVisited && frame.review && (
            <div hidden={!details}>
              <LiteraryReviewPanel
                key={job.reviewId}
                bookId={bookId}
                chapterId={chapterId}
                initialJobId={job.reviewId}
                coordinated={!!managedFrame}
                coordinatedReview={managedFrame ? frame.review : undefined}
                coordinatorBusy={managedBusy}
                onWorkChange={setReviewWork}
              />
            </div>
          )}
        </section>
      )}
    </section>
  );
}
