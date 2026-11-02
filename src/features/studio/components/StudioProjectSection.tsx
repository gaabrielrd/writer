import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { BookOpen, Map, MoreHorizontal } from 'lucide-react';
import { editorialStateLabels, type EditorialState } from '@/features/work-progress';
import { CampaignDeletionControls } from '@/features/campaigns';
import { AdventureDeletionDialog } from '@/features/adventures';
import {
  Alert,
  Badge,
  Button,
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
  const [deletionId, setDeletionId] = useState<string | null>(null),
    [deletionOpen, setDeletionOpen] = useState(false);
  const { pathname, search } = useLocation();
  const [params, setParams] = useSearchParams();
  const status =
    statusesByKind[kind].find((value) => value === params.get(kind + 'Status')) ?? 'all';
  const editorialState =
    (['draft', 'review', 'ready'] as const).find(
      (value) => value === params.get(kind + 'Editorial'),
    ) ?? 'all';
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next);
  }
  const setStatus = (value: 'all' | StudioStatus) => setFilter(kind + 'Status', value);
  const setEditorialState = (value: 'all' | EditorialState) => setFilter(kind + 'Editorial', value);
  const { result, loading, refresh, loadMore } = useStudioProjects(kind, status, editorialState);
  const label = projectLabels[kind];
  return (
    <section className={styles.section} aria-label={label}>
      <div className={styles.sectionHeader}>
        <h2>{label}</h2>
        <div className={styles.sectionActions}>
          {kind !== 'campaign' && (
            <div className={styles.filterField}>
              <span className={styles.filterLabel}>Estado editorial</span>
              <div
                className={styles.typeFilters}
                role="group"
                aria-label={'Estado editorial de ' + label}
              >
                {(['all', 'draft', 'review', 'ready'] as const).map((value) => (
                  <Button
                    key={value}
                    variant="ghost"
                    aria-pressed={editorialState === value}
                    onClick={() => setEditorialState(value)}
                  >
                    {value === 'all' ? 'Todos' : editorialStateLabels[value]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className={styles.filterField}>
            <span className={styles.filterLabel}>
              {kind === 'book' ? 'Publicação' : kind === 'adventure' ? 'Condição' : 'Estado'}
            </span>
            <div
              className={styles.typeFilters}
              role="group"
              aria-label={
                (kind === 'book'
                  ? 'Publicação de '
                  : kind === 'adventure'
                    ? 'Condição de '
                    : 'Estado de ') + label
              }
            >
              {(['all', ...statusesByKind[kind]] as const).map((value) => (
                <Button
                  key={value}
                  variant="ghost"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {value === 'all'
                    ? 'Todos'
                    : kind === 'book' && value === 'draft'
                      ? 'Não publicado'
                      : statusLabels[value]}
                </Button>
              ))}
            </div>
          </div>
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
          <div className={styles.projectList}>
            {result.items.map((project) => {
              const destination = projectPath(project);
              const returnState = { studioReturnTo: pathname + search };
              const menu = (onDelete?: () => void) => (
                <Dropdown
                  mode="action"
                  label={'Ações do projeto ' + project.title}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={'Ações do projeto ' + project.title}
                    >
                      <MoreHorizontal className="icon icon-sm" aria-hidden="true" />
                    </Button>
                  }
                >
                  <DropdownItem asChild>
                    <Link to={destination} state={returnState}>
                      Abrir projeto
                    </Link>
                  </DropdownItem>
                  {onDelete && (
                    <DropdownItem onSelect={onDelete}>
                      Excluir {project.kind === 'campaign' ? 'campanha' : 'aventura'}
                    </DropdownItem>
                  )}
                </Dropdown>
              );
              return (
                <article key={project.id} className={styles.projectRow}>
                  <Link to={destination} state={returnState} className={styles.projectIdentity}>
                    <span className={styles.projectThumbnail}>
                      {project.kind === 'book' && project.coverUrl ? (
                        <img src={project.coverUrl} alt="" loading="lazy" />
                      ) : project.kind === 'campaign' ? (
                        <Map className="icon" aria-hidden="true" />
                      ) : (
                        <BookOpen className="icon" aria-hidden="true" />
                      )}
                    </span>
                    <div className={styles.projectCopy}>
                      <h3>{project.title}</h3>
                      <span className={styles.projectMeta}>
                        <span>
                          {project.kind === 'book'
                            ? 'Livro'
                            : project.kind === 'adventure'
                              ? 'Aventura'
                              : 'Campanha'}
                        </span>
                        {project.kind === 'book' && (
                          <span>{project.wordCount.toLocaleString('pt-BR')} palavras</span>
                        )}
                      </span>
                    </div>
                  </Link>
                  <div className={styles.projectDetails}>
                    <div className={styles.projectBadges}>
                      <Badge variant="neutral">
                        {project.kind === 'campaign'
                          ? statusLabels[project.status]
                          : editorialStateLabels[
                              project.editorialState ??
                                (project.kind === 'adventure' && project.status === 'ready'
                                  ? 'ready'
                                  : 'draft')
                            ]}
                      </Badge>
                      {project.kind === 'book' && (
                        <Badge variant={project.status === 'published' ? 'success' : 'secondary'}>
                          {project.status === 'published' ? 'Publicado' : 'Não publicado'}
                        </Badge>
                      )}
                      {project.kind === 'adventure' && project.status === 'archived' && (
                        <Badge variant="secondary">Arquivada</Badge>
                      )}
                    </div>
                    <p className={styles.updated}>
                      Atualizado em{' '}
                      <time dateTime={projectDateTime(project.updatedAt)}>
                        {formatProjectDate(project.updatedAt)}
                      </time>
                    </p>
                  </div>
                  <div className={styles.projectActions}>
                    {project.kind === 'campaign' ? (
                      <CampaignDeletionControls
                        campaignId={project.id}
                        onRevoked={() => refresh()}
                        renderTrigger={menu}
                      />
                    ) : (
                      menu(
                        project.kind === 'adventure'
                          ? () => {
                              setDeletionId(project.id);
                              setDeletionOpen(true);
                            }
                          : undefined,
                      )
                    )}
                  </div>
                </article>
              );
            })}
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
      {deletionId && (
        <AdventureDeletionDialog
          adventureId={deletionId}
          open={deletionOpen}
          onClose={() => {
            setDeletionOpen(false);
            refresh();
          }}
        />
      )}
    </section>
  );
}
