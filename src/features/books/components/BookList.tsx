import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Upload } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import type { CreateBookInput } from '../model/book';
import { useBooks } from '../hooks/useBooks';
import { BookCard } from './BookCard';
import { BookFormDialog } from './BookFormDialog';
import { ImportBookModal } from './ImportBookModal';
import styles from './BookList.module.css';

export interface BookListProps {
  authorId: string;
}

export function BookList({ authorId }: BookListProps) {
  const navigate = useNavigate();
  const { books, loading, error, refreshBooks, createBook } = useBooks(authorId);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const handleOpenCreate = () => {
    setIsFormOpen(true);
  };

  const handleOpenImport = () => {
    setIsImportOpen(true);
  };

  const handleFormSubmit = async (input: CreateBookInput) => {
    await createBook(input);
  };

  const handleImportSuccess = (newBookId: string) => {
    void refreshBooks();
    void navigate(`/books/${newBookId}`);
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
          description="Você ainda não começou a escrever nenhuma obra. Crie seu primeiro livro para estruturar capítulos e compêndio de lore, ou importe um manuscrito pronto."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" onClick={handleOpenCreate}>
                <Plus className="icon icon-sm" aria-hidden="true" />
                Criar Primeiro Livro
              </Button>
              <Button variant="secondary" onClick={handleOpenImport}>
                <Upload className="icon icon-sm" aria-hidden="true" />
                Importar Documento (.docx, .pdf)
              </Button>
            </div>
          }
        />

        <BookFormDialog
          open={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleFormSubmit}
        />

        <ImportBookModal
          open={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          authorId={authorId}
          onSuccess={handleImportSuccess}
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
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={handleOpenImport}
            title="Importar livro de arquivo .docx ou .pdf"
          >
            <Upload className="icon icon-sm" aria-hidden="true" />
            Importar Documento
          </Button>
          <Button variant="primary" onClick={handleOpenCreate}>
            <Plus className="icon icon-sm" aria-hidden="true" />
            Novo Livro
          </Button>
        </div>
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

      <ImportBookModal
        open={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        authorId={authorId}
        onSuccess={handleImportSuccess}
      />
    </section>
  );
}
