import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Loader2,
} from 'lucide-react';
import { Button, ErrorState, LoadingState } from '@/shared/ui';
import { useAuth, CreditsBadge } from '@/features/auth';
import { getBook, listChapters, getChapter, type Book, type Chapter } from '@/features/books';
import {
  listLoreEntities,
  createLoreEntity,
  updateLoreEntity,
  type CreateLoreEntityInput,
  type UpdateLoreEntityInput,
  type LoreEntity,
} from '@/features/lore';
import { useAutoSave } from '../hooks/useAutoSave';
import { RichEditor } from './RichEditor';
import { EditorLoreSidebar } from './EditorLoreSidebar';
import styles from './EditorPage.module.css';

export function EditorPage() {
  const { bookId, chapterId } = useParams<{
    bookId: string;
    chapterId: string;
  }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loreEntities, setLoreEntities] = useState<LoreEntity[]>([]);

  const [content, setContent] = useState<string>('');
  const [wordCount, setWordCount] = useState<number>(0);
  const [overrideCredits, setOverrideCredits] = useState<number | null>(null);
  const currentCredits = overrideCredits ?? user?.credits ?? 0;

  const [loading, setLoading] = useState<boolean>(() => Boolean(bookId && chapterId));
  const [error, setError] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const handleSaved = useCallback((newCount: number) => {
    setWordCount(newCount);
  }, []);

  const {
    saveStatus,
    error: saveError,
    resetSavedContent,
  } = useAutoSave({
    bookId,
    chapterId,
    content,
    debounceMs: 1000,
    onSaved: handleSaved,
  });

  useEffect(() => {
    let active = true;

    if (!bookId || !chapterId) {
      return;
    }

    const loadData = async () => {
      try {
        const bookData: Book | null = await getBook(bookId);
        const chaptersData: Chapter[] = await listChapters(bookId);
        const chapterData: Chapter | null = await getChapter(bookId, chapterId);
        const loreData: LoreEntity[] = await listLoreEntities(bookId);

        if (!active) return;
        if (!bookData || !chapterData) {
          setError('Livro ou capítulo não encontrado');
          setLoading(false);
          return;
        }

        setBook(bookData);
        setChapters(chaptersData);
        setChapter(chapterData);
        const initialContent = chapterData.content || '';
        setContent(initialContent);
        resetSavedContent(initialContent);
        setWordCount(chapterData.wordCount || 0);
        setLoreEntities(loreData);
        setLoading(false);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar dados do editor');
        setLoading(false);
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [bookId, chapterId, resetSavedContent]);

  const handleCreateLoreEntity = async (input: CreateLoreEntityInput) => {
    if (!bookId) return;
    const newEntity: LoreEntity = await createLoreEntity(bookId, input);
    setLoreEntities((prev) => [...prev, newEntity]);
  };

  const handleUpdateLoreEntity = async (id: string, input: UpdateLoreEntityInput) => {
    if (!bookId) return;
    await updateLoreEntity(bookId, id, input);
    setLoreEntities((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...input, updatedAt: Date.now() } : e)),
    );
  };

  const handleSelectEntity = (entity: LoreEntity) => {
    setSelectedEntityId(entity.id);
    setIsSidebarOpen(true);
  };

  if (loading) {
    return <LoadingState label="Carregando área de escrita..." />;
  }

  if (error || !book || !chapter) {
    return (
      <div className={styles.errorContainer}>
        <ErrorState
          title="Não foi possível abrir o editor"
          description={error || 'Capítulo não encontrado.'}
          action={
            <Link to="/">
              <Button variant="primary">Voltar para Minhas Obras</Button>
            </Link>
          }
        />
      </div>
    );
  }

  // Encontra capítulo anterior e próximo para navegação sequencial
  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex !== -1 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  return (
    <div className={styles.pageLayout}>
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Link
            to="/"
            className={styles.backLink}
            title="Voltar para a lista de obras"
            aria-label="Voltar para a lista de obras"
          >
            <ArrowLeft className="icon icon-sm" aria-hidden="true" />
          </Link>

          <div className={styles.titleInfo}>
            <span className={styles.bookTitle}>{book.title}</span>
            <span className={styles.divider}>/</span>
            <h1 className={styles.chapterTitle}>{chapter.title}</h1>
          </div>
        </div>

        <div className={styles.topBarRight}>
          <CreditsBadge credits={currentCredits} tier={user?.tier || 'free'} />

          <div className={styles.saveStatusWrapper} aria-live="polite">
            {saveStatus === 'saving' && (
              <span className={styles.statusSaving}>
                <Loader2 className="icon icon-sm" aria-hidden="true" />
                Salvando...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className={styles.statusSaved}>
                <CheckCircle2 className="icon icon-sm" aria-hidden="true" />
                Salvo
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className={styles.statusUnsaved}>
                <Cloud className="icon icon-sm" aria-hidden="true" />
                Não salvo
              </span>
            )}
            {saveStatus === 'error' && (
              <span className={styles.statusError} title={saveError || 'Erro ao salvar'}>
                <CloudOff className="icon icon-sm" aria-hidden="true" />
                Erro ao salvar
              </span>
            )}
          </div>

          <span className={styles.wordCounter}>
            <strong>{wordCount.toLocaleString('pt-BR')}</strong> palavras
          </span>

          <div className={styles.chapterNavigation}>
            <button
              type="button"
              className={styles.navBtn}
              disabled={!prevChapter}
              onClick={() => {
                if (prevChapter) {
                  void navigate(`/books/${bookId}/editor/${prevChapter.id}`);
                }
              }}
              title={prevChapter ? `Capítulo anterior: ${prevChapter.title}` : 'Primeiro capítulo'}
              aria-label="Capítulo anterior"
            >
              <ChevronLeft className="icon icon-sm" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.navBtn}
              disabled={!nextChapter}
              onClick={() => {
                if (nextChapter) {
                  void navigate(`/books/${bookId}/editor/${nextChapter.id}`);
                }
              }}
              title={nextChapter ? `Próximo capítulo: ${nextChapter.title}` : 'Último capítulo'}
              aria-label="Próximo capítulo"
            >
              <ChevronRight className="icon icon-sm" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className={styles.workspace}>
        <RichEditor
          content={content}
          onChange={setContent}
          entities={loreEntities}
          onSelectEntity={handleSelectEntity}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          userId={user?.uid}
          userCredits={currentCredits}
          onCreditDeducted={(newTotal) => setOverrideCredits(newTotal)}
        />

        <EditorLoreSidebar
          isOpen={isSidebarOpen}
          entities={loreEntities}
          selectedEntityId={selectedEntityId}
          onClose={() => setIsSidebarOpen(false)}
          onCreateEntity={handleCreateLoreEntity}
          onUpdateEntity={handleUpdateLoreEntity}
        />
      </main>
    </div>
  );
}
