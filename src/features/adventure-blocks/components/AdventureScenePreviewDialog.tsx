import { useState } from 'react';
import { useAuth } from '@/features/auth';
import { Button, Dialog, Dropdown, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { narrativeTypeLabels, type AdventureBlockAudience } from '../model/adventureBlock';
import { useAdventureScenePreview } from '../hooks/useAdventureScenePreview';
import styles from './AdventureBlocks.module.css';
export interface AdventureScenePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  adventureId: string;
  sceneId: string;
}
export function AdventureScenePreviewDialog(props: AdventureScenePreviewDialogProps) {
  const { user } = useAuth();
  return props.open && user ? (
    <PreviewSession key={JSON.stringify([user.uid, props.adventureId, props.sceneId])} {...props} />
  ) : null;
}
function PreviewSession({ open, onClose, adventureId, sceneId }: AdventureScenePreviewDialogProps) {
  const [audience, setAudience] = useState<AdventureBlockAudience>('creator');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Prévia da cena"
      description="Somente você pode conferir esta prévia. O modo escolhido não compartilha nem publica o material."
      maxWidthClass="max-w-3xl"
    >
      <Dropdown
        mode="select"
        label="Modo da prévia"
        value={audience}
        onValueChange={(value) =>
          setAudience(value === 'gm' || value === 'players' ? value : 'creator')
        }
        options={[
          { value: 'creator', label: 'Original completo' },
          { value: 'gm', label: 'Mestre' },
          { value: 'players', label: 'Jogadores' },
        ]}
      />
      <PreviewContent
        key={audience}
        adventureId={adventureId}
        sceneId={sceneId}
        audience={audience}
      />
    </Dialog>
  );
}
function PreviewContent({
  adventureId,
  sceneId,
  audience,
}: {
  adventureId: string;
  sceneId: string;
  audience: AdventureBlockAudience;
}) {
  const preview = useAdventureScenePreview(adventureId, sceneId, audience);
  if (preview.loading) return <LoadingState label="Preparando prévia…" />;
  if (preview.error)
    return (
      <ErrorState
        title="Prévia indisponível"
        description={preview.error}
        onRetry={preview.refresh}
      />
    );
  if (!preview.page?.items.length)
    return (
      <EmptyState
        title="Nenhum bloco neste modo"
        description="Esta cena não tem blocos ativos permitidos para o modo escolhido."
      />
    );
  return (
    <div className={styles.preview} aria-live="polite">
      {preview.page.items.map((item) => (
        <article className={styles.previewBlock} key={item.key}>
          <p className={styles.hint}>{narrativeTypeLabels[item.narrativeType]}</p>
          <h2>{item.title}</h2>
          <div className={styles.previewProse} dangerouslySetInnerHTML={{ __html: item.html }} />
          {item.image && (
            <figure>
              {preview.images[item.key] ? (
                <img src={preview.images[item.key]} alt={item.image.alt} />
              ) : (
                <LoadingState label="Preparando ilustração…" />
              )}
              {item.image.caption && <figcaption>{item.image.caption}</figcaption>}
            </figure>
          )}
        </article>
      ))}
      {preview.page.nextCursor && (
        <Button
          variant="outline"
          disabled={preview.loadingMore}
          onClick={() => void preview.loadMore()}
        >
          {preview.loadingMore ? 'Carregando…' : 'Carregar mais blocos da prévia'}
        </Button>
      )}
    </div>
  );
}
