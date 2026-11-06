import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { readCompleteWorkVersion, type CompleteWorkVersion } from '@/features/manuscript-history';
import { renderRichText } from '@/shared/lib';
import { Alert, Badge, Button, Dropdown, EmptyState, LoadingState } from '@/shared/ui';
import {
  startLiteraryMilestone,
  getLiteraryMilestone,
  advanceLiteraryMilestone,
  cancelLiteraryMilestone,
  listLiteraryMilestones,
  listLiteraryMilestoneVersions,
  type LiteraryMilestone,
  type StartLiteraryMilestone,
} from '../services/literaryMilestoneService';
import styles from './EditorialContractPanel.module.css';
const stateLabels = {
  planning: 'Identificando cenas',
  capturing: 'Preservando versões',
  verifying: 'Conferindo versões',
  done: 'Captura concluída',
  stale: 'Fonte alterada; captura interrompida',
  canceled: 'Captura cancelada',
};
const active = (state: LiteraryMilestone['state']) =>
  ['planning', 'capturing', 'verifying'].includes(state);
export function LiteraryMilestonePanel({
  bookId,
  chapterId,
  onPendingChange,
}: {
  bookId: string;
  chapterId: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { user } = useAuth();
  const [kind, setKind] = useState<'firstDraft' | 'revised'>('firstDraft');
  const [page, setPage] = useState<Awaited<ReturnType<typeof listLiteraryMilestones>> | null>(null);
  const [job, setJob] = useState<LiteraryMilestone | null>(null);
  const [versions, setVersions] = useState<Awaited<
    ReturnType<typeof listLiteraryMilestoneVersions>
  > | null>(null);
  const [selected, setSelected] = useState<CompleteWorkVersion | null>(null);
  const [pending, setPending] = useState<StartLiteraryMilestone | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false),
    pause = useRef(false);
  useEffect(() => {
    onPendingChange?.(pending !== null);
  }, [pending, onPendingChange]);
  useEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
      pause.current = true;
    };
  }, [bookId, chapterId, user?.uid]);
  const run = async (task: (current: number) => Promise<void>) => {
    if (working.current) return;
    const current = epoch.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task(current);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a captura.');
    } finally {
      if (epoch.current === current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const load = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryMilestones(bookId, chapterId, afterId);
      if (epoch.current === current)
        setPage((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const start = () =>
    run(async (current) => {
      const input = pending ?? {
        target: { kind: 'book' as const, id: bookId },
        chapterId,
        kind,
        jobId: crypto.randomUUID(),
      };
      setPending(input);
      let result;
      try {
        result = await startLiteraryMilestone(input, user?.uid ?? '');
      } catch (cause) {
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
        if (
          epoch.current === current &&
          [
            'functions/invalid-argument',
            'functions/not-found',
            'functions/permission-denied',
            'functions/unauthenticated',
            'functions/failed-precondition',
          ].includes(code)
        )
          setPending(null);
        throw cause;
      }
      if (epoch.current === current) {
        setPending(null);
        setJob(result);
        setVersions(null);
        setSelected(null);
      }
    });
  const open = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryMilestone(bookId, id);
      if (epoch.current !== current) return;
      if (result.state === 'unconfirmed')
        throw new Error('Captura ainda sem confirmação. Consulte novamente sem criar outra.');
      setJob(result);
      setVersions(null);
      setSelected(null);
    });
  const resume = () =>
    run(async (current) => {
      if (!job) return;
      pause.current = false;
      let latest = job;
      // Work is explicitly requested here; mounting or listing never advances a job.
      while (epoch.current === current && !pause.current && active(latest.state)) {
        latest = await advanceLiteraryMilestone(bookId, job.jobId);
        if (epoch.current === current) setJob(latest);
      }
    });
  const cancel = () =>
    run(async (current) => {
      if (!job) return;
      const result = await cancelLiteraryMilestone(bookId, job.jobId);
      if (epoch.current === current) setJob(result);
    });
  const listVersions = (afterIndex: number | null = null) =>
    run(async (current) => {
      if (!job) return;
      const result = await listLiteraryMilestoneVersions(bookId, job.jobId, afterIndex);
      if (epoch.current === current)
        setVersions((previous) => ({
          ...result,
          items: afterIndex !== null ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const inspect = (id: string) =>
    run(async (current) => {
      const result = await readCompleteWorkVersion(
        { target: { kind: 'book', id: bookId }, versionId: id },
        () => epoch.current === current,
      );
      if (epoch.current === current && result) setSelected(result);
    });
  return (
    <section className={styles.panel} aria-label="Versões da produção do capítulo">
      <h3>Primeira versão e versão revisada</h3>
      <p>
        Preserve o texto salvo no histórico. Em capítulos compostos, a captura mantém a ordem e uma
        versão de cada cena. Este registro identifica o texto; não certifica qualidade, revisão ou
        conclusão do capítulo.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Preservando ou consultando versões…" />}
      {pending && (
        <Alert>
          A criação desta captura ainda precisa de confirmação. Recupere o mesmo pedido antes de
          iniciar outra.
        </Alert>
      )}
      <Dropdown
        mode="select"
        label="Marco da versão"
        value={kind}
        disabled={busy || pending !== null}
        options={[
          { value: 'firstDraft', label: 'Primeira versão' },
          { value: 'revised', label: 'Versão revisada' },
        ]}
        onValueChange={(value) => setKind(value as 'firstDraft' | 'revised')}
      />
      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => void start()}>
          {pending ? 'Recuperar a mesma captura' : 'Iniciar preservação do texto salvo'}
        </Button>
        <Button variant="outline" disabled={busy || pending !== null} onClick={() => void load()}>
          Consultar capturas do capítulo
        </Button>
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
          title="Nenhuma captura registrada"
          description="O texto atual continua no editor. Preserve uma versão quando quiser identificá-la como marco."
        />
      )}
      {page && (
        <ul>
          {page.items.map((item) => (
            <li key={item.jobId}>
              <Button
                variant="ghost"
                disabled={busy || pending !== null}
                onClick={() => void open(item.jobId)}
              >
                {item.kind === 'firstDraft' ? 'Primeira versão' : 'Versão revisada'} ·{' '}
                {new Date(item.createdAt).toLocaleString('pt-BR')} · {stateLabels[item.state]}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {page?.nextAfterId && (
        <Button
          variant="outline"
          disabled={busy || pending !== null}
          onClick={() => void load(page.nextAfterId)}
        >
          Mais capturas
        </Button>
      )}
      {job && (
        <section className={styles.comparison}>
          <Badge>{stateLabels[job.state]}</Badge>
          <p>
            {job.planned} unidades identificadas · {job.captured} versões preservadas ·{' '}
            {job.verified} conferidas
          </p>
          <div className={styles.actions}>
            {active(job.state) && (
              <>
                <Button disabled={busy} onClick={() => void resume()}>
                  Retomar preservação até concluir
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void cancel()}>
                  Cancelar esta captura
                </Button>
              </>
            )}
            <Button variant="outline" disabled={busy} onClick={() => void open(job.jobId)}>
              Consultar checkpoint
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void listVersions()}>
              Consultar versões preservadas
            </Button>
          </div>
          {job.state === 'stale' && (
            <p>
              A fonte mudou durante a captura. As versões já preservadas continuam no histórico.
              Confira o texto antes de iniciar outra captura.
            </p>
          )}
          {job.state === 'canceled' && (
            <p>
              Versões que já entraram no histórico são preservadas, inclusive uma captura nativa que
              estivesse em curso.
            </p>
          )}
        </section>
      )}
      {versions && (
        <ol>
          {versions.items.map((item) => (
            <li key={item.index}>
              {item.version ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void inspect(item.version!.id)}
                >
                  Ler unidade {item.index + 1} · {item.version.wordCount} palavras
                </Button>
              ) : (
                'Unidade ' + (item.index + 1) + ' ainda não preservada'
              )}
            </li>
          ))}
        </ol>
      )}
      {versions?.nextAfterIndex !== null && versions?.nextAfterIndex !== undefined && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void listVersions(versions.nextAfterIndex)}
        >
          Mais unidades
        </Button>
      )}
      {selected && (
        <section className={styles.comparison} aria-label="Texto preservado">
          <h4>{selected.version.label ?? 'Versão preservada'}</h4>
          <div dangerouslySetInnerHTML={{ __html: renderRichText(selected.content) }} />
          <Button variant="ghost" onClick={() => setSelected(null)}>
            Fechar leitura
          </Button>
        </section>
      )}
    </section>
  );
}
