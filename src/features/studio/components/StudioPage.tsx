import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Plus, Upload } from 'lucide-react';
import { ContinueWorkPanel } from '@/features/work-progress';
import { useAuth } from '@/features/auth';
import { CampaignCapturePreparations } from '@/features/campaign-bases';
import {
  CampaignComparisonPreparations,
  type ComparisonReadEnvelope,
} from '@/features/campaign-comparisons';
import {
  CampaignAdoptionDialog,
  CampaignAdoptionPreparations,
} from '@/features/campaign-adoptions';
import {
  BookFormDialog,
  ImportBookModal,
  createBook,
  type CreateBookInput,
} from '@/features/books';
import { Button, Dropdown, DropdownItem, LoadingState, PageHeader } from '@/shared/ui';
import { projectKinds, projectLabels, type StudioProjectKind } from '../model/project';
import { ProjectCreationDialog } from './ProjectCreationDialog';
import { StudioProjectSection } from './StudioProjectSection';
import styles from './StudioPage.module.css';

function StudioSession({ ownerId }: { ownerId: string }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<'all' | StudioProjectKind>('all');
  const [form, setForm] = useState<StudioProjectKind | null>(null);
  const [importOpen, setImportOpen] = useState(false);
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
  async function submitBook(input: CreateBookInput) {
    const book = await createBook(ownerId, input);
    if (active.current) void navigate('/books/' + encodeURIComponent(book.id));
  }
  function created(type: 'adventure' | 'campaign', id: string) {
    if (!active.current) return;
    setForm(null);
    void navigate(
      '/' + (type === 'adventure' ? 'adventures' : 'campaigns') + '/' + encodeURIComponent(id),
    );
  }
  return (
    <div className={styles.page}>
      <PageHeader
        title="Estúdio"
        description="Escreva livros, crie aventuras e prepare suas campanhas."
        actions={
          <div className={styles.actions}>
            <Dropdown
              mode="action"
              label="Novo projeto"
              trigger={
                <Button>
                  <Plus className="icon icon-sm" aria-hidden="true" />
                  Novo projeto
                </Button>
              }
            >
              <DropdownItem onSelect={() => setForm('book')}>Livro</DropdownItem>
              <DropdownItem onSelect={() => setForm('adventure')}>Aventura</DropdownItem>
              <DropdownItem onSelect={() => setForm('campaign')}>Campanha</DropdownItem>
            </Dropdown>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="icon icon-sm" aria-hidden="true" />
              Importar Documento
            </Button>
            <Button variant="secondary" onClick={() => void navigate('/books/new/assisted')}>
              Criar com IA
            </Button>
          </div>
        }
      />
      <ContinueWorkPanel />
      <CampaignComparisonPreparations
        onReviewAdoption={(context) => {
          setAdoption({ ...context });
          setAdoptionAttempt((n) => n + 1);
          setAdoptionOpen(true);
        }}
      />
      <CampaignAdoptionPreparations />
      {adoption && (
        <CampaignAdoptionDialog
          key={adoptionAttempt}
          selection={{ campaignId: adoption.campaignId, context: adoption }}
          open={adoptionOpen}
          onClose={() => setAdoptionOpen(false)}
        />
      )}
      <CampaignCapturePreparations
        onActivated={(id) => void navigate('/campaigns/' + encodeURIComponent(id))}
      />
      <div className={styles.filters}>
        <Dropdown
          mode="select"
          label="Tipo de projeto"
          value={kind}
          onValueChange={(value) => setKind(value as 'all' | StudioProjectKind)}
          options={[
            { value: 'all', label: 'Todos' },
            ...projectKinds.map((value) => ({ value, label: projectLabels[value] })),
          ]}
        />
      </div>
      {projectKinds
        .filter((type) => kind === 'all' || type === kind)
        .map((type) => (
          <StudioProjectSection key={type} kind={type} />
        ))}
      <BookFormDialog open={form === 'book'} onClose={() => setForm(null)} onSubmit={submitBook} />
      <ImportBookModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        authorId={ownerId}
        onSuccess={(id) => {
          if (active.current) void navigate('/books/' + encodeURIComponent(id));
        }}
      />
      <ProjectCreationDialog
        kind="adventure"
        open={form === 'adventure'}
        onClose={() => setForm(null)}
        onCreated={(id) => created('adventure', id)}
      />
      <ProjectCreationDialog
        kind="campaign"
        open={form === 'campaign'}
        onClose={() => setForm(null)}
        onCreated={(id) => created('campaign', id)}
      />
    </div>
  );
}
export function StudioPage() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <StudioSession key={user.uid} ownerId={user.uid} />;
}
