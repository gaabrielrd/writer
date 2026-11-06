import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Badge, Button, EmptyState, LoadingState, Textarea } from '@/shared/ui';
import {
  startLiteraryReview,
  getLiteraryReview,
  advanceLiteraryReview,
  cancelLiteraryReview,
  cancelPendingLiteraryReview,
  cancelPendingLiteraryReviewAnalysis,
  retryLiteraryReviewAnalysis,
  acceptLiteraryReview,
  advanceLiteraryReviewedVersion,
  listLiteraryReviews,
  listLiteraryReviewAnalyses,
  type LiteraryReview,
  type StartLiteraryReview,
} from '../services/literaryReviewService';
import { getLiteraryProse, type ProseResponse } from '../services/literaryProseService';
import { WritingSourcePicker } from './WritingSourcePicker';
import styles from './EditorialContractPanel.module.css';
const labels = {
  planning: 'Identificando cenas',
  reviewing: 'Revisão pendente',
  attention: 'Análise interrompida',
  done: 'Cobertura concluída',
  stale: 'Fontes alteradas; reconferência necessária',
  canceled: 'Revisão cancelada',
};
const active = (job: LiteraryReview) =>
  !job.paused && (job.state === 'planning' || job.state === 'reviewing');
export function LiteraryReviewPanel({
  bookId,
  chapterId,
  captureGeneration,
  onWorkChange,
  initialJobId,
  coordinated = false,
  coordinatedReview,
  coordinatorBusy = false,
}: {
  coordinated?: boolean;
  coordinatedReview?: LiteraryReview;
  coordinatorBusy?: boolean;
  initialJobId?: string;
  bookId: string;
  chapterId: string;
  captureGeneration?: () => unknown;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
}) {
  const { user } = useAuth();
  const [instruction, setInstruction] = useState(''),
    [planIds, setPlanIds] = useState<string[] | undefined>(undefined);
  const [pending, setPending] = useState<StartLiteraryReview | null>(null),
    [job, setJob] = useState<LiteraryReview | null>(null);
  const [page, setPage] = useState<Awaited<ReturnType<typeof listLiteraryReviews>> | null>(null);
  const [analyses, setAnalyses] = useState<Awaited<
    ReturnType<typeof listLiteraryReviewAnalyses>
  > | null>(null);
  const [selected, setSelected] = useState<ProseResponse | null>(null);
  const [busy, setBusy] = useState(false),
    [canceling, setCanceling] = useState(false),
    [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false),
    sequence = useRef(0),
    pause = useRef(false);
  useEffect(() => {
    onWorkChange?.({ dirty: !!instruction, pending: pending !== null || busy || canceling });
  }, [instruction, pending, busy, canceling, onWorkChange]);
  useEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
      pause.current = true;
    };
  }, [bookId, chapterId, user?.uid]);
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
      if (epoch.current === current && sequence.current === runId)
        setError(cause instanceof Error ? cause.message : 'Revisão indisponível.');
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
        ...(planIds === undefined ? {} : { planIds: [...planIds] }),
        ...(captureGeneration ? { generation: captureGeneration() } : {}),
      };
      setPending(input);
      let result;
      try {
        result = await startLiteraryReview(input, user?.uid ?? '');
      } catch (cause) {
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
        if (
          epoch.current === current &&
          sequence.current === runId &&
          [
            'functions/invalid-argument',
            'functions/not-found',
            'functions/permission-denied',
            'functions/unauthenticated',
            'functions/failed-precondition',
            'functions/resource-exhausted',
          ].includes(code)
        )
          setPending(null);
        throw cause;
      }
      if (epoch.current === current && sequence.current === runId) {
        setPending(null);
        setJob(result);
        setInstruction('');
        setAnalyses(null);
        setSelected(null);
      }
    });
  const open = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryReview(bookId, id);
      if (epoch.current !== current) return;
      if (result.state === 'unconfirmed')
        throw new Error('Revisão sem confirmação. Consulte novamente.');
      setJob(result);
      setAnalyses(null);
      setSelected(null);
    });
  const lastCoordinated = useRef<LiteraryReview | undefined>(undefined);
  const adoptCoordinated = useCallback((next: LiteraryReview) => setJob(next), []);
  useEffect(() => {
    if (
      coordinated &&
      coordinatedReview &&
      coordinatedReview !== lastCoordinated.current &&
      !busy &&
      !canceling &&
      !pending
    ) {
      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        lastCoordinated.current = coordinatedReview;
        adoptCoordinated(coordinatedReview);
      });
      return () => {
        active = false;
      };
    }
  }, [coordinated, coordinatedReview, busy, canceling, pending, adoptCoordinated]);
  useEffect(() => {
    if (!initialJobId || coordinatedReview) return;
    let alive = true;
    void getLiteraryReview(bookId, initialJobId)
      .then((result) => {
        if (alive && result.state !== 'unconfirmed') setJob(result);
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível abrir a revisão do ciclo.',
          );
      });
    return () => {
      alive = false;
    };
  }, [bookId, initialJobId, coordinatedReview]);
  const load = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryReviews(bookId, chapterId, afterId);
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
        latest = await advanceLiteraryReview(bookId, job.jobId);
        if (epoch.current === current && sequence.current === runId) setJob(latest);
        if (latest.waitingForResult) break;
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
        ? await cancelPendingLiteraryReview(pending, user?.uid ?? '')
        : await cancelLiteraryReview(bookId, id);
      if (epoch.current === current) {
        sequence.current += 1;
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
      const result = await cancelPendingLiteraryReviewAnalysis(bookId, job.jobId);
      if (epoch.current === current) setJob(result);
    });
  const retry = () =>
    run(async (current) => {
      if (!job) return;
      const result = await retryLiteraryReviewAnalysis(bookId, job.jobId);
      if (epoch.current === current) setJob(result);
    });
  const accept = () =>
    run(async (current) => {
      if (!job?.sourceToken) return;
      const result = await acceptLiteraryReview(bookId, job.jobId, job.sourceToken);
      if (epoch.current === current) setJob(result);
    });
  const preserve = (restart = false) =>
    run(async (current, runId) => {
      if (!job?.sourceToken) return;
      pause.current = false;
      let latest: Awaited<ReturnType<typeof advanceLiteraryReviewedVersion>>;
      let first = true;
      do {
        latest = await advanceLiteraryReviewedVersion(
          bookId,
          job.jobId,
          job.sourceToken,
          first && restart,
        );
        first = false;
        if (epoch.current === current && sequence.current === runId) setJob(latest);
      } while (
        epoch.current === current &&
        sequence.current === runId &&
        !pause.current &&
        latest.state === 'done' &&
        latest.authorAccepted &&
        latest.preservationState === 'capturing'
      );
    });
  const listAnalyses = (afterId: string | null = null) =>
    run(async (current) => {
      if (!job) return;
      const result = await listLiteraryReviewAnalyses(bookId, job.jobId, afterId);
      if (epoch.current === current) {
        setAnalyses((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
        if (result.state && result.state !== job.state)
          setJob({ ...job, state: result.state, authorAccepted: false });
      }
    });
  const inspect = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryProse(bookId, id);
      if (epoch.current === current) setSelected(result);
    });
  const locked = coordinatorBusy || busy || canceling || pending !== null;
  return (
    <section className={styles.panel} aria-label="Revisão integral do capítulo">
      <h3>Revisão integral do capítulo</h3>
      <p>
        Percorra todas as cenas e segmentos em duas camadas: arquitetura/continuidade e
        prosa/experiência. A cobertura não declara que correções foram aplicadas nem que o livro
        está integrado.
      </p>
      <p>
        A análise usa a IA da plataforma e não debita créditos. A retomada só avança depois do seu
        pedido; sair preserva o checkpoint.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Avançando a revisão…" />}
      {pending && <Alert>Confirme a criação da revisão antes de iniciar outra.</Alert>}
      {!coordinated && (
        <>
          <Textarea
            label="Orientação para a revisão integral"
            maxLength={4000}
            value={instruction}
            disabled={locked}
            onChange={(event) => setInstruction(event.target.value)}
          />
          {!!instruction && (
            <Button variant="ghost" disabled={locked} onClick={() => setInstruction('')}>
              Descartar orientação de revisão
            </Button>
          )}
          <WritingSourcePicker
            bookId={bookId}
            value={planIds}
            onChange={setPlanIds}
            disabled={locked}
          />
          <div className={styles.actions}>
            <Button
              disabled={busy || canceling}
              hidden={!!initialJobId}
              onClick={() => void start()}
            >
              {pending ? 'Recuperar a mesma revisão' : 'Registrar revisão do capítulo'}
            </Button>
            <Button variant="outline" disabled={locked} onClick={() => void load()}>
              Consultar revisões do capítulo
            </Button>
            {busy && (
              <Button
                variant="outline"
                onClick={() => {
                  pause.current = true;
                }}
              >
                Pausar após a análise atual
              </Button>
            )}
          </div>
          {page && !page.items.length && (
            <EmptyState
              title="Nenhuma revisão integral registrada"
              description="O capítulo precisa de cenas ativas com prosa salva para este fluxo."
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
              Mais revisões
            </Button>
          )}
        </>
      )}
      {job && (
        <section className={styles.comparison}>
          <Badge>{labels[job.state]}</Badge>
          <p>
            {job.completedUnits} de {job.units} cenas conferidas nas duas camadas · {job.analyses}{' '}
            análises
          </p>
          <p>
            {job.blocking} impedimentos · {job.warnings} alertas · {job.suggestions} sugestões
          </p>
          {job.waitingForResult && (
            <Alert>
              Há um pedido registrado sem resultado terminal. Consulte o checkpoint ou cancele; o
              registro não comprova que o produtor continua ativo.
            </Alert>
          )}
          {job.authorAccepted && <p>Aceite autoral registrado para estas fontes e versões.</p>}
          {job.preservationProgress && (
            <p>
              Versão revisada: {job.preservationProgress.captured} de{' '}
              {job.preservationProgress.planned} cenas preservadas ·{' '}
              {job.preservationProgress.verified} conferidas.
            </p>
          )}
          {job.preservationCurrent && (
            <Alert variant="success">
              Versão revisada preservada no histórico e vinculada a esta revisão aceita. A
              integração do ato permanece uma etapa separada.
            </Alert>
          )}
          {job.preservationState === 'done' && !job.preservationCurrent && (
            <Alert variant="warning">
              O histórico mudou desde a última conferência. Consulte a revisão e reconfira as
              versões preservadas.
            </Alert>
          )}
          {job.preservationState === 'attention' && (
            <Alert variant="warning">
              A captura anterior foi interrompida ou perdeu uma versão. O registro foi preservado;
              uma nova captura exige seu pedido.
            </Alert>
          )}
          <div className={styles.actions}>
            {!coordinated && active(job) && (
              <Button disabled={locked} onClick={() => void resume()}>
                Retomar revisão até concluir
              </Button>
            )}
            {!coordinated && (active(job) || job.state === 'attention') && (
              <Button
                variant="outline"
                disabled={canceling || pending !== null}
                onClick={() => void cancel()}
              >
                Cancelar esta revisão
              </Button>
            )}
            {job.pendingRequestId && (
              <>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void inspect(job.pendingRequestId!)}
                >
                  Consultar análise pendente
                </Button>
                {!coordinated && (
                  <Button variant="outline" disabled={locked} onClick={() => void cancelAnalysis()}>
                    Cancelar somente a análise pendente
                  </Button>
                )}
              </>
            )}
            {!coordinated && job.state === 'attention' && (
              <Button variant="outline" disabled={locked} onClick={() => void retry()}>
                Preparar nova tentativa da análise interrompida
              </Button>
            )}
            <Button variant="outline" disabled={locked} onClick={() => void open(job.jobId)}>
              Consultar checkpoint da revisão
            </Button>
            <Button variant="outline" disabled={locked} onClick={() => void listAnalyses()}>
              Consultar análises e evidências
            </Button>
            {!coordinated &&
              job.state === 'done' &&
              job.authorAccepted &&
              !job.preservationCurrent && (
                <Button
                  disabled={locked}
                  onClick={() => void preserve(job.preservationState === 'attention')}
                >
                  {job.preservationState === 'attention'
                    ? 'Registrar nova captura revisada'
                    : job.preservationState === 'done'
                      ? 'Reconferir versões preservadas'
                      : 'Preservar versão revisada aceita'}
                </Button>
              )}
            {!coordinated && job.state === 'done' && !job.authorAccepted && (
              <Button disabled={locked || job.blocking > 0} onClick={() => void accept()}>
                Registrar aceite autoral da revisão
              </Button>
            )}
          </div>
          {job.state === 'stale' && (
            <p>
              O manuscrito ou suas fontes mudaram. Preserve esta revisão como registro histórico e
              inicie outra após conferir as alterações.
            </p>
          )}
        </section>
      )}
      {analyses && (
        <ul>
          {analyses.items.map((item) => (
            <li key={item.id}>
              <Button
                variant="ghost"
                disabled={locked}
                onClick={() => void inspect(item.requestId)}
              >
                Cena {item.unitIndex + 1} ·{' '}
                {item.layer === 'reviewStructure' ? 'Arquitetura' : 'Prosa'} · parte{' '}
                {item.segment + 1}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {analyses?.nextAfterId && (
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => void listAnalyses(analyses.nextAfterId)}
        >
          Mais análises
        </Button>
      )}
      {selected && (
        <section className={styles.comparison} aria-label="Evidências da análise">
          {selected.historical && (
            <Alert variant="warning">Análise histórica: o texto ou as fontes já mudaram.</Alert>
          )}
          {selected.state === 'running' && (
            <Alert>Pedido registrado, sem resultado terminal confirmado.</Alert>
          )}
          {selected.state === 'error' && (
            <Alert variant="warning">
              {selected.message ?? 'Análise interrompida. Nenhuma correção foi aplicada.'}
            </Alert>
          )}
          {selected.state === 'revoked' && (
            <Alert>A origem desta análise não está mais disponível.</Alert>
          )}
          {selected.result && (
            <>
              <p>{selected.result.rationale}</p>
              {selected.result.findings.map((finding, index) => (
                <div key={index}>
                  <Badge>
                    {finding.severity === 'blocking'
                      ? 'Impedimento'
                      : finding.severity === 'warning'
                        ? 'Atenção'
                        : 'Sugestão'}
                  </Badge>
                  <blockquote>{finding.quote}</blockquote>
                  <p>
                    {selected.documents?.find((document) => document.id === finding.sourceId)
                      ?.label ?? 'Fonte selecionada'}{' '}
                    · posição {finding.offset}
                  </p>
                  <p>{finding.problem}</p>
                  <p>{finding.action}</p>
                </div>
              ))}
              {!selected.result.findings.length && <p>Nenhum achado retornado neste segmento.</p>}
            </>
          )}
        </section>
      )}
    </section>
  );
}
