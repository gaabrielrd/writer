import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookImage } from 'lucide-react';
import { ImageLibraryPicker } from '@/features/image-library';
import { UniverseSelect } from '@/features/universes';
import { Alert, Button, Dialog, FormSection, Input, Textarea } from '@/shared/ui';
import type { Book, CreateBookInput } from '../model/book';
import styles from './BookFormDialog.module.css';
import { BookCreationWizard } from './BookCreationWizard';
import coverStyles from './BookCreationWizard.module.css';

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
  const [universeId, setUniverseId] = useState(bookToEdit?.universeId ?? null);
  const [synopsis, setSynopsis] = useState(bookToEdit?.synopsis ?? '');
  const [coverUrl, setCoverUrl] = useState(bookToEdit?.coverUrl ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coverImageId, setCoverImageId] = useState(bookToEdit?.coverImageId ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (saveError) errorRef.current?.focus();
  }, [saveError]);
  function close() {
    if (!submitLock.current) onClose();
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitLock.current) return;

    submitLock.current = true;
    setIsSubmitting(true);
    setSaveError(null);
    void (async () => {
      try {
        await onSubmit({
          title: title.trim(),
          genre: genre.trim(),
          ...(universeId !== (bookToEdit?.universeId ?? null) ? { universeId } : {}),
          synopsis: synopsis.trim(),
          coverUrl: coverUrl.trim() || null,
          coverImageId,
        });
        onClose();
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.',
        );
      } finally {
        submitLock.current = false;
        setIsSubmitting(false);
      }
    })();
  };

  const dialogTitle = bookToEdit ? 'Editar Obra' : 'Criar Novo Livro';

  return (
    <Dialog
      open={true}
      title={dialogTitle}
      description="Atualize os dados da obra. Sinopse e capa podem ser preenchidas quando precisar."
      onClose={close}
      footer={
        <div className={styles.footer}>
          <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="book-form"
            variant="primary"
            disabled={isSubmitting || !title.trim()}
          >
            {isSubmitting ? 'Salvando...' : bookToEdit ? 'Salvar Alterações' : 'Criar Livro'}
          </Button>
        </div>
      }
    >
      <form id="book-form" onSubmit={handleSubmit} className={styles.form}>
        {saveError && (
          <Alert ref={errorRef} tabIndex={-1} variant="destructive">
            {saveError}
          </Alert>
        )}
        <UniverseSelect
          value={universeId}
          onChange={setUniverseId}
          disabled={isSubmitting}
          alwaysShow
        />
        {universeId !== (bookToEdit?.universeId ?? null) && (
          <Alert variant="warning">
            Alterar o universo retira a publicação atual. Capítulos e lore local serão preservados;
            referências ao universo anterior ficarão indisponíveis.
          </Alert>
        )}
        <Input
          label="Título da Obra"
          placeholder="Ex: As Crônicas de Eldoria"
          value={title}
          maxLength={300}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={isSubmitting}
        />

        <Input
          label="Gênero Literário"
          placeholder="Ex: Fantasia Épica, Ficção Científica, Suspense"
          value={genre}
          maxLength={120}
          onChange={(e) => setGenre(e.target.value)}
          disabled={isSubmitting}
        />

        <FormSection
          title="Sinopse"
          description="Apresente sua história · opcional"
          disabled={isSubmitting}
        >
          <Textarea
            label="Sinopse / Premissa"
            placeholder="Descreva resumidamente o enredo, atmosfera e premissa principal do livro..."
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            rows={4}
            maxLength={4000}
            disabled={isSubmitting}
          />
        </FormSection>
        <FormSection
          title="Capa"
          description={coverUrl ? 'Capa selecionada · opcional' : 'Imagem da biblioteca · opcional'}
          disabled={isSubmitting}
        >
          <div className={coverStyles.cover}>
            {coverUrl ? (
              <img src={coverUrl} alt={`Capa selecionada de ${title}`} />
            ) : (
              <div className={coverStyles.placeholder}>
                <BookImage className="icon" aria-hidden="true" />
                <span>Sem capa</span>
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => setPickerOpen(true)}
          >
            Selecionar da biblioteca
          </Button>
          <ImageLibraryPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={(image) => {
              setCoverUrl(image.url);
              setCoverImageId(image.id);
            }}
          />
          <FormSection
            title="Usar URL de imagem"
            description="Alternativa à biblioteca"
            disabled={isSubmitting}
          >
            <Input
              label="URL da Capa (opcional)"
              placeholder="https://exemplo.com/imagem-capa.jpg"
              value={coverImageId ? '' : coverUrl}
              onChange={(e) => {
                setCoverUrl(e.target.value);
                setCoverImageId(null);
              }}
              disabled={isSubmitting}
            />
          </FormSection>
          {coverUrl && (
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => {
                setCoverUrl('');
                setCoverImageId(null);
              }}
            >
              Remover capa
            </Button>
          )}
        </FormSection>
        {isSubmitting && <p role="status">Salvando sua obra...</p>}
      </form>
    </Dialog>
  );
}

export function BookFormDialog({ open, bookToEdit, onClose, onSubmit }: BookFormDialogProps) {
  if (!open) return null;
  if (!bookToEdit) return <BookCreationWizard onClose={onClose} onSubmit={onSubmit} />;

  return (
    <BookFormContent
      key={bookToEdit ? bookToEdit.id : 'new-book'}
      bookToEdit={bookToEdit}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
