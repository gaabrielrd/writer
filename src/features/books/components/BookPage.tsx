import { useState, useEffect, useId, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Book as BookIcon,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  FileText,
  Globe,
  Lock,
  MoreHorizontal,
  Scroll,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Dropdown,
  DropdownItem,
  Input,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { ExportDialog } from '@/features/editor';
import { publishBook, unpublishBook } from '../services/publicationService';
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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [expandedSynopsisBookId, setExpandedSynopsisBookId] = useState<string | null>(null);
  const synopsisId = useId();
  const bookOptionsRef = useRef<HTMLButtonElement>(null);
  const [compendiumActions, setCompendiumActions] = useState<HTMLDivElement | null>(null);
  const [compendiumBusy, setCompendiumBusy] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

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
    void bookService
      .getBook(bookId)
      .then((data) => {
        if (data) setBook(data);
      })
      .catch((cause: unknown) => {
        setActionError(
          cause instanceof Error ? cause.message : 'Não foi possível atualizar a obra.',
        );
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
        setActionError(null);
        await bookService.deleteBook(bookId);
        void navigate('/');
      } catch (cause) {
        setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir a obra.');
      } finally {
        setIsDeleting(false);
      }
    })();
  };

  const handlePublication = async (publish: boolean) => {
    if (!bookId || !book || isPublishing) return;
    setIsPublishing(true);
    setActionError(null);
    try {
      if (publish) await publishBook(bookId, authorName.trim());
      else await unpublishBook(bookId);
      setBook((previous) =>
        previous
          ? { ...previous, status: publish ? 'published' : 'draft', updatedAt: Date.now() }
          : previous,
      );
      setIsPublishOpen(false);
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar a publicação. Tente novamente.',
      );
    } finally {
      setIsPublishing(false);
    }
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
  const isSynopsisExpanded = expandedSynopsisBookId === book.id;
  const restoreBookOptionsFocus = () => {
    requestAnimationFrame(() => bookOptionsRef.current?.focus());
  };

  return (
    <div className={styles.container}>
      {actionError && (
        <Alert variant="destructive" title="A ação não foi concluída">
          {actionError}
        </Alert>
      )}
      <div className={styles.backRow}>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft className="icon icon-sm" aria-hidden="true" />
          Minhas Obras
        </Link>
      </div>

      <div className={`${styles.bookHeader} glass-surface`}>
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
            className={styles.detailsHeading}
            actions={
              isOwner ? (
                <Dropdown
                  label="Opções do livro"
                  align="end"
                  trigger={
                    <Button
                      ref={bookOptionsRef}
                      variant="ghost"
                      size="icon"
                      aria-label="Opções do livro"
                    >
                      <MoreHorizontal className="icon" aria-hidden="true" />
                    </Button>
                  }
                >
                  <DropdownItem onSelect={() => setIsExportOpen(true)}>
                    <Download className="icon icon-sm" aria-hidden="true" />
                    Exportar
                  </DropdownItem>
                  <DropdownItem onSelect={() => setIsImportOpen(true)}>
                    <Upload className="icon icon-sm" aria-hidden="true" />
                    Importar documento
                  </DropdownItem>
                  <DropdownItem onSelect={() => setIsFormOpen(true)}>
                    <Edit2 className="icon icon-sm" aria-hidden="true" />
                    Editar
                  </DropdownItem>
                  <DropdownItem onSelect={handleDelete} disabled={isDeleting}>
                    <Trash2 className="icon icon-sm" aria-hidden="true" />
                    Excluir
                  </DropdownItem>
                </Dropdown>
              ) : undefined
            }
          />

          {book.synopsis && (
            <div className={styles.synopsisBlock}>
              <p
                id={synopsisId}
                className={`${styles.synopsis} ${isSynopsisExpanded ? '' : styles.synopsisCollapsed}`}
              >
                {book.synopsis}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className={styles.synopsisToggle}
                aria-expanded={isSynopsisExpanded}
                aria-controls={synopsisId}
                aria-label={isSynopsisExpanded ? 'Recolher sinopse' : 'Expandir sinopse'}
                onClick={() => setExpandedSynopsisBookId(isSynopsisExpanded ? null : book.id)}
              >
                {isSynopsisExpanded ? 'Menos' : 'Mais'}
                {isSynopsisExpanded ? (
                  <ChevronUp className="icon icon-sm" aria-hidden="true" />
                ) : (
                  <ChevronDown className="icon icon-sm" aria-hidden="true" />
                )}
              </Button>
            </div>
          )}

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

      <div className={styles.tabsHeader}>
        <div className={styles.tabBar} role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const IconComp = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                disabled={compendiumBusy}
                aria-selected={isActive}
                className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  refreshBook();
                }}
              >
                <IconComp className="icon icon-sm" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div ref={setCompendiumActions} className={styles.tabActions} />
      </div>

      <div className={styles.tabContent} role="tabpanel">
        {activeTab === 'chapters' && (
          <ChapterList
            book={book}
            open={true}
            onClose={() => {}}
            onChapterCountChanged={refreshBook}
            mode="inline"
          />
        )}

        {activeTab === 'compendium' && (
          <LoreTab
            book={book}
            actionsContainer={compendiumActions}
            onEntitiesChanged={refreshBook}
            onBusyChange={setCompendiumBusy}
          />
        )}

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
                  ? 'A versão publicada está disponível no link abaixo. Alterações no rascunho só aparecem após atualizar a publicação.'
                  : 'Sua obra está em modo rascunho e só você pode vê-la. Publique-a para compartilhar com leitores.'}
              </p>
              {isPublished && <Link to={`/read/${book.id}`}>Abrir leitor público</Link>}
              {isOwner && isPublished && (
                <Button
                  variant="secondary"
                  disabled={isPublishing}
                  onClick={() => setIsPublishOpen(true)}
                >
                  Atualizar publicação
                </Button>
              )}
              {isOwner && (
                <Button
                  variant={isPublished ? 'secondary' : 'primary'}
                  onClick={() =>
                    isPublished ? void handlePublication(false) : setIsPublishOpen(true)
                  }
                  disabled={isPublishing}
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

      {isPublishOpen && (
        <Dialog
          open
          title="Publicar versão da obra"
          onClose={() => {
            if (!isPublishing) setIsPublishOpen(false);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={isPublishing}
                onClick={() => setIsPublishOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={isPublishing || !authorName.trim()}
                onClick={() => void handlePublication(true)}
              >
                {isPublishing ? 'Publicando...' : 'Confirmar publicação'}
              </Button>
            </>
          }
        >
          <p>
            Qualquer pessoa com o link poderá ler todos os capítulos desta versão, o título e o nome
            de autor informado abaixo. Apenas nome, apelidos, categoria e resumo das entidades
            marcadas públicas serão incluídos. Fichas detalhadas, relações e notas ficam privadas.
          </p>
          <p>
            Novas alterações permanecem no rascunho até você atualizar a publicação. Retirar a
            publicação bloqueia novos acessos, mas não apaga cópias já feitas pelos leitores.
          </p>
          <Input
            label="Nome de autor público"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            maxLength={120}
            disabled={isPublishing}
          />
          {actionError && (
            <Alert variant="destructive" title="Falha na publicação">
              {actionError}
            </Alert>
          )}
        </Dialog>
      )}
      {isExportOpen && (
        <ExportDialog
          book={book}
          onClose={() => {
            setIsExportOpen(false);
            restoreBookOptionsFocus();
          }}
        />
      )}
      {isFormOpen && (
        <BookFormDialog
          open={isFormOpen}
          bookToEdit={book}
          onClose={() => {
            setIsFormOpen(false);
            restoreBookOptionsFocus();
          }}
          onSubmit={handleEditSubmit}
        />
      )}

      {isImportOpen && (
        <ImportBookModal
          open={isImportOpen}
          targetBook={book}
          authorId={book.authorId}
          onClose={() => {
            setIsImportOpen(false);
            restoreBookOptionsFocus();
          }}
          onSuccess={() => {
            refreshBook();
          }}
        />
      )}
    </div>
  );
}
