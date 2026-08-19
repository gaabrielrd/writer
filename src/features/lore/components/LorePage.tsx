import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { Button, ErrorState, LoadingState, PageHeader } from '@/shared/ui';
import { getBook, type Book } from '@/features/books';
import { LoreTab } from './LoreTab';
import styles from './LorePage.module.css';

export function LorePage() {
  const { bookId } = useParams<{ bookId: string }>();

  const [book, setBook] = useState<Book | null>(null);
  const [bookLoading, setBookLoading] = useState<boolean>(() => Boolean(bookId));
  const [bookError, setBookError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!bookId) return;

    getBook(bookId)
      .then((data) => {
        if (active) {
          setBook(data);
          setBookLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setBookError(err instanceof Error ? err.message : 'Falha ao buscar livro');
          setBookLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [bookId]);

  if (bookLoading) {
    return <LoadingState label="Carregando compêndio de lore..." />;
  }

  if (bookError || !book) {
    return (
      <div className={styles.container}>
        <ErrorState
          title="Livro não encontrado"
          description={bookError || 'A obra solicitada não existe ou foi removida.'}
          action={
            <Link to="/">
              <Button variant="primary">Voltar para Minhas Obras</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title={`Compêndio de Lore — ${book.title}`}
        description="Mantenha a consistência do universo da história: organize personagens, locais, conceitos e regras do mundo."
      />

      <LoreTab book={book} />
    </div>
  );
}
