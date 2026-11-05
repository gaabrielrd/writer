import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams, useLocation } from 'react-router';
import {
  ArrowLeft,
  DatabaseBackup,
  Globe,
  History,
  MoreHorizontal,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  AdventurePersonaDialog,
  readEditorChatOperation,
  subscribeEditorChatOperation,
} from '@/features/ai-assistant';
import { AdventureBackupDialog } from '@/features/adventure-portability';
import {
  AdventureDeletionDialog,
  isAdventureDeletionId,
  type AdventureDeletionProgress,
} from '@/features/adventure-deletions';
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
  Dropdown,
  DropdownItem,
  EmptyState,
  ErrorState,
  LoadingState,
  ObjectHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  buttonVariants,
} from '@/shared/ui';
import type { Adventure } from '../model/adventure';
import { getAdventure } from '../services/adventureService';
import styles from './AdventurePage.module.css';

function AdventureDetail({ id, ownerId }: { id: string; ownerId: string }) {
  const studioReturnState = useLocation().state as { studioReturnTo?: unknown } | null;
  const studioReturnTo =
    typeof studioReturnState?.studioReturnTo === 'string' &&
    /^\/studio\/projects(?:\?|$)/.test(studioReturnState.studioReturnTo)
      ? studioReturnState.studioReturnTo
      : '/studio/projects';
  const { setPendingEditorOperation } = useAuth();
  const navigate = useNavigate();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [revoked, setRevoked] = useState<AdventureDeletionProgress | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
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
  const pending = !revoked && (loreBusy || personaBusy || personaJournal !== 'clear');
  useEffect(() => {
    setPendingEditorOperation(pending);
    return () => setPendingEditorOperation(false);
  }, [pending, setPendingEditorOperation]);
  const tabs = ['scenes', 'narrative', 'progress', 'lore'] as const;
  const requestedTab = searchParams.get('tab');
  const activeTab = tabs.find((tab) => tab === requestedTab) ?? 'scenes';
  const selectTab = (tab: 'scenes' | 'narrative' | 'progress' | 'lore') =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('tab', tab);
        return next;
      },
      { state: studioReturnState },
    );
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
    enabled: Boolean(!revoked && result?.adventure && result.adventure.ownerId === ownerId),
  });
  const back = (
    <Link to={studioReturnTo} className={buttonVariants({ variant: 'secondary' })}>
      Voltar aos projetos
    </Link>
  );
  const recovery =
    !revoked && personaJournal !== 'clear' ? (
      <Button variant="outline" onClick={() => setPersonaOpen(true)}>
        Recuperar pedido de persona
      </Button>
    ) : null;
  let content;
  if (revoked)
    content = (
      <div className={styles.page}>
        <EmptyState
          title="Acesso à aventura encerrado"
          description="A exclusão foi confirmada. A limpeza pode ser retomada sem reabrir o conteúdo original."
          action={
            <>
              {back}
              <Button variant="outline" onClick={() => setDeletionOpen(true)}>
                Consultar exclusão desta aventura
              </Button>
            </>
          }
        />
      </div>
    );
  else if (!result || (result.error && result.attempt !== attempt))
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
        {isAdventureDeletionId(id) && (
          <Button variant="outline" onClick={() => setDeletionOpen(true)}>
            Consultar exclusão desta aventura
          </Button>
        )}
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
        <AdventureBackupDialog
          open={backupOpen}
          onClose={() => setBackupOpen(false)}
          ownerId={ownerId}
          adventureId={adventure.id}
          title={adventure.title}
        />
        <WorkHistoryDialog
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          target={{ kind: 'adventure', id: adventure.id }}
        />
        <Link to={studioReturnTo} className={styles.backLink}>
          <ArrowLeft className="icon icon-sm" aria-hidden="true" />
          Voltar aos projetos
        </Link>
        <ObjectHeader
          kind={
            adventure.origin.kind === 'imported' ? 'Aventura · importada' : 'Aventura · autoral'
          }
          title={adventure.title}
          meta={
            <>
              <Badge variant="neutral">{status}</Badge>
              {adventure.status === 'archived' && <Badge variant="secondary">Arquivada</Badge>}
              <Badge variant="outline">Privada</Badge>
              {adventure.universeId ? (
                <Link
                  className={styles.universeLink}
                  to={'/universes/' + encodeURIComponent(adventure.universeId) + '/lore'}
                >
                  <Globe className="icon icon-sm" aria-hidden="true" /> Abrir universo vinculado
                </Link>
              ) : (
                <span title="Projeto independente, sem universo vinculado.">Sem universo</span>
              )}
              <span>
                Atualizada em{' '}
                <time
                  dateTime={validDate ? new Date(adventure.updatedAt).toISOString() : undefined}
                >
                  {validDate
                    ? new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(adventure.updatedAt)
                    : 'Data indisponível'}
                </time>
              </span>
            </>
          }
          description={
            <p className={styles.synopsis}>{adventure.synopsis || 'Nenhuma sinopse cadastrada.'}</p>
          }
          secondaryActions={
            <Button variant="outline" onClick={() => setCaptureOpen(true)}>
              Criar campanha desta aventura
            </Button>
          }
          menu={
            <Dropdown
              mode="action"
              label="Opções da aventura"
              align="end"
              variant="outline"
              iconOnly
              icon={<MoreHorizontal className="icon" aria-hidden="true" />}
            >
              <DropdownItem onSelect={() => setHistoryOpen(true)}>
                <History className="icon icon-sm" aria-hidden="true" />
                Histórico do texto
              </DropdownItem>
              <DropdownItem onSelect={() => setPersonaOpen(true)}>
                <UserRound className="icon icon-sm" aria-hidden="true" />
                Persona da aventura
              </DropdownItem>
              <DropdownItem disabled={pending} onSelect={() => setBackupOpen(true)}>
                <DatabaseBackup className="icon icon-sm" aria-hidden="true" />
                Backup da aventura
              </DropdownItem>
              <DropdownItem
                variant="destructive"
                disabled={pending || backupOpen || captureOpen || historyOpen || personaOpen}
                onSelect={() => setDeletionOpen(true)}
              >
                <Trash2 className="icon icon-sm" aria-hidden="true" />
                Excluir aventura
              </DropdownItem>
            </Dropdown>
          }
        />
        <CampaignCapturePreparations adventureId={adventure.id} />
        <Tabs value={activeTab} onValueChange={(value) => selectTab(value as typeof activeTab)}>
          <TabsList aria-label="Preparação da aventura">
            <TabsTrigger value="scenes">Cenas</TabsTrigger>
            <TabsTrigger value="narrative">Arcos e cronologia</TabsTrigger>
            <TabsTrigger value="progress">Progresso</TabsTrigger>
            <TabsTrigger value="lore">Compêndio</TabsTrigger>
          </TabsList>
          <TabsContent value="scenes">
            <ScenePlanner target={{ kind: 'adventure', id: adventure.id }} />
          </TabsContent>
          <TabsContent value="narrative">
            <NarrativePlanner
              key={ownerId + ':' + adventure.id + ':' + (adventure.universeId ?? 'none')}
              target={{ kind: 'adventure', id: adventure.id }}
              onProjectChange={() => setAttempt((n) => n + 1)}
            />
          </TabsContent>
          <TabsContent value="progress">
            <ProjectProgressPanel
              target={{ kind: 'adventure', id: adventure.id }}
              manuscriptRefreshKey={adventure.updatedAt}
              onProjectChange={() => setAttempt((n) => n + 1)}
            />
          </TabsContent>
          {/* Kept mounted so an unsaved lore draft survives switching sections. */}
          <TabsContent value="lore" forceMount hidden={activeTab !== 'lore'}>
            <LoreCollection
              scope={{ kind: 'adventure', id: adventure.id }}
              active={activeTab === 'lore'}
              onBusyChange={setLoreBusy}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }
  return (
    <>
      <BusyNavigationGuard busy={pending} />
      {isAdventureDeletionId(id) && (
        <AdventureDeletionDialog
          adventureId={id}
          open={deletionOpen}
          onRevoked={(value) => {
            setRevoked(value);
            setBackupOpen(false);
            setCaptureOpen(false);
            setHistoryOpen(false);
            setPersonaOpen(false);
          }}
          onClose={() => {
            setDeletionOpen(false);
            if (revoked) void navigate('/studio');
          }}
        />
      )}
      {!revoked && personaOpen && (
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
