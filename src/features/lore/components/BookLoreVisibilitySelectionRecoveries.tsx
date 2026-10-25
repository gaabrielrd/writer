import { useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { bookLoreVisibilitySelectionSession } from '../services/bookLoreVisibilitySelectionService';
import type { VisibilityRoot } from '../services/bookLoreVisibilitySelectionContracts';
import styles from './BookLoreManualEditor.module.css';

export interface BookLoreVisibilitySelectionRecoveriesProps {
  bookId: string;
  onSelect: (selectionId: string) => void;
}
export function BookLoreVisibilitySelectionRecoveries(
  props: BookLoreVisibilitySelectionRecoveriesProps,
) {
  const actor = useBookLoreActor();
  return actor !== null ? <Page key={JSON.stringify([actor, props.bookId])} {...props} /> : null;
}
function Page({ bookId, onSelect }: BookLoreVisibilitySelectionRecoveriesProps) {
  const [after, setAfter] = useState<string>(),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [rows, setRows] = useState<readonly VisibilityRoot[]>([]),
    [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void bookLoreVisibilitySelectionSession(() => live)
      .recoveries(after, 50)
      .then((page) => {
        if (live) {
          setRows(page.items.filter((r) => r.manifest.identity.bookId === bookId));
          setNext(page.next);
        }
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Não foi possível listar as seleções.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [bookId, after, reload]);
  const load = (cursor?: string) => {
    setLoading(true);
    setError('');
    setRows([]);
    setAfter(cursor);
    setReload((n) => n + 1);
  };
  return (
    <section aria-label="Recuperações de visibilidade do lore" className={styles.fields}>
      <h3>Visibilidade neste dispositivo</h3>
      {loading ? (
        <LoadingState label="Buscando seleções..." />
      ) : error ? (
        <ErrorState
          title="Não foi possível listar as seleções"
          description={error}
          action={<Button onClick={() => load(after)}>Tentar novamente</Button>}
        />
      ) : (
        <>
          {rows.length ? (
            <ul className={styles.list}>
              {rows.map((r, index) => (
                <li key={r.manifest.identity.selectionId} className={styles.row}>
                  <div className={styles.label}>
                    <strong>
                      Seleção de {r.manifest.count} {r.manifest.count === 1 ? 'ficha' : 'fichas'}
                      {' — '}
                      {r.manifest.value ? 'tornar públicas' : 'tornar privadas'}
                    </strong>
                    <p className={styles.status}>
                      {r.head.applied} alterações registradas; {r.head.unchanged} sem mudança;
                      conferir resultado
                    </p>
                    {r.head.cancelRequested && (
                      <p className={styles.status}>
                        Cancelamento registrado; conferir encerramento
                      </p>
                    )}
                  </div>
                  <Button
                    aria-label={'Retomar visibilidade ' + (index + 1)}
                    onClick={() => onSelect(r.manifest.identity.selectionId)}
                  >
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhuma seleção nesta página"
              description={
                next
                  ? 'Há mais operações da sua conta na próxima página.'
                  : 'Seleções deste livro que podem ser retomadas aparecerão aqui.'
              }
            />
          )}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => load()}>
              Atualizar lista
            </Button>
            {next && <Button onClick={() => load(next)}>Próxima página</Button>}
          </div>
        </>
      )}
    </section>
  );
}
