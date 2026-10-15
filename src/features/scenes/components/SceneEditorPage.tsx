import { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { useWorkActivity, WorkActivityNotice } from '@/features/work-progress';
import { RichEditor, BusyNavigationGuard } from '@/features/editor';
import { countWords } from '@/features/books';
import {
  WorkHistoryDialog,
  readPendingWorkHistoryOperation,
  type VersionEditorAdapter,
} from '@/features/manuscript-history';
import { listLoreEntities, type LoreEntity } from '@/features/lore';
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
  if (request.error) return <ErrorState error={request.error} onRetry={request.retry} />;
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
  const [entities, setEntities] = useState<LoreEntity[]>([]);
  const [loreError, setLoreError] = useState('');
  const [loreVersion, setLoreVersion] = useState(0);
  const [selected, setSelected] = useState<LoreEntity | null>(null);
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
  const operationBusy = editorBusy || historyBusy || historyPending;
  const active = useRef(true);
  const doc = autosave.document;
  const target = { kind: initial.project.kind, id: initial.project.id };
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
      autosave.acceptConfirmedContent({
        content: source.content,
        revision: source.revision,
        wordCount: countWords(source.content),
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
      setPendingEditorOperation(pending || historyLock.current || editorBusyRef.current);
    },
    [setPendingEditorOperation],
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
      <BusyNavigationGuard busy={historyBusy || historyPending} />
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
          disabled={historyBusy || editorBusy}
          onClick={() => setHistoryOpen(true)}
        >
          Histórico do texto
        </Button>{' '}
        <Badge>{sceneStageLabels[doc.stage]}</Badge>
        <span role="status">{labels[autosave.status]}</span>
        <span className={styles.meta}>
          {doc.wordCount.toLocaleString('pt-BR')} palavras confirmadas
        </span>
        {doc.archived && <Badge variant="secondary">Arquivada: fora da composição</Badge>}
      </div>
      <p className={styles.hint}>
        A prosa desta cena compõe seu agrupador quando está ativa. O planejamento e as referências
        permanecem privados.
      </p>
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
            chapterTitle={doc.title}
            bookTitle={doc.project.title}
            placeholder="Comece a escrever sua cena aqui…"
            content={autosave.content}
            externalBusy={historyBusy || historyPending}
            externalContentVersion={historyContentVersion}
            onChange={(content) => {
              if (!historyLock.current && !historyPendingRef.current) autosave.change(content);
            }}
            entities={entities}
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
          onRetry={() => setLoreVersion((value) => value + 1)}
        />
      )}
      {sidebar && (
        <SceneReferences
          document={doc}
          disabled={autosave.status !== 'saved' || operationBusy}
          onRevision={autosave.acceptMetadata}
        />
      )}
      {selected && (
        <Dialog
          open
          title={selected.name}
          description="Menção textual no trecho aberto. Encontrar este nome não cria vínculo explícito nem confirma participação na história."
          onClose={() => setSelected(null)}
        >
          <p>{selected.summary}</p>
          <p>{selected.details}</p>
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
