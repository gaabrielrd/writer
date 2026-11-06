import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Dropdown,
  EmptyState,
  ErrorState,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { getLiteraryOperation } from '../services/literaryProductionService';
import {
  listLiteraryPendingOperations,
  finishLiteraryOperation,
} from '../services/literaryRecoveryStorage';
import {
  progressStages,
  listLiteraryProgressArtifacts,
  getLiteraryProgressArtifact,
  saveLiteraryProgressNote,
  type ProgressStage,
  type ProgressPage,
  type ProgressDetail,
  type SaveProgressNote,
} from '../services/literaryProgressService';
import styles from './EditorialContractPanel.module.css';
const labels: Record<string, string> = {
  saved: 'Salvo',
  approved: 'Aprovado',
  proposal: 'Proposta',
  working: 'Em elaboração',
  gap: 'Lacuna',
  checkingGuide: 'Conferindo o guia',
  verified: 'Verificações concluídas; confirmação pendente',
  compiling: 'Compilando texto',
  prepared: 'Manifesto preparado; publicação pendente',
  published: 'Publicação confirmada',
  pending: 'Pendente',
  accepted: 'Aceite registrado',
  planning: 'Organizando unidades',
  drafting: 'Redação em andamento',
  reading: 'Leitura em andamento',
  synthesizing: 'Integrando evidências',
  capturing: 'Preservando versões',
  verifying: 'Conferindo versões e fontes',
  done: 'Execução concluída',
  stale: 'Fontes alteradas',
  attention: 'Ação necessária',
  canceled: 'Cancelado',
  unrecorded: 'Sem confirmação',
};
const counterLabels: Record<string, string> = {
  units: 'Unidades',
  accepted: 'Unidades aceitas',
  drafted: 'Unidades redigidas',
  adopted: 'Unidades adotadas',
  planned: 'Versões previstas',
  captured: 'Versões preservadas',
  verified: 'Versões conferidas',
  wordCount: 'Palavras preservadas',
  blocking: 'Achados bloqueantes',
  warnings: 'Alertas',
  unresolvedBlocking: 'Bloqueios não resolvidos',
  chapterCount: 'Capítulos selecionados',
  compiledChapters: 'Capítulos compilados',
  unitCount: 'Fontes de texto',
  verifiedUnits: 'Fontes reconferidas',
  verifiedChapters: 'Capítulos reconferidos',
  verifiedCandidates: 'Posições do livro reconferidas',
  removalCount: 'Capítulos removidos desta edição',
  guideCount: 'Entradas públicas do guia',
  verifiedGuideEntries: 'Entradas conferidas',
};
const signature = (blockers: string, nextStep: string) => JSON.stringify({ blockers, nextStep });
type Props = {
  bookId: string;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
};
export function LiteraryProgressPanel(props: Props) {
  const { user } = useAuth();
  return (
    <ProgressSession key={user?.uid + ':' + props.bookId} {...props} actorId={user?.uid ?? ''} />
  );
}
function ProgressSession({ bookId, actorId, onWorkChange }: Props & { actorId: string }) {
  const [stage, setStage] = useState<ProgressStage>('planning'),
    [page, setPage] = useState<ProgressPage | null>(null),
    [selected, setSelected] = useState<ProgressDetail | null>(null),
    [comparison, setComparison] = useState<ProgressDetail | null>(null),
    [blockers, setBlockers] = useState(''),
    [nextStep, setNextStep] = useState(''),
    [baseline, setBaseline] = useState(signature('', '')),
    [pending, setPending] = useState<SaveProgressNote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false),
    dirty = signature(blockers, nextStep) !== baseline;
  useEffect(() => {
    onWorkChange?.({ dirty, pending: pending !== null });
  }, [dirty, pending, onWorkChange]);
  useEffect(() => {
    const current = ++epoch.current;
    if (actorId)
      void listLiteraryProgressArtifacts(bookId, 'planning')
        .then((result) => {
          if (epoch.current === current) setPage(result);
        })
        .catch((cause: unknown) => {
          if (epoch.current === current)
            setError(
              cause instanceof Error ? cause.message : 'Não foi possível carregar o progresso.',
            );
        });
    return () => {
      epoch.current += 1;
    };
  }, [actorId, bookId]);
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
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.');
    } finally {
      if (epoch.current === current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const load = (selectedStage = stage, afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryProgressArtifacts(bookId, selectedStage, afterId);
      if (epoch.current !== current) return;
      setPage((previous) => ({
        ...result,
        items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
      }));
      setStage(selectedStage);
      if (!afterId) {
        setSelected(null);
        setComparison(null);
      }
    });
  const adopt = (detail: ProgressDetail) => {
    setSelected(detail);
    setComparison(null);
    setBlockers(detail.note.blockers.join('\n'));
    setNextStep(detail.note.nextStep);
    setBaseline(signature(detail.note.blockers.join('\n'), detail.note.nextStep));
  };
  const open = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryProgressArtifact(bookId, stage, id);
      if (epoch.current === current) adopt(result);
    });
  const save = () =>
    run(async (current) => {
      if (!selected) return;
      const input = pending ?? {
        target: { kind: 'book' as const, id: bookId },
        stage: selected.artifact.stage,
        id: selected.artifact.id,
        sourceToken: selected.artifact.sourceToken,
        expectedRevision: selected.note.revision,
        operationId: crypto.randomUUID(),
        notes: {
          blockers: blockers
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          nextStep,
        },
      };
      setPending(input);
      let result;
      try {
        result = await saveLiteraryProgressNote(input, actorId, selected.artifact.noteId);
      } catch (cause) {
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
        if (
          epoch.current === current &&
          [
            'functions/invalid-argument',
            'functions/failed-precondition',
            'functions/not-found',
            'functions/permission-denied',
            'functions/unauthenticated',
            'functions/resource-exhausted',
          ].includes(code)
        )
          setPending(null);
        throw cause;
      }
      if (epoch.current !== current) return;
      setPending(null);
      adopt({ artifact: selected.artifact, note: result });
      setNotice('Bloqueios e próximo passo salvos.');
      setPage((previous) =>
        previous
          ? {
              ...previous,
              items: previous.items.map((item) =>
                item.noteId === result.id
                  ? {
                      ...item,
                      note: {
                        revision: result.revision,
                        updatedAt: result.updatedAt,
                        artifactChanged: false,
                        blockerCount: result.blockers.length,
                        hasNextStep: !!result.nextStep,
                      },
                    }
                  : item,
              ),
            }
          : previous,
      );
    });
  const inspect = () =>
    run(async (current) => {
      if (!pending || !selected) return;
      const receipt = await getLiteraryOperation(bookId, pending.operationId);
      if (epoch.current !== current) return;
      if (receipt.state === 'unconfirmed') {
        setNotice('Salvamento ainda sem confirmação. Consulte novamente ou repita o mesmo pedido.');
        return;
      }
      if (
        receipt.kind !== 'progress' ||
        receipt.id !== selected.artifact.noteId ||
        receipt.revision !== pending.expectedRevision + 1
      )
        throw new Error('A confirmação não corresponde a esta anotação. Preserve a pendência.');
      const entry = listLiteraryPendingOperations(actorId, bookId).find(
        (item) => item.operationId === pending.operationId,
      );
      if (entry) finishLiteraryOperation(entry);
      const result = await getLiteraryProgressArtifact(bookId, pending.stage, pending.id);
      if (epoch.current === current) {
        setPending(null);
        adopt(result);
        setNotice('Salvamento confirmado; anotação atual recuperada.');
      }
    });
  const compare = () =>
    run(async (current) => {
      if (!selected) return;
      const result = await getLiteraryProgressArtifact(
        bookId,
        selected.artifact.stage,
        selected.artifact.id,
      );
      if (epoch.current === current) setComparison(result);
    });
  if (!actorId) return <EmptyState title="Entre na sua conta para consultar o progresso." />;
  const locked = busy || pending !== null || (!page && !error);
  return (
    <section className={styles.panel} aria-label="Progresso por artefato">
      <h3>Progresso por artefato</h3>
      <p>
        Confira cada etapa e sua versão. Um texto salvo, uma revisão aceita e uma publicação
        confirmada são resultados distintos.
      </p>
      <Dropdown
        mode="select"
        label="Etapa do trabalho"
        value={stage}
        disabled={locked || dirty}
        options={[...progressStages]}
        onValueChange={(value) => void load(value as ProgressStage)}
      />
      <div className={styles.actions}>
        <Button variant="outline" disabled={locked || dirty} onClick={() => void load()}>
          Atualizar registros
        </Button>
      </div>
      {busy && <LoadingState label="Consultando o estado editorial..." />}
      {error && (
        <ErrorState message={error} onRetry={!dirty && !pending ? () => void load() : undefined} />
      )}
      {notice && <Alert>{notice}</Alert>}
      {!page && !error && !busy && <LoadingState label="Carregando registros desta etapa..." />}
      {page?.items.length === 0 && (
        <EmptyState
          title="Nenhum artefato registrado nesta etapa"
          description="As etapas permanecem separadas; a ausência de um registro não é substituída pela contagem de palavras."
        />
      )}
      {!!page?.items.length && (
        <ul className={styles.decisions}>
          {page.items.map((item) => (
            <li key={item.id} className={styles.decisionForm}>
              <strong className={styles.contextText}>
                {item.title ??
                  (item.kind === 'firstDraft'
                    ? 'Primeira versão'
                    : item.kind === 'revised'
                      ? 'Versão revisada'
                      : 'Registro ' + item.id.slice(0, 12))}
              </strong>
              <span className={styles.contextText}>
                {item.resource.kind === 'chapter'
                  ? 'Capítulo'
                  : item.resource.kind === 'act'
                    ? 'Ato'
                    : 'Livro'}{' '}
                · {item.resource.id}
              </span>
              <Badge>{labels[item.state] ?? item.state}</Badge>
              {item.active && (
                <p>
                  Há uma execução registrada em andamento. Confira seu checkpoint antes de iniciar
                  outra.
                </p>
              )}
              {item.revision !== null && <span>Revisão do artefato: {item.revision}</span>}
              {item.authorAccepted && <span>Aceite autoral registrado</span>}
              {item.note.blockerCount > 0 && (
                <span>{item.note.blockerCount} bloqueio(s) anotado(s)</span>
              )}
              {item.note.artifactChanged && (
                <Alert>O artefato mudou desde a anotação. Compare o estado atual.</Alert>
              )}
              <Button
                variant="outline"
                disabled={locked || dirty}
                aria-label={`Consultar artefato ${item.title ?? item.id}`}
                onClick={() => void open(item.id)}
              >
                Consultar artefato
              </Button>
            </li>
          ))}
        </ul>
      )}
      {page?.nextAfterId && (
        <Button
          variant="outline"
          disabled={locked || dirty}
          onClick={() => void load(stage, page.nextAfterId)}
        >
          Mais registros
        </Button>
      )}
      {selected && (
        <div className={styles.decisionForm}>
          <h4 className={styles.contextText}>
            Checkpoint · {selected.artifact.title ?? selected.artifact.id}
          </h4>
          <p>
            Estado salvo: {labels[selected.artifact.state] ?? selected.artifact.state}. As fontes
            ainda precisam ser reconferidas na etapa correspondente.
          </p>
          {selected.artifact.completedAt !== null && (
            <p>
              Execução concluída em{' '}
              {new Date(selected.artifact.completedAt).toLocaleString('pt-BR')}.
            </p>
          )}
          {selected.artifact.versionId && (
            <p className={styles.contextText}>
              Versão preservada vinculada: {selected.artifact.versionId}
            </p>
          )}
          <dl>
            {Object.entries(selected.artifact.counters).map(([key, value]) => (
              <div key={key}>
                <dt>{counterLabels[key] ?? key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {selected.note.artifactChanged && (
            <Alert>
              Esta anotação foi escrita para uma versão anterior. Confira o registro antes de salvar
              o próximo passo.
            </Alert>
          )}
          <Textarea
            label="Bloqueios deste artefato — um por linha"
            value={blockers}
            maxLength={7212}
            disabled={locked}
            onChange={(event) => setBlockers(event.target.value)}
          />
          <Textarea
            label="Próximo passo"
            value={nextStep}
            maxLength={4000}
            disabled={locked}
            onChange={(event) => setNextStep(event.target.value)}
          />
          <p>Estas anotações orientam a retomada e não alteram os aceites das etapas.</p>
          <div className={styles.actions}>
            <Button disabled={busy || (!dirty && !pending)} onClick={() => void save()}>
              {pending ? 'Repetir o mesmo salvamento' : 'Salvar próximo passo e bloqueios'}
            </Button>
            {pending && (
              <Button variant="outline" disabled={busy} onClick={() => void inspect()}>
                Consultar salvamento
              </Button>
            )}
            <Button variant="outline" disabled={locked} onClick={() => void compare()}>
              Comparar com o registro atual
            </Button>
          </div>
          {comparison && (
            <div className={styles.comparison}>
              <h4>Registro atual · revisão {comparison.note.revision}</h4>
              <p>{comparison.note.blockers.join('\n') || 'Sem bloqueios anotados.'}</p>
              <p>{comparison.note.nextStep || 'Sem próximo passo anotado.'}</p>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  setSelected(comparison);
                  setBaseline(
                    signature(comparison.note.blockers.join('\n'), comparison.note.nextStep),
                  );
                  setComparison(null);
                }}
              >
                Usar esta versão como base e preservar meu rascunho
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
