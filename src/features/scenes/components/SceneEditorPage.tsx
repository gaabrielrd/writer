import { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { useWorkActivity, WorkActivityNotice } from '@/features/work-progress';
import { RichEditor, BusyNavigationGuard } from '@/features/editor';
import { countWords } from '@/features/books';
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
  const navigate = useNavigate();
  const location = useLocation();
  const autosave = useSceneAutosave(uid, initial);
  const [sidebar, setSidebar] = useState(false);
  const [legacyEntities, setEntities] = useState<LoreEntity[]>([]);
  const [legacyLoreError, setLoreError] = useState('');
  const [loreVersion, setLoreVersion] = useState(0);
  const [selected, setSelected] = useState<LoreMentionEntity | null>(null);
  const [leaving, setLeaving] = useState(false);
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
  const operationBusy = editorBusy || historyBusy || historyPending || blocksPending || blocksBusy;
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
    setPendingEditorOperation(operationBusy || autosave.status !== 'saved');
    return () => setPendingEditorOperation(false);
  }, [operationBusy, autosave.status, setPendingEditorOperation]);
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
  const labels = {
    saved: 'Salvo',
    dirty: 'Não salvo',
    saving: 'Salvando…',
    error: 'Não confirmado',
    conflict: 'Conflito de revisão',
  };
  return (
    <main className={styles.editor}>
      <BusyNavigationGuard busy={historyBusy || historyPending || blocksBusy || blocksPending} />
      <WorkHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        target={target}
        resource={historyAdapter.resource}
        editor={historyAdapter}
        onPendingChange={onHistoryPendingChange}
      />{' '}
      <WorkActivityNotice activity={activity} />
      <PageHeader
        title={doc.title}
        description={
          doc.project.title +
          ' · ' +
          (doc.group?.title ?? (target.kind === 'book' ? 'Sem capítulo' : 'Sem parte'))
        }
        breadcrumbs={
          <Link
            to={returnUrl}
            onClick={(event) => {
              if (blocksLock.current || blocksPendingRef.current) {
                event.preventDefault();
                return;
              }
              if (historyLock.current || historyPendingRef.current) {
                event.preventDefault();
                setHistoryOpen(true);
                return;
              }
              if (autosave.status !== 'saved' || autosave.recovery || operationBusy) {
                event.preventDefault();
                setLeaving(true);
              }
            }}
          >
            Voltar ao planejamento
          </Link>
        }
      />
      <div className={styles.toolbar}>
        <Button
          variant="outline"
          disabled={historyBusy || editorBusy || blocksBusy || blocksPending}
          onClick={() => setHistoryOpen(true)}
        >
          Histórico do texto
        </Button>{' '}
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
        A assistência de IA ainda não está disponível para cenas. Você pode escrever e formatar
        manualmente.
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
            externalBusy={historyBusy || historyPending || blocksBusy || blocksPending}
            externalContentVersion={historyContentVersion}
            onChange={(content) => {
              if (
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
            aiUnavailableReason="A assistência de IA ainda não está disponível para cenas."
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
          disabled={autosave.status !== 'saved' || operationBusy}
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
      {leaving && (
        <Dialog
          open
          title="Texto ainda não confirmado"
          description="Seu texto será oferecido como rascunho local ao voltar. Um conflito continuará exigindo comparação."
          onClose={() => setLeaving(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setLeaving(false)}>
                Continuar escrevendo
              </Button>
              <Button
                disabled={autosave.storageError || operationBusy}
                onClick={() => {
                  void navigate(returnUrl);
                }}
              >
                Sair com rascunho
              </Button>
            </>
          }
        >
          <p>
            Aguarde a confirmação para garantir que o texto esteja disponível em outros
            dispositivos.
          </p>
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
