import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { BookOpen, Globe } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { ScenePlanner } from '@/features/scenes';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const narrativeOpen = searchParams.get('tab') === 'narrative';
  const selectTab = (tab: 'scenes' | 'narrative') =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', tab);
      return next;
    });
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'scenes'
        : event.key === 'End'
          ? 'narrative'
          : narrativeOpen
            ? 'scenes'
            : 'narrative';
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
  const status = { draft: 'Rascunho', ready: 'Pronta', archived: 'Arquivada' }[adventure.status];
  return (
    <div className={styles.page}>
      <PageHeader
        title={adventure.title}
        description="Aventura autoral"
        breadcrumbs={<Link to="/studio">Estúdio</Link>}
        actions={back}
      />
      <div className={styles.meta}>
        <Badge variant="secondary">Aventura</Badge>
        <Badge variant="neutral">{status}</Badge>
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
          aria-selected={!narrativeOpen}
          onKeyDown={handleTabKey}
          id="adventure-tab-scenes"
          aria-controls="adventure-tab-panel"
          tabIndex={narrativeOpen ? -1 : 0}
          variant={narrativeOpen ? 'secondary' : 'primary'}
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
      </div>
      <div
        role="tabpanel"
        id="adventure-tab-panel"
        aria-labelledby={'adventure-tab-' + (narrativeOpen ? 'narrative' : 'scenes')}
      >
        {narrativeOpen ? (
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
