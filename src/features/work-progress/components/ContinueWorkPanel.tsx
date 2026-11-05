import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, BookOpen, Map, ScrollText } from 'lucide-react';
import { useAuth } from '@/features/auth';
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
import type { ResumePage, ResumeSummary, WorkTarget } from '../model/workProgress';
import { workErrorMessage, workResumePath, workProjectPath } from '../model/workProgress';
import {
  getWorkPreferences,
  listWorkResume,
  resolveWorkResume,
} from '../services/workProgressService';
import { deviceTimeZone, formatWorkDate } from '../services/workTimeZone';
import { useWorkPage } from '../hooks/useWorkPage';
import styles from './WorkProgress.module.css';
export function ContinueWorkPanel({ compact = false }: { compact?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando retomada…" />;
  return user ? <ResumeSession key={user.uid} uid={user.uid} compact={compact} /> : null;
}
function ResumeSession({ uid, compact }: { uid: string; compact: boolean }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<'all' | WorkTarget['kind']>('all');
  const [zone, setZone] = useState(deviceTimeZone);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const active = useRef(true),
    request = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    void getWorkPreferences().then(
      (preferences) => {
        if (current && preferences.timeZone) setZone(preferences.timeZone);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [uid]);
  const page = useWorkPage<ResumeSummary, ResumePage>(
    uid + ':' + kind + ':' + String(compact),
    (cursor) =>
      listWorkResume({ ...(kind === 'all' ? {} : { kind }), cursor, limit: compact ? 4 : 25 }),
    (item) => item.target.kind + ':' + item.target.id,
  );
  async function resume(item: ResumeSummary) {
    if (request.current) return;
    request.current = true;
    setBusy(item.target.kind + ':' + item.target.id);
    setError('');
    try {
      const current = await resolveWorkResume({ target: item.target });
      if (!active.current) return;
      if (
        !current ||
        current.target.kind !== item.target.kind ||
        current.target.id !== item.target.id
      ) {
        setError('Este projeto não está mais disponível para sua conta.');
        page.refresh();
        return;
      }
      const path = current.fallback
        ? workProjectPath(current.target) + '?tab=progress'
        : workResumePath(current.target, current.resource);
      void navigate(path, { state: current.fallback ? { workResumeFallback: true } : undefined });
    } catch (cause) {
      if (active.current) setError(workErrorMessage(cause));
    } finally {
      request.current = false;
      if (active.current) setBusy('');
    }
  }
  const labels = { book: 'Livro', adventure: 'Aventura', campaign: 'Campanha' };
  return (
    <section className={styles.panel} aria-label="Continuar meu trabalho">
      <header className={styles.panelHeader}>
        <h2>Continuar meu trabalho</h2>
        {compact && (
          <Link className={styles.headerLink} to="/studio/projects">
            Ver todos os projetos
            <ArrowRight className="icon icon-sm" aria-hidden="true" />
          </Link>
        )}
      </header>
      {!compact && (
        <Dropdown
          mode="select"
          label="Retomar tipo de projeto"
          value={kind}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'book', label: 'Livros' },
            { value: 'adventure', label: 'Aventuras' },
            { value: 'campaign', label: 'Campanhas' },
          ]}
          onValueChange={(value) => setKind(value as typeof kind)}
        />
      )}
      {error && <Alert variant="warning">{error}</Alert>}
      {page.loading && !page.page && <LoadingState label="Carregando seus projetos recentes…" />}
      {page.error && !page.page && <ErrorState error={page.error} onRetry={page.retry} />}{' '}
      {!page.loading &&
        !page.error &&
        page.items.length === 0 &&
        !page.page?.nextCursor &&
        (compact ? (
          <p className={styles.emptyLine}>
            <strong>Nenhum trabalho recente</strong>
            <span>Abra um livro, aventura ou campanha e ele aparece aqui para você continuar.</span>
          </p>
        ) : (
          <EmptyState
            title="Nenhum trabalho recente"
            description="Abra um livro, aventura ou campanha para poder continuar depois."
          />
        ))}
      <div className={styles.resumeGrid}>
        {(compact ? page.items.slice(0, 4) : page.items).map((item) => (
          <Card
            role="article"
            aria-label={item.title}
            className={styles.resumeCard}
            key={item.target.kind + ':' + item.target.id}
          >
            <span className={styles.resumeArtwork} data-kind={item.target.kind} aria-hidden="true">
              {item.target.kind === 'book' ? (
                <BookOpen className="icon" aria-hidden="true" />
              ) : item.target.kind === 'adventure' ? (
                <ScrollText className="icon" aria-hidden="true" />
              ) : (
                <Map className="icon" aria-hidden="true" />
              )}
            </span>
            <div className={styles.resumeCopy}>
              <Badge variant="secondary">{labels[item.target.kind]}</Badge>
              <h3>{item.title}</h3>
              <p className={styles.hint}>
                <span className="sr-only">Último acesso: </span>
                {formatWorkDate(item.accessedAt, zone)}
              </p>
            </div>
            <Button
              size="sm"
              className={styles.resumeButton}
              disabled={Boolean(busy)}
              onClick={() => void resume(item)}
            >
              {busy === item.target.kind + ':' + item.target.id
                ? 'Verificando acesso…'
                : item.resource.kind === 'chapter'
                  ? 'Continuar capítulo'
                  : item.resource.kind === 'scene'
                    ? 'Continuar cena'
                    : item.target.kind === 'campaign'
                      ? 'Continuar preparação'
                      : 'Continuar projeto'}
              <ArrowRight className="icon icon-sm" aria-hidden="true" />
            </Button>
          </Card>
        ))}
      </div>
      {page.error && page.page && (
        <Alert variant="warning">
          {page.error}
          <Button variant="secondary" onClick={page.retry}>
            Tentar carregar retomada novamente
          </Button>
        </Alert>
      )}
      {!compact && page.page?.nextCursor && (
        <Button variant="secondary" disabled={page.loading} onClick={() => void page.more()}>
          {page.loading ? 'Carregando…' : 'Carregar mais projetos recentes'}
        </Button>
      )}
    </section>
  );
}
