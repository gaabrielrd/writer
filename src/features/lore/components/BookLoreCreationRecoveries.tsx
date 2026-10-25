import { useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { bookLoreEditSession } from '../services/bookLoreEditService';
import type { CreationTicket } from '../services/bookLoreCreationTicketContracts';
import type { LoreMentionEntity } from '../model/loreEntity';
import styles from './BookLoreManualEditor.module.css';

export interface BookLoreCreationRecoveriesProps {
  bookId: string;
  entities?: readonly LoreMentionEntity[];
  onSelect: (writeId: string) => void;
}
export function BookLoreCreationRecoveries(props: BookLoreCreationRecoveriesProps) {
  const actor = useBookLoreActor();
  return actor !== null ? (
    <RecoveryPage key={JSON.stringify([props.bookId, actor])} {...props} />
  ) : null;
}
function RecoveryPage({ bookId, entities = [], onSelect }: BookLoreCreationRecoveriesProps) {
  const [after, setAfter] = useState<string>(),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [rows, setRows] = useState<readonly CreationTicket[]>([]),
    [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const session = bookLoreEditSession(() => live);
    void session
      .creationPreparations(after, 50)
      .then((page) => {
        if (live) {
          setRows(page.items.filter((t) => t.bookId === bookId && t.discard?.phase !== 'complete'));
          setNext(page.next);
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : 'Não foi possível listar as criações.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [bookId, after, retry]);
  function load(cursor?: string) {
    setLoading(true);
    setError('');
    setRows([]);
    setAfter(cursor);
    setRetry((n) => n + 1);
  }
  return (
    <section aria-label="Recuperações de criação de lore" className={styles.fields}>
      <h3>Criações neste dispositivo</h3>
      {loading ? (
        <LoadingState label="Buscando criações..." />
      ) : error ? (
        <ErrorState
          title="Não foi possível listar as criações"
          description={error}
          action={<Button onClick={() => load(after)}>Tentar novamente</Button>}
        />
      ) : (
        <>
          {rows.length ? (
            <ul className={styles.list}>
              {rows.map((t, n) => (
                <li className={styles.row} key={t.writeId}>
                  <div>
                    <strong>{entities.find((e) => e.id === t.loreId)?.name || 'Nova ficha'}</strong>
                    <p className={styles.status}>
                      {t.discard
                        ? 'Descarte pendente'
                        : t.ownApply?.phase === 'confirmed'
                          ? 'Criação registrada'
                          : t.ownApply?.phase === 'conflict' || t.parent?.phase === 'adopted'
                            ? 'Verificação pendente'
                            : t.jobsClosed
                              ? 'Preparação cancelada'
                              : t.cancelRequested
                                ? 'Encerramento pendente'
                                : !t.draft?.complete
                                  ? 'Primeira cópia pendente'
                                  : 'Preparação disponível'}
                    </p>
                  </div>
                  <Button
                    aria-label={`Retomar criação ${n + 1}`}
                    onClick={() => onSelect(t.writeId)}
                  >
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Nenhuma criação nesta página"
              description={
                next
                  ? 'Há mais preparações da sua conta na próxima página.'
                  : 'As cópias protegidas de novas fichas deste livro aparecerão aqui.'
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
