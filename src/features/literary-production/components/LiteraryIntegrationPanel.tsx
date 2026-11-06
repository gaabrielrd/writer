import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Dropdown, EmptyState, LoadingState, Textarea } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { listActs, type Act } from '@/features/books';
import {
  listLiteraryArchitectureInventory,
  previewLiteraryArchitectureSource,
  type ArchitectureInventoryPage,
  type ArchitectureSourcePreview,
  startLiteraryIntegration,
  getLiteraryIntegration,
  advanceLiteraryIntegration,
  cancelLiteraryIntegration,
  cancelPendingLiteraryIntegration,
  cancelPendingLiteraryIntegrationAnalysis,
  retryLiteraryIntegrationAnalysis,
  acceptLiteraryIntegration,
  listLiteraryIntegrations,
  listLiteraryIntegrationResults,
  getLiteraryIntegrationResult,
  getLiteraryIntegrationSetup,
  type LiteraryIntegration,
  type StartLiteraryIntegration,
  type IntegrationResult,
} from '../services/literaryIntegrationService';
import { WritingSourcePicker } from './WritingSourcePicker';
import { LiteraryFindingDecisionPanel } from './LiteraryFindingDecisionPanel';
import { findingActionLabels } from '../model/finding';
import {
  listLiteraryFindingDecisions,
  type FindingSource,
} from '../services/literaryFindingService';
import { LiteraryIntegrationRecheckPanel } from './LiteraryIntegrationRecheckPanel';
import styles from './EditorialContractPanel.module.css';
const labels: Record<LiteraryIntegration['state'], string> = {
  planning: 'Organizando fontes',
  reading: 'Leitura em andamento',
  synthesizing: 'Integrando evidências',
  verifying: 'Reconferindo cobertura e fontes',
  done: 'Cobertura integrada concluída',
  attention: 'Ação necessária',
  stale: 'Fontes alteradas; reconferência necessária',
  canceled: 'Integração cancelada',
};
const axisLabels: Record<string, string> = {
  time: 'Tempo',
  knowledge: 'Conhecimento',
  relationship: 'Relações',
  planting: 'Plantios e retornos',
  causality: 'Causalidade',
  promise: 'Promessa',
  voice: 'Voz',
  reservation: 'Reservas',
};
const architectureLabels: Record<string, string> = {
  contract: 'Guia editorial',
  plan: 'Ficha de planejamento',
  act: 'Ato',
  chapter: 'Capítulo',
  scene: 'Planejamento de cena',
  arc: 'Arco',
  event: 'Evento',
  arcMilestone: 'Marco de arco',
  sceneLink: 'Vínculo de cena',
  narrativeLink: 'Vínculo narrativo',
  narrativeControl: 'Ordem narrativa',
};
const active = (job: LiteraryIntegration) =>
  ['planning', 'reading', 'synthesizing', 'verifying'].includes(job.state);
type IntegrationPanelProps = {
  bookId: string;
  captureGeneration?: () => unknown;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
};
export function LiteraryIntegrationPanel(props: IntegrationPanelProps) {
  const { user } = useAuth();
  return <IntegrationSession key={user?.uid + ':' + props.bookId} {...props} />;
}
function IntegrationSession({ bookId, captureGeneration, onWorkChange }: IntegrationPanelProps) {
  const { user } = useAuth();
  const [level, setLevel] = useState<'book' | 'act'>('book'),
    [actId, setActId] = useState('');
  const [acts, setActs] = useState<Act[] | null>(null),
    [instruction, setInstruction] = useState('');
  const [planIds, setPlanIds] = useState<string[] | undefined>(undefined);
  const [audit, setAudit] = useState<'selected' | 'architecture'>('selected');
  const [architecturePage, setArchitecturePage] = useState<ArchitectureInventoryPage | null>(null);
  const [architecturePreview, setArchitecturePreview] = useState<ArchitectureSourcePreview | null>(
    null,
  );
  const [setupGeneration, setSetupGeneration] = useState<
    Awaited<ReturnType<typeof getLiteraryIntegrationSetup>>['generation'] | null
  >(null);
  const [setupNotice, setSetupNotice] = useState(false),
    [recheckPending, setRecheckPending] = useState(false);
  const [pending, setPending] = useState<StartLiteraryIntegration | null>(null),
    [job, setJob] = useState<LiteraryIntegration | null>(null);
  const [page, setPage] = useState<Awaited<ReturnType<typeof listLiteraryIntegrations>> | null>(
    null,
  );
  const [results, setResults] = useState<Awaited<
    ReturnType<typeof listLiteraryIntegrationResults>
  > | null>(null);
  const [selected, setSelected] = useState<IntegrationResult | null>(null);
  const [decisionPage, setDecisionPage] = useState<Awaited<
    ReturnType<typeof listLiteraryFindingDecisions>
  > | null>(null);
  const [findingEditors, setFindingEditors] = useState<
    Array<{ key: string; source?: FindingSource; decisionId?: string; jobId: string }>
  >([]);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [findingWork, setFindingWork] = useState<
    Record<string, { dirty: boolean; pending: boolean }>
  >({});
  const findingDirty = Object.values(findingWork).some((item) => item.dirty),
    findingPending = Object.values(findingWork).some((item) => item.pending);
  const updateFindingWork = useCallback(
    (key: string, value: { dirty: boolean; pending: boolean }) =>
      setFindingWork((previous) => {
        const old = previous[key];
        if (
          (!old && !value.dirty && !value.pending) ||
          (old?.dirty === value.dirty && old?.pending === value.pending)
        )
          return previous;
        const next = { ...previous };
        if (!value.dirty && !value.pending) delete next[key];
        else next[key] = value;
        return next;
      }),
    [],
  );
  const [busy, setBusy] = useState(false),
    [canceling, setCanceling] = useState(false),
    [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    sequence = useRef(0),
    working = useRef(false),
    pause = useRef(false);
  useEffect(() => {
    onWorkChange?.({
      dirty: !!instruction || setupNotice || findingDirty,
      pending: pending !== null || busy || canceling || recheckPending || findingPending,
    });
  }, [
    instruction,
    setupNotice,
    pending,
    busy,
    canceling,
    recheckPending,
    findingDirty,
    findingPending,
    onWorkChange,
  ]);
  useEffect(() => {
    const generation = ++epoch.current;
    return () => {
      epoch.current = generation + 1;
      pause.current = true;
    };
  }, [bookId, user?.uid]);
  const run = async (task: (current: number, runId: number) => Promise<void>) => {
    if (working.current || canceling) return;
    const current = epoch.current,
      runId = ++sequence.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task(current, runId);
    } catch (cause) {
      if (epoch.current === current && sequence.current === runId) {
        if (
          cause &&
          typeof cause === 'object' &&
          'code' in cause &&
          [
            'functions/permission-denied',
            'functions/not-found',
            'functions/failed-precondition',
          ].includes(String(cause.code))
        ) {
          setSelected(null);
          setArchitecturePreview(null);
          setArchitecturePage(null);
        }
        setError(cause instanceof Error ? cause.message : 'Integração indisponível.');
      }
    } finally {
      if (epoch.current === current && sequence.current === runId) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const loadActs = () =>
    run(async (current) => {
      const result = await listActs(bookId);
      if (epoch.current === current) setActs(result);
    });
  const start = () =>
    run(async (current, runId) => {
      if (!pending && level === 'act' && !actId)
        throw new Error('Escolha o ato antes de registrar a integração.');
      const input = pending ?? {
        target: { kind: 'book' as const, id: bookId },
        jobId: crypto.randomUUID(),
        level,
        actId: level === 'act' ? actId : null,
        instruction,
        ...(audit === 'architecture'
          ? { audit: 'architecture' as const }
          : planIds === undefined
            ? {}
            : { planIds: [...planIds] }),
        ...(setupGeneration
          ? { generation: setupGeneration }
          : captureGeneration
            ? { generation: captureGeneration() }
            : {}),
      };
      setPending(input);
      let result;
      try {
        result = await startLiteraryIntegration(input, user?.uid ?? '');
      } catch (cause) {
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
        if (
          epoch.current === current &&
          sequence.current === runId &&
          [
            'functions/invalid-argument',
            'functions/failed-precondition',
            'functions/not-found',
            'functions/unauthenticated',
            'functions/permission-denied',
            'functions/resource-exhausted',
          ].includes(code)
        )
          setPending(null);
        throw cause;
      }
      if (epoch.current === current && sequence.current === runId) {
        setPending(null);
        setJob(result);
        setArchitecturePage(null);
        setArchitecturePreview(null);
        setInstruction('');
        setSetupNotice(false);
        setSelected(null);
        setResults(null);
        setDecisionPage(null);
      }
    });
  const open = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryIntegration(bookId, id);
      if (epoch.current !== current) return;
      if (result.state === 'unconfirmed')
        throw new Error('Integração sem confirmação. Consulte novamente.');
      setJob(result);
      setArchitecturePage(null);
      setArchitecturePreview(null);
      setResults(null);
      setSelected(null);
      setDecisionPage(null);
    });
  const load = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryIntegrations(bookId, afterId);
      if (epoch.current === current)
        setPage((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const resume = () =>
    run(async (current, runId) => {
      if (!job) return;
      pause.current = false;
      let latest = job;
      while (
        epoch.current === current &&
        sequence.current === runId &&
        !pause.current &&
        active(latest)
      ) {
        latest = await advanceLiteraryIntegration(bookId, job.jobId);
        if (epoch.current === current && sequence.current === runId) setJob(latest);
        if (latest.waitingForResult) break;
      }
    });
  const inventory = () =>
    run(async (current, runId) => {
      if (!job?.architecture) return;
      pause.current = false;
      let latest = job;
      while (
        epoch.current === current &&
        sequence.current === runId &&
        !pause.current &&
        active(latest) &&
        !latest.architecture?.inventoryComplete
      ) {
        latest = await advanceLiteraryIntegration(bookId, job.jobId);
        if (epoch.current === current && sequence.current === runId) setJob(latest);
        if (latest.waitingForResult) break;
      }
    });
  const browseArchitecture = (afterIndex: number | null = null) =>
    run(async (current) => {
      if (!job?.architecture) return;
      const page = await listLiteraryArchitectureInventory(bookId, job.jobId, afterIndex);
      if (epoch.current !== current) return;
      if (['stale', 'canceled'].includes(page.state)) {
        setArchitecturePreview(null);
        setArchitecturePage(null);
        throw new Error('A auditoria não está atual. Confira as fontes antes de continuar.');
      }
      setArchitecturePage((old) => ({
        ...page,
        items: afterIndex === null ? page.items : [...(old?.items ?? []), ...page.items],
      }));
    });
  const previewArchitecture = (index: number, segment = 0) =>
    run(async (current) => {
      if (!job?.architecture) return;
      setArchitecturePreview(null);
      const preview = await previewLiteraryArchitectureSource(bookId, job.jobId, index, segment);
      if (epoch.current === current) {
        setArchitecturePreview(preview);
        if (preview.state !== 'ready') setArchitecturePage(null);
      }
    });
  const cancel = async () => {
    const id = pending?.jobId ?? job?.jobId;
    if (!id || canceling) return;
    const current = epoch.current;
    pause.current = true;
    setCanceling(true);
    setError(null);
    try {
      const result = pending
        ? await cancelPendingLiteraryIntegration(pending, user?.uid ?? '')
        : await cancelLiteraryIntegration(bookId, id);
      if (epoch.current === current) {
        sequence.current++;
        working.current = false;
        setBusy(false);
        setPending(null);
        setJob(result);
      }
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Cancelamento sem confirmação.');
    } finally {
      if (epoch.current === current) setCanceling(false);
    }
  };
  const cancelAnalysis = () =>
    run(async (current) => {
      if (!job) return;
      const result = await cancelPendingLiteraryIntegrationAnalysis(bookId, job.jobId);
      if (epoch.current === current) setJob(result);
    });
  const retry = () =>
    run(async (current) => {
      if (!job) return;
      const result = await retryLiteraryIntegrationAnalysis(bookId, job.jobId);
      if (epoch.current === current) setJob(result);
    });
  const accept = () =>
    run(async (current) => {
      if (!job?.sourceToken) return;
      const result = await acceptLiteraryIntegration(bookId, job.jobId, job.sourceToken);
      if (epoch.current === current) setJob(result);
    });
  const browse = (afterIndex: number | null = null) =>
    run(async (current) => {
      if (!job) return;
      const result = await listLiteraryIntegrationResults(bookId, job.jobId, afterIndex);
      if (epoch.current === current)
        setResults((previous) => ({
          ...result,
          items: afterIndex !== null ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const inspect = (id: string) =>
    run(async (current) => {
      if (!job) return;
      const result = await getLiteraryIntegrationResult(bookId, job.jobId, id);
      if (epoch.current === current) setSelected(result);
    });
  const prepareSuccessor = () =>
    run(async (current) => {
      if (!job || instruction) return;
      const setup = await getLiteraryIntegrationSetup(bookId, job.jobId);
      if (epoch.current === current) {
        setLevel(setup.level);
        setActId(setup.actId ?? '');
        setInstruction(setup.instruction);
        setPlanIds(setup.planIds);
        setAudit(setup.audit === 'architecture' ? 'architecture' : 'selected');
        setSetupGeneration(setup.generation);
        setSetupNotice(true);
      }
    });
  const browseDecisions = (afterId: string | null = null) =>
    run(async (current) => {
      if (!job) return;
      const result = await listLiteraryFindingDecisions(bookId, job.jobId, afterId);
      if (epoch.current === current)
        setDecisionPage((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const openFinding = (source: FindingSource, decisionId?: string) => {
    const key = source.jobId + ':' + source.requestId + ':' + source.index;
    setFindingEditors((previous) =>
      previous.some((item) => item.key === key)
        ? previous
        : [
            ...previous,
            { key, jobId: source.jobId, ...(decisionId ? { decisionId } : { source }) },
          ],
    );
    setActiveFinding(key);
  };
  const closeFinding = (key: string) => {
    setFindingEditors((previous) => previous.filter((item) => item.key !== key));
    setActiveFinding((current) => (current === key ? null : current));
  };
  const findingChanged = (affectedJob: string) => {
    if (job?.jobId === affectedJob) void open(affectedJob);
  };
  const locked = busy || canceling || pending !== null || recheckPending || findingPending;
  return (
    <section className={styles.panel} aria-label="Integração literária de atos e livro">
      <h2>Integração de atos e livro</h2>
      <p>
        Leia o manuscrito completo do escopo escolhido, confira transições e acompanhe a matriz de
        continuidade. Ao integrar um ato, o capítulo anterior também é lido como contexto para a
        passagem.
      </p>
      <p>
        A IA da plataforma registra análises e propostas. Não aplica correções, não publica e não
        debita créditos de manuscrito.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Avançando a integração…" />}
      {pending && <Alert>Confirme o registro pendente antes de iniciar outra integração.</Alert>}
      <Dropdown
        mode="select"
        label="Cobertura do planejamento"
        value={audit}
        disabled={locked}
        options={[
          { value: 'selected', label: 'Contexto selecionado ou automático' },
          { value: 'architecture', label: 'Auditoria global da arquitetura' },
        ]}
        onValueChange={(value) => {
          setAudit(value === 'architecture' ? 'architecture' : 'selected');
          if (value === 'architecture') {
            setLevel('book');
            setActId('');
            setPlanIds(undefined);
          }
        }}
      />
      {audit === 'architecture' && (
        <Alert>
          A auditoria percorre todas as fichas e a estrutura narrativa ativa antes de ler o
          manuscrito integral. As intenções das fichas não são acontecimentos comprovados. Corpos de
          lore não lidos não serão tratados como conferidos. Fontes removidas ou recriadas exigem
          reconciliação. Você poderá pausar e retomar os checkpoints.
        </Alert>
      )}
      <Dropdown
        mode="select"
        label="Escopo da integração"
        value={level}
        disabled={locked || audit === 'architecture'}
        options={[
          { value: 'book', label: 'Livro inteiro' },
          { value: 'act', label: 'Um ato' },
        ]}
        onValueChange={(value) => setLevel(value as 'book' | 'act')}
      />
      {level === 'act' && (
        <>
          <Button variant="outline" disabled={locked} onClick={() => void loadActs()}>
            Consultar atos disponíveis
          </Button>
          {acts && (
            <Dropdown
              mode="select"
              label="Ato para integrar"
              value={actId}
              disabled={locked}
              options={acts.map((act) => ({
                value: act.id,
                label: act.name || 'Ato ' + act.order,
              }))}
              onValueChange={setActId}
            />
          )}
          {acts && !acts.length && (
            <EmptyState
              title="Nenhum ato registrado"
              description="Organize os capítulos em atos ou integre o livro inteiro."
            />
          )}
        </>
      )}
      <Textarea
        label="Orientação para a integração"
        value={instruction}
        maxLength={4000}
        disabled={locked}
        onChange={(event) => setInstruction(event.target.value)}
      />
      {!!instruction && (
        <Button variant="ghost" disabled={locked} onClick={() => setInstruction('')}>
          Descartar orientação de integração
        </Button>
      )}
      {setupNotice && (
        <Alert>
          Escopo e orientações recuperados. Confira as fontes antes de registrar a integração
          sucessora.
          <Button
            variant="ghost"
            disabled={locked}
            onClick={() => {
              setSetupNotice(false);
              setSetupGeneration(null);
              setInstruction('');
              setPlanIds(undefined);
              setLevel('book');
              setActId('');
            }}
          >
            Descartar preparação da integração sucessora
          </Button>
        </Alert>
      )}
      {setupGeneration && (
        <p>
          A próxima integração usará o modelo {setupGeneration.model} do registro consultado.
          <Button variant="ghost" disabled={locked} onClick={() => setSetupGeneration(null)}>
            Usar configuração atual de IA
          </Button>
        </p>
      )}
      {audit !== 'architecture' && (
        <WritingSourcePicker
          bookId={bookId}
          value={planIds}
          onChange={setPlanIds}
          disabled={locked}
        />
      )}
      <div className={styles.actions}>
        <Button
          disabled={busy || canceling || recheckPending || findingPending}
          onClick={() => void start()}
        >
          {pending ? 'Recuperar o mesmo registro' : 'Registrar integração'}
        </Button>
        <Button variant="outline" disabled={locked} onClick={() => void load()}>
          Consultar integrações
        </Button>
        {pending && (
          <Button variant="outline" disabled={canceling} onClick={() => void cancel()}>
            Cancelar registro pendente
          </Button>
        )}
        {busy && (
          <Button
            variant="outline"
            onClick={() => {
              pause.current = true;
            }}
          >
            Pausar após a etapa atual
          </Button>
        )}
      </div>
      {page && !page.items.length && (
        <EmptyState
          title="Nenhuma integração registrada"
          description="O texto salvo será lido após seu pedido explícito de retomada."
        />
      )}
      {page && (
        <p>
          Os registros listados são históricos; abrir um checkpoint confere sua atualidade antes de
          continuar.
        </p>
      )}
      {page && (
        <ul>
          {page.items.map((item) => (
            <li key={item.jobId}>
              <Button variant="ghost" disabled={locked} onClick={() => void open(item.jobId)}>
                {item.level === 'act' ? 'Ato' : 'Livro'} ·{' '}
                {new Date(item.createdAt).toLocaleString('pt-BR')} · {labels[item.state]}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {page?.nextAfterId && (
        <Button variant="outline" disabled={locked} onClick={() => void load(page.nextAfterId)}>
          Mais integrações
        </Button>
      )}
      {job && (
        <section className={styles.comparison} aria-label="Checkpoint da integração">
          <Badge>{labels[job.state]}</Badge>
          {job.architecture && (
            <>
              <div className={styles.actions}>
                {!job.architecture.inventoryComplete && (
                  <Button disabled={locked} onClick={() => void inventory()}>
                    Preparar inventário sem IA
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void browseArchitecture()}
                >
                  Conferir fontes da arquitetura
                </Button>
              </div>
              <p>
                Arquitetura: {job.architecture.readSources} de {job.architecture.sources} fontes
                lidas · {job.architecture.verifiedSources} reconferidas ·{' '}
                {job.architecture.segments} trechos.
              </p>
              <p>
                {job.architecture.inventoryComplete
                  ? 'Inventário arquitetural percorrido.'
                  : 'Inventário arquitetural em andamento.'}{' '}
                {job.architecture.complete
                  ? 'Arquitetura conferida para estas versões.'
                  : 'Cobertura arquitetural ainda incompleta.'}
              </p>
              {job.state === 'done' && !job.coverage.wholeBook && (
                <Alert>
                  A auditoria da arquitetura terminou sem manuscrito no escopo. Este resultado não
                  comprova leitura integral de texto nem conclusão do livro.
                </Alert>
              )}
            </>
          )}
          <p>
            {job.chapters} capítulos do escopo · {job.contextChapters} de contexto · {job.readUnits}{' '}
            de {job.units} fontes lidas · {job.segments} trechos
          </p>
          <p>
            {job.boundaries} de {job.expectedBoundaries} transições · {job.analyses} análises e
            sínteses registradas
          </p>
          {!!job.reusedAnalyses && (
            <p>
              {job.reusedAnalyses} análises reaproveitadas por equivalência do pedido e das origens,
              sem nova geração.
            </p>
          )}
          <p>
            {job.blocking} registros de impedimentos · {job.warnings} alertas · {job.suggestions}{' '}
            sugestões. Achados relacionados podem aparecer em mais de uma camada.
          </p>
          {!!job.retainedBlocking && (
            <p>
              {job.retainedBlocking} impedimentos encerrados por decisão autoral de manter ·{' '}
              {job.unresolvedBlocking ?? job.blocking} sem decisão vigente.
            </p>
          )}
          {job.message && <Alert variant="warning">{job.message}</Alert>}
          {job.waitingForResult && (
            <Alert>
              Há uma análise sem resultado terminal confirmado. Consulte ou cancele antes de pedir
              nova tentativa.
            </Alert>
          )}
          {job.state === 'done' && (
            <p>
              Cobertura integral conferida para as versões deste registro. Correções e aceite
              autoral continuam separados.
            </p>
          )}
          {job.authorAccepted && (
            <Alert variant="success">
              Aceite autoral da integração registrado. A publicação permanece uma ação separada.
            </Alert>
          )}
          <div className={styles.actions}>
            {active(job) && (
              <Button disabled={locked} onClick={() => void resume()}>
                Retomar integração até concluir
              </Button>
            )}
            {(active(job) || job.state === 'attention') && (
              <Button
                variant="outline"
                disabled={canceling || pending !== null}
                onClick={() => void cancel()}
              >
                Cancelar esta integração
              </Button>
            )}
            <Button variant="outline" disabled={locked} onClick={() => void open(job.jobId)}>
              Consultar checkpoint da integração
            </Button>
            <Button variant="outline" disabled={locked} onClick={() => void browse()}>
              Consultar matriz e análises
            </Button>
            <Button variant="outline" disabled={locked} onClick={() => void browseDecisions()}>
              Consultar decisões e correções
            </Button>
            {job.pendingRequestId && (
              <>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void inspect(job.pendingRequestId!)}
                >
                  Consultar análise pendente
                </Button>
                <Button variant="outline" disabled={locked} onClick={() => void cancelAnalysis()}>
                  Cancelar somente análise pendente
                </Button>
              </>
            )}
            {job.state === 'attention' && job.pendingRequestId && (
              <Button variant="outline" disabled={locked} onClick={() => void retry()}>
                Preparar nova tentativa da análise
              </Button>
            )}
            {job.finalRequestId && (
              <Button
                variant="outline"
                disabled={locked || !!instruction}
                onClick={() => void prepareSuccessor()}
              >
                Preparar integração sucessora com estas orientações
              </Button>
            )}
            {job.finalRequestId && (
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => void inspect(job.finalRequestId!)}
              >
                Consultar síntese final
              </Button>
            )}
            {job.state === 'done' && !job.authorAccepted && (
              <Button
                disabled={locked || (job.unresolvedBlocking ?? job.blocking) > 0}
                onClick={() => void accept()}
              >
                Registrar aceite da integração
              </Button>
            )}
          </div>
          {job.canRecheck && job.sourceToken && (
            <LiteraryIntegrationRecheckPanel
              key={job.jobId}
              bookId={bookId}
              jobId={job.jobId}
              sourceToken={job.sourceToken}
              operationId={job.recheckOperationId}
              lastOperationId={job.lastRecheckId}
              disabled={busy || canceling || pending !== null || findingPending}
              onPendingChange={setRecheckPending}
              onRefresh={() => void open(job.jobId)}
            />
          )}
          {job.state === 'stale' && (
            <p>As fontes mudaram. Este registro não comprova a integração das versões atuais.</p>
          )}
        </section>
      )}
      {decisionPage && (
        <section aria-label="Decisões e correções registradas">
          <h3>Decisões e correções</h3>
          <p>
            Estes registros preservam suas justificativas. Abrir uma decisão confere sua atualidade
            sem recuperar o corpo de uma análise revogada.
          </p>
          {!decisionPage.items.length && (
            <EmptyState
              title="Nenhuma decisão registrada"
              description="Abra um achado para investigar, planejar correção ou registrar uma escolha autoral."
            />
          )}
          {decisionPage.items.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              disabled={locked}
              onClick={() => openFinding(item.source, item.id)}
            >
              Achado {item.source.index + 1} · {findingActionLabels[item.action]} · revisão{' '}
              {item.revision}
            </Button>
          ))}
          {decisionPage.nextAfterId && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => void browseDecisions(decisionPage.nextAfterId)}
            >
              Mais decisões e correções
            </Button>
          )}
        </section>
      )}
      {architecturePage && (
        <section className={styles.comparison} aria-label="Inventário da auditoria global">
          <h3>Fontes da arquitetura</h3>
          <p>
            {architecturePage.inventoryComplete
              ? 'Inventário percorrido; cada fonte ainda precisa de leitura e conferência.'
              : 'Prévia parcial; o inventário ainda está em andamento.'}
          </p>
          {architecturePage.items.length === 0 && (
            <EmptyState
              title="Nenhuma fonte nesta página"
              description="Prepare ou retome o inventário para consultar as fontes."
            />
          )}
          <ul>
            {architecturePage.items.map((item) => (
              <li key={item.index}>
                <Button
                  variant="ghost"
                  className={styles.sourceButton}
                  disabled={locked || !item.available}
                  onClick={() => void previewArchitecture(item.index)}
                >
                  Prévia da fonte {item.index + 1} ·{' '}
                  {architectureLabels[item.source.kind] ?? 'Fonte'} ·{' '}
                  {item.available
                    ? (item.label ?? 'Associação ou ordem registrada')
                    : 'Versão indisponível'}
                </Button>
                {item.read && <Badge>Leitura registrada</Badge>}
              </li>
            ))}
          </ul>
          {architecturePage.nextAfterIndex !== null && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => void browseArchitecture(architecturePage.nextAfterIndex)}
            >
              Mais fontes da arquitetura
            </Button>
          )}
        </section>
      )}
      {architecturePreview && (
        <section className={styles.comparison} aria-label="Prévia da fonte arquitetural">
          {architecturePreview.state !== 'ready' ? (
            <Alert>A fonte não está disponível nesta versão da auditoria.</Alert>
          ) : (
            <>
              <h3>{architecturePreview.source.label}</h3>
              <p>
                Trecho {architecturePreview.segment + 1} de {architecturePreview.segmentCount}. Esta
                prévia não executa IA nem comprova leitura do manuscrito.
              </p>
              <Textarea
                label="Fonte enviada à auditoria"
                value={architecturePreview.source.text}
                readOnly
                rows={8}
              />
              <Textarea
                label="Guia editorial enviado à auditoria"
                value={architecturePreview.editorial.instruction}
                readOnly
                rows={6}
              />
              <details>
                <summary>Contrato vigente nesta prévia</summary>
                {architecturePreview.editorial.documents.map((doc) => (
                  <Textarea key={doc.id} label={doc.label} value={doc.text} readOnly rows={6} />
                ))}
              </details>
              <div className={styles.actions}>
                {architecturePreview.segment > 0 && (
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      void previewArchitecture(
                        architecturePreview.index,
                        architecturePreview.segment - 1,
                      )
                    }
                  >
                    Trecho anterior da fonte
                  </Button>
                )}
                {architecturePreview.segment + 1 < architecturePreview.segmentCount && (
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      void previewArchitecture(
                        architecturePreview.index,
                        architecturePreview.segment + 1,
                      )
                    }
                  >
                    Próximo trecho da fonte
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      )}
      {results && (
        <ul>
          {results.items.map((item) => (
            <li key={item.index}>
              <Button
                variant="ghost"
                disabled={locked}
                onClick={() => void inspect(item.requestId)}
              >
                {item.index + 1} ·{' '}
                {item.kind === 'architecture'
                  ? 'Arquitetura e intenção'
                  : item.kind === 'reading'
                    ? 'Leitura e matriz'
                    : item.kind === 'boundary'
                      ? 'Transição'
                      : 'Síntese de evidências'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {results?.nextAfterIndex !== null && results?.nextAfterIndex !== undefined && (
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => void browse(results.nextAfterIndex)}
        >
          Mais análises da integração
        </Button>
      )}
      {selected && (
        <section className={styles.comparison} aria-label="Evidências da integração">
          {selected.state !== 'done' ? (
            <Alert>
              Resultado {selected.state}. Não há evidência atual disponível para esta consulta.
            </Alert>
          ) : (
            <>
              {selected.reusedFrom && (
                <Alert>
                  Resultado reaproveitado de uma análise com pedido e origens equivalentes. As
                  fontes deste checkpoint foram conferidas novamente.
                </Alert>
              )}
              <p>{selected.result.report}</p>
              {selected.kind === 'synthesis' && (
                <details>
                  <summary>Análises incluídas nesta síntese</summary>
                  {selected.evidenceIds.map((id, index) => (
                    <Button
                      key={id}
                      variant="ghost"
                      disabled={locked}
                      onClick={() => void inspect(id)}
                    >
                      Abrir análise de apoio {index + 1}
                    </Button>
                  ))}
                </details>
              )}
              {selected.result.findings.map((finding, index) => (
                <div key={index}>
                  <Badge>
                    {finding.severity === 'blocking'
                      ? 'Impedimento'
                      : finding.severity === 'warning'
                        ? 'Atenção'
                        : 'Sugestão'}
                  </Badge>
                  <p>{finding.problem}</p>
                  <p>{finding.action}</p>
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      openFinding({ jobId: selected.jobId, requestId: selected.requestId, index })
                    }
                  >
                    Tratar este achado
                  </Button>
                  {'evidence' in finding &&
                    finding.evidence.map((evidence, at) => (
                      <div key={at}>
                        <blockquote>{evidence.quote}</blockquote>
                        <p>
                          {selected.sources.find((source) => source.id === evidence.sourceId)
                            ?.label ?? evidence.sourceId}{' '}
                          · posição {evidence.offset}
                        </p>
                      </div>
                    ))}
                  {'evidenceIds' in finding &&
                    finding.evidenceIds.map((id) => (
                      <Button
                        key={id}
                        variant="ghost"
                        disabled={locked}
                        onClick={() => void inspect(id)}
                      >
                        Abrir evidência de apoio
                      </Button>
                    ))}
                </div>
              ))}
              {'matrix' in selected.result &&
                selected.result.matrix.map((row, index) => (
                  <section key={index}>
                    <h3>
                      {axisLabels[row.axis]} · {row.subject}
                    </h3>
                    <p>{row.observation}</p>
                    <p>
                      {row.certainty === 'uncertain'
                        ? 'Informação incerta'
                        : row.certainty === 'interpretation'
                          ? 'Interpretação proposta'
                          : 'Acontecimento identificado pela análise'}{' '}
                      · proposta para conferência
                    </p>
                    {row.evidence.map((evidence, at) => (
                      <div key={at}>
                        <blockquote>{evidence.quote}</blockquote>
                        <p>
                          {selected.sources.find((source) => source.id === evidence.sourceId)
                            ?.label ?? evidence.sourceId}{' '}
                          · posição {evidence.offset}
                        </p>
                      </div>
                    ))}
                  </section>
                ))}
              {'conclusions' in selected.result &&
                selected.result.conclusions.map((item, index) => (
                  <section key={index}>
                    <h3>{axisLabels[item.axis]}</h3>
                    <p>{item.observation}</p>
                    {item.evidenceIds.map((id) => (
                      <Button
                        key={id}
                        variant="ghost"
                        disabled={locked}
                        onClick={() => void inspect(id)}
                      >
                        Abrir evidência da síntese
                      </Button>
                    ))}
                  </section>
                ))}
            </>
          )}
        </section>
      )}
      {!!findingEditors.length && (
        <section className={styles.panel} aria-label="Decisões editoriais abertas">
          <h3>Decisões abertas</h3>
          <p>
            Trocar de relatório ou de decisão mantém seus rascunhos até você fechar cada editor.
          </p>
          <div className={styles.actions}>
            {findingEditors.map((entry, index) => (
              <Button
                key={entry.key}
                variant={activeFinding === entry.key ? 'primary' : 'outline'}
                aria-pressed={activeFinding === entry.key}
                onClick={() => setActiveFinding(entry.key)}
              >
                Decisão {index + 1}
                {findingWork[entry.key]?.dirty ? ' · rascunho' : ''}
              </Button>
            ))}
          </div>
          {findingEditors.map((entry) => (
            <div key={entry.key} hidden={activeFinding !== entry.key}>
              <LiteraryFindingDecisionPanel
                bookId={bookId}
                trackingKey={entry.key}
                source={entry.source}
                decisionId={entry.decisionId}
                disabled={busy || canceling || pending !== null || recheckPending}
                onWorkChange={updateFindingWork}
                onChanged={findingChanged}
                onClose={() => closeFinding(entry.key)}
              />
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
