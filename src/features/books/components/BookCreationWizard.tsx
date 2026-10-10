import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookImage, Sparkles } from 'lucide-react';
import { ImageLibraryPicker } from '@/features/image-library';
import { useAuth } from '@/features/auth';
import { useBookGeneration } from '@/features/ai-assistant';
import { Alert, Button, Dialog, Input, Textarea } from '@/shared/ui';
import type { CreateBookInput } from '../model/book';
import styles from './BookCreationWizard.module.css';

interface Props {
  onClose: () => void;
  onSubmit: (input: CreateBookInput) => Promise<void>;
}
const steps = ['Livro', 'Sinopse', 'Capa'];

export function BookCreationWizard({ onClose, onSubmit }: Props) {
  const { user, updateUserCreditsState } = useAuth();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coverImageId, setCoverImageId] = useState<string>();
  const [coverGenerationId, setCoverGenerationId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [creationId] = useState(() => crypto.randomUUID());
  const submitLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const generation = useBookGeneration({ title, genre, synopsis }, user?.credits ?? 0, (asset) => {
    updateUserCreditsState(asset.credits);
    if (asset.kind === 'synopsis') setSynopsis(asset.text ?? '');
    else {
      setCoverUrl(asset.coverUrl ?? '');
      setCoverGenerationId(asset.id);
      setCoverImageId(asset.imageId ?? asset.id);
    }
  });
  const accepting = generation.operation === 'accept';
  const locked = saving || accepting;
  const kind = step === 1 ? 'synopsis' : 'cover';
  const cost = generation.quote?.[kind];
  const validFirstStep = Boolean(title.trim() && genre.trim());
  const canGenerate = Boolean(
    user && cost && user.credits >= cost && validFirstStep && (step === 1 || synopsis.trim()),
  );
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  function close() {
    if (!locked && !submitLock.current) {
      generation.invalidate();
      onClose();
    }
  }
  function navigate(next: number) {
    generation.invalidate();
    setStep(next);
    setSaveError(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || submitLock.current || generation.operation) return;
    if (step < 2) {
      if (validFirstStep) navigate(step + 1);
      return;
    }
    if (!validFirstStep) return;
    submitLock.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit({
        title: title.trim(),
        genre: genre.trim(),
        synopsis: synopsis.trim() || undefined,
        coverUrl: coverUrl.trim() || null,
        creationId,
        ...(coverImageId ? { coverImageId } : {}),
        ...(coverGenerationId ? { coverGenerationId } : {}),
      });
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Não foi possível criar o livro. Tente novamente.',
      );
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      title="Criar Novo Livro"
      description={`Etapa ${step + 1} de 3`}
      onClose={close}
      footer={
        <div className={styles.footer}>
          <Button type="button" variant="secondary" onClick={close} disabled={locked}>
            Cancelar
          </Button>
          {step > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(step - 1)}
              disabled={locked}
            >
              Voltar
            </Button>
          )}
          <Button
            type="submit"
            form="create-book-wizard"
            disabled={!validFirstStep || locked || Boolean(generation.operation)}
          >
            {saving ? 'Criando livro...' : step < 2 ? 'Continuar' : 'Criar Livro'}
          </Button>
        </div>
      }
    >
      <ol className={styles.steps} aria-label="Etapas da criação">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <form
        id="create-book-wizard"
        className={styles.form}
        onSubmit={(event) => void submit(event)}
      >
        <h3 ref={heading} tabIndex={-1} className={styles.stepTitle}>
          {steps[step]}
        </h3>
        {step === 0 && (
          <>
            <Input
              label="Título da Obra"
              value={title}
              maxLength={300}
              required
              disabled={locked}
              onChange={(event) => {
                generation.invalidate();
                setTitle(event.target.value);
              }}
            />
            <Input
              label="Gênero Literário"
              value={genre}
              maxLength={120}
              required
              disabled={locked}
              onChange={(event) => {
                generation.invalidate();
                setGenre(event.target.value);
              }}
            />
          </>
        )}
        {step === 1 && (
          <Textarea
            label="Sinopse / Premissa"
            value={synopsis}
            maxLength={4000}
            rows={6}
            disabled={locked}
            placeholder="Escreva a premissa ou gere uma sugestão com IA."
            onChange={(event) => {
              generation.invalidate();
              setSynopsis(event.target.value);
            }}
          />
        )}
        {step === 2 && (
          <>
            <div className={styles.cover}>
              {coverUrl ? (
                <img src={coverUrl} alt={`Capa selecionada de ${title}`} />
              ) : (
                <div className={styles.placeholder}>
                  <BookImage className="icon" aria-hidden="true" />
                  <span>Sem capa</span>
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={locked}
              onClick={() => {
                generation.invalidate();
                setPickerOpen(true);
              }}
            >
              Selecionar da biblioteca
            </Button>
            <ImageLibraryPicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              onSelect={(image) => {
                setCoverUrl(image.url);
                setCoverImageId(image.id);
                setCoverGenerationId(undefined);
              }}
            />
            <Input
              label="URL da Capa (opcional)"
              type="url"
              value={coverImageId || coverGenerationId ? '' : coverUrl}
              disabled={locked}
              placeholder="https://exemplo.com/capa.jpg"
              onChange={(event) => {
                generation.invalidate();
                setCoverGenerationId(undefined);
                setCoverImageId(undefined);
                setCoverUrl(event.target.value);
              }}
            />
            {coverUrl && (
              <Button
                type="button"
                variant="secondary"
                disabled={locked}
                onClick={() => {
                  setCoverUrl('');
                  setCoverGenerationId(undefined);
                  setCoverImageId(undefined);
                }}
              >
                Remover capa
              </Button>
            )}
          </>
        )}
        {step > 0 && (
          <div className={styles.generation}>
            <p>
              {cost
                ? `Ao usar ${kind === 'synopsis' ? 'a sinopse' : 'a capa'}: ${cost} ${cost === 1 ? 'crédito' : 'créditos'}.`
                : generation.error
                  ? 'IA indisponível.'
                  : 'Consultando disponibilidade da IA...'}{' '}
              {user && `Saldo: ${user.credits} créditos.`}
            </p>
            {step === 2 && !synopsis.trim() && <p>Preencha a sinopse para gerar uma capa.</p>}
            {cost && user && user.credits < cost && (
              <p>Saldo insuficiente para esta geração. Você pode continuar manualmente.</p>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!canGenerate || locked || Boolean(generation.operation)}
              onClick={() => void generation.generate(kind)}
            >
              <Sparkles className="icon icon-sm" aria-hidden="true" />
              {generation.operation === 'generate'
                ? 'Gerando...'
                : generation.suggestion
                  ? 'Gerar outra'
                  : step === 1
                    ? 'Gerar sinopse com IA'
                    : 'Gerar capa com IA'}
            </Button>
            {generation.operation && (
              <p role="status">
                {accepting
                  ? 'Confirmando uso e créditos...'
                  : 'A IA está preparando sua sugestão...'}
              </p>
            )}
            {generation.suggestion && (
              <div className={styles.suggestion} aria-label="Sugestão de IA">
                {generation.suggestion.text && <p>{generation.suggestion.text}</p>}
                {generation.suggestion.previewUrl && (
                  <div className={styles.cover}>
                    <img
                      src={generation.suggestion.previewUrl}
                      alt={`Sugestão de capa de ${title}`}
                    />
                  </div>
                )}
                <div className={styles.footer}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={locked}
                    onClick={generation.invalidate}
                  >
                    Descartar
                  </Button>
                  <Button type="button" disabled={locked} onClick={() => void generation.accept()}>
                    {step === 1 ? 'Usar sinopse' : 'Usar capa'} ({generation.suggestion.cost}{' '}
                    {generation.suggestion.cost === 1 ? 'crédito' : 'créditos'})
                  </Button>
                </div>
              </div>
            )}
            {generation.error && <Alert variant="destructive">{generation.error}</Alert>}
          </div>
        )}
        {saveError && <Alert variant="destructive">{saveError}</Alert>}
      </form>
    </Dialog>
  );
}
