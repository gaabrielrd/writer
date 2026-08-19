import { useState, type FormEvent } from 'react';
import { Button, Dialog, Input, Textarea } from '@/shared/ui';
import type { Book, CreateBookInput } from '../model/book';
import styles from './BookFormDialog.module.css';

export interface BookFormDialogProps {
  open: boolean;
  bookToEdit?: Book | null;
  onClose: () => void;
  onSubmit: (input: CreateBookInput) => Promise<void>;
}

interface FormContentProps {
  bookToEdit?: Book | null;
  onClose: () => void;
  onSubmit: (input: CreateBookInput) => Promise<void>;
}

function BookFormContent({ bookToEdit, onClose, onSubmit }: FormContentProps) {
  const [title, setTitle] = useState(bookToEdit?.title ?? '');
  const [genre, setGenre] = useState(bookToEdit?.genre ?? '');
  const [synopsis, setSynopsis] = useState(bookToEdit?.synopsis ?? '');
  const [coverUrl, setCoverUrl] = useState(bookToEdit?.coverUrl ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    void (async () => {
      try {
        await onSubmit({
          title: title.trim(),
          genre: genre.trim() || undefined,
          synopsis: synopsis.trim() || undefined,
          coverUrl: coverUrl.trim() || null,
        });
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const dialogTitle = bookToEdit ? 'Editar Obra' : 'Criar Novo Livro';

  return (
    <Dialog
      open={true}
      title={dialogTitle}
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="book-form"
            variant="primary"
            disabled={isSubmitting || !title.trim()}
          >
            {bookToEdit ? 'Salvar Alterações' : 'Criar Livro'}
          </Button>
        </div>
      }
    >
      <form id="book-form" onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Título da Obra"
          placeholder="Ex: As Crônicas de Eldoria"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={isSubmitting}
        />

        <Input
          label="Gênero Literário"
          placeholder="Ex: Fantasia Épica, Ficção Científica, Suspense"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          disabled={isSubmitting}
        />

        <Textarea
          label="Sinopse / Premissa"
          placeholder="Descreva resumidamente o enredo, atmosfera e premissa principal do livro..."
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          rows={4}
          disabled={isSubmitting}
        />

        <Input
          label="URL da Capa (opcional)"
          placeholder="https://exemplo.com/imagem-capa.jpg"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          disabled={isSubmitting}
        />
      </form>
    </Dialog>
  );
}

export function BookFormDialog({ open, bookToEdit, onClose, onSubmit }: BookFormDialogProps) {
  if (!open) return null;

  return (
    <BookFormContent
      key={bookToEdit ? bookToEdit.id : 'new-book'}
      bookToEdit={bookToEdit}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
