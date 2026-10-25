import { useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { bookLoreRemovalSession } from '../services/bookLoreRemovalService';
import type { LoreRemovalJournal } from '../services/bookLoreRemovalJournalContracts';
import type { LoreMentionEntity } from '../model/loreEntity';
import styles from './BookLoreManualEditor.module.css';

export interface BookLoreRemovalRecoveriesProps {
  bookId: string;
  entities?: readonly LoreMentionEntity[];
  onSelect: (writeId: string, loreId: string) => void;
}
export function BookLoreRemovalRecoveries(props: BookLoreRemovalRecoveriesProps) {
  const actor = useBookLoreActor();
  return actor !== null ? <Page key={JSON.stringify([actor, props.bookId])} {...props} /> : null;
}
function Page({ bookId, entities = [], onSelect }: BookLoreRemovalRecoveriesProps) {
  const [after, setAfter] = useState<string>(),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [rows, setRows] = useState<readonly LoreRemovalJournal[]>([]),
    [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const page = await bookLoreRemovalSession(() => live).recoveries(after, 50);
      if (live) {
        setRows(
          page.items.filter(
            (t) =>
              t.identity.bookId === bookId &&
              !(t.cancelRequested && t.inspectionClosed && t.cancellationChecked && !t.removal),
          ),
        );
        setNext(page.next);
      }
    })()
      .catch((e: unknown) => {
        if (live)
          setError(e instanceof Error ? e.message : 'Não foi possível listar as retiradas.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [bookId, after, retry]);
  const load = (cursor?: string) => {
    setLoading(true);
    setError('');
    setRows([]);
    setAfter(cursor);
    setRetry((n) => n + 1);
  };
  return (
    <section aria-label="Recuperações de retirada de lore" className={styles.fields}>
      <h3>Retiradas neste dispositivo</h3>
      {loading ? (
        <LoadingState label="Buscando retiradas..." />
      ) : error ? (
        <ErrorState
          title="Não foi possível listar as retiradas"
          description={error}
          action={<Button onClick={() => load(after)}>Tentar novamente</Button>}
        />
      ) : (
        <>
          {rows.length ? (
            <ul className={styles.list}>
              {rows.map((t, n) => (
                <li className={styles.row} key={t.identity.writeId}>
                  <div className={styles.label}>
                    <strong>
                      {entities.find((e) => e.id === t.identity.loreId)?.name ?? 'Ficha do livro'}
                    </strong>
                    <p className={styles.status}>Ficha: {t.identity.loreId}</p>
                    <p className={styles.status}>
                      {t.removal?.complete
                        ? 'Conclusão registrada; conferir resultado'
                        : t.removal?.phase === 'handed-off'
                          ? 'Limpeza assumida pela exclusão do livro'
                          : t.removal
                            ? 'Retirada registrada; limpeza pendente'
                            : t.cancelRequested
                              ? 'Cancelamento pendente'
                              : t.intent
                                ? 'Resultado pendente de verificação'
                                : 'Preparação disponível'}
                    </p>
                  </div>
                  <Button
                    aria-label={'Retomar retirada ' + (n + 1)}
                    onClick={() => onSelect(t.identity.writeId, t.identity.loreId)}
                  >
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhuma retirada nesta página"
              description={
                next
                  ? 'Há mais operações da sua conta na próxima página.'
                  : 'As retiradas deste livro que podem ser retomadas aparecerão aqui.'
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
