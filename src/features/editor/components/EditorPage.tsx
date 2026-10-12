import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Loader2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Alert, Button, Dialog, ErrorState, LoadingState, useWorkspaceLayout } from '@/shared/ui';
import { useAuth } from '@/features/auth';
import {
  getBook,
  listChapters,
  getChapter,
  updateChapter,
  updateBook,
  subscribeWritingBindings,
  type Book,
  type Chapter,
} from '@/features/books';
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
import {
  ChapterPersonaDialog,
  resolveWritingPersona,
  usePersonaLibrary,
  ChapterChatPanel,
  chapterChatCall,
  chatDocumentHash,
  relevantChatLore,
  ChapterChatError,
  readChatApplyRecovery,
  writeChatApplyRecovery,
  clearChatApplyRecovery,
  type AIActionType,
  type ChatEditorBridge,
  type ChatContext,
  type ChatApplyInput,
} from '@/features/ai-assistant';
import { clearLocalDraft, readLocalDraft } from '../services/localDraftStorage';
import { runChapterOperation } from '../services/chapterContentStorage';
import { useAutoSave } from '../hooks/useAutoSave';
import { useEditorFullscreen } from '../hooks/useEditorFullscreen';
import { BusyNavigationGuard } from './BusyNavigationGuard';
import { RichEditor } from './RichEditor';
import { ResizableEditorWorkspace } from './ResizableEditorWorkspace';
import { EditorLoreSidebar } from './EditorLoreSidebar';
import { ExportButton } from './ExportButton';
import { LoreAnalysisDialog } from './LoreAnalysisDialog';
import styles from './EditorPage.module.css';

export function EditorPage() {
  const { bookId, chapterId } = useParams();
  const { user } = useAuth();
  const { setExpanded } = useWorkspaceLayout();
  useEffect(() => () => setExpanded(false), [setExpanded]);
  return <EditorSession key={`${user?.uid}:${bookId}:${chapterId}`} />;
}

function EditorSession() {
  const { expanded, toggle: toggleFullscreen } = useEditorFullscreen();
  const { bookId, chapterId } = useParams<{
    bookId: string;
    chapterId: string;
  }>();
  const navigate = useNavigate();
  const { user, updateUserCreditsState, setPendingEditorOperation } = useAuth();

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [personaDialog, setPersonaDialog] = useState(false);
  const personaButton = useRef<HTMLButtonElement | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [bindingAttempt, setBindingAttempt] = useState(0);
  const hasPersona = Boolean(book?.personaId || chapter?.personaComplement);
  const library = usePersonaLibrary(hasPersona ? user?.uid : null);
  let personaError = bindingError;
  let writingPersona = { instruction: '', version: '' };
  try {
    writingPersona = resolveWritingPersona(
      library.personas,
      book?.personaId,
      chapter?.personaComplement,
    );
  } catch (cause) {
    personaError = cause instanceof Error ? cause.message : 'Persona indisponível.';
  }
  if (hasPersona && library.loading) personaError = 'Carregando a configuração de personas...';
  else if (hasPersona && library.error) personaError = library.error;
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

  const [activePanel, setActivePanel] = useState<'lore' | 'chat' | null>(null);
  const isSidebarOpen = activePanel === 'lore';
  const setIsSidebarOpen = (open: boolean) => setActivePanel(open ? 'lore' : null);
  const [chatMounted, setChatMounted] = useState(false);
  const [chatBridge, setChatBridge] = useState<ChatEditorBridge | null>(null);
  const [chatPrompt, setChatPrompt] = useState<{
    id: number;
    text: string;
    context: ChatContext | null;
  }>();
  const [chatApplyRecovery, setChatApplyRecovery] = useState(() =>
    user?.uid && bookId && chapterId ? readChatApplyRecovery(user.uid, bookId, chapterId) : null,
  );
  const [chatRecoveryError, setChatRecoveryError] = useState<string | null>(null);
  const chatSequence = useRef(0);
  const chatOpening = useRef(false);
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
    getSavedContent,
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
    if (!bookId || !chapterId || !user?.uid || !book?.id || !chapter?.id) return;
    let active = true;
    const stop = subscribeWritingBindings(
      bookId,
      chapterId,
      (settings) => {
        if (!active) return;
        if ('personaId' in settings)
          setBook((previous) =>
            previous && previous.personaId !== settings.personaId
              ? { ...previous, personaId: settings.personaId }
              : previous,
          );
        if ('personaComplement' in settings)
          setChapter((previous) =>
            previous &&
            JSON.stringify(previous.personaComplement) !==
              JSON.stringify(settings.personaComplement)
              ? { ...previous, personaComplement: settings.personaComplement }
              : previous,
          );
        setBindingError(null);
      },
      (cause) => {
        if (active) setBindingError(cause.message);
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [bookId, chapterId, user?.uid, book?.id, chapter?.id, bindingAttempt]);

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
    if (!book) return;
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
        if (active) {
          setLoreEntities(entities);
          if (!book.universeId) setGlobalLoreError(null);
        }
      },
      failure,
    );
    const stopGlobal = book.universeId
      ? subscribeLoreEntities(
          { kind: 'universe', id: book.universeId },
          (entities) => {
            if (active) {
              setGlobalLoreEntities(entities);
              setGlobalLoreError(null);
            }
          },
          failure,
        )
      : () => undefined;
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
  const openChat = async (action?: AIActionType) => {
    if (chatOpening.current) return;
    chatOpening.current = true;
    try {
      const captured = await chatBridge?.capture('auto');
      if (action) {
        const prompt = {
          continue: '/continuar ',
          improve_style: '/estilo ',
          check_consistency: '/coerencia ',
          custom: '',
        }[action];
        setChatPrompt({ id: ++chatSequence.current, text: prompt, context: captured ?? null });
      }
      setChatMounted(true);
      setActivePanel((previous) => (previous === 'chat' && !action ? null : 'chat'));
    } finally {
      chatOpening.current = false;
    }
  };
  const applyChat = async (input: ChatApplyInput) => {
    if (!chatBridge || !bookId || !chapterId || personaError)
      throw new Error(personaError || 'Editor indisponível.');
    if (input.message.context.persona.version !== (await chatDocumentHash(writingPersona.version)))
      throw new Error('A persona mudou. Gere uma nova sugestão.');
    if (globalLoreError) throw new Error('Recarregue o lore antes de aplicar.');
    const loreSnapshot = (items: ChatContext['lore']) =>
      JSON.stringify(
        items.map((item) => [
          item.name,
          item.category,
          item.summary,
          item.aliases,
          item.scope,
          item.details,
        ]),
      );
    if (
      loreSnapshot(relevantChatLore(allLoreEntities, input.message.context.text)) !==
      loreSnapshot(input.message.context.lore)
    )
      throw new Error('O lore utilizado mudou. Gere uma nova sugestão.');
    if (chatApplyRecovery)
      throw new Error('Recupere o aceite pendente antes de aplicar outra sugestão.');
    chatBridge.setBusy(true);
    try {
      const prepared = await chatBridge.prepare(
        input.target,
        input.message.suggestion!,
        input.replace,
      );
      await saveNow();
      await runChapterOperation(bookId, chapterId, async () => {
        const persisted = await getChapter(bookId, chapterId);
        if (!persisted || persisted.content !== getSavedContent())
          throw new Error(
            'O capítulo mudou em outra sessão ou não foi salvo. Resolva o salvamento antes de aplicar.',
          );
        const recovery = {
          identity: input.identity,
          messageId: input.message.id,
          requestId: input.requestId,
          expectedHash: await chatDocumentHash(persisted.content),
          sourceHash: input.target.hash,
          after: prepared.after,
          retarget: input.retarget,
        };
        writeChatApplyRecovery(user!.uid, recovery);
        setChatRecoveryError(null);
        setChatApplyRecovery(recovery);
        let result: { content: string; credits: number; wordCount: number };
        try {
          result = await chapterChatCall<{
            content: string;
            credits: number;
            wordCount: number;
          }>(input.identity, {
            action: 'apply',
            ...recovery,
          });
        } catch (cause) {
          if (cause instanceof ChapterChatError && !cause.uncertain) {
            clearChatApplyRecovery(user!.uid, bookId, chapterId);
            setChatApplyRecovery(null);
          }
          throw cause;
        }
        prepared.commit();
        resetSavedContent(result.content);
        setContent(result.content);
        setWordCount(result.wordCount);
        updateUserCreditsState(result.credits);
        clearChatApplyRecovery(user!.uid, bookId, chapterId);
        setChatApplyRecovery(null);
        if (user?.uid) clearLocalDraft(user.uid, bookId, chapterId, result.content);
      });
    } finally {
      chatBridge.setBusy(false);
      chatBridge.focus();
    }
  };
  const recoverChatApply = async () => {
    if (!chatApplyRecovery || !user || !bookId || !chapterId || !chatBridge) return;
    setChatRecoveryError(null);
    chatBridge.setBusy(true);
    try {
      await runChapterOperation(bookId, chapterId, async () => {
        const result = await chapterChatCall<{
          content: string;
          credits: number;
          wordCount: number;
        }>(chatApplyRecovery.identity, { action: 'apply', ...chatApplyRecovery });
        const latest = await getChapter(bookId, chapterId);
        if (!latest) throw new Error('Capítulo indisponível.');
        // Preserve edits made since the uncertain acceptance. Never restore an old receipt over them.
        if (content === getSavedContent()) {
          resetSavedContent(latest.content);
          setContent(latest.content);
          setWordCount(latest.wordCount);
        }
        updateUserCreditsState(result.credits);
        clearChatApplyRecovery(user.uid, bookId, chapterId);
        setChatApplyRecovery(null);
      });
    } catch (cause) {
      if (cause instanceof ChapterChatError && !cause.uncertain) {
        clearChatApplyRecovery(user.uid, bookId, chapterId);
        setChatApplyRecovery(null);
      }
      setChatRecoveryError((cause as Error).message);
    } finally {
      chatBridge.setBusy(false);
    }
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
    <div className={styles.pageLayout} data-workspace-expanded={expanded}>
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
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
            title={expanded ? 'Sair da tela cheia (Escape)' : 'Entrar em tela cheia'}
            aria-pressed={expanded}
            disabled={isAcceptingAI}
            onPointerDown={(event) => event.preventDefault()}
            onClick={toggleFullscreen}
          >
            {expanded ? (
              <Minimize2 className="icon icon-sm" aria-hidden="true" />
            ) : (
              <Maximize2 className="icon icon-sm" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="secondary"
            disabled={isAcceptingAI}
            ref={personaButton}
            title={personaError ?? 'Configurar personas de escrita'}
            onClick={() => setPersonaDialog(true)}
          >
            Persona
          </Button>
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
      {chatRecoveryError && !chatApplyRecovery && (
        <Alert variant="danger" title="Aceite não aplicado">
          {chatRecoveryError}
        </Alert>
      )}
      {chatApplyRecovery && (
        <Alert variant="warning" title="Aceite aguardando confirmação">
          {chatRecoveryError ??
            'Recupere a operação antes de aplicar outra sugestão. O mesmo recibo impede um segundo débito.'}
          <Button
            variant="secondary"
            onClick={() => {
              void recoverChatApply();
            }}
          >
            Recuperar aceite
          </Button>
        </Alert>
      )}
      <ResizableEditorWorkspace
        uid={user?.uid ?? ''}
        panelOpen={activePanel !== null}
        panel={
          <>
            {chatMounted && user && (
              <ChapterChatPanel
                open={activePanel === 'chat'}
                uid={user.uid}
                bookId={book.id}
                chapterId={chapter.id}
                bridge={chatBridge}
                initialPrompt={chatPrompt}
                contextVersion={writingPersona.version}
                unavailable={personaError}
                onClose={() => setActivePanel(null)}
                onApply={applyChat}
              />
            )}
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
          </>
        }
      >
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
          workspaceExpanded={expanded}
          chatOpen={activePanel === 'chat'}
          onOpenChat={(action) => {
            void openChat(action);
          }}
          onChatBridge={setChatBridge}
          chapterTitle={chapter.title}
          bookTitle={book.title}
          writingPersona={writingPersona}
          aiUnavailableReason={personaError}
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
          onToggleSidebar={() =>
            setActivePanel((previous) => (previous === 'lore' ? null : 'lore'))
          }
          userId={user?.uid}
          userCredits={currentCredits}
          onCreditDeducted={updateUserCreditsState}
        />
      </ResizableEditorWorkspace>
      {personaDialog && user && (
        <ChapterPersonaDialog
          ownerId={user.uid}
          bookPersonaId={book.personaId}
          complement={chapter.personaComplement}
          error={personaError}
          instruction={writingPersona.instruction}
          onRetry={() => {
            library.retry();
            setBindingAttempt((value) => value + 1);
          }}
          onClose={() => {
            setPersonaDialog(false);
            requestAnimationFrame(() => personaButton.current?.focus());
          }}
          onSaveBook={async (personaId) => {
            await updateBook(book.id, { personaId });
            setBook((previous) => (previous ? { ...previous, personaId } : previous));
          }}
          onSaveChapter={async (personaComplement) => {
            await updateChapter(book.id, chapter.id, { personaComplement });
            setChapter((previous) => (previous ? { ...previous, personaComplement } : previous));
          }}
        />
      )}
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
