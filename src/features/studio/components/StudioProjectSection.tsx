import { useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, Map } from 'lucide-react';
import { editorialStateLabels, type EditorialState } from '@/features/work-progress';
import { BookCard } from '@/features/books';
import { CampaignDeletionControls } from '@/features/campaigns';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dropdown,
  DropdownItem,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/ui';
import { useStudioProjects } from '../hooks/useStudioProjects';
import {
  formatProjectDate,
  projectLabels,
  projectDateTime,
  projectPath,
  statusLabels,
  statusesByKind,
  type StudioProjectKind,
  type StudioStatus,
} from '../model/project';
import styles from './StudioPage.module.css';

export function StudioProjectSection({ kind }: { kind: StudioProjectKind }) {
  const [status, setStatus] = useState<'all' | StudioStatus>('all');
  const [editorialState, setEditorialState] = useState<'all' | EditorialState>('all');
  const { result, loading, refresh, loadMore } = useStudioProjects(kind, status, editorialState);
  const label = projectLabels[kind];
  return (
    <section className={styles.section} aria-label={label}>
      <div className={styles.sectionHeader}>
        <h2>{label}</h2>
        <div className={styles.sectionActions}>
          {kind !== 'campaign' && (
            <Dropdown
              mode="select"
              label={'Estado editorial de ' + label}
              value={editorialState}
              onValueChange={(value) => setEditorialState(value as 'all' | EditorialState)}
              options={[
                { value: 'all', label: 'Todos os estados' },
                ...(['draft', 'review', 'ready'] as const).map((value) => ({
                  value,
                  label: editorialStateLabels[value],
                })),
              ]}
            />
          )}
          <Dropdown
            mode="select"
            label={
              (kind === 'adventure'
                ? 'Condição de '
                : kind === 'book'
                  ? 'Publicação de '
                  : 'Estado de ') + label
            }
            value={status}
            onValueChange={(value) =>
              setStatus(
                kind === 'adventure' && value !== 'archived'
                  ? 'all'
                  : (value as 'all' | StudioStatus),
              )
            }
            options={[
              {
                value: 'all',
                label: kind === 'adventure' ? 'Todas as condições' : 'Todos os estados',
              },
              ...statusesByKind[kind].map((value) => ({
                value,
                label: kind === 'book' && value === 'draft' ? 'Não publicado' : statusLabels[value],
              })),
            ]}
          />
          <Button variant="ghost" onClick={refresh}>
            Atualizar {label.toLocaleLowerCase('pt-BR')}
          </Button>
        </div>
      </div>
      {loading ? (
        <div role="status">
          <LoadingState
            label={
              kind === 'book'
                ? 'Preparando e carregando seus livros...'
                : 'Carregando ' + label.toLocaleLowerCase('pt-BR') + '...'
            }
          />
          {result?.processed !== undefined && (
            <p>
              {result.processed}{' '}
              {result.processed === 1 ? 'livro verificado' : 'livros verificados'}.
            </p>
          )}
        </div>
      ) : result?.error ? (
        <ErrorState
          title={'Não foi possível carregar ' + label.toLocaleLowerCase('pt-BR')}
          description={result.error}
          action={
            <Button variant="secondary" onClick={refresh}>
              Tentar novamente
            </Button>
          }
        />
      ) : !result?.items.length ? (
        <EmptyState
          title={'Nenhum projeto nesta lista'}
          description={
            status === 'all' && editorialState === 'all'
              ? 'Seus projetos deste tipo aparecerão aqui depois de criados.'
              : 'Não há projetos neste estado. Experimente outro filtro.'
          }
        />
      ) : (
        <>
          <div className={styles.grid}>
            {result.items.map((project) => (
              <article key={project.id} className={styles.project}>
                {project.kind === 'book' ? (
                  <BookCard book={project} />
                ) : (
                  <Link className={styles.projectLink} to={projectPath(project)}>
                    <Card className={styles.projectCard} tone="raised">
                      {project.kind === 'adventure' ? (
                        <BookOpen className="icon" aria-hidden="true" />
                      ) : (
                        <Map className="icon" aria-hidden="true" />
                      )}
                      <Badge variant="secondary">
                        {project.kind === 'adventure' ? 'Aventura' : 'Campanha'}
                      </Badge>
                      <h3>{project.title}</h3>
                      <Badge variant="neutral">
                        {project.kind === 'adventure'
                          ? editorialStateLabels[
                              project.editorialState ??
                                (project.status === 'ready' ? 'ready' : 'draft')
                            ]
                          : statusLabels[project.status]}
                      </Badge>
                      {project.kind === 'adventure' && project.status === 'archived' && (
                        <Badge variant="secondary">Arquivada</Badge>
                      )}
                      <span>Abrir projeto</span>
                    </Card>
                  </Link>
                )}
                <p className={styles.updated}>
                  Atualizado em{' '}
                  <time dateTime={projectDateTime(project.updatedAt)}>
                    {formatProjectDate(project.updatedAt)}
                  </time>
                </p>
                {project.kind === 'campaign' && (
                  <CampaignDeletionControls
                    campaignId={project.id}
                    onRevoked={() => refresh()}
                    renderTrigger={(open) => (
                      <Dropdown
                        mode="action"
                        label={'Ações da campanha ' + project.title}
                        trigger={<Button variant="outline">Ações da campanha</Button>}
                      >
                        <DropdownItem onSelect={open}>Excluir campanha</DropdownItem>
                      </Dropdown>
                    )}
                  />
                )}
              </article>
            ))}
          </div>
          {result.moreError && <Alert variant="destructive">{result.moreError}</Alert>}
          {result.nextCursor && (
            <Button
              variant="secondary"
              disabled={result.loadingMore}
              onClick={() => void loadMore()}
            >
              {result.loadingMore
                ? 'Carregando...'
                : 'Carregar mais ' + label.toLocaleLowerCase('pt-BR')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
