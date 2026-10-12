import { useState } from 'react';
import { BookImage } from 'lucide-react';
import { Badge, Card } from '@/shared/ui';
import bookStyles from './BookCard.module.css';
import styles from './BookCreationWizard.module.css';

interface Props {
  title: string;
  genre: string;
  synopsis: string;
  coverUrl: string;
}

function PreviewCover({ title, imageUrl }: { title: string; imageUrl: string }) {
  const [failedCover, setFailedCover] = useState(false);
  return imageUrl && !failedCover ? (
    <img
      className={bookStyles.coverImage}
      src={imageUrl}
      alt={`Prévia da capa de ${title.trim() || 'seu livro'}`}
      onError={() => setFailedCover(true)}
    />
  ) : (
    <div className={bookStyles.coverFallback}>
      <BookImage className="icon" aria-hidden="true" />
      <span>Sem capa</span>
    </div>
  );
}

export function BookDraftPreview({ title, genre, synopsis, coverUrl }: Props) {
  let imageUrl = /^data:image\//i.test(coverUrl.trim()) ? coverUrl.trim() : '';
  try {
    const url = new URL(coverUrl.trim());
    if (['https:', 'http:'].includes(url.protocol)) imageUrl = url.href;
  } catch {
    // Incomplete URLs remain editable while the preview keeps its placeholder.
  }

  return (
    <aside className={styles.preview} aria-label="Prévia do livro">
      <div className={styles.previewHeading}>
        <h3>Prévia do livro</h3>
        <p>Acompanhe sua obra enquanto preenche.</p>
      </div>
      <Card className={styles.previewCard}>
        <div className={bookStyles.cardWrapper}>
          <div className={bookStyles.coverContainer}>
            <PreviewCover key={imageUrl} title={title} imageUrl={imageUrl} />
          </div>
          <div className={bookStyles.content}>
            <div className={bookStyles.header}>
              <h4 className={bookStyles.title} title={title.trim() || undefined}>
                {title.trim() || 'Título da sua obra'}
              </h4>
              <Badge variant="outline" className={styles.previewGenre}>
                {genre.trim() || 'Gênero literário'}
              </Badge>
            </div>
            <p className={bookStyles.synopsis}>
              {synopsis.trim() || 'A sinopse da sua história aparecerá aqui.'}
            </p>
          </div>
        </div>
      </Card>
    </aside>
  );
}
