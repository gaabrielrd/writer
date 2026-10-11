import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Alert, Button, Dialog, ErrorState, LoadingState } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import { getBook, listChapters, getChapter, type Book, type Chapter } from '@/features/books';
import {
  listLoreEntities,
  createLoreEntity,
  updateLoreEntity,
  subscribeLoreEntities,
  entityScope,
  type CreateLoreEntityInput,
  type UpdateLoreEntityInput,
  type LoreEntity,
} from '@/features/lore';
import { clearLocalDraft, readLocalDraft } from '../services/localDraftStorage';
import { useAutoSave } from '../hooks/useAutoSave';
import { BusyNavigationGuard } from './BusyNavigationGuard';
import { RichEditor } from './RichEditor';
import { EditorLoreSidebar } from './EditorLoreSidebar';
import { ExportButton } from './ExportButton';
import { LoreAnalysisDialog } from './LoreAnalysisDialog';
import styles from './EditorPage.module.css';

export function EditorPage() {
  const { bookId, chapterId } = useParams();
  const { user } = useAuth();
  return <EditorSession key={`${user?.uid}:${bookId}:${chapterId}`} />;
}

function EditorSession() {
  const { bookId, chapterId } = useParams<{
    bookId: string;
    chapterId: string;
  }>();
  const navigate = useNavigate();
  const { user, updateUserCreditsState, setPendingEditorOperation } = useAuth();

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loreEntities, setLoreEntities] = useState<LoreEntity[]>([]);
  const [globalLoreEntities, setGlobalLoreEntities] = useState<LoreEntity[]>([]);
  const [globalLoreError, setGlobalLoreError] = useState<string | null>(null);
  const [loreAttempt, setLoreAttempt] = useState(0);
  const allLoreEntities = useMemo(
    () => [...loreEntities, ...globalLoreEntities],
    [loreEntities, globalLoreEntities],
  );

  const [recoveryDraft, setRecoveryDraft] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [wordCount, setWordCount] = useState<number>(0);
  const currentCredits = user?.credits ?? 0;

  const [loading, setLoading] = useState<boolean>(() => Boolean(bookId && chapterId));
  const [error, setError] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isAcceptingAI, setIsAcceptingAI] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [loreRefreshError, setLoreRefreshError] = useState<string | null>(null);
  const handleBusyChange = useCallback(
    (busy: boolean) => {
      setIsAcceptingAI(busy);
      setPendingEditorOperation(busy);
    },
    [setPendingEditorOperation],
  );
  useEffect(
    () => () => {
      setPendingEditorOperation(false);
    },
    [setPendingEditorOperation],
  );
  const [createEntityName, setCreateEntityName] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const handleSaved = useCallback((newCount: number) => {
    setWordCount(newCount);
  }, []);

  const {
    saveStatus,
    error: saveError,
    resetSavedContent,
    saveNow,
  } = useAutoSave({
    bookId,
    chapterId,
    content,
    debounceMs: 1000,
    ownerId: user?.uid,
    enabled: chapter !== null,
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
        const globalData = bookData?.universeId
          ? await listLoreEntities({ kind: 'universe', id: bookData.universeId }).catch(
              (cause: unknown) => {
                if (active)
                  setGlobalLoreError(
                    cause instanceof Error ? cause.message : 'Falha ao carregar lore global.',
                  );
                return [];
              },
            )
          : [];

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
        const recovery = user?.uid ? readLocalDraft(user.uid, bookId, chapterId) : null;
        setContent(initialContent);
        if (recovery && recovery.content !== initialContent) setRecoveryDraft(recovery.content);
        resetSavedContent(initialContent);
        setWordCount(chapterData.wordCount || 0);
        setLoreEntities(loreData);
        setGlobalLoreEntities(globalData);
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
  }, [bookId, chapterId, resetSavedContent, user?.uid]);

  useEffect(() => {
    if (!book?.universeId) return;
    let active = true;
    const failure = (cause: unknown) => {
      if (active) {
        setGlobalLoreEntities([]);
        setGlobalLoreError(cause instanceof Error ? cause.message : 'Falha ao sincronizar o lore.');
      }
    };
    const stopLocal = subscribeLoreEntities(
      book.id,
      (entities) => {
        if (active) setLoreEntities(entities);
      },
      failure,
    );
    const stopGlobal = subscribeLoreEntities(
      { kind: 'universe', id: book.universeId },
      (entities) => {
        if (active) {
          setGlobalLoreEntities(entities);
          setGlobalLoreError(null);
        }
      },
      failure,
    );
    return () => {
      active = false;
      stopLocal();
      stopGlobal();
    };
  }, [book, loreAttempt]);

  const handleCreateLoreEntity = async (
    input: CreateLoreEntityInput,
    scope: 'local' | 'global' = 'local',
  ) => {
    if (!bookId) return;
    if (scope === 'global' && !book?.universeId) throw new Error('Este livro não possui universo.');
    const newEntity: LoreEntity = await createLoreEntity(
      scope === 'global' ? { kind: 'universe', id: book!.universeId! } : bookId,
      input,
    );
    const setter = scope === 'global' ? setGlobalLoreEntities : setLoreEntities;
    setter((prev) => [...prev.filter((item) => item.id !== newEntity.id), newEntity]);
  };

  const handleUpdateLoreEntity = async (id: string, input: UpdateLoreEntityInput) => {
    if (!bookId) return;
    const entity = allLoreEntities.find((item) => item.id === id);
    if (!entity) throw new Error('Entidade não disponível.');
    await updateLoreEntity(entity.universeId ? entityScope(entity) : bookId, id, input);
    const setter = entity.universeId ? setGlobalLoreEntities : setLoreEntities;
    setter((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...input, updatedAt: Date.now() } : e)),
    );
  };

  const handleSelectEntity = (entity: LoreEntity) => {
    setSelectedEntityId(entity.id);
    setIsSidebarOpen(true);
  };

  const refreshLore = async () => {
    if (!book) return;
    try {
      const [local, global] = await Promise.all([
        listLoreEntities(book.id),
        book.universeId
          ? listLoreEntities({ kind: 'universe', id: book.universeId })
          : Promise.resolve([]),
      ]);
      setLoreEntities(local);
      setGlobalLoreEntities(global);
      setLoreRefreshError(null);
    } catch {
      setLoreRefreshError('O lote foi aplicado, mas não foi possível recarregar o compêndio.');
    }
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

  if (recoveryDraft !== null) {
    return (
      <Dialog
        open
        title="Recuperar rascunho local?"
        onClose={() => {
          void navigate('/');
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (user?.uid && bookId && chapterId)
                  clearLocalDraft(user.uid, bookId, chapterId, recoveryDraft);
                resetSavedContent(recoveryDraft);
                void saveNow();
                setRecoveryDraft(null);
              }}
            >
              Manter versão salva
            </Button>
            <Button
              onClick={() => {
                setContent(recoveryDraft);
                setRecoveryDraft(null);
              }}
            >
              Recuperar texto local
            </Button>
          </>
        }
      >
        <p>
          Há uma cópia local não confirmada diferente da versão salva deste capítulo. Escolha qual
          deseja continuar editando. Fechar mantém a cópia local e volta à biblioteca.
        </p>
        <p>
          <strong>Versão salva:</strong>{' '}
          {chapter.content.replace(/<[^>]*>/g, '').slice(0, 240) || 'Capítulo vazio'}
        </p>
        <p>
          <strong>Rascunho local:</strong>{' '}
          {recoveryDraft.replace(/<[^>]*>/g, '').slice(0, 240) || 'Capítulo vazio'}
        </p>
      </Dialog>
    );
  }

  // Encontra capítulo anterior e próximo para navegação sequencial
  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex !== -1 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  return (
    <div className={styles.pageLayout}>
      <BusyNavigationGuard busy={isAcceptingAI} />
      {isAcceptingAI && (
        <p role="status">Aguarde a aplicação terminar antes de sair do capítulo.</p>
      )}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Link
            to={`/books/${bookId}`}
            onClick={(event) => {
              if (isAcceptingAI) event.preventDefault();
            }}
            className={styles.backLink}
            title="Voltar para o livro"
            aria-label="Voltar para o livro"
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
          <ExportButton book={book} currentChapter={chapter} currentContent={content} />

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

          {saveError && (
            <Button variant="secondary" onClick={() => void saveNow()}>
              Tentar salvar novamente
            </Button>
          )}
          <span className={styles.wordCounter}>
            <strong>{wordCount.toLocaleString('pt-BR')}</strong> palavras
          </span>

          <div className={styles.chapterNavigation}>
            <button
              type="button"
              className={styles.navBtn}
              disabled={!prevChapter || isAcceptingAI}
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
              disabled={!nextChapter || isAcceptingAI}
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

      <section className={styles.workspace} aria-label="Espaço de escrita">
        {loreRefreshError && (
          <Alert variant="warning">
            {loreRefreshError}
            <Button variant="secondary" onClick={() => void refreshLore()}>
              Recarregar compêndio
            </Button>
          </Alert>
        )}
        {globalLoreError && (
          <Alert variant="warning" title="Lore global indisponível">
            {globalLoreError}
            <Button variant="secondary" onClick={() => setLoreAttempt((n) => n + 1)}>
              Tentar novamente
            </Button>
          </Alert>
        )}
        <RichEditor
          onBusyChange={handleBusyChange}
          documentId={chapter.id}
          content={content}
          onChange={setContent}
          entities={allLoreEntities}
          onSelectEntity={handleSelectEntity}
          onCreateEntity={(name) => {
            setCreateEntityName(name);
            setIsSidebarOpen(true);
          }}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          userId={user?.uid}
          userCredits={currentCredits}
          onCreditDeducted={updateUserCreditsState}
        />

        <EditorLoreSidebar
          onAnalyzeText={globalLoreError ? undefined : () => setIsAnalysisOpen(true)}
          isOpen={isSidebarOpen}
          entities={allLoreEntities}
          universeId={book.universeId}
          selectedEntityId={selectedEntityId}
          createEntityName={createEntityName}
          onCreateRequestHandled={() => setCreateEntityName(null)}
          onClose={() => setIsSidebarOpen(false)}
          onCreateEntity={handleCreateLoreEntity}
          onUpdateEntity={handleUpdateLoreEntity}
        />
      </section>
      {isAnalysisOpen && (
        <LoreAnalysisDialog
          bookId={book.id}
          chapterId={chapter.id}
          content={content}
          entities={allLoreEntities}
          universeId={book.universeId}
          onClose={() => setIsAnalysisOpen(false)}
          onBusyChange={handleBusyChange}
          onApplied={(credits) => {
            updateUserCreditsState(credits);
            void refreshLore();
          }}
        />
      )}
    </div>
  );
}
