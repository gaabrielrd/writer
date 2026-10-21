import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { BookOpen, Globe, History, UserRound } from 'lucide-react';
import {
  AdventurePersonaDialog,
  readEditorChatOperation,
  subscribeEditorChatOperation,
} from '@/features/ai-assistant';
import { WorkHistoryDialog } from '@/features/manuscript-history';
import { LoreCollection } from '@/features/lore';
import { BusyNavigationGuard } from '@/features/editor';
import { useAuth } from '@/features/auth';
import { CampaignCaptureDialog, CampaignCapturePreparations } from '@/features/campaign-bases';
import { ScenePlanner } from '@/features/scenes';
import {
  ProjectProgressPanel,
  useWorkActivity,
  WorkActivityNotice,
  editorialStateLabels,
} from '@/features/work-progress';
import { NarrativePlanner } from '@/features/narrative-planning';
import {
  Badge,
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  buttonVariants,
} from '@/shared/ui';
import type { Adventure } from '../model/adventure';
import { getAdventure } from '../services/adventureService';
import styles from './AdventurePage.module.css';

function AdventureDetail({ id, ownerId }: { id: string; ownerId: string }) {
  const { setPendingEditorOperation } = useAuth();
  const navigate = useNavigate();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loreBusy, setLoreBusy] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaBusy, setPersonaBusy] = useState(false);
  const personaScope = useMemo(
    () => ({ target: { kind: 'adventure' as const, id }, resource: null }),
    [id],
  );
  const personaJournal = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribeEditorChatOperation(ownerId, personaScope, listener),
      [ownerId, personaScope],
    ),
    useCallback(() => {
      try {
        const row = readEditorChatOperation(ownerId, personaScope);
        return row && row.state !== 'settled' ? 'pending' : 'clear';
      } catch {
        return 'unavailable';
      }
    }, [ownerId, personaScope]),
    () => 'clear',
  );
  const pending = loreBusy || personaBusy || personaJournal !== 'clear';
  useEffect(() => {
    setPendingEditorOperation(pending);
    return () => setPendingEditorOperation(false);
  }, [pending, setPendingEditorOperation]);
  const tabs = ['scenes', 'narrative', 'progress', 'lore'] as const;
  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.find((tab) => tab === requestedTab) ?? 'scenes';
  const narrativeOpen = activeTab === 'narrative';
  const selectTab = (tab: 'scenes' | 'narrative' | 'progress' | 'lore') =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', tab);
      return next;
    });
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(activeTab);
    const next =
      tabs[
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      ]!;
    selectTab(next);
    document.getElementById('adventure-tab-' + next)?.focus();
  };
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    adventure: Adventure | null;
    error?: string;
    refreshError?: string;
  }>();
  useEffect(() => {
    let active = true;
    void getAdventure(id)
      .then((adventure) => {
        if (active)
          setResult({ attempt, adventure: adventure?.ownerId === ownerId ? adventure : null });
      })
      .catch((cause: unknown) => {
        if (active)
          setResult((previous) =>
            previous?.adventure
              ? {
                  attempt,
                  adventure: previous.adventure,
                  refreshError: cause instanceof Error ? cause.message : 'Tente novamente.',
                }
              : {
                  attempt,
                  adventure: null,
                  error: cause instanceof Error ? cause.message : 'Tente novamente.',
                },
          );
      });
    return () => {
      active = false;
    };
  }, [id, ownerId, attempt]);
  const activity = useWorkActivity({
    target: { kind: 'adventure', id },
    resource: { kind: 'project' },
    enabled: Boolean(result?.adventure && result.adventure.ownerId === ownerId),
  });
  const back = (
    <Link to="/studio" className={buttonVariants({ variant: 'secondary' })}>
      Voltar ao Estúdio
    </Link>
  );
  const recovery =
    personaJournal !== 'clear' ? (
      <Button variant="outline" onClick={() => setPersonaOpen(true)}>
        Recuperar pedido de persona
      </Button>
    ) : null;
  let content;
  if (!result || (result.error && result.attempt !== attempt))
    content = <LoadingState label="Carregando aventura..." />;
  else if (result.error)
    content = (
      <>
        <ErrorState
          title="Não foi possível carregar a aventura"
          description={result.error}
          action={
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Tentar novamente
            </Button>
          }
        />
        {recovery}
      </>
    );
  else if (!result.adventure)
    content = (
      <>
        <EmptyState
          title="Aventura indisponível"
          description="Esta aventura não está disponível para sua conta."
          action={back}
        />
        {recovery}
      </>
    );
  else {
    const adventure = result.adventure;
    const validDate =
      typeof adventure.updatedAt === 'number' &&
      Number.isFinite(adventure.updatedAt) &&
      adventure.updatedAt >= 0 &&
      adventure.updatedAt <= 8_640_000_000_000_000;
    const status =
      editorialStateLabels[
        adventure.editorialState ?? (adventure.status === 'ready' ? 'ready' : 'draft')
      ];
    content = (
      <div className={styles.page}>
        {result.refreshError && (
          <Alert variant="warning">
            Não foi possível atualizar os dados da aventura. {result.refreshError} O formulário
            aberto foi mantido.
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Tentar novamente
            </Button>
          </Alert>
        )}
        <WorkActivityNotice activity={activity} />
        <CampaignCaptureDialog
          open={captureOpen}
          onClose={() => setCaptureOpen(false)}
          adventureId={adventure.id}
          onActivated={(campaignId) =>
            void navigate('/campaigns/' + encodeURIComponent(campaignId))
          }
        />
        <WorkHistoryDialog
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          target={{ kind: 'adventure', id: adventure.id }}
        />
        <PageHeader
          title={adventure.title}
          description={
            adventure.origin.kind === 'imported' ? 'Aventura importada' : 'Aventura autoral'
          }
          breadcrumbs={<Link to="/studio">Estúdio</Link>}
          actions={
            <div className={styles.headerActions}>
              {back}
              <Button variant="outline" onClick={() => setPersonaOpen(true)}>
                <UserRound className="icon icon-sm" aria-hidden="true" />
                Persona da aventura
              </Button>
              <Button variant="outline" onClick={() => setCaptureOpen(true)}>
                Criar campanha desta aventura
              </Button>
              <Button variant="outline" onClick={() => setHistoryOpen(true)}>
                <History className="icon icon-sm" aria-hidden="true" />
                Histórico do texto
              </Button>
            </div>
          }
        />
        <div className={styles.meta}>
          <Badge variant="secondary">Aventura</Badge>
          <Badge variant="neutral">{status}</Badge>
          {adventure.status === 'archived' && <Badge variant="secondary">Arquivada</Badge>}
          <Badge variant="outline">Privada</Badge>
        </div>
        <Card className={styles.content}>
          <h2>
            <BookOpen className="icon" aria-hidden="true" /> Sinopse
          </h2>
          <p>{adventure.synopsis || 'Nenhuma sinopse cadastrada.'}</p>
          <p className={styles.date}>
            Atualizada em{' '}
            <time dateTime={validDate ? new Date(adventure.updatedAt).toISOString() : undefined}>
              {validDate
                ? new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(adventure.updatedAt)
                : 'Data indisponível'}
            </time>
          </p>
        </Card>
        <CampaignCapturePreparations adventureId={adventure.id} />
        {adventure.universeId ? (
          <Link to={'/universes/' + encodeURIComponent(adventure.universeId) + '/lore'}>
            <Globe className="icon icon-sm" aria-hidden="true" /> Abrir universo vinculado
          </Link>
        ) : (
          <p>Projeto independente, sem universo vinculado.</p>
        )}
        <div className={styles.tabs} role="tablist" aria-label="Preparação da aventura">
          <Button
            role="tab"
            aria-selected={activeTab === 'scenes'}
            onKeyDown={handleTabKey}
            id="adventure-tab-scenes"
            aria-controls="adventure-tab-panel"
            tabIndex={activeTab === 'scenes' ? 0 : -1}
            variant={activeTab === 'scenes' ? 'primary' : 'secondary'}
            onClick={() => selectTab('scenes')}
          >
            Cenas
          </Button>
          <Button
            role="tab"
            aria-selected={narrativeOpen}
            onKeyDown={handleTabKey}
            id="adventure-tab-narrative"
            aria-controls="adventure-tab-panel"
            tabIndex={narrativeOpen ? 0 : -1}
            variant={narrativeOpen ? 'primary' : 'secondary'}
            onClick={() => selectTab('narrative')}
          >
            Arcos e cronologia
          </Button>
          <Button
            role="tab"
            aria-selected={activeTab === 'progress'}
            onKeyDown={handleTabKey}
            id="adventure-tab-progress"
            aria-controls="adventure-tab-panel"
            tabIndex={activeTab === 'progress' ? 0 : -1}
            variant={activeTab === 'progress' ? 'primary' : 'secondary'}
            onClick={() => selectTab('progress')}
          >
            Progresso
          </Button>
          <Button
            role="tab"
            aria-selected={activeTab === 'lore'}
            onKeyDown={handleTabKey}
            id="adventure-tab-lore"
            aria-controls="adventure-tab-panel"
            tabIndex={activeTab === 'lore' ? 0 : -1}
            variant={activeTab === 'lore' ? 'primary' : 'secondary'}
            onClick={() => selectTab('lore')}
          >
            Lore
          </Button>
        </div>
        <div
          role="tabpanel"
          id="adventure-tab-panel"
          aria-labelledby={'adventure-tab-' + activeTab}
        >
          <div hidden={activeTab !== 'lore'}>
            <LoreCollection
              scope={{ kind: 'adventure', id: adventure.id }}
              active={activeTab === 'lore'}
              onBusyChange={setLoreBusy}
            />
          </div>
          {activeTab === 'lore' ? null : activeTab === 'progress' ? (
            <ProjectProgressPanel
              target={{ kind: 'adventure', id: adventure.id }}
              manuscriptRefreshKey={adventure.updatedAt}
              onProjectChange={() => setAttempt((n) => n + 1)}
            />
          ) : narrativeOpen ? (
            <NarrativePlanner
              key={ownerId + ':' + adventure.id + ':' + (adventure.universeId ?? 'none')}
              target={{ kind: 'adventure', id: adventure.id }}
              onProjectChange={() => setAttempt((n) => n + 1)}
            />
          ) : (
            <ScenePlanner
              target={{ kind: 'adventure', id: adventure.id }}
              projectTitle={adventure.title}
            />
          )}
        </div>
      </div>
    );
  }
  return (
    <>
      <BusyNavigationGuard busy={pending} />
      {personaOpen && (
        <AdventurePersonaDialog
          uid={ownerId}
          adventureId={id}
          sceneId={null}
          onClose={() => setPersonaOpen(false)}
          onChanged={() => setAttempt((n) => n + 1)}
          onPendingChange={setPersonaBusy}
        />
      )}
      {content}
    </>
  );
}
export function AdventurePage() {
  const { user, loading } = useAuth();
  const { adventureId } = useParams<{ adventureId: string }>();
  if (loading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AdventureDetail key={user.uid + ':' + adventureId} id={adventureId ?? ''} ownerId={user.uid} />
  );
}
