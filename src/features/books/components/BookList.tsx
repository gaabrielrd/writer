import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState } from '@vitru/styleguide';
import type { Book, CreateBookInput } from '../model/book';
import { useBooks } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { BookFormDialog } from './BookFormDialog';
import { ChapterList } from './ChapterList';
import styles from './BookList.module.css';

export interface BookListProps {
  authorId: string;
}

export function BookList({ authorId }: BookListProps) {
  const { books, loading, error, refreshBooks, createBook, updateBook, deleteBook } =
    useBooks(authorId);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [managingBook, setManagingBook] = useState<Book | null>(null);

  const handleOpenCreate = () => {
    setEditingBook(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (book: Book) => {
    setEditingBook(book);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (input: CreateBookInput) => {
    if (editingBook) {
      await updateBook(editingBook.id, input);
    } else {
      await createBook(input);
    }
  };

  const handleToggleStatus = (book: Book) => {
    const nextStatus = book.status === 'published' ? 'draft' : 'published';
    void updateBook(book.id, { status: nextStatus });
  };

  const handleDelete = (bookId: string) => {
    void deleteBook(bookId);
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
          bookToEdit={editingBook}
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
          <BookCard
            key={book.id}
            book={book}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            onToggleStatus={handleToggleStatus}
            onManageChapters={(b) => setManagingBook(b)}
          />
        ))}
      </div>

      <BookFormDialog
        open={isFormOpen}
        bookToEdit={editingBook}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {managingBook && (
        <ChapterList
          book={managingBook}
          open={Boolean(managingBook)}
          onClose={() => {
            setManagingBook(null);
            void refreshBooks();
          }}
          onChapterCountChanged={() => void refreshBooks()}
        />
      )}
    </section>
  );
}
