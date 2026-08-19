import { Book as BookIcon, Edit2, FileText, Globe, Lock, Trash2 } from 'lucide-react';
import { Badge, Button, Card } from '@vitru/styleguide';
import type { Book } from '../model/book';
import styles from './BookCard.module.css';

export interface BookCardProps {
  book: Book;
  onEdit: (book: Book) => void;
  onDelete: (bookId: string) => void;
  onToggleStatus: (book: Book) => void;
  onManageChapters: (book: Book) => void;
}

export function BookCard({
  book,
  onEdit,
  onDelete,
  onToggleStatus,
  onManageChapters,
}: BookCardProps) {
  const isPublished = book.status === 'published';

  return (
    <Card tone="raised">
      <div className={styles.cardWrapper}>
        <div className={styles.coverContainer}>
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={`Capa de ${book.title}`} className={styles.coverImage} />
          ) : (
            <div className={styles.coverFallback}>
              <BookIcon className="icon" aria-hidden="true" />
              <span>Sem capa</span>
            </div>
          )}
        </div>

        <div className={styles.content}>
          <div className={styles.header}>
            <h3 className={styles.title}>{book.title}</h3>
            {book.genre && <Badge variant="neutral">{book.genre}</Badge>}
          </div>

          <p className={styles.synopsis}>
            {book.synopsis || 'Nenhuma sinopse cadastrada para este livro.'}
          </p>

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

        <div className={styles.actions}>
          <div className={styles.actionGroup}>
            <Button
              variant="primary"
              onClick={() => onManageChapters(book)}
              title="Gerenciar Capítulos"
            >
              <FileText className="icon icon-sm" aria-hidden="true" />
              Capítulos
            </Button>
            <Button
              variant="secondary"
              onClick={() => onToggleStatus(book)}
              title={isPublished ? 'Despublicar obra' : 'Publicar obra online'}
            >
              {isPublished ? (
                <>
                  <Lock className="icon icon-sm" aria-hidden="true" />
                  Rascunho
                </>
              ) : (
                <>
                  <Globe className="icon icon-sm" aria-hidden="true" />
                  Publicar
                </>
              )}
            </Button>
          </div>

          <div className={styles.actionGroup}>
            <Button
              variant="secondary"
              onClick={() => onEdit(book)}
              title="Editar dados da obra"
              aria-label={`Editar ${book.title}`}
            >
              <Edit2 className="icon icon-sm" aria-hidden="true" />
            </Button>
            <Button
              variant="danger"
              onClick={() => onDelete(book.id)}
              title="Excluir livro"
              aria-label={`Excluir ${book.title}`}
            >
              <Trash2 className="icon icon-sm" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
