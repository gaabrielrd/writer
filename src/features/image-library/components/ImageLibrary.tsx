import { useEffect, useRef, useState } from 'react';
import { Images, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
} from '@/shared/ui';
import { Navigate, useLocation } from 'react-router';
import {
  deleteLibraryImage,
  listLibraryImages,
  renameLibraryImage,
} from '../services/imageLibraryService';
import type { LibraryImage } from '../model/image';
import styles from './ImageLibrary.module.css';

function ImageGrid({ onSelect }: { onSelect?: (image: LibraryImage) => void }) {
  const { user } = useAuth();
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [migrationPending, setMigrationPending] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LibraryImage | null>(null);
  const [deleting, setDeleting] = useState<LibraryImage | null>(null);
  const [preview, setPreview] = useState<LibraryImage | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const operation = useRef(false);
  const uid = user?.uid;
  const visibleImages = images.filter((image) => !onSelect || image.state !== 'deleting');
  async function load(next?: string) {
    const current = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const page = await listLibraryImages(next);
      if (current === version.current) {
        setImages((previous) =>
          next
            ? [
                ...previous,
                ...page.images.filter((image) => !previous.some((item) => item.id === image.id)),
              ]
            : page.images,
        );
        setCursor(page.cursor);
        setMigrationPending(Boolean(page.migrationPending));
      }
    } catch (cause) {
      if (current === version.current) setError((cause as Error).message);
    } finally {
      if (current === version.current) setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    const requestVersion = version;
    queueMicrotask(() => {
      if (active && uid) void load();
    });
    return () => {
      active = false;
      requestVersion.current++;
    };
  }, [uid]);
  async function save(remove: boolean) {
    const image = remove ? deleting : editing;
    if (!image || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    const current = version.current;
    try {
      if (remove) await deleteLibraryImage(image.id);
      else await renameLibraryImage(image.id, name.trim());
      if (current !== version.current) return;
      setImages((items) =>
        remove
          ? items.filter((item) => item.id !== image.id)
          : items.map((item) => (item.id === image.id ? { ...item, name: name.trim() } : item)),
      );
      setEditing(null);
      setDeleting(null);
    } catch (cause) {
      if (current === version.current) setError((cause as Error).message);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      {error && <ErrorState error={error} onRetry={() => void load(cursor ?? undefined)} />}
      {loading && <LoadingState />}
      {!loading && !error && visibleImages.length === 0 && (
        <EmptyState
          title="Sua biblioteca está vazia"
          description="As imagens que você aceitar da IA serão guardadas aqui, mesmo se cancelar a criação do livro."
          icon={<Images className="icon" aria-hidden="true" />}
        />
      )}
      <div className={styles.grid}>
        {visibleImages.map((image) => (
          <Card key={image.id} className={styles.item}>
            <img className={styles.cover} src={image.url} alt={image.name} loading="lazy" />
            <p className={styles.name}>{image.name}</p>
            <p className={styles.details}>
              {new Date(image.createdAt).toLocaleDateString('pt-BR')} · {image.useCount}{' '}
              {image.useCount === 1 ? 'uso' : 'usos'}
            </p>
            <div className={styles.actions}>
              {onSelect ? (
                <Button
                  type="button"
                  aria-label={`Selecionar ${image.name}`}
                  onClick={() => onSelect(image)}
                >
                  Selecionar
                </Button>
              ) : (
                <>
                  {image.state === 'deleting' && (
                    <p className={styles.details}>Exclusão pendente. Tente excluir novamente.</p>
                  )}
                  <Button
                    variant="secondary"
                    disabled={image.state === 'deleting'}
                    onClick={() => setPreview(image)}
                  >
                    Visualizar
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label={`Renomear ${image.name}`}
                    disabled={image.state === 'deleting'}
                    onClick={() => {
                      setEditing(image);
                      setName(image.name);
                    }}
                  >
                    <Pencil className="icon icon-sm" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label={`Excluir ${image.name}`}
                    disabled={image.useCount > 0}
                    title={
                      image.useCount > 0
                        ? 'Remova os vínculos da imagem antes de excluir'
                        : 'Excluir imagem'
                    }
                    onClick={() => setDeleting(image)}
                  >
                    <Trash2 className="icon icon-sm" aria-hidden="true" />
                  </Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
      {migrationPending && (
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Importar mais imagens antigas
        </Button>
      )}
      {cursor && (
        <Button variant="secondary" disabled={loading} onClick={() => void load(cursor)}>
          Carregar mais imagens
        </Button>
      )}
      {preview && (
        <Dialog open title={preview.name} onClose={() => setPreview(null)}>
          <img src={preview.url} alt={preview.name} className={styles.preview} />
        </Dialog>
      )}
      {editing && (
        <Dialog
          open
          title="Renomear imagem"
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          footer={
            <Button disabled={busy || !name.trim()} onClick={() => void save(false)}>
              Salvar nome
            </Button>
          }
        >
          <Input
            label="Nome da imagem"
            maxLength={300}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          {error && <Alert variant="destructive">{error}</Alert>}
        </Dialog>
      )}
      {deleting && (
        <Dialog
          open
          title="Excluir imagem?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>
                Cancelar
              </Button>
              <Button disabled={busy} onClick={() => void save(true)}>
                Confirmar exclusão
              </Button>
            </>
          }
        >
          <p>A imagem “{deleting.name}” será excluída permanentemente da biblioteca.</p>
          {error && <Alert variant="destructive">{error}</Alert>}
        </Dialog>
      )}
    </div>
  );
}

export function ImageLibraryPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (image: LibraryImage) => void;
}) {
  const { user } = useAuth();
  if (!open || !user) return null;
  return (
    <Dialog
      open
      title="Selecionar da biblioteca"
      description="Reutilizar uma imagem não consome créditos."
      onClose={onClose}
      maxWidthClass="max-w-3xl"
    >
      <ImageGrid
        key={user.uid}
        onSelect={(image) => {
          onSelect(image);
          onClose();
        }}
      />
    </Dialog>
  );
}
export function ImageLibraryPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return (
    <section>
      <PageHeader
        title="Biblioteca de Imagens"
        description="Suas imagens aceitas da IA. Reutilize nas capas, fichas e aventuras sem consumir novos créditos."
      />
      <ImageGrid key={user.uid} />
    </section>
  );
}
