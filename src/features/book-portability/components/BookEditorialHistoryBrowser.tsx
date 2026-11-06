import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState, ErrorState, LoadingState, Textarea } from '@/shared/ui';
import {
  listEditorialHistory,
  readEditorialHistory,
  type EditorialHistoryItem,
  type EditorialHistoryPage,
} from '../services/bookEditorialHistoryApi';
import styles from './BookEditorialRestorePanel.module.css';

const labels: Record<string, string> = {
  contract: 'Contrato',
  plan: 'Plano',
  document: 'Documento',
  decision: 'Decisão',
  evidence: 'Evidência',
  report: 'Relatório',
  checkpoint: 'Versão preservada',
  prose: 'Texto',
};
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Não foi possível consultar o arquivo original.';

export function BookEditorialHistoryBrowser({
  bookId,
  guard,
}: {
  bookId: string;
  guard: () => void;
}) {
  const currentGuard = useRef(guard);
  useEffect(() => {
    currentGuard.current = guard;
  }, [guard]);
  const generation = useRef(0),
    selection = useRef(0);
  const [page, setPage] = useState<EditorialHistoryPage | null>(null);
  const [loading, setLoading] = useState(true),
    [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; text: string } | null>(null);
  const scopedGuard = useCallback((epoch: number) => {
    currentGuard.current();
    if (generation.current !== epoch) throw new Error('A consulta pertence a outra sessão.');
  }, []);
  useEffect(() => {
    const epoch = ++generation.current;
    void listEditorialHistory(bookId, null, () => scopedGuard(epoch))
      .then(setPage)
      .catch((cause: unknown) => {
        if (generation.current === epoch) setError(message(cause));
      })
      .finally(() => {
        if (generation.current === epoch) setLoading(false);
      });
    return () => {
      generation.current = epoch + 1;
    };
  }, [bookId, scopedGuard]);
  async function load(after: string | null = null) {
    const epoch = generation.current;
    setLoading(true);
    setError(null);
    try {
      const next = await listEditorialHistory(bookId, after, () => scopedGuard(epoch));
      scopedGuard(epoch);
      setPage((previous) => ({
        ...next,
        items: after ? [...(previous?.items ?? []), ...next.items] : next.items,
      }));
    } catch (cause) {
      if (generation.current === epoch) setError(message(cause));
    } finally {
      if (generation.current === epoch) setLoading(false);
    }
  }
  async function read(row: EditorialHistoryItem) {
    const epoch = generation.current,
      ticket = ++selection.current;
    setReading(true);
    setSelected(null);
    setError(null);
    const check = () => {
      scopedGuard(epoch);
      if (selection.current !== ticket) throw new Error('Outra leitura foi selecionada.');
    };
    try {
      const text = await readEditorialHistory(bookId, row.id, check);
      check();
      setSelected({ id: row.id, text });
    } catch (cause) {
      if (generation.current === epoch && selection.current === ticket) setError(message(cause));
    } finally {
      if (generation.current === epoch && selection.current === ticket) setReading(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="Registros originais preservados">
      <h4>Arquivo original</h4>
      <p>
        Consulta privada dos registros preservados no backup. Ler um registro não aplica seu
        conteúdo à cópia atual.
      </p>
      {loading && <LoadingState label="Consultando arquivo original…" />}
      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
      {page?.items.length === 0 && !loading && (
        <EmptyState title="Nenhum registro original disponível" />
      )}
      <ul>
        {page?.items.map((row) => (
          <li key={row.id}>
            <Button variant="outline" disabled={reading} onClick={() => void read(row)}>
              {labels[row.artifact?.kind ?? ''] ??
                (row.recordKind === 'book-editorial-link'
                  ? 'Relação preservada'
                  : 'Resumo editorial')}
              {row.artifact?.revision !== null && row.artifact?.revision !== undefined
                ? ` · versão ${row.artifact.revision}`
                : ''}
            </Button>
          </li>
        ))}
      </ul>
      {page?.next && (
        <Button
          variant="outline"
          disabled={loading || reading}
          onClick={() => void load(page.next)}
        >
          Mais registros
        </Button>
      )}
      {reading && <LoadingState label="Conferindo o conteúdo original…" />}
      {selected && (
        <Textarea
          label="Conteúdo original preservado"
          value={selected.text}
          readOnly
          rows={16}
          hint="Registro no formato original do arquivo. Nenhuma alteração é aplicada ao livro."
        />
      )}
    </section>
  );
}
