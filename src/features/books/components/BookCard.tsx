import { Link } from 'react-router';
import { Book as BookIcon, FileText } from 'lucide-react';
import { Badge, Card } from '@/shared/ui';
import type { Book } from '../model/book';
import type { StudioBookSummary } from '../services/studioBookService';
import styles from './BookCard.module.css';

export interface BookCardProps {
  book: Book | StudioBookSummary;
}

export function BookCard({ book }: BookCardProps) {
  const isPublished = book.status === 'published';

  return (
    <Link to={`/books/${book.id}`} className={styles.cardLink}>
      <Card tone="raised">
        <div className={styles.cardWrapper}>
          <div className={styles.coverContainer}>
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={`Capa de ${book.title}`}
                className={styles.coverImage}
              />
            ) : (
              <div className={styles.coverFallback}>
                <BookIcon className="icon" aria-hidden="true" />
                <span>Sem capa</span>
              </div>
            )}
          </div>

          <div className={styles.content}>
            <div className={styles.header}>
              <h3 className={styles.title} title={book.title}>
                {book.title}
              </h3>
              {book.genre && <Badge variant="neutral">{book.genre}</Badge>}
            </div>

            {(!('kind' in book) || book.synopsis !== undefined) && (
              <p className={styles.synopsis}>
                {book.synopsis || 'Nenhuma sinopse cadastrada para este livro.'}
              </p>
            )}

            <div className={styles.meta}>
              <span className={styles.metaItem}>
                <FileText className="icon icon-sm" aria-hidden="true" />
                {book.wordCount.toLocaleString('pt-BR')} palavras
              </span>
              <span className={styles.metaItem}>
                {isPublished ? (
                  <Badge variant="success">Publicado</Badge>
                ) : (
                  <Badge variant="neutral">Rascunho</Badge>
                )}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
