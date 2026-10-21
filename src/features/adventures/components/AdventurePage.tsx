import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { BookOpen, Globe, History } from 'lucide-react';
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
  const navigate = useNavigate();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loreBusy, setLoreBusy] = useState(false);
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
          setResult({
            attempt,
            adventure: null,
            error: cause instanceof Error ? cause.message : 'Tente novamente.',
          });
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
  if (!result || (result.error && result.attempt !== attempt))
    return <LoadingState label="Carregando aventura..." />;
  if (result.error)
    return (
      <ErrorState
        title="Não foi possível carregar a aventura"
        description={result.error}
        action={
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </Button>
        }
      />
    );
  if (!result.adventure)
    return (
      <EmptyState
        title="Aventura indisponível"
        description="Esta aventura não está disponível para sua conta."
        action={back}
      />
    );
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
  return (
    <div className={styles.page}>
      <BusyNavigationGuard busy={loreBusy} />
      <WorkActivityNotice activity={activity} />
      <CampaignCaptureDialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        adventureId={adventure.id}
        onActivated={(campaignId) => void navigate('/campaigns/' + encodeURIComponent(campaignId))}
      />
      <WorkHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        target={{ kind: 'adventure', id: adventure.id }}
      />
      <PageHeader
        title={adventure.title}
        description="Aventura autoral"
        breadcrumbs={<Link to="/studio">Estúdio</Link>}
        actions={
          <div className={styles.headerActions}>
            {back}
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
      <div role="tabpanel" id="adventure-tab-panel" aria-labelledby={'adventure-tab-' + activeTab}>
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
export function AdventurePage() {
  const { user, loading } = useAuth();
  const { adventureId } = useParams<{ adventureId: string }>();
  if (loading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AdventureDetail key={user.uid + ':' + adventureId} id={adventureId ?? ''} ownerId={user.uid} />
  );
}
