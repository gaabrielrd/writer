import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, UNSAFE_DataRouterContext, useBlocker, useParams } from 'react-router';
import { useAuth } from '@/features/auth';
import { RichEditor } from '@/features/editor';
import {
  EditorChatWorkspace,
  type AIActionType,
  type EditorChatApplyHost,
  type EditorChatEditorBridge,
} from '@/features/ai-assistant';
import { countWords } from '@/features/books';
import {
  WorkHistoryDialog,
  readPendingWorkHistoryOperation,
  type VersionEditorAdapter,
} from '@/features/manuscript-history';
import {
  useAdventureLoreContext,
  AdventureLoreReader,
  type LoreMentionEntity,
} from '@/features/lore';
import { auth, renderRichText } from '@/shared/lib';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/shared/ui';
import {
  blockAudienceLabels,
  blockContentHash,
  blockErrorMessage,
  narrativeTypeLabels,
  sameBlockResource,
  type AdventureBlockDocument,
} from '../model/adventureBlock';
import { getAdventureBlock } from '../services/adventureBlockService';
import { useAdventureBlockDraft } from '../hooks/useAdventureBlockDraft';
import { AdventureBlockNavigator } from './AdventureBlockNavigator';
import { AdventureBlockImageEditor } from './AdventureBlockImageEditor';
import { AdventureScenePreviewDialog } from './AdventureScenePreviewDialog';
import styles from './AdventureBlocks.module.css';
export interface AdventureBlockEditorProps {
  adventureId: string;
  sceneId: string;
  blockId: string;
  returnTo?: string;
}
export function AdventureBlockEditorPage() {
  const { adventureId, sceneId, blockId } = useParams<{
    adventureId: string;
    sceneId: string;
    blockId: string;
  }>();
  return adventureId && sceneId && blockId ? (
    <AdventureBlockEditor adventureId={adventureId} sceneId={sceneId} blockId={blockId} />
  ) : (
    <EmptyState title="Bloco indisponível" />
  );
}
export function AdventureBlockEditor(props: AdventureBlockEditorProps) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando conta…" />;
  if (!user) return <EmptyState title="Entre para escrever seus blocos" />;
  return (
    <BlockLoader
      key={JSON.stringify([user.uid, props.adventureId, props.sceneId, props.blockId])}
      {...props}
      uid={user.uid}
    />
  );
}
function BlockLoader(props: AdventureBlockEditorProps & { uid: string }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    document?: AdventureBlockDocument | null;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const document = await getAdventureBlock({
          adventureId: props.adventureId,
          resource: { kind: 'block', id: props.blockId },
        });
        if (!active) return;
        if (
          !document ||
          document.sceneId !== props.sceneId ||
          !sameBlockResource(document.resource, { kind: 'block', id: props.blockId })
        ) {
          setResult({ document: null });
          return;
        }
        const hash = await blockContentHash(document.content);
        if (!active) return;
        if (hash !== document.bodyHash)
          throw new Error('Não foi possível verificar o texto deste bloco.');
        setResult({ document });
      } catch (cause) {
        if (active) setResult({ error: blockErrorMessage(cause) });
      }
    })();
    return () => {
      active = false;
    };
  }, [props.adventureId, props.sceneId, props.blockId, attempt]);
  if (!result) return <LoadingState label="Carregando bloco…" />;
  if (result.error)
    return (
      <ErrorState
        title="Não foi possível carregar o bloco"
        description={result.error}
        onRetry={() => {
          setResult(undefined);
          setAttempt((value) => value + 1);
        }}
      />
    );
  if (!result.document)
    return (
      <EmptyState
        title="Bloco indisponível"
        description="O bloco não está disponível nesta cena e conta."
      />
    );
  return <BlockSession {...props} initial={result.document} />;
}
function BlockSession({
  uid,
  adventureId,
  sceneId,
  blockId,
  returnTo,
  initial,
}: AdventureBlockEditorProps & { uid: string; initial: AdventureBlockDocument }) {
  const { user, setPendingEditorOperation } = useAuth();
  const draft = useAdventureBlockDraft(uid, adventureId, initial);
  const active = useRef(true),
    editorBusyRef = useRef(false),
    historyReserved = useRef(false),
    chatReserved = useRef(false),
    chatPendingRef = useRef(false),
    imageReservedRef = useRef(false),
    chatBridge = useRef<EditorChatEditorBridge | null>(null),
    actor = useRef(auth.currentUser);
  const [chatOpen, setChatOpen] = useState(false);
  const actionSequence = useRef(0);
  const [chatAction, setChatAction] = useState<{ id: number; action: AIActionType }>();
  const [chatBusy, setChatBusy] = useState(false);
  const [chatPending, setChatPending] = useState(false);
  const [chatDraft, setChatDraft] = useState(false);
  const live = useRef({ draft, user });
  useLayoutEffect(() => {
    live.current = { draft, user };
  });
  const onChatBridge = useCallback((bridge: EditorChatEditorBridge | null) => {
    chatBridge.current = bridge;
  }, []);
  const onChatPending = useCallback((pending: boolean) => {
    chatPendingRef.current = pending;
    if (active.current) setChatPending(pending);
  }, []);
  const onChatDraft = useCallback((dirty: boolean) => {
    if (active.current) setChatDraft(dirty);
  }, []);
  const [editorBusy, setEditorBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageReserved, setImageReserved] = useState(false);
  const onImageReservation = useCallback((reserved: boolean) => {
    imageReservedRef.current = reserved;
    if (active.current) setImageReserved(reserved);
  }, []);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [contentVersion, setContentVersion] = useState(0);
  const [historyPending, setHistoryPending] = useState(() =>
    Boolean(
      readPendingWorkHistoryOperation(
        uid,
        { kind: 'adventure', id: adventureId },
        { kind: 'block', id: blockId },
      ),
    ),
  );
  const historyPendingRef = useRef(historyPending);
  const lore = useAdventureLoreContext(adventureId);
  const entities = lore.items,
    loreError = lore.error;
  const [sidebar, setSidebar] = useState(false),
    [selected, setSelected] = useState<LoreMentionEntity | null>(null);
  const doc = draft.document;
  const externalBusy = Boolean(
    editorBusy ||
    historyBusy ||
    chatBusy ||
    historyPending ||
    draft.exclusiveBusy ||
    draft.mutation.busy ||
    draft.mutation.pending,
  );
  const operationBusy = externalBusy || chatPending;
  const dirty = draft.status !== 'saved' || Boolean(draft.recovery);
  const principalPath = `/adventures/${encodeURIComponent(adventureId)}/scenes/${encodeURIComponent(sceneId)}`;
  const returnPath =
    returnTo?.startsWith(`/adventures/${encodeURIComponent(adventureId)}`) &&
    !/[\r\n\\]/.test(returnTo)
      ? returnTo
      : principalPath;
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setPendingEditorOperation(operationBusy || dirty || chatDraft);
    return () => setPendingEditorOperation(false);
  }, [operationBusy, dirty, chatDraft, setPendingEditorOperation]);
  useEffect(() => {
    if (!operationBusy && !chatDraft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [operationBusy, chatDraft]);
  const onHistoryPending = useCallback((pending: boolean) => {
    if (active.current) {
      historyPendingRef.current = pending;
      setHistoryPending(pending);
    }
  }, []);
  const historyAdapter: VersionEditorAdapter = {
    resource: { kind: 'block', id: blockId },
    destinationAudience: blockAudienceLabels[doc.audience] ?? blockAudienceLabels.creator,
    blockedReason:
      operationBusy || dirty
        ? 'Confirme o salvamento e resolva operações pendentes antes de guardar ou restaurar uma versão.'
        : undefined,
    getConfirmedContent: draft.getConfirmedContent,
    runExclusive: async (work, options) => {
      if (
        !active.current ||
        user?.uid !== uid ||
        editorBusyRef.current ||
        historyReserved.current ||
        chatReserved.current ||
        chatPendingRef.current ||
        draft.mutation.isReserved() ||
        (historyPendingRef.current && !options?.recovery)
      )
        throw new Error('Resolva as operações pendentes antes de continuar.');
      historyReserved.current = true;
      setHistoryBusy(true);
      try {
        return await draft.runExclusive(work);
      } finally {
        historyReserved.current = false;
        if (active.current) setHistoryBusy(false);
      }
    },
    acceptRestored: (source) => {
      if (
        !active.current ||
        !historyReserved.current ||
        user?.uid !== uid ||
        source.target.kind !== 'adventure' ||
        source.target.id !== adventureId ||
        source.resource.kind !== 'block' ||
        source.resource.id !== blockId ||
        source.revision === null ||
        typeof source.sceneWordCount !== 'number'
      )
        throw new Error('Esta confirmação não pertence ao bloco aberto.');
      draft.acceptConfirmedContent({
        content: source.content,
        revision: source.revision,
        sceneWordCount: source.sceneWordCount,
        bodyHash: source.contentHash,
        wordCount: countWords(source.content),
      });
      setContentVersion((value) => value + 1);
    },
  };
  const runNavigatorExclusive: NonNullable<VersionEditorAdapter['runExclusive']> = async (
    work,
    options,
  ) => {
    if (
      !active.current ||
      historyReserved.current ||
      historyPendingRef.current ||
      chatReserved.current ||
      chatPendingRef.current ||
      editorBusyRef.current
    )
      throw new Error('Resolva as operações pendentes antes de alterar os blocos.');
    return draft.runExclusive(work, options);
  };
  const chatHost = useMemo<EditorChatApplyHost>(() => {
    const checkCurrent = () => {
      if (
        !active.current ||
        !actor.current ||
        auth.currentUser !== actor.current ||
        actor.current.uid !== uid ||
        live.current.user?.uid !== uid ||
        live.current.draft.deleted
      )
        throw new Error('O bloco ou a conta mudou. Confira o estado antes de continuar.');
    };
    const acceptConfirmed: EditorChatApplyHost['acceptConfirmed'] = (source) => {
      checkCurrent();
      if (
        !chatReserved.current ||
        source.target.kind !== 'adventure' ||
        source.target.id !== adventureId ||
        source.resource.kind !== 'block' ||
        source.resource.id !== blockId ||
        source.revision === null ||
        !Number.isSafeInteger(source.sceneWordCount) ||
        source.sceneWordCount! < 0
      )
        throw new Error('Esta confirmação não pertence ao bloco aberto.');
      live.current.draft.acceptConfirmedContent({
        content: source.content,
        revision: source.revision,
        sceneWordCount: source.sceneWordCount!,
        bodyHash: source.contentHash,
        wordCount: countWords(source.content),
      });
    };
    return {
      target: { kind: 'adventure', id: adventureId },
      resource: { kind: 'block', id: blockId },
      checkCurrent,
      getConfirmedSnapshot: () => {
        checkCurrent();
        return live.current.draft.getConfirmedSnapshot();
      },
      getBridge: () => chatBridge.current,
      runExclusive: async (work) => {
        checkCurrent();
        if (
          chatReserved.current ||
          historyReserved.current ||
          historyPendingRef.current ||
          editorBusyRef.current ||
          imageReservedRef.current ||
          live.current.draft.mutation.isReserved()
        )
          throw new Error('Resolva as operações do bloco antes de continuar.');
        chatReserved.current = true;
        setChatBusy(true);
        try {
          return await live.current.draft.runExclusive(async () => {
            checkCurrent();
            const result = await work();
            checkCurrent();
            return result;
          });
        } finally {
          chatReserved.current = false;
          if (active.current) setChatBusy(false);
        }
      },
      acceptConfirmed,
      prepareAdoption: async (source) => {
        checkCurrent();
        if (
          !chatReserved.current ||
          source.target.kind !== 'adventure' ||
          source.target.id !== adventureId ||
          source.resource.kind !== 'block' ||
          source.resource.id !== blockId ||
          source.revision === null ||
          !Number.isSafeInteger(source.sceneWordCount) ||
          source.sceneWordCount! < 0
        )
          throw new Error('Esta confirmação não pertence ao bloco aberto.');
        const confirmed = {
          ...source,
          target: { ...source.target },
          resource: { ...source.resource },
        };
        const full = await getAdventureBlock({
          adventureId,
          resource: { kind: 'block', id: blockId },
        });
        checkCurrent();
        if (
          !full ||
          full.sceneId !== sceneId ||
          full.resource.kind !== 'block' ||
          full.resource.id !== blockId ||
          full.revision !== confirmed.revision ||
          full.content !== confirmed.content ||
          full.bodyHash !== confirmed.contentHash ||
          full.sceneWordCount !== confirmed.sceneWordCount
        )
          throw new Error(
            'Os totais e o texto confirmado mudaram. Confira o bloco antes de continuar.',
          );
        const bodyHash = await blockContentHash(full.content);
        checkCurrent();
        if (bodyHash !== confirmed.contentHash)
          throw new Error('Não foi possível conferir o texto confirmado.');
        return () => {
          checkCurrent();
          acceptConfirmed(confirmed);
          live.current.draft.acceptMetadata(full, full);
        };
      },
    };
  }, [uid, adventureId, sceneId, blockId]);
  return (
    <main className={styles.page}>
      <EditorChatWorkspace
        uid={uid}
        host={chatHost}
        open={chatOpen}
        requestAction={chatAction}
        onClose={() => setChatOpen(false)}
        onPendingChange={onChatPending}
        onDraftChange={onChatDraft}
        invalidationKey={JSON.stringify([lore.context?.generation ?? null, lore.error])}
        disabledReason={
          draft.deleted
            ? 'O bloco não está mais disponível. Você ainda pode conferir pedidos e excluir os controles do chat.'
            : dirty
              ? 'Confirme o salvamento do bloco antes de preparar ou aplicar sugestões.'
              : externalBusy || historyPending
                ? 'Resolva a operação do bloco antes de preparar ou aplicar sugestões.'
                : undefined
        }
      />
      <BlockNavigationGuard
        busy={operationBusy}
        dirty={dirty || chatDraft}
        storageError={draft.storageError}
        chatDraft={chatDraft}
      />
      {draft.deleted ? (
        <EmptyState
          title="Bloco removido"
          description="O histórico permanece disponível no projeto."
          action={
            <>
              <Link to={principalPath}>Voltar à cena</Link>
              <Button variant="outline" onClick={() => setChatOpen(true)}>
                Conferir assistente
              </Button>
            </>
          }
        />
      ) : (
        <>
          <WorkHistoryDialog
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            target={{ kind: 'adventure', id: adventureId }}
            resource={historyAdapter.resource}
            editor={historyAdapter}
            onPendingChange={onHistoryPending}
          />
          <AdventureScenePreviewDialog
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            adventureId={adventureId}
            sceneId={sceneId}
          />
          <PageHeader
            title={doc.title}
            description={doc.adventureTitle + ' · ' + doc.sceneTitle}
            breadcrumbs={<Link to={returnPath}>Voltar à cena</Link>}
            actions={
              <div className={styles.actions}>
                <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                  Prévia da cena
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    editorBusy ||
                    chatBusy ||
                    chatPending ||
                    historyBusy ||
                    imageReserved ||
                    draft.mutation.busy ||
                    Boolean(draft.mutation.pending)
                  }
                  onClick={() => setHistoryOpen(true)}
                >
                  Histórico do bloco
                </Button>
              </div>
            }
          />
          <div className={styles.actions}>
            <Badge>{blockAudienceLabels[doc.audience] ?? blockAudienceLabels.creator}</Badge>
            <Badge variant="secondary">{narrativeTypeLabels[doc.narrativeType]}</Badge>
            {doc.archived && <Badge variant="outline">Bloco arquivado</Badge>}
            {doc.sceneArchived && <Badge variant="outline">Cena arquivada</Badge>}
            <span role="status">
              {draft.mutation.pending
                ? 'Não confirmado'
                : draft.mutation.busy
                  ? 'Salvando…'
                  : draft.status === 'saved'
                    ? 'Salvo'
                    : draft.status === 'conflict'
                      ? 'Conflito de revisão'
                      : draft.status === 'error'
                        ? 'Salvamento não confirmado'
                        : 'Não salvo'}
            </span>
          </div>
          <p className={styles.hint}>
            {doc.wordCount.toLocaleString('pt-BR')} palavras confirmadas neste bloco ·{' '}
            {doc.sceneWordCount.toLocaleString('pt-BR')} palavras confirmadas na cena.
          </p>
          <p className={styles.hint}>
            A audiência organiza o material, sem publicar ou conceder acesso. O texto privado também
            conta na meta atual.
          </p>
          <AdventureBlockImageEditor
            adventureId={adventureId}
            sceneId={sceneId}
            resource={doc.resource}
            revision={doc.revision}
            disabled={dirty || operationBusy}
            runExclusive={runNavigatorExclusive}
            operationController={draft.mutation}
            onReservationChange={onImageReservation}
          />
          {draft.storageError && (
            <Alert variant="warning">
              Não foi possível preservar o rascunho neste navegador. Mantenha a página aberta até
              confirmar o salvamento.
            </Alert>
          )}
          {draft.mutation.pending && (
            <Alert variant="warning">
              O texto ainda não foi confirmado. Confirme o mesmo pedido antes de continuar.
              <Button disabled={draft.mutation.busy} onClick={() => void draft.mutation.recover()}>
                Confirmar operação do bloco
              </Button>
            </Alert>
          )}
          {draft.recovery ? (
            <Alert variant="warning">
              Há um rascunho local diferente do texto confirmado.
              <div className={styles.actions}>
                <Button disabled={operationBusy} onClick={draft.recoverDraft}>
                  Recuperar rascunho do bloco
                </Button>
                <Button variant="outline" disabled={operationBusy} onClick={draft.discardDraft}>
                  Usar texto confirmado
                </Button>
              </div>
            </Alert>
          ) : (
            <div className={styles.paper}>
              <RichEditor
                documentId={JSON.stringify([uid, adventureId, sceneId, blockId])}
                ariaLabel="Área de escrita do bloco"
                chapterTitle={doc.title}
                bookTitle={doc.adventureTitle}
                content={draft.content}
                onChange={(value) => {
                  if (
                    !historyReserved.current &&
                    !historyPendingRef.current &&
                    !chatReserved.current &&
                    !editorBusyRef.current
                  )
                    draft.change(value);
                }}
                entities={entities}
                isLoreActive={() => Boolean(lore.context && lore.isCurrent(lore.context))}
                onSelectEntity={setSelected}
                isSidebarOpen={sidebar}
                onToggleSidebar={() => setSidebar((value) => !value)}
                aiCapabilities={{ chat: true, autocomplete: false, legacyActions: false }}
                loreMatcher="editor-chat-v1"
                onEditorChatBridge={onChatBridge}
                onOpenChat={(action) => {
                  if (action) setChatAction({ id: ++actionSequence.current, action });
                  setChatOpen(true);
                }}
                chatOpen={chatOpen}
                chatUnavailableReason={
                  dirty || externalBusy
                    ? 'Confirme o texto e resolva a operação do bloco antes de usar este contexto.'
                    : null
                }
                aiUnavailableReason="Use o assistente de escrita para conversar sobre este bloco."
                externalBusy={externalBusy}
                externalContentVersion={contentVersion}
                onBusyChange={(value) => {
                  editorBusyRef.current = value;
                  setEditorBusy(value);
                }}
                userId={uid}
                userCredits={user?.credits}
              />
            </div>
          )}
          {(draft.error || draft.mutation.error) && (
            <ErrorState
              title={
                draft.status === 'conflict' ? 'O texto remoto mudou' : 'Salvamento não confirmado'
              }
              description={draft.error || draft.mutation.error}
              action={
                draft.status === 'conflict' ? (
                  <Button disabled={operationBusy} onClick={() => void draft.compare()}>
                    Comparar texto do bloco
                  </Button>
                ) : (
                  <Button disabled={operationBusy} onClick={() => void draft.save()}>
                    Tentar salvar bloco
                  </Button>
                )
              }
            />
          )}
          {loreError && <Alert variant="warning">{loreError}</Alert>}
          {sidebar && (
            <section aria-label="Lore autorizado">
              <h2>Lore autorizado</h2>
              {entities.length ? (
                entities.map((entity) => (
                  <Button key={entity.id} variant="ghost" onClick={() => setSelected(entity)}>
                    {entity.name}
                  </Button>
                ))
              ) : (
                <p className={styles.hint}>Nenhuma ficha disponível neste universo.</p>
              )}
            </section>
          )}
          <AdventureBlockNavigator
            key={contentVersion}
            adventureId={adventureId}
            sceneId={sceneId}
            activeResource={initial.resource}
            sceneRevision={doc.sceneRevision}
            disabled={dirty || operationBusy || imageReserved}
            runExclusive={runNavigatorExclusive}
            operationController={draft.mutation}
          />
          {selected && (
            <AdventureLoreReader
              adventureId={adventureId}
              entityId={selected.id}
              onClose={() => setSelected(null)}
            />
          )}
          {draft.remote && (
            <Dialog
              open
              title="Comparar textos do bloco"
              description="Seu rascunho permanece preservado até você escolher."
              onClose={draft.closeComparison}
              footer={
                <>
                  <Button
                    variant="outline"
                    disabled={operationBusy}
                    onClick={() => {
                      draft.resolve(false);
                      setContentVersion((value) => value + 1);
                    }}
                  >
                    Usar texto remoto
                  </Button>
                  <Button disabled={operationBusy} onClick={() => draft.resolve(true)}>
                    Manter meu texto e salvar
                  </Button>
                </>
              }
            >
              <h3>Seu texto local</h3>
              <div
                className={styles.compare}
                dangerouslySetInnerHTML={{ __html: renderRichText(draft.content) }}
              />
              <h3>Texto remoto</h3>
              <div
                className={styles.compare}
                dangerouslySetInnerHTML={{ __html: renderRichText(draft.remote.content) }}
              />
            </Dialog>
          )}
        </>
      )}
    </main>
  );
}
function BlockNavigationGuard(props: {
  busy: boolean;
  dirty: boolean;
  storageError: boolean;
  chatDraft: boolean;
}) {
  const router = useContext(UNSAFE_DataRouterContext);
  return router ? <DataNavigationGuard {...props} /> : null;
}
function DataNavigationGuard({
  busy,
  dirty,
  storageError,
  chatDraft,
}: {
  busy: boolean;
  dirty: boolean;
  storageError: boolean;
  chatDraft: boolean;
}) {
  const blocker = useBlocker(busy || dirty);
  return blocker.state === 'blocked' ? (
    <Dialog
      open
      title={busy ? 'Operação ainda não confirmada' : 'Texto ainda não confirmado'}
      description={
        busy
          ? 'Confirme a operação pendente antes de trocar de documento.'
          : chatDraft
            ? 'A pergunta do assistente está apenas na memória e será descartada ao sair. O rascunho do bloco segue suas próprias regras de recuperação.'
            : 'Você pode continuar escrevendo ou sair preservando o rascunho deste bloco.'
      }
      onClose={() => blocker.reset()}
      footer={
        <>
          <Button variant="outline" onClick={() => blocker.reset()}>
            Continuar no bloco
          </Button>
          {!busy && (
            <Button disabled={storageError} onClick={() => blocker.proceed()}>
              {chatDraft ? 'Sair e descartar pergunta' : 'Sair mantendo rascunho'}
            </Button>
          )}
        </>
      }
    >
      <p>
        {storageError
          ? 'Não foi possível guardar o rascunho neste navegador. Confirme o salvamento antes de sair.'
          : 'O rascunho pertence a esta conta e a este bloco.'}
      </p>
    </Dialog>
  ) : null;
}
