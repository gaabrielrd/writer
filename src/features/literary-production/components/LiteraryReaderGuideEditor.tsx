import { useEffect, useRef, useState } from 'react';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { ReaderGuideFields } from './ReaderGuideFields';
import {
  listLiteraryPublicationGuide,
  getLiteraryPublicationGuideEntry,
  getLiteraryPublicationGuideVersion,
  saveLiteraryPublicationGuideEntry,
  resolvePublicationRecovery,
  emptyReaderGuide,
  type ReaderGuideDraft,
  type GuideEntry,
  type PublicationChapter,
  type LiteraryPublication,
  type SaveGuideEntry,
} from '../services/literaryPublicationService';
import styles from './EditorialContractPanel.module.css';
type Props = {
  bookId: string;
  actorId: string;
  job: LiteraryPublication;
  chapters: PublicationChapter[];
  disabled?: boolean;
  onPreview: (id: string) => void;
  onSaved: () => void;
  onWorkChange?: (value: { dirty: boolean; pending: boolean }) => void;
};
const definite = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  [
    'functions/invalid-argument',
    'functions/failed-precondition',
    'functions/not-found',
    'functions/permission-denied',
    'functions/unauthenticated',
    'functions/resource-exhausted',
  ].includes(String(cause.code));
export function LiteraryReaderGuideEditor({
  bookId,
  actorId,
  job,
  chapters,
  disabled = false,
  onPreview,
  onSaved,
  onWorkChange,
}: Props) {
  const [page, setPage] = useState<Awaited<ReturnType<typeof listLiteraryPublicationGuide>> | null>(
      null,
    ),
    [selected, setSelected] = useState<GuideEntry | null>(null),
    [value, setValue] = useState<ReaderGuideDraft>(emptyReaderGuide),
    [baseline, setBaseline] = useState(JSON.stringify(emptyReaderGuide())),
    [comparison, setComparison] = useState<GuideEntry | null>(null),
    [pending, setPending] = useState<SaveGuideEntry | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false),
    dirty = JSON.stringify(value) !== baseline,
    readOnly = job.state !== 'prepared',
    locked = disabled || busy || pending !== null;
  useEffect(() => {
    onWorkChange?.({ dirty, pending: pending !== null });
  }, [dirty, pending, onWorkChange]);
  useEffect(() => {
    const current = ++epoch.current;
    void listLiteraryPublicationGuide(bookId, job.jobId)
      .then((result) => {
        if (epoch.current === current) setPage(result);
      })
      .catch((cause: unknown) => {
        if (epoch.current === current)
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o guia.');
      });
    return () => {
      epoch.current += 1;
    };
  }, [bookId, job.jobId, actorId]);
  const run = async (task: (current: number) => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const current = epoch.current;
    try {
      await task(current);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o guia.');
    } finally {
      if (epoch.current === current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const adopt = (entry: GuideEntry) => {
    setSelected(entry.deleted ? null : entry);
    const draft = entry.guide ?? emptyReaderGuide();
    setValue(draft);
    setBaseline(JSON.stringify(draft));
    setComparison(null);
  };
  const load = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryPublicationGuide(bookId, job.jobId, afterId);
      if (epoch.current === current)
        setPage((prior) => ({
          ...result,
          items: afterId ? [...(prior?.items ?? []), ...result.items] : result.items,
        }));
    });
  const open = (id: string) =>
    run(async (current) => {
      const result = await getLiteraryPublicationGuideEntry(bookId, job.jobId, id);
      if (epoch.current === current) adopt(result);
    });
  const save = (remove = false) =>
    run(async (current) => {
      if (!selected || !job.manifestHash) return;
      const input = pending ?? {
        target: { kind: 'book' as const, id: bookId },
        jobId: job.jobId,
        id: selected.id,
        operationId: crypto.randomUUID(),
        expectedRevision: selected.revision,
        expectedManifestHash: job.manifestHash,
        guide: remove
          ? null
          : { ...value, aliases: value.aliases.map((alias) => alias.trim()).filter(Boolean) },
      };
      setPending(input);
      let result;
      try {
        result = await saveLiteraryPublicationGuideEntry(input, actorId);
      } catch (cause) {
        if (epoch.current === current && definite(cause)) setPending(null);
        throw cause;
      }
      if (epoch.current !== current) return;
      setPending(null);
      adopt(result);
      setNotice(
        result.deleted
          ? 'Entrada removida do guia desta edição.'
          : 'Entrada pública salva; confira suas evidências antes de publicar.',
      );
      const resultPage = await listLiteraryPublicationGuide(bookId, job.jobId);
      if (epoch.current === current) {
        setPage(resultPage);
        onSaved();
      }
    });
  const inspect = () =>
    run(async (current) => {
      if (!pending) return;
      const receipt = await resolvePublicationRecovery(
        actorId,
        bookId,
        pending.operationId,
        'publicationGuide',
        pending.id,
        pending.expectedRevision,
      );
      if (epoch.current !== current) return;
      if (!receipt) {
        setNotice(
          'Entrada ainda sem confirmação. Consulte novamente ou repita o mesmo salvamento.',
        );
        return;
      }
      const result = await getLiteraryPublicationGuideVersion(
        bookId,
        job.jobId,
        pending.id,
        receipt.revision,
      );
      if (epoch.current === current) {
        setPending(null);
        adopt(result);
        onSaved();
        setNotice('A versão exata deste pedido foi recuperada.');
      }
    });
  const compare = () =>
    run(async (current) => {
      if (!selected) return;
      const result = await getLiteraryPublicationGuideEntry(bookId, job.jobId, selected.id);
      if (epoch.current === current) setComparison(result);
    });
  return (
    <section className={styles.panel} aria-label="Edição do guia do leitor">
      <h4>Guia do leitor</h4>
      <p>
        Escreva os campos públicos e cite o texto desta edição. Cada fato pode ser liberado em um
        capítulo diferente deste livro.
      </p>
      {readOnly && (
        <Alert>
          O guia está fechado para edição. Reabra-o para alterar e conferir uma nova versão.
        </Alert>
      )}
      {busy && <LoadingState label="Salvando ou consultando o guia..." />}
      {error && (
        <ErrorState message={error} onRetry={!dirty && !pending ? () => void load() : undefined} />
      )}
      {notice && <Alert>{notice}</Alert>}
      {!page && !error && !busy && <LoadingState label="Carregando entradas do guia..." />}
      {page?.items.length === 0 && (
        <EmptyState
          title="Guia sem entradas públicas"
          description="Esta edição pode ser publicada com o guia vazio após sua confirmação explícita."
        />
      )}
      <div className={styles.actions}>
        <Button
          disabled={locked || readOnly || dirty}
          onClick={() =>
            adopt({
              id: crypto.randomUUID(),
              revision: 0,
              deleted: false,
              guide: emptyReaderGuide(),
              updatedAt: null,
            })
          }
        >
          Nova entrada pública
        </Button>
        <Button variant="outline" disabled={locked || dirty} onClick={() => void load()}>
          Atualizar guia
        </Button>
      </div>
      {page?.items.map((item) => (
        <div key={item.id} className={styles.decisionForm}>
          <strong className={styles.contextText}>
            {item.guide?.name}
            {item.guide?.disambiguation ? ' · ' + item.guide.disambiguation : ''}
          </strong>
          <p>{item.guide?.summary}</p>
          <span>Revisão {item.revision}</span>
          <Button variant="outline" disabled={locked || dirty} onClick={() => void open(item.id)}>
            Abrir entrada {item.guide?.name}
          </Button>
        </div>
      ))}
      {page?.nextAfterId && (
        <Button
          variant="outline"
          disabled={locked || dirty}
          onClick={() => void load(page.nextAfterId)}
        >
          Mais entradas do guia
        </Button>
      )}
      {selected && (
        <>
          <p>Revisão da entrada: {selected.revision}</p>
          <ReaderGuideFields
            value={value}
            disabled={locked || readOnly}
            chapters={chapters}
            targets={page?.items ?? []}
            onPreview={onPreview}
            onChange={(next) => {
              if (!locked && !readOnly) setValue(next);
            }}
          />
          <div className={styles.actions}>
            <Button
              disabled={disabled || busy || readOnly || (!dirty && !pending)}
              onClick={() => void save()}
            >
              {pending ? 'Repetir o mesmo salvamento do guia' : 'Salvar entrada pública'}
            </Button>
            {pending && (
              <Button variant="outline" disabled={disabled || busy} onClick={() => void inspect()}>
                Consultar salvamento da entrada
              </Button>
            )}
            <Button variant="outline" disabled={locked} onClick={() => void compare()}>
              Comparar entrada atual
            </Button>
            {selected.revision > 0 && (
              <Button
                variant="destructive"
                disabled={locked || readOnly || dirty}
                onClick={() => void save(true)}
              >
                Remover entrada desta edição
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={locked}
              onClick={() =>
                adopt({
                  id: selected.id,
                  revision: selected.revision,
                  deleted: false,
                  guide: selected.guide,
                  updatedAt: selected.updatedAt,
                })
              }
            >
              Descartar alterações da entrada
            </Button>
          </div>
        </>
      )}
      {comparison && (
        <div className={styles.comparison}>
          <h4>Versão atual · revisão {comparison.revision}</h4>
          {comparison.guide ? (
            <ReaderGuideFields
              value={comparison.guide}
              disabled
              chapters={chapters}
              targets={page?.items ?? []}
              onPreview={onPreview}
              onChange={() => {}}
              legend="Entrada salva no servidor"
            />
          ) : (
            <p>Esta identidade não tem uma entrada ativa.</p>
          )}
          <Button
            variant="outline"
            disabled={locked || readOnly}
            onClick={() => {
              setSelected(comparison);
              setBaseline(JSON.stringify(comparison.guide ?? emptyReaderGuide()));
              setComparison(null);
            }}
          >
            Usar esta revisão como base e preservar meu rascunho
          </Button>
        </div>
      )}
    </section>
  );
}
