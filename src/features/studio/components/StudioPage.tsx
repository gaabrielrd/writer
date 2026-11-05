import { PersonalizedWelcome } from '@/features/onboarding';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Plus,
  Upload,
  ArchiveRestore,
  BookOpen,
  ScrollText,
  FolderOpen,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { BookRestoreDialog, BookRestorePreparations } from '@/features/book-portability';
import {
  AdventureRestoreDialog,
  AdventureRestorePreparations,
} from '@/features/adventure-portability';
import { AdventureDeletionPreparations, getAdventure } from '@/features/adventures';
import { ContinueWorkPanel } from '@/features/work-progress';
import { useAuth } from '@/features/auth';
import { AdventureImportDialog, AdventureImportPreparations } from '@/features/adventure-import';
import { CampaignCapturePreparations } from '@/features/campaign-bases';
import { CampaignDeletionPreparations } from '@/features/campaigns';
import {
  CampaignComparisonPreparations,
  type ComparisonReadEnvelope,
} from '@/features/campaign-comparisons';
import {
  CampaignAdoptionDialog,
  CampaignAdoptionPreparations,
} from '@/features/campaign-adoptions';
import { ImportBookModal, getBook } from '@/features/books';
import {
  Button,
  Card,
  FilterChips,
  LoadingState,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/ui';
import { projectKinds, projectLabels } from '../model/project';
import { StudioProjectSection } from './StudioProjectSection';
import styles from './StudioPage.module.css';

import {
  studioDestination,
  studioDestinations,
  type StudioSection,
} from '../model/studioNavigation';

const operationTabs = [
  { value: 'imports', label: 'Importações e restaurações' },
  { value: 'campaigns', label: 'Campanhas' },
  { value: 'deletions', label: 'Exclusões' },
] as const;

function StudioSession({ ownerId, section }: { ownerId: string; section: StudioSection }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selectedKind = params.get('kind');
  const kind = projectKinds.find((value) => value === selectedKind) ?? 'all';
  const operationTab =
    operationTabs.find((tab) => tab.value === params.get('tab'))?.value ?? 'imports';
  const [operationsLoaded, setOperationsLoaded] = useState(section === 'operations');
  if (section === 'operations' && !operationsLoaded) setOperationsLoaded(true);
  const destination = studioDestinations.find((item) => item.id === section)!;
  const [importOpen, setImportOpen] = useState(false);
  const [adventureImportOpen, setAdventureImportOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false),
    [restoreId, setRestoreId] = useState<string | undefined>(),
    [restoreRevision, setRestoreRevision] = useState(0);
  const [adventureRestoreOpen, setAdventureRestoreOpen] = useState(false),
    [adventureRestoreId, setAdventureRestoreId] = useState<string | undefined>(),
    [adventureRestoreRevision, setAdventureRestoreRevision] = useState(0);
  const [adoption, setAdoption] = useState<ComparisonReadEnvelope | null>(null),
    [adoptionOpen, setAdoptionOpen] = useState(false),
    [adoptionAttempt, setAdoptionAttempt] = useState(0);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <div className={styles.page}>
      <PageHeader
        title={destination.title}
        description={section === 'home' ? undefined : destination.description}
        actions={
          (section === 'home' || section === 'projects') && (
            <Button onClick={() => void navigate('/studio/new')}>
              <Plus className="icon icon-sm" aria-hidden="true" />
              Novo projeto
            </Button>
          )
        }
      />
      {section === 'home' && (
        <>
          <PersonalizedWelcome />
          <div className={styles.homeGrid}>
            <ContinueWorkPanel compact />
            <aside className={styles.homeAside} aria-label="Atalhos do Estúdio">
              <Card className={styles.homeCard}>
                <h2>Acesso rápido</h2>
                <Link to="/studio/projects" className={styles.shortcut}>
                  <FolderOpen className="icon icon-sm" aria-hidden="true" />
                  <span>Ver meus projetos</span>
                  <ArrowRight className="icon icon-sm" aria-hidden="true" />
                </Link>
                <Link to="/studio/import" className={styles.shortcut}>
                  <Upload className="icon icon-sm" aria-hidden="true" />
                  <span>Importar ou restaurar</span>
                  <ArrowRight className="icon icon-sm" aria-hidden="true" />
                </Link>
                <Link to="/studio/operations" className={styles.shortcut}>
                  <Activity className="icon icon-sm" aria-hidden="true" />
                  <span>Ver operações em andamento</span>
                  <ArrowRight className="icon icon-sm" aria-hidden="true" />
                </Link>
              </Card>
            </aside>
          </div>
        </>
      )}
      <div hidden={section !== 'projects'} className={styles.sectionBody}>
        {section === 'projects' && (
          <>
            <FilterChips
              label="Tipo de projeto"
              value={kind}
              onValueChange={(type) => {
                const next = new URLSearchParams(params);
                if (type === 'all') next.delete('kind');
                else next.set('kind', type);
                setParams(next);
              }}
              options={(['all', ...projectKinds] as const).map((type) => ({
                value: type,
                label: type === 'all' ? 'Todos' : projectLabels[type],
              }))}
            />
            {projectKinds
              .filter((type) => kind === 'all' || type === kind)
              .map((type) => (
                <StudioProjectSection key={type} kind={type} />
              ))}
          </>
        )}
      </div>
      {section === 'import' && (
        <>
          <section className={styles.toolSection} aria-labelledby="studio-import-title">
            <h2 id="studio-import-title">Importar documento</h2>
            <div className={styles.toolGrid}>
              <Card className={styles.toolCard}>
                <BookOpen className="icon" aria-hidden="true" />
                <h3>Livro</h3>
                <p>Revise um documento e transforme seu conteúdo em capítulos.</p>
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  Importar livro
                </Button>
              </Card>
              <Card className={styles.toolCard}>
                <ScrollText className="icon" aria-hidden="true" />
                <h3>Aventura</h3>
                <p>Revise o material importado antes de criar uma aventura particular.</p>
                <Button variant="secondary" onClick={() => setAdventureImportOpen(true)}>
                  Importar aventura
                </Button>
              </Card>
            </div>
          </section>
          <section className={styles.toolSection} aria-labelledby="studio-restore-title">
            <h2 id="studio-restore-title">Restaurar backup</h2>
            <div className={styles.toolGrid}>
              <Card className={styles.toolCard}>
                <ArchiveRestore className="icon" aria-hidden="true" />
                <h3>Backup de livro</h3>
                <p>Confira o arquivo e restaure uma nova cópia privada do livro.</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRestoreId(undefined);
                    setRestoreOpen(true);
                  }}
                >
                  Restaurar backup de livro
                </Button>
              </Card>
              <Card className={styles.toolCard}>
                <ArchiveRestore className="icon" aria-hidden="true" />
                <h3>Backup de aventura</h3>
                <p>Recupere uma aventura em nova cópia, com revisão antes da finalização.</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAdventureRestoreId(undefined);
                    setAdventureRestoreOpen(true);
                  }}
                >
                  Restaurar backup de aventura
                </Button>
              </Card>
            </div>
          </section>
          <p className={styles.hint}>
            Já começou um pedido?{' '}
            <Link to="/studio/operations">Acompanhar operações em andamento</Link>
          </p>
        </>
      )}
      <div hidden={section !== 'operations'} className={styles.sectionBody}>
        {operationsLoaded && (
          <Tabs
            value={operationTab}
            onValueChange={(tab) => {
              const next = new URLSearchParams(params);
              next.set('tab', tab);
              setParams(next);
            }}
          >
            <TabsList aria-label="Operações em andamento">
              {operationTabs.map(({ value, label }) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="imports" forceMount hidden={operationTab !== 'imports'}>
              <section className={styles.toolSection} aria-label="Importações e restaurações">
                <h2>Importações e restaurações</h2>
                <div className={styles.operationPanels}>
                  <div>
                    <BookRestorePreparations
                      ownerId={ownerId}
                      revision={restoreRevision}
                      onResume={(id) => {
                        setRestoreId(id);
                        setRestoreOpen(true);
                      }}
                    />
                  </div>
                  <div>
                    <AdventureRestorePreparations
                      ownerId={ownerId}
                      revision={adventureRestoreRevision}
                      onResume={(id) => {
                        setAdventureRestoreId(id);
                        setAdventureRestoreOpen(true);
                      }}
                    />
                  </div>
                  <div>
                    <AdventureImportPreparations
                      onActivated={(id) => {
                        if (active.current) void navigate('/adventures/' + encodeURIComponent(id));
                      }}
                    />
                  </div>
                </div>
              </section>
            </TabsContent>
            <TabsContent value="campaigns" forceMount hidden={operationTab !== 'campaigns'}>
              <section className={styles.toolSection} aria-label="Operações de campanhas">
                <h2>Campanhas</h2>
                <div className={styles.operationPanels}>
                  <div>
                    <CampaignComparisonPreparations
                      onReviewAdoption={(context) => {
                        setAdoption({ ...context });
                        setAdoptionAttempt((n) => n + 1);
                        setAdoptionOpen(true);
                      }}
                    />
                  </div>
                  <div>
                    <CampaignAdoptionPreparations />
                  </div>

                  <div>
                    <CampaignCapturePreparations
                      onActivated={(id) => void navigate('/campaigns/' + encodeURIComponent(id))}
                    />
                  </div>
                </div>
              </section>
            </TabsContent>
            <TabsContent value="deletions" forceMount hidden={operationTab !== 'deletions'}>
              <section className={styles.toolSection} aria-label="Exclusões em andamento">
                <h2>Exclusões</h2>
                <div className={styles.operationPanels}>
                  <div>
                    <AdventureDeletionPreparations />
                  </div>
                  <div>
                    <CampaignDeletionPreparations />
                  </div>
                </div>
              </section>
            </TabsContent>
          </Tabs>
        )}
      </div>
      <BookRestoreDialog
        ownerId={ownerId}
        open={restoreOpen}
        restoreId={restoreId}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreRevision((n) => n + 1);
        }}
        onOpenBook={async (id, guard) => {
          const book = await getBook(id, { source: 'server' });
          guard();
          if (!active.current) return;
          if (!book || book.authorId !== ownerId || book.deleting)
            throw new Error('Este livro não está disponível para abrir.');
          void navigate('/books/' + encodeURIComponent(id));
        }}
      />

      <AdventureRestoreDialog
        ownerId={ownerId}
        open={adventureRestoreOpen}
        restoreId={adventureRestoreId}
        onClose={() => {
          setAdventureRestoreOpen(false);
          setAdventureRestoreRevision((n) => n + 1);
        }}
        onOpenAdventure={async (id, guard) => {
          const adventure = await getAdventure(id);
          guard();
          if (!active.current) return;
          if (!adventure || adventure.ownerId !== ownerId)
            throw new Error('Esta aventura não está disponível para abrir.');
          void navigate('/adventures/' + encodeURIComponent(id));
        }}
      />

      <AdventureImportDialog
        open={adventureImportOpen}
        onClose={() => setAdventureImportOpen(false)}
        onActivated={(id) => {
          if (active.current) void navigate('/adventures/' + encodeURIComponent(id));
        }}
      />

      {adoption && (
        <CampaignAdoptionDialog
          key={adoptionAttempt}
          selection={{ campaignId: adoption.campaignId, context: adoption }}
          open={adoptionOpen}
          onClose={() => setAdoptionOpen(false)}
        />
      )}

      <ImportBookModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        authorId={ownerId}
        onSuccess={(id) => {
          if (active.current) void navigate('/books/' + encodeURIComponent(id));
        }}
      />
    </div>
  );
}
export function StudioPage() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const destination = studioDestination(pathname);
  if (loading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!destination) return <Navigate to="/studio" replace />;
  return <StudioSession key={user.uid} ownerId={user.uid} section={destination.id} />;
}
