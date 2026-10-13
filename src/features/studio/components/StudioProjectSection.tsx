import { useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, Map } from 'lucide-react';
import { BookCard } from '@/features/books';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dropdown,
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
  const { result, loading, refresh, loadMore } = useStudioProjects(kind, status);
  const label = projectLabels[kind];
  return (
    <section className={styles.section} aria-label={label}>
      <div className={styles.sectionHeader}>
        <h2>{label}</h2>
        <div className={styles.sectionActions}>
          <Dropdown
            mode="select"
            label={'Estado de ' + label}
            value={status}
            onValueChange={(value) => setStatus(value as 'all' | StudioStatus)}
            options={[
              { value: 'all', label: 'Todos os estados' },
              ...statusesByKind[kind].map((value) => ({ value, label: statusLabels[value] })),
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
            status === 'all'
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
                      <Badge variant="neutral">{statusLabels[project.status]}</Badge>
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
