import { LiteraryWorkflowPanel } from './LiteraryWorkflowPanel';
import type { EditorialState, LiteraryCollaborationMode } from '../model/editorial';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Badge, Button, Dropdown, EmptyState, LoadingState, Textarea } from '@/shared/ui';
import { listLiteraryReferences } from '../services/literaryPlanningService';
import {
  LITERARY_GATE_CRITERIA,
  LITERARY_GATE_OPTIONAL_CRITERIA,
  getLiteraryPreparationContext,
  getLiteraryPreparationGate,
  saveLiteraryPreparationGate,
  listLiteraryPreparationGateVersions,
  type LiteraryGate,
  type LiteraryGateCriterion,
  type PreparationContext,
  type PreparationGateState,
  type SavePreparationGate,
} from '../services/literaryPreparationService';
import type { LiteraryReferencePage } from '../model/planning';
import { WritingSourcePicker } from './WritingSourcePicker';
import { LiteraryMilestonePanel } from './LiteraryMilestonePanel';
import { LiteraryProsePanel } from './LiteraryProsePanel';
import { LiteraryReviewPanel } from './LiteraryReviewPanel';
import { LiteraryDraftPanel } from './LiteraryDraftPanel';
import styles from './EditorialContractPanel.module.css';

const emptyGate = (): LiteraryGate => ({
  authorAccepted: false,
  notes: '',
  criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
    id,
    result: 'gap',
    rationale: '',
    evidence: [],
  })),
});
const resultLabels = {
  gap: 'Pendente',
  pass: 'Atendido',
  fail: 'Impedimento',
  notApplicable: 'Não se aplica',
};
const definitive = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  [
    'functions/invalid-argument',
    'functions/failed-precondition',
    'functions/not-found',
    'functions/unauthenticated',
    'functions/permission-denied',
    'functions/resource-exhausted',
  ].includes(String(cause.code));
export function LiteraryPreparationPanel({
  bookId,
  onWorkChange,
  captureGeneration,
  collaborationMode,
  editorialState,
}: {
  collaborationMode?: LiteraryCollaborationMode;
  editorialState?: EditorialState | null;
  bookId: string;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
  captureGeneration?: () => unknown;
}) {
  const { user } = useAuth();
  const [chapters, setChapters] = useState<LiteraryReferencePage | null>(null),
    [chapterId, setChapterId] = useState('');
  const [planIds, setPlanIds] = useState<string[]>([]),
    [context, setContext] = useState<PreparationContext | null>(null);
  const [gate, setGate] = useState<LiteraryGate>(emptyGate),
    [baseline, setBaseline] = useState(() => JSON.stringify(emptyGate()));
  const [state, setState] = useState<PreparationGateState | null>(null),
    [gateToken, setGateToken] = useState<string | null>(null);
  const [pending, setPending] = useState<SavePreparationGate | null>(null);
  const [versions, setVersions] = useState<Awaited<
    ReturnType<typeof listLiteraryPreparationGateVersions>
  > | null>(null);
  const [historical, setHistorical] = useState<PreparationGateState | null>(null);
  const [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [milestonePending, setMilestonePending] = useState(false);
  const [freshnessKnown, setFreshnessKnown] = useState(true);
  const [proseWork, setProseWork] = useState({ dirty: false, pending: false });
  const [reviewWork, setReviewWork] = useState({ dirty: false, pending: false });
  const [draftWork, setDraftWork] = useState({ dirty: false, pending: false });
  const [workflowWork, setWorkflowWork] = useState({ dirty: false, pending: false });
  const epoch = useRef(0),
    working = useRef(false);
  const dirty =
    JSON.stringify(gate) !== baseline ||
    JSON.stringify([...planIds].sort()) !==
      JSON.stringify([...(state?.manifest.planIds ?? [])].sort()) ||
    proseWork.dirty ||
    reviewWork.dirty ||
    draftWork.dirty ||
    workflowWork.dirty;
  useEffect(() => {
    onWorkChange?.({
      dirty,
      pending:
        pending !== null ||
        milestonePending ||
        proseWork.pending ||
        reviewWork.pending ||
        draftWork.pending ||
        workflowWork.pending,
    });
  }, [
    dirty,
    pending,
    milestonePending,
    proseWork.pending,
    reviewWork.pending,
    draftWork.pending,
    workflowWork.pending,
    onWorkChange,
  ]);
  useEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [bookId, user?.uid]);
  const run = async (task: (current: number) => Promise<void>) => {
    if (working.current) return;
    const current = epoch.current;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task(current);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Preparação indisponível.');
    } finally {
      if (epoch.current === current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const loadChapters = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryReferences(bookId, 'chapter', afterId, 'subject');
      if (epoch.current === current)
        setChapters((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const open = () =>
    run(async (current) => {
      const value = await getLiteraryPreparationGate(bookId, chapterId);
      if (epoch.current !== current) return;
      setFreshnessKnown(true);
      setContext(null);
      setState(value);
      setGateToken(value?.stateToken ?? null);
      const next = value?.gate ?? emptyGate();
      setGate(next);
      setBaseline(JSON.stringify(next));
      if (value) {
        setPlanIds(value.manifest.planIds);
        setNotice(
          value.current
            ? 'Verificação salva carregada. Capture as fontes para editar.'
            : 'As fontes mudaram. A prontidão anterior precisa ser conferida novamente.',
        );
      } else setNotice('Este capítulo ainda não tem verificação salva.');
    });
  const capture = () =>
    run(async (current) => {
      const result = await getLiteraryPreparationContext(bookId, chapterId, planIds);
      if (epoch.current !== current) return;
      setContext(result);
      if (gateToken !== result.snapshot.stateToken) {
        setGate((previous) => ({
          ...previous,
          authorAccepted: false,
          criteria: previous.criteria.map((item) => ({ ...item, result: 'gap' })),
        }));
        setNotice(
          'Fontes capturadas. Confira cada critério; justificativas e citações anteriores foram preservadas para comparação.',
        );
      } else setNotice('As fontes correspondem à verificação carregada.');
      setGateToken(result.snapshot.stateToken);
    });
  const update = (index: number, patch: Partial<LiteraryGateCriterion>) => {
    setGate({
      ...gate,
      authorAccepted: false,
      criteria: gate.criteria.map((item, at) => (at === index ? { ...item, ...patch } : item)),
    });
  };
  const save = () =>
    run(async (current) => {
      if (!context && !pending) return;
      const request = pending ?? {
        target: { kind: 'book' as const, id: bookId },
        chapterId,
        planIds: context!.snapshot.manifest.planIds,
        stateToken: context!.snapshot.stateToken,
        gate: structuredClone(gate),
        expectedRevision: state?.revision ?? 0,
        operationId: crypto.randomUUID(),
      };
      setPending(request);
      let result;
      try {
        result = await saveLiteraryPreparationGate(request, user?.uid ?? '');
      } catch (cause) {
        if (epoch.current === current && definitive(cause)) setPending(null);
        throw cause;
      }
      if (epoch.current !== current) return;
      setFreshnessKnown(false);
      setPending(null);
      setGate(request.gate);
      setBaseline(JSON.stringify(request.gate));
      setContext(null);
      setGateToken(request.stateToken);
      setVersions(null);
      setHistorical(null);
      // A confirmed receipt advances the revision without adopting a newer remote body.
      setState({
        ...state,
        schemaVersion: 1,
        ...result,
        stateToken: request.stateToken,
        manifest: context?.snapshot.manifest ?? state!.manifest,
        gate: request.gate,
        assessment: 'author',
        current: false,
        ready: false,
        authorAccepted: false,
        recordedReady: request.gate.criteria.every(
          (item) => item.result === 'pass' || item.result === 'notApplicable',
        ),
        recordedAuthorAccepted: request.gate.authorAccepted,
      });
      setNotice(
        'Verificação salva na revisão ' +
          result.revision +
          '. Consulte a versão atual para reconfirmar a prontidão.',
      );
    });
  const history = (before: number | null = null) =>
    run(async (current) => {
      const result = await listLiteraryPreparationGateVersions(bookId, chapterId, before);
      if (epoch.current === current)
        setVersions((previous) => ({
          ...result,
          items: before ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const inspect = (revision: number) =>
    run(async (current) => {
      const result = await getLiteraryPreparationGate(bookId, chapterId, revision);
      if (epoch.current === current) setHistorical(result);
    });
  const disabled =
    busy ||
    pending !== null ||
    milestonePending ||
    proseWork.pending ||
    reviewWork.pending ||
    draftWork.pending ||
    workflowWork.pending;
  const ready = gate.criteria.every(
    (item) => item.result === 'pass' || item.result === 'notApplicable',
  );
  const reset = () => {
    setGate(state?.gate ?? emptyGate());
    setBaseline(JSON.stringify(state?.gate ?? emptyGate()));
    setContext(null);
    setGateToken(state?.stateToken ?? null);
    setPlanIds(state?.manifest.planIds ?? []);
  };
  return (
    <section className={styles.panel} aria-label="Preparação e verificação pré-redação">
      <h2>Preparação do capítulo</h2>
      <p>
        Salve no planejamento a ficha, as cenas e o worldbuilding local, vinculando os três ao
        capítulo como unidade planejada. Depois confira os critérios com as fontes atuais.
      </p>
      <p>
        As citações comprovam a localização da evidência. A avaliação literária e o aceite continuam
        sendo seus; esta conferência não afirma que a prosa já foi escrita ou revisada.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}
      {pending && (
        <Alert>
          O salvamento ainda precisa de confirmação. Consulte a mesma operação antes de alterar a
          verificação.
        </Alert>
      )}
      {busy && <LoadingState label="Consultando preparação…" />}
      <Button variant="outline" disabled={disabled || dirty} onClick={() => void loadChapters()}>
        Consultar capítulos
      </Button>
      {chapters && !chapters.items.length && (
        <EmptyState
          title="Nenhum capítulo disponível"
          description="Crie um capítulo antes de preparar sua redação."
        />
      )}
      {chapters && (
        <Dropdown
          mode="select"
          label="Capítulo em preparação"
          value={chapterId}
          disabled={disabled || dirty}
          options={chapters.items.map((item) => ({ value: item.reference.id, label: item.label }))}
          onValueChange={(id) => {
            setChapterId(id);
            setState(null);
            setContext(null);
            setGateToken(null);
            setGate(emptyGate());
            setBaseline(JSON.stringify(emptyGate()));
            setVersions(null);
            setHistorical(null);
            setPlanIds([]);
          }}
        />
      )}
      {chapters?.nextAfterId && (
        <Button
          variant="outline"
          disabled={disabled || dirty}
          onClick={() => void loadChapters(chapters.nextAfterId)}
        >
          Mais capítulos
        </Button>
      )}
      {chapterId && (
        <>
          <div className={styles.actions}>
            <Button variant="outline" disabled={disabled || dirty} onClick={() => void open()}>
              Consultar verificação salva
            </Button>
            {dirty && (
              <Button variant="outline" disabled={disabled} onClick={reset}>
                Descartar alterações da verificação
              </Button>
            )}
          </div>
          {state && (
            <p>
              Revisão {state.revision} ·{' '}
              <Badge>
                {!freshnessKnown
                  ? 'Salva; atualidade a conferir'
                  : state.current
                    ? state.ready
                      ? state.authorAccepted
                        ? 'Pronta com aceite autoral'
                        : 'Critérios atendidos; aceite pendente'
                      : 'Pendências registradas'
                    : 'Fontes alteradas; reconferência necessária'}
              </Badge>
            </p>
          )}
          <WritingSourcePicker
            key={'sources:' + chapterId}
            bookId={bookId}
            value={planIds}
            disabled={disabled}
            onChange={(ids) => {
              setPlanIds(ids ?? []);
              setContext(null);
              setGate({ ...gate, authorAccepted: false });
            }}
          />
          <Button
            variant="outline"
            disabled={disabled || planIds.length < 3}
            onClick={() => void capture()}
          >
            Capturar fontes da preparação
          </Button>
          {context && (
            <>
              <details className={styles.comparison}>
                <summary>Fontes efetivamente conferidas</summary>
                {context.documents.map((document) => (
                  <section key={document.id}>
                    <h3>
                      {document.label} · revisão {document.revision}
                    </h3>
                    <p className={styles.contextText}>{document.text}</p>
                  </section>
                ))}
              </details>
              <div className={styles.panel}>
                {gate.criteria.map((criterion, index) => (
                  <section className={styles.decisionForm} key={criterion.id}>
                    <h3>{LITERARY_GATE_CRITERIA[criterion.id]}</h3>
                    <Dropdown
                      mode="select"
                      label={'Resultado: ' + LITERARY_GATE_CRITERIA[criterion.id]}
                      value={criterion.result}
                      disabled={disabled}
                      options={Object.entries(resultLabels)
                        .filter(
                          ([value]) =>
                            value !== 'notApplicable' ||
                            LITERARY_GATE_OPTIONAL_CRITERIA.includes(criterion.id),
                        )
                        .map(([value, label]) => ({ value, label }))}
                      onValueChange={(value) =>
                        update(index, { result: value as LiteraryGateCriterion['result'] })
                      }
                    />
                    <Textarea
                      label="Justificativa, correção ou pendência"
                      maxLength={2000}
                      value={criterion.rationale}
                      disabled={disabled}
                      onChange={(event) => update(index, { rationale: event.target.value })}
                    />
                    {criterion.evidence.map((evidence, at) => (
                      <div className={styles.decisionForm} key={at}>
                        <Dropdown
                          mode="select"
                          label="Fonte da evidência"
                          value={evidence.documentId}
                          disabled={disabled}
                          options={context.documents.map((document) => ({
                            value: document.id,
                            label: document.label,
                          }))}
                          onValueChange={(documentId) =>
                            update(index, {
                              evidence: criterion.evidence.map((item, n) =>
                                n === at ? { ...item, documentId } : item,
                              ),
                            })
                          }
                        />
                        <Textarea
                          label="Citação literal da fonte"
                          value={evidence.quote}
                          maxLength={1500}
                          disabled={disabled}
                          onChange={(event) =>
                            update(index, {
                              evidence: criterion.evidence.map((item, n) =>
                                n === at ? { ...item, quote: event.target.value } : item,
                              ),
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          disabled={disabled}
                          onClick={() =>
                            update(index, {
                              evidence: criterion.evidence.filter((_, n) => n !== at),
                            })
                          }
                        >
                          Remover evidência
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      disabled={
                        disabled || criterion.evidence.length >= 3 || !context.documents.length
                      }
                      onClick={() => {
                        const document = context.documents[0];
                        if (document)
                          update(index, {
                            evidence: [
                              ...criterion.evidence,
                              { documentId: document.id, quote: '' },
                            ],
                          });
                      }}
                    >
                      Adicionar evidência
                    </Button>
                  </section>
                ))}
              </div>
              <Textarea
                label="Observações e próximo passo"
                maxLength={6000}
                value={gate.notes}
                disabled={disabled}
                onChange={(event) => setGate({ ...gate, notes: event.target.value })}
              />
              <Dropdown
                mode="select"
                label="Aceite autoral da preparação"
                value={gate.authorAccepted ? 'accepted' : 'pending'}
                disabled={disabled || !ready}
                options={[
                  { value: 'pending', label: 'Pendente' },
                  { value: 'accepted', label: 'Aceito esta preparação' },
                ]}
                onValueChange={(value) =>
                  setGate({ ...gate, authorAccepted: value === 'accepted' })
                }
              />
              <Button disabled={disabled} onClick={() => void save()}>
                Salvar verificação e evidências
              </Button>
            </>
          )}
          {pending && (
            <Button disabled={busy} variant="outline" onClick={() => void save()}>
              Recuperar o mesmo salvamento
            </Button>
          )}
          <Button variant="outline" disabled={disabled} onClick={() => void history()}>
            Consultar histórico da preparação
          </Button>
          {versions && (
            <ul>
              {versions.items.map((item) => (
                <li key={item.revision}>
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => void inspect(item.revision)}
                  >
                    Ver revisão {item.revision}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {versions?.nextBeforeRevision && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => void history(versions.nextBeforeRevision)}
            >
              Versões anteriores
            </Button>
          )}
          <LiteraryWorkflowPanel
            editorialState={editorialState}
            bookId={bookId}
            chapterId={chapterId}
            collaborationMode={collaborationMode}
            captureGeneration={captureGeneration}
            onWorkChange={setWorkflowWork}
          />
          <LiteraryDraftPanel
            collaborationMode={collaborationMode}
            key={'draft:' + chapterId}
            bookId={bookId}
            chapterId={chapterId}
            captureGeneration={captureGeneration}
            onWorkChange={setDraftWork}
          />
          <LiteraryProsePanel
            key={'prose:' + chapterId}
            bookId={bookId}
            chapterId={chapterId}
            onWorkChange={setProseWork}
            captureGeneration={captureGeneration}
          />
          <LiteraryReviewPanel
            key={'review:' + chapterId}
            bookId={bookId}
            chapterId={chapterId}
            captureGeneration={captureGeneration}
            onWorkChange={setReviewWork}
          />
          <LiteraryMilestonePanel
            key={'milestone:' + chapterId}
            bookId={bookId}
            chapterId={chapterId}
            onPendingChange={setMilestonePending}
          />
          {historical && (
            <section className={styles.comparison} aria-label="Verificação histórica">
              <h3>Revisão {historical.revision} · somente leitura</h3>
              <p>
                {historical.current ? 'Fontes ainda atuais.' : 'As fontes desta versão mudaram.'} O
                histórico não substitui o rascunho aberto.
              </p>
              {historical.gate.criteria.map((criterion) => (
                <div key={criterion.id}>
                  <h4>
                    {LITERARY_GATE_CRITERIA[criterion.id]} · {resultLabels[criterion.result]}
                  </h4>
                  <p>{criterion.rationale}</p>
                  {criterion.evidence.map((evidence, index) => (
                    <blockquote key={index}>{evidence.quote}</blockquote>
                  ))}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}
