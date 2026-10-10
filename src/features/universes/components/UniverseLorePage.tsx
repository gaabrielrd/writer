import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useAuth } from '@/features/auth';
import { LoreCollection } from '@/features/lore';
import { Button, ErrorState, LoadingState, PageHeader } from '@/shared/ui';
import { getUniverse } from '../services/universeService';
import type { Universe } from '../model/universe';
import styles from './UniversePage.module.css';

export function UniverseLorePage() {
  const { user, loading } = useAuth();
  const { universeId } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${user?.uid}:${universeId}:${attempt}`;
  const scope = useMemo(() => ({ kind: 'universe' as const, id: universeId ?? '' }), [universeId]);
  const [result, setResult] = useState<{ key: string; world?: Universe; error?: string }>();
  useEffect(() => {
    let active = true;
    if (!user || !universeId) return;
    void getUniverse(universeId)
      .then((world) => {
        if (active)
          setResult({
            key,
            ...(world && world.authorId === user.uid && !world.deleting
              ? { world }
              : { error: 'Universo indisponível.' }),
          });
      })
      .catch((cause: unknown) => {
        if (active)
          setResult({
            key,
            error: cause instanceof Error ? cause.message : 'Falha ao abrir universo.',
          });
      });
    return () => {
      active = false;
    };
  }, [user, universeId, key]);
  if (loading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (result?.key !== key) return <LoadingState label="Carregando universo..." />;
  if (!result.world)
    return (
      <ErrorState
        title="Não foi possível abrir o universo"
        description={result.error}
        action={<Button onClick={() => setAttempt((n) => n + 1)}>Tentar novamente</Button>}
      />
    );
  return (
    <div className={styles.page}>
      <PageHeader
        title={result.world.name}
        description={result.world.description}
        actions={
          <Link to="/universes">
            <Button variant="secondary">Voltar aos universos</Button>
          </Link>
        }
      />
      <LoreCollection key={key} scope={scope} />
    </div>
  );
}
