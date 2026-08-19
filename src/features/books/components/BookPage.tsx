import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Book as BookIcon,
  Edit2,
  FileText,
  Globe,
  Lock,
  Scroll,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge, Button, ErrorState, LoadingState, PageHeader } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { LoreTab } from '@/features/lore';
import type { Book } from '../model/book';
import type { CreateBookInput } from '../model/book';
import * as bookService from '../services/bookService';
import { ChapterList } from './ChapterList';
import { BookFormDialog } from './BookFormDialog';
import { ImportBookModal } from './ImportBookModal';
import styles from './BookPage.module.css';

type TabId = 'chapters' | 'compendium' | 'publication';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof FileText;
}

const TABS: TabDef[] = [
  { id: 'chapters', label: 'Capítulos', icon: FileText },
  { id: 'compendium', label: 'Compêndio', icon: Scroll },
  { id: 'publication', label: 'Publicação', icon: Globe },
];

export function BookPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(bookId));
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('chapters');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!bookId) return;

    bookService
      .getBook(bookId)
      .then((data) => {
        if (active) {
          setBook(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Falha ao buscar livro');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [bookId]);

  const refreshBook = () => {
    if (!bookId) return;
    void bookService.getBook(bookId).then((data) => {
      if (data) setBook(data);
    });
  };

  const handleEditSubmit = async (input: CreateBookInput) => {
    if (!bookId) return;
    await bookService.updateBook(bookId, input);
    refreshBook();
  };

  const handleDelete = () => {
    if (!bookId || !book) return;
    setIsDeleting(true);
    void (async () => {
      try {
        await bookService.deleteBook(bookId);
        void navigate('/');
      } finally {
        setIsDeleting(false);
      }
    })();
  };

  const handleToggleStatus = () => {
    if (!bookId || !book) return;
    const nextStatus = book.status === 'published' ? 'draft' : 'published';
    void (async () => {
      await bookService.updateBook(bookId, { status: nextStatus });
      setBook((prev) => (prev ? { ...prev, status: nextStatus, updatedAt: Date.now() } : prev));
    })();
  };

  if (loading) {
    return <LoadingState label="Carregando livro..." />;
  }

  if (error || !book) {
    return (
      <div className={styles.container}>
        <ErrorState
          title="Livro não encontrado"
          description={error || 'A obra solicitada não existe ou foi removida.'}
          action={
            <Link to="/">
              <Button variant="primary">Voltar para Minhas Obras</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isOwner = user?.uid === book.authorId;
  const isPublished = book.status === 'published';

  return (
    <div className={styles.container}>
      <div className={styles.backRow}>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft className="icon icon-sm" aria-hidden="true" />
          Minhas Obras
        </Link>
      </div>

      <div className={styles.bookHeader}>
        <div className={styles.bookCover}>
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={`Capa de ${book.title}`} className={styles.coverImage} />
          ) : (
            <div className={styles.coverFallback}>
              <BookIcon className="icon" aria-hidden="true" />
              <span>Sem capa</span>
            </div>
          )}
        </div>

        <div className={styles.bookInfo}>
          <PageHeader
            title={book.title}
            description={book.synopsis || undefined}
            actions={
              isOwner ? (
                <div className={styles.headerActions}>
                  <Button
                    variant="secondary"
                    onClick={() => setIsImportOpen(true)}
                    title="Importar capítulos de documento"
                  >
                    <Upload className="icon icon-sm" aria-hidden="true" />
                    Importar DOCX/PDF
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setIsFormOpen(true)}
                    title="Editar dados da obra"
                  >
                    <Edit2 className="icon icon-sm" aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    title="Excluir livro"
                  >
                    <Trash2 className="icon icon-sm" aria-hidden="true" />
                    Excluir
                  </Button>
                </div>
              ) : undefined
            }
          />

          <div className={styles.bookMeta}>
            {book.genre && <Badge variant="neutral">{book.genre}</Badge>}
            <span className={styles.metaItem}>
              <FileText className="icon icon-sm" aria-hidden="true" />
              {book.wordCount.toLocaleString('pt-BR')} palavras
            </span>
            {isPublished ? (
              <Badge variant="success">Publicado</Badge>
            ) : (
              <Badge variant="neutral">Rascunho</Badge>
            )}
          </div>
        </div>
      </div>

      <div className={styles.tabBar} role="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <IconComp className="icon icon-sm" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.tabContent} role="tabpanel">
        {activeTab === 'chapters' && (
          <ChapterList
            book={book}
            open={true}
            onClose={() => {}}
            onChapterCountChanged={refreshBook}
            mode="inline"
            onOpenImport={isOwner ? () => setIsImportOpen(true) : undefined}
          />
        )}

        {activeTab === 'compendium' && <LoreTab book={book} />}

        {activeTab === 'publication' && (
          <div className={styles.publicationTab}>
            <div className={styles.publicationCard}>
              <div className={styles.publicationIcon}>
                {isPublished ? (
                  <Globe className="icon" aria-hidden="true" />
                ) : (
                  <Lock className="icon" aria-hidden="true" />
                )}
              </div>
              <h3 className={styles.publicationTitle}>
                {isPublished ? 'Obra Publicada' : 'Obra em Rascunho'}
              </h3>
              <p className={styles.publicationDescription}>
                {isPublished
                  ? 'Sua obra está visível publicamente. Leitores podem acessá-la pelo link de publicação.'
                  : 'Sua obra está em modo rascunho e só você pode vê-la. Publique-a para compartilhar com leitores.'}
              </p>
              {isOwner && (
                <Button
                  variant={isPublished ? 'secondary' : 'primary'}
                  onClick={handleToggleStatus}
                >
                  {isPublished ? (
                    <>
                      <Lock className="icon icon-sm" aria-hidden="true" />
                      Reverter para Rascunho
                    </>
                  ) : (
                    <>
                      <Globe className="icon icon-sm" aria-hidden="true" />
                      Publicar Obra
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {isFormOpen && (
        <BookFormDialog
          open={isFormOpen}
          bookToEdit={book}
          onClose={() => setIsFormOpen(false)}
          onSubmit={handleEditSubmit}
        />
      )}

      {isImportOpen && (
        <ImportBookModal
          open={isImportOpen}
          targetBook={book}
          authorId={book.authorId}
          onClose={() => setIsImportOpen(false)}
          onSuccess={() => {
            refreshBook();
          }}
        />
      )}
    </div>
  );
}
