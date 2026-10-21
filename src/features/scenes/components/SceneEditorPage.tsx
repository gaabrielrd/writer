import { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Link, useParams, useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { useWorkActivity, WorkActivityNotice } from '@/features/work-progress';
import { RichEditor, BusyNavigationGuard } from '@/features/editor';
import { countWords } from '@/features/books';
import {
  AdventurePersonaDialog,
  EditorChatWorkspace,
  type EditorChatApplyHost,
  type EditorChatEditorBridge,
  type AIActionType,
} from '@/features/ai-assistant';
import {
  AdventureBlockNavigator,
  AdventureBlockCountRecovery,
  AdventureBlockImageEditor,
  AdventureScenePreviewDialog,
  useAdventureBlockMutation,
  type AdventureBlockNavigatorProps,
  type AdventureBlockTotals,
  type AdventureBlockSummary,
} from '@/features/adventure-blocks';
import {
  WorkHistoryDialog,
  readPendingWorkHistoryOperation,
  type VersionEditorAdapter,
} from '@/features/manuscript-history';
import {
  listLoreEntities,
  useAdventureLoreContext,
  AdventureLoreReader,
  type LoreEntity,
  type LoreMentionEntity,
} from '@/features/lore';
import { renderRichText } from '@/shared/lib/sanitizeRichText';
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
import type { SceneDocument, SceneProject } from '../model/scene';
import { sceneStageLabels } from '../model/scene';
import { getScene } from '../services/sceneService';
import { sceneErrorMessage } from '../model/sceneError';
import { useSceneResource } from '../hooks/useSceneResource';
import { useSceneAutosave } from '../hooks/useSceneAutosave';
import { SceneReferences } from './SceneReferences';
import styles from './Scenes.module.css';
export function SceneEditorPage() {
  const { bookId, adventureId, sceneId } = useParams<{
    bookId: string;
    adventureId: string;
    sceneId: string;
  }>();
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando conta…" />;
  if (!user) return <EmptyState title="Entre para escrever suas cenas" />;
  const target: SceneProject | null = bookId
    ? { kind: 'book', id: bookId }
    : adventureId
      ? { kind: 'adventure', id: adventureId }
      : null;
  if (!target || !sceneId) return <EmptyState title="Cena indisponível" />;
  return (
    <SceneEditorLoader
      key={[user.uid, target.kind, target.id, sceneId].join(':')}
      uid={user.uid}
      target={target}
      sceneId={sceneId}
    />
  );
}
function SceneEditorLoader({
  uid,
  target,
  sceneId,
}: {
  uid: string;
  target: SceneProject;
  sceneId: string;
}) {
  const request = useSceneResource(
    'scene:' + uid + ':' + target.kind + ':' + target.id + ':' + sceneId,
    () => getScene({ target, sceneId }),
  );
  if (request.loading) return <LoadingState label="Carregando cena…" />;
  if (request.error)
    return (
      <>
        <ErrorState error={request.error} onRetry={request.retry} />
        {target.kind === 'adventure' && (
          <AdventureBlockCountRecovery
            adventureId={target.id}
            sceneId={sceneId}
            onRecovered={request.retry}
          />
        )}
      </>
    );
  const document = request.value;
  if (
    !document ||
    document.ownerId !== uid ||
    document.id !== sceneId ||
    document.project.kind !== target.kind ||
    document.project.id !== target.id
  )
    return (
      <EmptyState
        title="Cena indisponível"
        description="A cena não está disponível para esta conta."
      />
    );
  return <SceneWritingSession uid={uid} initial={document} />;
}
function SceneWritingSession({ uid, initial }: { uid: string; initial: SceneDocument }) {
  const { user, setPendingEditorOperation } = useAuth();
  const location = useLocation();
  const autosave = useSceneAutosave(uid, initial);
  const [sidebar, setSidebar] = useState(false);
  const [legacyEntities, setEntities] = useState<LoreEntity[]>([]);
  const [legacyLoreError, setLoreError] = useState('');
  const [loreVersion, setLoreVersion] = useState(0);
  const [selected, setSelected] = useState<LoreMentionEntity | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const actionSequence = useRef(0);
  const [chatAction, setChatAction] = useState<{ id: number; action: AIActionType }>();
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaPending, setPersonaPending] = useState(false);
  const [personaVersion, setPersonaVersion] = useState(0);
  const [chatPending, setChatPending] = useState(false);
  const [chatDraft, setChatDraft] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const chatLock = useRef(false);
  const chatPendingRef = useRef(false);
  const chatBridge = useRef<EditorChatEditorBridge | null>(null);
  const registerChatBridge = useCallback((bridge: EditorChatEditorBridge | null) => {
    chatBridge.current = bridge;
  }, []);
  const onChatPending = useCallback((pending: boolean) => {
    chatPendingRef.current = pending;
    setChatPending(pending);
  }, []);
  const [editorBusy, setEditorBusy] = useState(false);
  const editorBusyRef = useRef(false);
  const historyLock = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyContentVersion, setHistoryContentVersion] = useState(0);
  const [historyPending, setHistoryPending] = useState(() =>
    Boolean(
      readPendingWorkHistoryOperation(
        uid,
        { kind: initial.project.kind, id: initial.project.id },
        { kind: 'scene', id: initial.id },
      ),
    ),
  );
  const historyPendingRef = useRef(historyPending);
  const [blocksPending, setBlocksPending] = useState(false);
  const [blocksBusy, setBlocksBusy] = useState(false);
  const blocksPendingRef = useRef(false);
  const blocksLock = useRef(false);
  const operationBusy =
    editorBusy || historyBusy || historyPending || blocksPending || blocksBusy || chatBusy;
  const active = useRef(true);
  const doc = autosave.document;
  const liveAutosave = useRef(autosave);
  const liveUid = useRef(user?.uid);
  useLayoutEffect(() => {
    liveAutosave.current = autosave;
    liveUid.current = user?.uid;
  }, [autosave, user?.uid]);
  const target = { kind: initial.project.kind, id: initial.project.id };
  const adventureLore = useAdventureLoreContext(target.kind === 'adventure' ? target.id : null);
  const entities: LoreMentionEntity[] =
    target.kind === 'adventure' ? adventureLore.items : legacyEntities;
  const loreError = target.kind === 'adventure' ? adventureLore.error : legacyLoreError;
  const projectUrl = `/${target.kind === 'book' ? 'books' : 'adventures'}/${encodeURIComponent(target.id)}`;
  const navigationState: unknown = location.state;
  const requestedReturn =
    typeof navigationState === 'object' && navigationState !== null && 'returnTo' in navigationState
      ? navigationState.returnTo
      : undefined;
  const returnUrl =
    typeof requestedReturn === 'string' &&
    requestedReturn.startsWith(projectUrl + '?') &&
    !/[\r\n\\]/.test(requestedReturn)
      ? requestedReturn
      : projectUrl;
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setPendingEditorOperation(
      operationBusy || personaPending || chatPending || chatDraft || autosave.status !== 'saved',
    );
    return () => setPendingEditorOperation(false);
  }, [
    operationBusy,
    personaPending,
    chatPending,
    chatDraft,
    autosave.status,
    setPendingEditorOperation,
  ]);
  useEffect(() => {
    let valid = true;
    if (target.kind === 'adventure') return;
    const requests = [];
    if (target.kind === 'book') requests.push(listLoreEntities({ kind: 'book', id: target.id }));
    if (doc.project.universeId)
      requests.push(listLoreEntities({ kind: 'universe', id: doc.project.universeId }));
    void Promise.allSettled(requests).then((results) => {
      if (!valid) return;
      setEntities(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])));
      const failed = results.find((result) => result.status === 'rejected');
      setLoreError(failed?.status === 'rejected' ? sceneErrorMessage(failed.reason) : '');
    });
    return () => {
      valid = false;
    };
  }, [target.kind, target.id, doc.project.universeId, loreVersion]);
  const activity = useWorkActivity({
    target,
    resource: { kind: 'scene', id: doc.id },
    enabled: doc.ownerId === uid && user?.uid === uid,
  });
  const historyAdapter: VersionEditorAdapter = {
    resource: { kind: 'scene', id: initial.id },
    destinationAudience:
      target.kind === 'adventure'
        ? doc.mainBlockAudience === 'players'
          ? 'Jogadores'
          : doc.mainBlockAudience === 'gm'
            ? 'Mestre'
            : 'Privado do criador'
        : undefined,
    blockedReason:
      operationBusy || autosave.status !== 'saved' || autosave.recovery
        ? 'Confirme o salvamento e resolva a recuperação antes de guardar ou restaurar uma versão.'
        : undefined,
    getConfirmedContent: autosave.getConfirmedContent,
    runExclusive: async (work, options) => {
      if (
        !active.current ||
        user?.uid !== uid ||
        editorBusyRef.current ||
        blocksLock.current ||
        blocksPendingRef.current ||
        historyLock.current ||
        chatLock.current ||
        chatPendingRef.current ||
        (historyPendingRef.current && !options?.recovery) ||
        autosave.status !== 'saved' ||
        autosave.recovery
      )
        throw new Error('Confirme o salvamento e resolva operações pendentes antes de continuar.');
      historyLock.current = true;
      setHistoryBusy(true);
      setPendingEditorOperation(true);
      try {
        return await autosave.runExclusive(async () => {
          if (!active.current || user?.uid !== uid) throw new Error('O editor aberto mudou.');
          return work();
        });
      } finally {
        historyLock.current = false;
        if (active.current) {
          setHistoryBusy(false);
          setPendingEditorOperation(historyPendingRef.current || editorBusyRef.current);
        }
      }
    },
    acceptRestored: (source) => {
      if (
        !active.current ||
        !historyLock.current ||
        user?.uid !== uid ||
        source.target.kind !== target.kind ||
        source.target.id !== target.id ||
        source.resource.kind !== 'scene' ||
        source.resource.id !== initial.id ||
        source.revision === null
      )
        throw new Error('Esta confirmação não pertence à cena aberta.');
      const mainWords = countWords(source.content);
      const words = target.kind === 'adventure' ? source.sceneWordCount : mainWords;
      if (!Number.isSafeInteger(words) || words === undefined || words < mainWords)
        throw new Error('O total confirmado da cena não pôde ser verificado.');
      autosave.acceptConfirmedContent({
        content: source.content,
        revision: source.revision,
        wordCount: words,
        ...(target.kind === 'adventure'
          ? { mainWordCount: mainWords, blockWordCount: words - mainWords }
          : {}),
        bodyHash: source.contentHash,
        bodyBytes: new TextEncoder().encode(source.content).byteLength,
      });
      setHistoryContentVersion((version) => version + 1);
    },
  };
  const onHistoryPendingChange = useCallback(
    (pending: boolean) => {
      if (!active.current) return;
      historyPendingRef.current = pending;
      setHistoryPending(pending);
      setPendingEditorOperation(
        pending ||
          historyLock.current ||
          chatLock.current ||
          chatPendingRef.current ||
          editorBusyRef.current ||
          blocksPendingRef.current ||
          blocksLock.current,
      );
    },
    [setPendingEditorOperation],
  );
  const onBlocksPendingChange = useCallback(
    (pending: boolean) => {
      if (!active.current) return;
      blocksPendingRef.current = pending;
      setBlocksPending(pending);
      setPendingEditorOperation(
        pending ||
          blocksLock.current ||
          historyLock.current ||
          chatLock.current ||
          chatPendingRef.current ||
          historyPendingRef.current ||
          editorBusyRef.current,
      );
    },
    [setPendingEditorOperation],
  );
  const onBlocksSceneChange = useCallback(
    (totals: AdventureBlockTotals, block?: AdventureBlockSummary) => {
      if (!active.current || liveUid.current !== uid) return;
      const current = liveAutosave.current;
      const main = block?.resource.kind === 'scene' ? block : undefined;
      const mainWords =
        main?.wordCount ?? current.document.mainWordCount ?? countWords(current.document.content);
      current.acceptMetadata({
        ...current.document,
        revision: totals.sceneRevision,
        wordCount: totals.sceneWordCount,
        bodyHash: totals.mainBodyHash,
        mainWordCount: mainWords,
        blockWordCount: totals.sceneWordCount - mainWords,
        blocksStructureRevision: totals.structureRevision,
        ...(main
          ? {
              mainBlockTitle: main.title,
              mainBlockType: main.narrativeType,
              mainBlockAudience: main.audience,
              mainBlockOrder: main.order,
              bodyBytes: main.bodyBytes,
            }
          : {}),
      });
    },
    [uid],
  );
  const runBlocksExclusive = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T> => {
      if (
        !active.current ||
        liveUid.current !== uid ||
        blocksLock.current ||
        chatLock.current ||
        chatPendingRef.current ||
        historyLock.current ||
        historyPendingRef.current ||
        editorBusyRef.current
      )
        throw new Error('Confirme o salvamento e as operações pendentes antes de continuar.');
      blocksLock.current = true;
      setBlocksBusy(true);
      setPendingEditorOperation(true);
      try {
        return await liveAutosave.current.runExclusive(work);
      } finally {
        blocksLock.current = false;
        if (active.current) {
          setBlocksBusy(false);
          setPendingEditorOperation(
            blocksPendingRef.current || historyPendingRef.current || editorBusyRef.current,
          );
        }
      }
    },
    [uid, setPendingEditorOperation],
  );
  const chatHost: EditorChatApplyHost = {
    target,
    resource: { kind: 'scene', id: initial.id },
    checkCurrent: () => {
      if (!active.current || liveUid.current !== uid) throw new Error('O editor aberto mudou.');
    },
    getConfirmedSnapshot: () => liveAutosave.current.getConfirmedSnapshot(),
    getBridge: () => chatBridge.current,
    runExclusive: async (work) => {
      if (
        !active.current ||
        liveUid.current !== uid ||
        chatLock.current ||
        historyLock.current ||
        historyPendingRef.current ||
        blocksLock.current ||
        blocksPendingRef.current ||
        editorBusyRef.current
      )
        throw new Error(
          'Confirme o salvamento e resolva as operações pendentes antes de continuar.',
        );
      chatLock.current = true;
      setChatBusy(true);
      try {
        return await liveAutosave.current.runExclusive(work);
      } finally {
        chatLock.current = false;
        if (active.current) setChatBusy(false);
      }
    },
    acceptConfirmed: (source) => {
      if (
        !chatLock.current ||
        !active.current ||
        liveUid.current !== uid ||
        source.revision === null
      )
        throw new Error('Esta confirmação não pertence à cena aberta.');
      const mainWords = countWords(source.content),
        words = target.kind === 'adventure' ? source.sceneWordCount : mainWords;
      if (words === undefined || !Number.isSafeInteger(words) || words < mainWords)
        throw new Error('Total da cena indisponível.');
      liveAutosave.current.acceptConfirmedContent({
        content: source.content,
        revision: source.revision,
        bodyHash: source.contentHash,
        bodyBytes: new TextEncoder().encode(source.content).byteLength,
        wordCount: words,
        ...(target.kind === 'adventure'
          ? { mainWordCount: mainWords, blockWordCount: words - mainWords }
          : {}),
      });
    },
    prepareAdoption: async (source) => {
      const fresh = await getScene({ target, sceneId: initial.id });
      if (
        !active.current ||
        liveUid.current !== uid ||
        !chatLock.current ||
        !fresh ||
        fresh.ownerId !== uid ||
        fresh.id !== initial.id ||
        fresh.project.kind !== target.kind ||
        fresh.project.id !== target.id ||
        fresh.content !== source.content ||
        fresh.revision !== source.revision ||
        fresh.bodyHash !== source.contentHash ||
        (target.kind === 'adventure' && fresh.wordCount !== source.sceneWordCount)
      )
        throw new Error('A confirmação da cena mudou. Compare o texto antes de adotar.');
      return () => {
        liveAutosave.current.acceptConfirmedContent(fresh);
        liveAutosave.current.acceptMetadata(fresh);
      };
    },
  };
  const labels = {
    saved: 'Salvo',
    dirty: 'Não salvo',
    saving: 'Salvando…',
    error: 'Não confirmado',
    conflict: 'Conflito de revisão',
  };
  return (
    <main className={styles.editor}>
      <BusyNavigationGuard
        busy={
          historyBusy ||
          historyPending ||
          blocksBusy ||
          blocksPending ||
          chatBusy ||
          chatPending ||
          personaPending
        }
        unsavedMessage={
          chatDraft || autosave.status !== 'saved' || autosave.recovery
            ? `${autosave.storageError ? 'O rascunho do manuscrito ainda não pôde ser guardado neste dispositivo.' : 'O texto do manuscrito permanece no rascunho deste dispositivo.'}${chatDraft ? ' A pergunta do assistente está só na memória e será descartada ao sair.' : ''}`
            : undefined
        }
        allowDiscard={!autosave.storageError}
        discardLabel={chatDraft ? 'Sair e descartar pergunta' : 'Sair com rascunho'}
      />
      <EditorChatWorkspace
        uid={uid}
        host={chatHost}
        open={chatOpen}
        requestAction={chatAction}
        onClose={() => setChatOpen(false)}
        onPendingChange={onChatPending}
        onDraftChange={setChatDraft}
        invalidationKey={JSON.stringify([
          loreVersion,
          personaVersion,
          adventureLore.context?.generation,
          loreError,
        ])}
        disabledReason={
          autosave.status !== 'saved' ||
          autosave.recovery ||
          historyBusy ||
          historyPending ||
          blocksBusy ||
          blocksPending ||
          chatBusy ||
          personaPending
            ? 'Confirme o salvamento e resolva operações pendentes para preparar ou aplicar.'
            : null
        }
      />
      {personaOpen && target.kind === 'adventure' && (
        <AdventurePersonaDialog
          uid={uid}
          adventureId={target.id}
          sceneId={initial.id}
          onClose={() => setPersonaOpen(false)}
          onPendingChange={setPersonaPending}
          onChanged={() => setPersonaVersion((v) => v + 1)}
        />
      )}
      <WorkHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        target={target}
        resource={historyAdapter.resource}
        editor={historyAdapter}
        onPendingChange={onHistoryPendingChange}
      />{' '}
      {chatPending && (
        <Alert variant="warning" title="Conversa com operação em andamento">
          <Button variant="outline" onClick={() => setChatOpen(true)}>
            Conferir assistente
          </Button>
        </Alert>
      )}
      <WorkActivityNotice activity={activity} />
      <PageHeader
        title={doc.title}
        description={
          doc.project.title +
          ' · ' +
          (doc.group?.title ?? (target.kind === 'book' ? 'Sem capítulo' : 'Sem parte'))
        }
        breadcrumbs={<Link to={returnUrl}>Voltar ao planejamento</Link>}
      />
      <div className={styles.toolbar}>
        <Button
          variant="outline"
          disabled={
            historyBusy || editorBusy || blocksBusy || blocksPending || chatPending || chatBusy
          }
          onClick={() => setHistoryOpen(true)}
        >
          Histórico do texto
        </Button>{' '}
        {target.kind === 'adventure' && (
          <Button
            variant="outline"
            disabled={operationBusy || chatPending || personaPending}
            onClick={() => setPersonaOpen(true)}
          >
            Persona da cena
          </Button>
        )}
        <Badge>{sceneStageLabels[doc.stage]}</Badge>
        <span role="status">{labels[autosave.status]}</span>
        <span className={styles.meta}>
          {target.kind === 'adventure'
            ? `${(doc.mainWordCount ?? doc.wordCount).toLocaleString('pt-BR')} palavras no texto principal · ${doc.wordCount.toLocaleString('pt-BR')} na cena`
            : `${doc.wordCount.toLocaleString('pt-BR')} palavras confirmadas`}
        </span>
        {doc.archived && <Badge variant="secondary">Arquivada: fora da composição</Badge>}
      </div>
      <p className={styles.hint}>
        {target.kind === 'adventure'
          ? 'O texto principal e os blocos ativos compõem a cena. A audiência prepara apenas a prévia; não compartilha o conteúdo automaticamente.'
          : 'A prosa desta cena compõe seu agrupador quando está ativa. O planejamento e as referências permanecem privados.'}
      </p>
      {target.kind === 'adventure' && (
        <AdventureSceneBlocks
          adventureId={target.id}
          sceneId={doc.id}
          sceneRevision={doc.revision}
          disabled={
            historyBusy ||
            historyPending ||
            chatBusy ||
            chatPending ||
            personaPending ||
            editorBusy ||
            autosave.status !== 'saved' ||
            Boolean(autosave.recovery)
          }
          runExclusive={runBlocksExclusive}
          onPendingChange={onBlocksPendingChange}
          onSceneChange={onBlocksSceneChange}
        />
      )}
      <Alert variant="info">
        Converse sobre esta cena pelo assistente. Autocomplete permanece indisponível. Você pode
        escrever e formatar manualmente.
      </Alert>
      {autosave.storageError && (
        <Alert variant="warning">
          Não foi possível guardar o rascunho neste navegador. Mantenha esta página aberta até
          confirmar o salvamento.
        </Alert>
      )}
      {autosave.recovery ? (
        <Alert variant="warning">
          Há um rascunho local diferente do texto confirmado. Escolha como continuar.
          <div className={styles.actions}>
            <Button disabled={operationBusy} onClick={autosave.recover}>
              Recuperar rascunho
            </Button>
            <Button disabled={operationBusy} variant="outline" onClick={autosave.discardRecovery}>
              Usar texto confirmado
            </Button>
          </div>
        </Alert>
      ) : (
        <div className={styles.paper}>
          <RichEditor
            ariaLabel="Área de escrita da cena"
            documentId={[uid, target.kind, target.id, doc.id].join(':')}
            chapterTitle={
              target.kind === 'adventure' ? (doc.mainBlockTitle ?? 'Texto principal') : doc.title
            }
            bookTitle={doc.project.title}
            placeholder="Comece a escrever sua cena aqui…"
            content={autosave.content}
            externalBusy={historyBusy || historyPending || blocksBusy || blocksPending || chatBusy}
            externalContentVersion={historyContentVersion}
            onChange={(content) => {
              if (
                !chatLock.current &&
                !historyLock.current &&
                !historyPendingRef.current &&
                !blocksLock.current &&
                !blocksPendingRef.current
              )
                autosave.change(content);
            }}
            entities={entities}
            isLoreActive={() =>
              target.kind !== 'adventure' ||
              Boolean(adventureLore.context && adventureLore.isCurrent(adventureLore.context))
            }
            onSelectEntity={setSelected}
            isSidebarOpen={sidebar}
            onToggleSidebar={() => setSidebar((value) => !value)}
            aiUnavailableReason="Autocomplete e ações legadas não estão disponíveis neste texto."
            aiCapabilities={{ chat: true, autocomplete: false, legacyActions: false }}
            chatUnavailableReason={null}
            loreMatcher="editor-chat-v1"
            onEditorChatBridge={registerChatBridge}
            onOpenChat={(action) => {
              if (action) setChatAction({ id: ++actionSequence.current, action });
              setChatOpen(true);
            }}
            chatOpen={chatOpen}
            userId={uid}
            userCredits={user?.credits}
            onBusyChange={(busy) => {
              editorBusyRef.current = busy;
              setEditorBusy(busy);
            }}
          />
        </div>
      )}
      {autosave.error && (
        <ErrorState
          title={
            autosave.status === 'conflict' ? 'O texto remoto mudou' : 'Salvamento não confirmado'
          }
          error={autosave.error}
          action={
            autosave.status === 'conflict' ? (
              <Button onClick={() => void autosave.compare()}>Comparar textos</Button>
            ) : (
              <Button
                disabled={operationBusy || autosave.status === 'saving'}
                onClick={() => void autosave.save()}
              >
                Tentar salvar novamente
              </Button>
            )
          }
        />
      )}
      {loreError && (
        <ErrorState
          title="Parte do lore está indisponível"
          error={loreError}
          onRetry={() =>
            target.kind === 'adventure'
              ? adventureLore.refresh()
              : setLoreVersion((value) => value + 1)
          }
        />
      )}
      {sidebar && (
        <SceneReferences
          document={doc}
          disabled={autosave.status !== 'saved' || operationBusy || chatPending}
          onRevision={autosave.acceptMetadata}
        />
      )}
      {selected && target.kind === 'adventure' && (
        <AdventureLoreReader
          adventureId={target.id}
          entityId={selected.id}
          onClose={() => setSelected(null)}
        />
      )}
      {selected && target.kind === 'book' && (
        <Dialog
          open
          title={selected.name}
          description="Menção textual no trecho aberto. Encontrar este nome não cria vínculo explícito nem confirma participação na história."
          onClose={() => setSelected(null)}
        >
          <p>{selected.summary}</p>
          <p>{(selected as LoreEntity).details}</p>
        </Dialog>
      )}
      {autosave.remote && (
        <Dialog
          open
          title="Comparar textos da cena"
          description="O texto local não foi substituído. Confira o texto confirmado antes de escolher."
          onClose={autosave.closeComparison}
          footer={
            <>
              <Button
                disabled={operationBusy}
                variant="outline"
                onClick={() => autosave.resolve(false)}
              >
                Usar texto remoto
              </Button>
              <Button disabled={operationBusy} onClick={() => autosave.resolve(true)}>
                Manter meu texto e salvar
              </Button>
            </>
          }
        >
          <h3>Seu texto local</h3>
          <div
            className={styles.compare}
            dangerouslySetInnerHTML={{ __html: renderRichText(autosave.content) }}
          />
          <h3>Texto remoto · revisão {autosave.remote.revision}</h3>
          <div
            className={styles.compare}
            dangerouslySetInnerHTML={{ __html: renderRichText(autosave.remote.content) }}
          />
        </Dialog>
      )}
    </main>
  );
}

function AdventureSceneBlocks({
  adventureId,
  sceneId,
  sceneRevision,
  disabled,
  runExclusive,
  onPendingChange,
  onSceneChange,
}: Pick<
  AdventureBlockNavigatorProps,
  'adventureId' | 'sceneId' | 'disabled' | 'runExclusive' | 'onPendingChange' | 'onSceneChange'
> & { sceneRevision: number }) {
  const [imageReserved, setImageReserved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const mutation = useAdventureBlockMutation(adventureId, sceneId, {
    onPendingChange,
    onResult: (result) => onSceneChange?.(result, 'block' in result ? result.block : undefined),
  });
  return (
    <>
      <AdventureBlockNavigator
        adventureId={adventureId}
        sceneId={sceneId}
        sceneRevision={sceneRevision}
        activeResource={{ kind: 'scene', id: sceneId }}
        disabled={disabled || imageReserved}
        runExclusive={runExclusive}
        operationController={mutation}
        onSceneChange={onSceneChange}
        onPendingChange={onPendingChange}
      />
      <div className={styles.actions}>
        <AdventureBlockImageEditor
          adventureId={adventureId}
          sceneId={sceneId}
          resource={{ kind: 'scene', id: sceneId }}
          revision={sceneRevision}
          disabled={disabled}
          runExclusive={runExclusive}
          operationController={mutation}
          onReservationChange={setImageReserved}
        />
        <Button
          variant="outline"
          disabled={disabled || imageReserved || mutation.busy || Boolean(mutation.pending)}
          onClick={() => setPreviewOpen(true)}
        >
          Conferir prévia da cena
        </Button>
      </div>
      <AdventureScenePreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        adventureId={adventureId}
        sceneId={sceneId}
      />
    </>
  );
}
