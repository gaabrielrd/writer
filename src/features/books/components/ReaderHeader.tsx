import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/shared/ui';
import { ThemeToggle } from '@/shared/theme';
import {
  copyPublicReadingLink,
  publicReadingUrl,
  type PublicBook,
  type PublicChapter,
} from '../services/publicBookService';
import styles from './ReaderView.module.css';

export function ReaderHeader({ book, chapter }: { book: PublicBook; chapter?: PublicChapter }) {
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'error'>('idle');
  async function share() {
    try {
      await copyPublicReadingLink(book.id, chapter?.id);
      setShareState('copied');
    } catch {
      setShareState('error');
    }
  }
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>Biblioteca aberta</span>
        <h1>{book.title}</h1>
        {book.authorName && <p>Por {book.authorName}</p>}
        {chapter && <p className={styles.currentChapter}>Lendo: {chapter.title}</p>}
      </div>
      <div className={styles.headerActions}>
        <ThemeToggle showLabel />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void share();
          }}
        >
          <Link2 className="icon icon-sm" aria-hidden="true" /> Compartilhar link
        </Button>
        <span role="status" className={styles.shareStatus}>
          {shareState === 'copied' && 'Link do capítulo copiado.'}
          {shareState === 'error' && (
            <>
              Não foi possível copiar.{' '}
              <a href={publicReadingUrl(book.id, chapter?.id)}>Abra o link para compartilhar.</a>
            </>
          )}
        </span>
      </div>
    </header>
  );
}
