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
import type { LiteraryReferencePage } from '../model/planning';
import { listLiteraryReferences } from '../services/literaryPlanningService';
import {
  listLiteraryIntegrations,
  type LiteraryIntegration,
} from '../services/literaryIntegrationService';
import {
  getLiterarySequenceScope,
  startLiterarySequence,
  getLiterarySequence,
  listLiterarySequences,
  advanceLiterarySequence,
  setLiterarySequenceControl,
  recoverLiterarySequenceStep,
  type SequenceScope,
  type SequenceFrame,
  type StartLiterarySequence,
  type AdvanceLiterarySequence,
  type ControlLiterarySequence,
  type SequenceAction,
} from '../services/literarySequenceService';
import type { WorkflowAuthorizedPhase, WorkflowFrame } from '../services/literaryWorkflowService';
import { LiteraryWorkflowPanel } from './LiteraryWorkflowPanel';
import {
  LiteraryWorkflowAdmissionFields,
  type WorkflowAdmissionSelection,
} from './LiteraryWorkflowAdmissionFields';
import { LiteraryWorkflowPassageFields } from './LiteraryWorkflowPassageFields';
import type { WorkflowPassageInput } from '../services/literaryWorkflowService';
import styles from './EditorialContractPanel.module.css';
const phases: Record<WorkflowAuthorizedPhase, string> = {
  firstVersion: 'Primeira versão',
  review: 'Revisão integral',
  revisedVersion: 'Versão revisada',
};
const modes = {
  guidance: 'Orientação',
  supervised: 'Execução supervisionada',
  continuous: 'Execução contínua com limites',
};
const stops: Record<string, string> = {
  nextChapterAuthorization: 'O próximo capítulo exige sua autorização.',
  actIntegration: 'Para sair deste ato, escolha uma integração integral aceita e atual.',
  publication:
    'Confira a ordem e a publicação da unidade anterior e escolha a inspeção antes de continuar.',
  budget: 'O limite agregado foi atingido. Confira o consumo antes de ampliar a autorização.',
  preparation: 'Complete e aceite a preparação deste capítulo na área de preparação.',
  scope:
    'O contrato, a ordem ou uma origem mudou. Confira o escopo antes de registrar outra sequência.',
  awaitingResult: 'Há uma resposta pendente. Consulte o checkpoint antes de continuar.',
  firstVersionAuthorization: 'Confira o gate e autorize a primeira versão no ciclo abaixo.',
  firstVersionAcceptance: 'Confira e aceite a primeira versão no ciclo abaixo.',
  reviewAcceptance: 'Confira e aceite a revisão integral no ciclo abaixo.',
  revisedVersionAuthorization: 'Autorize a preservação da versão revisada no ciclo abaixo.',
  scene: 'A cena espera seu aceite no checkpoint de redação abaixo.',
  existingText: 'Confira e adote explicitamente o texto existente no checkpoint abaixo.',
  manualConfirmation: 'Escreva o capítulo e confirme a primeira versão manual no ciclo abaixo.',
  corrections: 'Resolva os impedimentos e reconcilie a revisão no ciclo abaixo.',
  reconciliation: 'Confira as fontes e reconcilie o ciclo do capítulo abaixo.',
};
interface Props {
  bookId: string;
  collaborationMode?: LiteraryCollaborationMode;
  editorialState?: EditorialState | null;
  captureGeneration?: () => unknown;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
}
export function LiterarySequencePanel(props: Props) {
  const { user } = useAuth();
  return (
    <SequenceSession
      key={JSON.stringify([user?.uid ?? null, props.bookId])}
      {...props}
      actorId={user?.uid ?? ''}
    />
  );
}
function SequenceSession({
  bookId,
  actorId,
  collaborationMode = 'supervised',
  editorialState,
  captureGeneration,
  onWorkChange,
}: Props & { actorId: string }) {
  const [references, setReferences] = useState<LiteraryReferencePage | null>(null);
  const [choice, setChoice] = useState(''),
    [selected, setSelected] = useState<Array<{ id: string; title: string }>>([]);
  const [instruction, setInstruction] = useState(''),
    [applications, setApplications] = useState('3'),
    [credits, setCredits] = useState('3'),
    [steps, setSteps] = useState('1000');
  const [authorizedPhases, setAuthorizedPhases] = useState<WorkflowAuthorizedPhase[]>([]),
    [between, setBetween] = useState(false);
  const [preview, setPreview] = useState<{
    input: StartLiterarySequence;
    scope: SequenceScope;
  } | null>(null);
  const [frame, setFrame] = useState<SequenceFrame | null>(null);
  const [childFrame, setChildFrame] = useState<WorkflowFrame | null>(null);
  const [page, setPage] = useState<Awaited<ReturnType<typeof listLiterarySequences>> | null>(null);
  const [reports, setReports] = useState<{
      items: LiteraryIntegration[];
      nextAfterId: string | null;
    } | null>(null),
    [integrationId, setIntegrationId] = useState('');
  const [startPending, setStartPending] = useState<StartLiterarySequence | null>(null),
    [stepPending, setStepPending] = useState<AdvanceLiterarySequence | null>(null),
    [controlPending, setControlPending] = useState<ControlLiterarySequence | null>(null);
  const [busy, setBusy] = useState(false),
    [controlling, setControlling] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [childWork, setChildWork] = useState({ dirty: false, pending: false });
  const [entryWork, setEntryWork] = useState({ dirty: false, pending: false }),
    [entrySelection, setEntrySelection] = useState<{
      index: number;
      originToken: string;
      value: WorkflowAdmissionSelection;
    } | null>(null),
    [firstPassage, setFirstPassage] = useState<WorkflowPassageInput | null>(null),
    [firstPassageEnabled, setFirstPassageEnabled] = useState(false),
    [firstPassageValid, setFirstPassageValid] = useState(true);
  const alive = useRef(false),
    serial = useRef(0),
    working = useRef(false),
    controlWorking = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const job = frame?.job,
    mode = job?.collaboration.mode ?? collaborationMode;
  const entryIndex = job?.index ?? -1,
    entryOrigin = job?.originToken ?? '';
  const chooseEntry = useCallback(
    (value: WorkflowAdmissionSelection | null) => {
      setEntrySelection(value ? { index: entryIndex, originToken: entryOrigin, value } : null);
    },
    [entryIndex, entryOrigin],
  );
  const entryScope = JSON.stringify([entryIndex, entryOrigin]);
  const [previousEntryScope, setPreviousEntryScope] = useState(entryScope);
  if (entryScope !== previousEntryScope) {
    setPreviousEntryScope(entryScope);
    setEntrySelection(null);
    setEntryWork({ dirty: false, pending: false });
    setFirstPassage(null);
    setFirstPassageEnabled(false);
    setFirstPassageValid(true);
    setIntegrationId('');
  }
  const entryMatches =
    !!entrySelection &&
    entrySelection.index === entryIndex &&
    entrySelection.originToken === entryOrigin &&
    entrySelection.value.contractRevision === editorialState?.revision;
  const publicationRequired =
    editorialState?.contract.publicationPolicy?.requirePreviousPublication === true;
  const entryValid =
    (!publicationRequired || entryMatches) &&
    !(
      entryIndex === 0 &&
      entryMatches &&
      entrySelection?.value.previousChapterId &&
      (!firstPassageEnabled || !firstPassageValid || !firstPassage)
    );
  const limits = {
    maxApplications: mode === 'guidance' ? 0 : Number(applications),
    maxCredits: mode === 'guidance' ? 0 : Number(credits),
    maxSteps: Number(steps),
  };
  const valid =
    Object.values(limits).every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000) &&
    limits.maxSteps > 0;
  const settingsDirty =
    !!job &&
    (JSON.stringify(limits) !== JSON.stringify(job.limits) ||
      JSON.stringify(authorizedPhases) !== JSON.stringify(job.authorizedPhases));
  const dirty =
    settingsDirty ||
    (!job && (!!selected.length || !!instruction || authorizedPhases.length > 0 || between)) ||
    childWork.dirty ||
    entryWork.dirty ||
    firstPassageEnabled;
  const pending = !!startPending || !!stepPending || !!controlPending;
  const locked = busy || controlling || pending || childWork.pending;
  const terminal = !!job && ['done', 'stale', 'canceled'].includes(job.state);
  const entryChapter = job?.chapters[job.index];
  useEffect(() => {
    onWorkChange?.({
      dirty,
      pending: pending || busy || controlling || childWork.pending || entryWork.pending,
    });
  }, [dirty, pending, busy, controlling, childWork.pending, entryWork.pending, onWorkChange]);
  const current = (ticket: number) => alive.current && serial.current === ticket;
  const sync = (next: SequenceFrame, settings = false) => {
    setFrame(next);
    if (next.job.currentWorkflowId) {
      setEntrySelection(null);
      setEntryWork({ dirty: false, pending: false });
      setFirstPassage(null);
      setFirstPassageEnabled(false);
      setFirstPassageValid(true);
    }
    setChildFrame((old) => {
      const child = next.workflow ?? (old?.job.jobId === next.job.currentWorkflowId ? old : null);
      return child;
    });
    if (!next.job.currentWorkflowId) setChildWork({ dirty: false, pending: false });
    if (settings) {
      setApplications(String(next.job.limits.maxApplications));
      setCredits(String(next.job.limits.maxCredits));
      setSteps(String(next.job.limits.maxSteps));
      setAuthorizedPhases([...next.job.authorizedPhases]);
    }
  };
  async function run(task: (ticket: number) => Promise<void>) {
    if (working.current || controlWorking.current) return;
    const ticket = ++serial.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task(ticket);
    } catch (cause) {
      if (current(ticket))
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível continuar a sequência.',
        );
    } finally {
      if (current(ticket)) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  const loadReferences = (after: string | null = null) =>
    run(async (ticket) => {
      const result = await listLiteraryReferences(bookId, 'chapter', after, 'subject');
      if (current(ticket))
        setReferences((old) => ({
          ...result,
          items: after
            ? [
                ...(old?.items ?? []),
                ...result.items.filter(
                  (item) => !old?.items.some((v) => v.reference.id === item.reference.id),
                ),
              ]
            : result.items,
        }));
    });
  const load = (after: string | null = null) =>
    run(async (ticket) => {
      const result = await listLiterarySequences(bookId, after);
      if (current(ticket))
        setPage((old) => ({
          ...result,
          items: after
            ? [
                ...(old?.items ?? []),
                ...result.items.filter((item) => !old?.items.some((v) => v.jobId === item.jobId)),
              ]
            : result.items,
        }));
    });
  const open = (id: string, settings = false) =>
    run(async (ticket) => {
      const result = await getLiterarySequence(bookId, id);
      if (current(ticket)) {
        sync(result, settings);
        setIntegrationId('');
        setReports(null);
      }
    });
  const prepare = () =>
    run(async (ticket) => {
      const input: StartLiterarySequence = structuredClone({
        target: { kind: 'book', id: bookId },
        jobId: crypto.randomUUID(),
        chapterIds: selected.map((item) => item.id),
        expectedScopeToken: '',
        instruction,
        limits,
        authorizedPhases: mode === 'continuous' ? authorizedPhases : [],
        continueBetweenChapters: mode === 'continuous' && between,
        ...(captureGeneration ? { generation: captureGeneration() } : {}),
      });
      const scope = await getLiterarySequenceScope(bookId, input.chapterIds);
      if (!current(ticket)) return;
      if (scope.collaboration.mode !== mode)
        throw new Error('O método salvo mudou. Confira o contrato antes de preparar a sequência.');
      setPreview({ scope, input: { ...input, expectedScopeToken: scope.originToken } });
    });
  const register = () =>
    run(async (ticket) => {
      const input =
        startPending ??
        (preview?.scope.collaboration.mode === collaborationMode ? preview.input : null);
      if (!input) return;
      setStartPending(input);
      const result = await startLiterarySequence(input, actorId);
      if (current(ticket)) {
        sync(result, true);
        setStartPending(null);
        setPreview(null);
        setInstruction('');
      }
    });
  const crossesAct = (f: SequenceFrame) =>
    !f.job.currentWorkflowId &&
    f.job.index > 0 &&
    !!f.job.chapters[f.job.index - 1]?.actId &&
    f.job.chapters[f.job.index - 1]?.actId !== f.job.chapters[f.job.index]?.actId;
  const loadReports = (after: string | null = null) =>
    run(async (ticket) => {
      const result = await listLiteraryIntegrations(bookId, after);
      if (current(ticket))
        setReports((old) => ({
          items: after
            ? [
                ...(old?.items ?? []),
                ...result.items.filter((item) => !old?.items.some((v) => v.jobId === item.jobId)),
              ]
            : result.items,
          nextAfterId: result.nextAfterId,
        }));
    });
  const advance = (recover = false) =>
    run(async (ticket) => {
      if (!frame) return;
      const integration = { index: frame.job.index, id: integrationId };
      const entry =
        entryMatches && entrySelection
          ? {
              ...entrySelection,
              firstPassage: firstPassageEnabled && firstPassage ? { ...firstPassage } : null,
            }
          : null;
      if (
        !recover &&
        !frame.job.currentWorkflowId &&
        (editorialState === null || !entryValid || entryWork.pending)
      )
        throw new Error('Confira o contrato e a inspeção da unidade antes de avançar.');
      if (recover) {
        const result = stepPending
          ? await advanceLiterarySequence(stepPending, actorId)
          : await recoverLiterarySequenceStep(
              bookId,
              frame.job.jobId,
              frame.job.busyStep ?? '',
              actorId,
              () => current(ticket),
            );
        if (current(ticket)) {
          sync(result);
          setStepPending(null);
        }
        return;
      }
      let latest = frame;
      do {
        const input: AdvanceLiterarySequence = {
          target: { kind: 'book', id: bookId },
          jobId: latest.job.jobId,
          operationId: crypto.randomUUID(),
          expectedRevision: latest.job.revision,
          expectedOriginToken: latest.job.originToken,
          ...(!latest.job.currentWorkflowId &&
          entry &&
          entry.index === latest.job.index &&
          entry.originToken === latest.job.originToken
            ? {
                admissionInspectionId: entry.value.inspectionId,
                ...(latest.job.index === 0 && entry.firstPassage
                  ? {
                      previousWorkflowId: entry.firstPassage.previousWorkflowId,
                      ...(entry.firstPassage.actIntegrationId
                        ? { actIntegrationId: entry.firstPassage.actIntegrationId }
                        : {}),
                    }
                  : {}),
              }
            : {}),
          ...(crossesAct(latest) && integration.index === latest.job.index && integration.id
            ? { actIntegrationId: integration.id }
            : {}),
        };
        setStepPending(input);
        latest = await advanceLiterarySequence(input, actorId);
        if (!current(ticket)) return;
        sync(latest);
        setStepPending(null);
      } while (
        latest.job.state === 'active' &&
        !latest.job.paused &&
        !latest.job.stop &&
        !latest.job.busyStep &&
        !latest.waitingForResult
      );
    });
  async function control(action: SequenceAction, recover = false, amend = false) {
    if (!frame || (controlWorking.current && action !== 'cancel')) return;
    const ticket = ++serial.current;
    working.current = false;
    controlWorking.current = true;
    setBusy(false);
    setControlling(true);
    setError(null);
    let input: ControlLiterarySequence =
      recover && controlPending
        ? controlPending
        : {
            target: { kind: 'book', id: bookId },
            jobId: frame.job.jobId,
            operationId: crypto.randomUUID(),
            expectedRevision: frame.job.revision,
            expectedOriginToken: frame.job.originToken,
            action,
            ...(amend
              ? {
                  limits: { ...limits },
                  authorizedPhases: mode === 'continuous' ? [...authorizedPhases] : [],
                }
              : {}),
          };
    try {
      if (action === 'cancel' && !recover) {
        const latest = await getLiterarySequence(bookId, frame.job.jobId);
        if (!current(ticket)) return;
        if (latest.job.originToken !== frame.job.originToken)
          throw new Error('A origem da sequência mudou; não cancele outra instância.');
        if (['done', 'canceled'].includes(latest.job.state)) {
          sync(latest);
          return;
        }
        input = { ...input, expectedRevision: latest.job.revision };
      }
      setControlPending(input);
      const result = await setLiterarySequenceControl(input, actorId);
      if (current(ticket)) {
        sync(result, true);
        setControlPending(null);
      }
    } catch (cause) {
      if (current(ticket))
        setError(
          cause instanceof Error
            ? cause.message
            : 'Controle sem confirmação. Preserve a decisão original.',
        );
    } finally {
      if (current(ticket)) {
        controlWorking.current = false;
        setControlling(false);
      }
    }
  }
  const change = (update: () => void) => {
    update();
    setPreview(null);
  };
  const activeAct = job?.chapters[(job?.index ?? 0) - 1]?.actId;
  const eligibleReports =
    reports?.items.filter(
      (item) =>
        item.state === 'done' &&
        item.authorAccepted &&
        item.level === 'act' &&
        item.actId === activeAct,
    ) ?? [];
  return (
    <section
      className={`${styles.panel} ${styles.mapContent}`}
      aria-label="Sequência editorial de capítulos"
    >
      <h3>Sequência editorial de capítulos</h3>
      <p>
        Selecione capítulos em modo cenas na ordem de leitura. A sequência conecta os ciclos
        completos dentro de um orçamento comum. Registrar não inicia geração.
      </p>
      <p>
        Este fluxo usa a IA da plataforma. Gerar e analisar não debita créditos; cada aplicação de
        prosa custa 1 crédito.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Consultando ou avançando a sequência…" />}
      {startPending && (
        <Alert>
          Registro sem confirmação. Preserve a intenção original.
          <Button
            className={styles.sequenceAction}
            disabled={busy || controlling}
            onClick={() => void register()}
          >
            Recuperar registro da sequência
          </Button>
        </Alert>
      )}
      {controlPending && (
        <Alert>
          Controle sem confirmação.
          <Button
            className={styles.sequenceAction}
            disabled={controlling}
            onClick={() => void control(controlPending.action, true)}
          >
            Recuperar controle da sequência
          </Button>
        </Alert>
      )}
      {!job && (
        <>
          <p>
            Método salvo: <strong>{modes[mode]}</strong>. Cada execução seleciona até 25 capítulos;
            o livro não tem uma quantidade fixa de capítulos.
          </p>
          <Button
            className={styles.sequenceAction}
            variant="outline"
            disabled={locked}
            onClick={() => void loadReferences()}
          >
            Consultar capítulos para sequência
          </Button>
          {references && !references.items.length && (
            <EmptyState
              title="Nenhum capítulo disponível"
              description="Crie capítulos compostos por cenas para este fluxo."
            />
          )}
          {references && (
            <Dropdown
              mode="select"
              label="Adicionar capítulo à sequência"
              value={choice}
              disabled={locked || selected.length >= 25}
              options={references.items
                .filter((item) => !selected.some((v) => v.id === item.reference.id))
                .map((item) => ({ value: item.reference.id, label: item.label }))}
              onValueChange={setChoice}
            />
          )}
          {references?.nextAfterId && (
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={locked}
              onClick={() => void loadReferences(references.nextAfterId)}
            >
              Mais capítulos para sequência
            </Button>
          )}
          {choice && (
            <Button
              className={styles.sequenceAction}
              disabled={locked || selected.length >= 25}
              onClick={() =>
                change(() => {
                  const item = references?.items.find((v) => v.reference.id === choice);
                  if (item && !selected.some((v) => v.id === choice))
                    setSelected([...selected, { id: choice, title: item.label }]);
                  setChoice('');
                })
              }
            >
              Adicionar capítulo selecionado
            </Button>
          )}
          <ol>
            {selected.map((item, index) => (
              <li key={item.id}>
                <p>{item.title}</p>
                <div className={styles.actions}>
                  <Button
                    className={styles.sequenceAction}
                    variant="outline"
                    disabled={locked || index === 0}
                    onClick={() =>
                      change(() =>
                        setSelected((old) => {
                          const next = [...old];
                          [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                          return next;
                        }),
                      )
                    }
                  >
                    Subir {item.title}
                  </Button>
                  <Button
                    className={styles.sequenceAction}
                    variant="outline"
                    disabled={locked || index === selected.length - 1}
                    onClick={() =>
                      change(() =>
                        setSelected((old) => {
                          const next = [...old];
                          [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
                          return next;
                        }),
                      )
                    }
                  >
                    Descer {item.title}
                  </Button>
                  <Button
                    className={styles.sequenceAction}
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      change(() => setSelected(selected.filter((v) => v.id !== item.id)))
                    }
                  >
                    Retirar {item.title}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <Textarea
            label="Orientação para esta sequência"
            value={instruction}
            maxLength={4000}
            disabled={locked}
            onChange={(event) => change(() => setInstruction(event.target.value))}
          />
        </>
      )}
      {(!job || !terminal) && (
        <>
          {mode !== 'guidance' && (
            <>
              <Input
                label="Limite agregado de aplicações"
                type="number"
                min={0}
                max={1000000}
                value={applications}
                disabled={locked}
                onChange={(event) => change(() => setApplications(event.target.value))}
              />
              <Input
                label="Limite agregado de créditos"
                type="number"
                min={0}
                max={1000000}
                value={credits}
                disabled={locked}
                onChange={(event) => change(() => setCredits(event.target.value))}
              />
            </>
          )}
          <Input
            label="Limite agregado de passos"
            type="number"
            min={1}
            max={1000000}
            value={steps}
            disabled={locked}
            onChange={(event) => change(() => setSteps(event.target.value))}
          />
          {mode === 'continuous' &&
            Object.entries(phases).map(([key, label]) => (
              <Dropdown
                key={key}
                mode="select"
                label={'Autorizar fase na sequência: ' + label}
                value={authorizedPhases.includes(key as WorkflowAuthorizedPhase) ? 'yes' : 'no'}
                disabled={locked}
                options={[
                  { value: 'no', label: 'Aguardar minha decisão' },
                  { value: 'yes', label: 'Autorizar no escopo e limites da sequência' },
                ]}
                onValueChange={(value) =>
                  change(() =>
                    setAuthorizedPhases((old) =>
                      (Object.keys(phases) as WorkflowAuthorizedPhase[]).filter((phase) =>
                        phase === key ? value === 'yes' : old.includes(phase),
                      ),
                    ),
                  )
                }
              />
            ))}
          {!job && mode === 'continuous' && (
            <Dropdown
              mode="select"
              label="Passagem entre capítulos da seleção"
              value={between ? 'yes' : 'no'}
              disabled={locked}
              options={[
                { value: 'no', label: 'Pedir minha autorização a cada capítulo' },
                { value: 'yes', label: 'Continuar dentro da seleção e dos limites' },
              ]}
              onValueChange={(value) => change(() => setBetween(value === 'yes'))}
            />
          )}
        </>
      )}
      {!job && (
        <>
          <Button
            className={styles.sequenceAction}
            disabled={locked || !valid || !selected.length}
            onClick={() => void prepare()}
          >
            Conferir escopo e preparar prévia
          </Button>
          {!!selected.length && (
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={locked}
              onClick={() =>
                change(() => {
                  setSelected([]);
                  setInstruction('');
                  setAuthorizedPhases([]);
                  setBetween(false);
                })
              }
            >
              Descartar seleção e orientação
            </Button>
          )}
          {preview && preview.scope.collaboration.mode === collaborationMode && (
            <section className={styles.comparison} aria-label="Prévia da sequência">
              <h4>Confira antes de registrar</h4>
              <p>
                {preview.scope.bookTitle} · {modes[preview.scope.collaboration.mode]}
              </p>
              <ol>
                {preview.scope.chapters.map((chapter) => (
                  <li key={chapter.id}>{chapter.title}</li>
                ))}
              </ol>
              <p>
                Até {preview.input.limits.maxApplications} aplicações,{' '}
                {preview.input.limits.maxCredits} créditos e {preview.input.limits.maxSteps} passos
                no conjunto.
              </p>
              <p>
                Fases autorizadas:{' '}
                {preview.input.authorizedPhases.map((phase) => phases[phase]).join(', ') ||
                  'cada passagem exige decisão autoral'}
                .
              </p>
              <p>
                {preview.input.continueBetweenChapters
                  ? 'A passagem entre capítulos está autorizada dentro desta seleção.'
                  : 'Cada capítulo seguinte exige nova decisão.'}{' '}
                A saída de ato exige integração aceita. A sequência não publica o livro.
              </p>
              <p className={styles.contextText}>{preview.input.instruction}</p>
              <Button
                className={styles.sequenceAction}
                disabled={locked}
                onClick={() => void register()}
              >
                Registrar esta sequência com estes limites
              </Button>
            </section>
          )}
        </>
      )}
      <Button
        className={styles.sequenceAction}
        variant="outline"
        disabled={locked || dirty}
        onClick={() => void load()}
      >
        Consultar sequências registradas
      </Button>
      {page && !page.items.length && (
        <EmptyState
          title="Nenhuma sequência nesta página"
          description="Pode haver outras execuções na próxima página."
        />
      )}
      {page && (
        <ul>
          {page.items.map((item) => (
            <li key={item.jobId}>
              <Button
                className={styles.sequenceAction}
                variant="ghost"
                disabled={locked || dirty}
                onClick={() => void open(item.jobId, true)}
              >
                {item.state === 'done'
                  ? 'Concluída'
                  : item.state === 'canceled'
                    ? 'Cancelada'
                    : item.state === 'stale'
                      ? 'Escopo alterado'
                      : item.paused
                        ? 'Pausada'
                        : 'Registrada'}{' '}
                · {item.index} de {item.chapterCount} capítulos ·{' '}
                {new Date(item.createdAt).toLocaleString('pt-BR')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {page?.nextAfterId && (
        <Button
          className={styles.sequenceAction}
          variant="outline"
          disabled={locked || dirty}
          onClick={() => void load(page.nextAfterId)}
        >
          Mais sequências registradas
        </Button>
      )}
      {job && (
        <section className={styles.comparison} aria-label="Checkpoint da sequência">
          <Badge>
            {job.state === 'done'
              ? 'Seleção concluída'
              : job.state === 'canceled'
                ? 'Sequência cancelada'
                : job.paused
                  ? 'Sequência pausada'
                  : job.state === 'stale'
                    ? 'Escopo alterado'
                    : 'Sequência registrada'}
          </Badge>
          <p>
            {job.index} de {job.chapters.length} capítulos concluídos · {job.applications} de{' '}
            {job.limits.maxApplications} aplicações · {job.credits} de {job.limits.maxCredits}{' '}
            créditos · {job.steps} de {job.limits.maxSteps} passos.
          </p>
          <ol>
            {job.chapters.map((chapter, index) => (
              <li key={chapter.id}>
                {chapter.title}
                {index < job.index
                  ? ' · concluído'
                  : index === job.index
                    ? ' · próximo ou em andamento'
                    : ''}
              </li>
            ))}
          </ol>
          {job.stop && (
            <Alert>
              {stops[job.stop] ?? 'Confira o ciclo do capítulo e suas fontes antes de continuar.'}
            </Alert>
          )}
          {job.registrationState === 'registering' && (
            <Button
              className={styles.sequenceAction}
              disabled={locked}
              onClick={() => void control('confirmRegistration')}
            >
              Confirmar registro original da sequência
            </Button>
          )}
          {(stepPending || job.busyStep) && (
            <Alert>
              Há um passo pendente. A retomada usa o pedido original.
              <Button
                className={styles.sequenceAction}
                disabled={busy || controlling}
                onClick={() => void advance(true)}
              >
                Recuperar passo original da sequência
              </Button>
            </Alert>
          )}
          {!job.currentWorkflowId && !terminal && editorialState === null && (
            <Alert>
              Contrato ainda indisponível. Consulte Contrato e decisões antes de escolher a entrada.
            </Alert>
          )}
          {!job.currentWorkflowId && !terminal && editorialState && entryChapter && (
            <>
              <LiteraryWorkflowAdmissionFields
                key={job.jobId + ':' + job.index}
                actorId={actorId}
                bookId={bookId}
                chapterId={entryChapter.id}
                contractRevision={editorialState.revision}
                required={publicationRequired}
                unit={editorialState.contract.publicationPolicy?.unit ?? null}
                disabled={locked || settingsDirty}
                onChange={chooseEntry}
                onWorkChange={setEntryWork}
              />
              {job.index === 0 && entryMatches && entrySelection?.value.previousChapterId && (
                <LiteraryWorkflowPassageFields
                  bookId={bookId}
                  chapterId={entryChapter.id}
                  targetActId={entrySelection.value.chapterActId}
                  enabled={firstPassageEnabled}
                  value={firstPassage}
                  disabled={locked || entryWork.pending}
                  onEnabledChange={setFirstPassageEnabled}
                  onChange={setFirstPassage}
                  onValidityChange={setFirstPassageValid}
                />
              )}
            </>
          )}
          {crossesAct(frame) && !terminal && (
            <>
              <Button
                className={styles.sequenceAction}
                variant="outline"
                disabled={locked}
                onClick={() => void loadReports()}
              >
                Consultar integrações aceitas do ato
              </Button>
              {reports && !eligibleReports.length && (
                <EmptyState
                  title="Nenhuma integração aceita nesta página"
                  description="Conclua e aceite a integração do ato ou consulte as demais páginas."
                />
              )}
              {reports && (
                <Dropdown
                  mode="select"
                  label="Integração para a próxima unidade"
                  value={integrationId}
                  disabled={locked}
                  options={eligibleReports.map((report) => ({
                    value: report.jobId,
                    label:
                      'Integração do ato · ' + new Date(report.createdAt).toLocaleString('pt-BR'),
                  }))}
                  onValueChange={setIntegrationId}
                />
              )}
              {reports?.nextAfterId && (
                <Button
                  className={styles.sequenceAction}
                  disabled={locked}
                  variant="outline"
                  onClick={() => void loadReports(reports.nextAfterId)}
                >
                  Mais integrações aceitas do ato
                </Button>
              )}
            </>
          )}
          <div className={styles.actions}>
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={busy || controlling || childWork.dirty || childWork.pending}
              onClick={() => void open(job.jobId)}
            >
              Consultar checkpoint da sequência
            </Button>
            {!terminal && job.registrationState === 'active' && (
              <>
                <Button
                  className={styles.sequenceAction}
                  disabled={
                    locked ||
                    settingsDirty ||
                    childWork.dirty ||
                    job.paused ||
                    !!job.busyStep ||
                    (crossesAct(frame) && !integrationId) ||
                    (!job.currentWorkflowId &&
                      (editorialState === null || !entryValid || entryWork.pending)) ||
                    job.stop === 'nextChapterAuthorization'
                  }
                  onClick={() => void advance()}
                >
                  Avançar sequência até a próxima decisão
                </Button>
                <Button
                  className={styles.sequenceAction}
                  variant="outline"
                  disabled={controlling || !!controlPending}
                  onClick={() => void control('pause')}
                >
                  Pausar sequência no servidor
                </Button>
                <Button
                  className={styles.sequenceAction}
                  variant="outline"
                  disabled={locked || !valid || childWork.dirty}
                  onClick={() => void control('resume', false, true)}
                >
                  Autorizar estes limites e retomar sequência
                </Button>
                {job.stop === 'nextChapterAuthorization' && (
                  <Button
                    className={styles.sequenceAction}
                    disabled={locked || settingsDirty}
                    onClick={() => void control('authorizeNext')}
                  >
                    Autorizar entrada no próximo capítulo
                  </Button>
                )}
              </>
            )}
            {!['done', 'canceled'].includes(job.state) && (
              <Button
                className={styles.sequenceAction}
                variant="destructive"
                disabled={controlling && controlPending?.action === 'cancel'}
                onClick={() => void control('cancel')}
              >
                Cancelar sequência no servidor
              </Button>
            )}
            {terminal && (
              <Button
                className={styles.sequenceAction}
                variant="outline"
                disabled={locked || childWork.dirty}
                onClick={() => {
                  setFrame(null);
                  setSelected([]);
                  setInstruction('');
                  setAuthorizedPhases([]);
                  setBetween(false);
                }}
              >
                Preparar outra seleção de capítulos
              </Button>
            )}
          </div>
          {childFrame && childFrame.job.jobId === job.currentWorkflowId && (
            <LiteraryWorkflowPanel
              managedFrame={childFrame}
              editorialState={editorialState}
              managedBusy={busy || controlling || pending || job.paused || job.state !== 'active'}
              bookId={bookId}
              chapterId={childFrame.job.chapterId}
              onWorkChange={setChildWork}
              onCheckpointChange={() => void open(job.jobId)}
            />
          )}
        </section>
      )}
    </section>
  );
}
