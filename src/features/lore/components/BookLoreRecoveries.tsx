import { useEffect, useState } from 'react';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { bookLoreEditSession } from '../services/bookLoreEditService';
import type { LorePreparationHead } from '../services/bookLorePreparationContracts';
import type { LoreMentionEntity } from '../model/loreEntity';
import styles from './BookLoreManualEditor.module.css';
export function BookLoreRecoveries({
  bookId,
  entities = [],
  onSelect,
}: {
  bookId: string;
  entities?: readonly LoreMentionEntity[];
  onSelect: (writeId: string, loreId: string) => void;
}) {
  const actorKey = useBookLoreActor();
  return actorKey !== null ? (
    <RecoveryPage
      key={JSON.stringify([bookId, actorKey])}
      bookId={bookId}
      entities={entities}
      onSelect={onSelect}
    />
  ) : null;
}
function RecoveryPage({
  bookId,
  entities,
  onSelect,
}: {
  bookId: string;
  entities: readonly LoreMentionEntity[];
  onSelect: (writeId: string, loreId: string) => void;
}) {
  const [after, setAfter] = useState<string>(),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [rows, setRows] = useState<readonly LorePreparationHead[]>([]),
    [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const session = bookLoreEditSession(() => live);
    void session
      .preparations(after, 50)
      .then((page) => {
        if (live) {
          setRows(
            page.items.filter((p) => p.intent.bookId === bookId && p.discard?.phase !== 'complete'),
          );
          setNext(page.next);
        }
      })
      .catch((e) => {
        if (live)
          setError(e instanceof Error ? e.message : 'Não foi possível listar as recuperações.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [bookId, after, retry]);
  function loadPage(cursor?: string) {
    setLoading(true);
    setError('');
    setRows([]);
    setAfter(cursor);
    setRetry((n) => n + 1);
  }
  return (
    <section aria-label="Recuperações de lore" className={styles.fields}>
      <h3>Recuperações neste dispositivo</h3>
      {loading ? (
        <LoadingState label="Buscando recuperações..." />
      ) : error ? (
        <ErrorState
          title="Não foi possível listar as recuperações"
          description={error}
          action={<Button onClick={() => loadPage(after)}>Tentar novamente</Button>}
        />
      ) : (
        <>
          {rows.length ? (
            <ul className={styles.list}>
              {rows.map((p, n) => (
                <li className={styles.row} key={p.intent.writeId}>
                  <div>
                    <strong>
                      {entities.find((e) => e.id === p.intent.loreId)?.name ?? 'Ficha indisponível'}
                    </strong>
                    <p className={styles.status}>
                      {p.discard
                        ? 'Descarte pendente'
                        : p.jobsClosed === 'applied'
                          ? 'Alterações aplicadas'
                          : p.cancelRequested
                            ? 'Edição cancelada'
                            : p.reserveState === 'pending'
                              ? 'Preparação interrompida'
                              : 'Preparação disponível'}
                    </p>
                  </div>
                  <Button
                    aria-label={`Abrir recuperação ${n + 1}`}
                    onClick={() => onSelect(p.intent.writeId, p.intent.loreId)}
                  >
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhuma recuperação nesta página"
              description={
                next
                  ? 'Há mais preparações da sua conta na próxima página.'
                  : 'As cópias protegidas deste livro aparecerão aqui.'
              }
            />
          )}
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => {
                loadPage();
              }}
            >
              Atualizar lista
            </Button>
            {next && <Button onClick={() => loadPage(next)}>Próxima página</Button>}
          </div>
        </>
      )}
    </section>
  );
}
