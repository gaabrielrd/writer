import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import type { CreateBookInput } from '../model/book';
import { useBooks } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { BookFormDialog } from './BookFormDialog';
import styles from './BookList.module.css';

export interface BookListProps {
  authorId: string;
}

export function BookList({ authorId }: BookListProps) {
  const { books, loading, error, refreshBooks, createBook } = useBooks(authorId);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const handleOpenCreate = () => {
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (input: CreateBookInput) => {
    await createBook(input);
  };

  if (loading) {
    return <LoadingState label="Carregando seus livros..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Não foi possível carregar os livros"
        description={error}
        action={
          <Button variant="secondary" onClick={() => void refreshBooks()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  if (books.length === 0) {
    return (
      <div className={styles.container}>
        <EmptyState
          title="Nenhum livro cadastrado"
          description="Você ainda não começou a escrever nenhuma obra. Crie seu primeiro livro para estruturar capítulos e compêndio de lore."
          action={
            <Button variant="primary" onClick={handleOpenCreate}>
              <Plus className="icon icon-sm" aria-hidden="true" />
              Criar Primeiro Livro
            </Button>
          }
        />

        <BookFormDialog
          open={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleFormSubmit}
        />
      </div>
    );
  }

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h2>Minhas Obras</h2>
          <p>
            {books.length} {books.length === 1 ? 'livro em andamento' : 'livros em andamento'}
          </p>
        </div>
        <Button variant="primary" onClick={handleOpenCreate}>
          <Plus className="icon icon-sm" aria-hidden="true" />
          Novo Livro
        </Button>
      </div>

      <div className={styles.grid}>
        {books.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>

      <BookFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      />
    </section>
  );
}
