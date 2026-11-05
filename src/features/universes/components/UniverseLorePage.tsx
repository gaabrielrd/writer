import { LoreImportDialog } from './LoreImportDialog';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useAuth } from '@/features/auth';
import { LoreCollection } from '@/features/lore';
import { ArrowLeft, Upload } from 'lucide-react';
import { Button, ErrorState, LoadingState, ObjectHeader } from '@/shared/ui';
import { getUniverse } from '../services/universeService';
import type { Universe } from '../model/universe';
import styles from './UniversePage.module.css';

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

function usage(world: Universe) {
  return [
    count(world.bookCount, 'livro', 'livros'),
    count(world.adventureCount ?? 0, 'aventura', 'aventuras'),
    count(world.campaignCount ?? 0, 'campanha', 'campanhas'),
  ].join(' · ');
}

export function UniverseLorePage() {
  const [importing, setImporting] = useState(false);
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
    <div className={styles.objectPage}>
      <Link to="/universes" className={styles.backLink}>
        <ArrowLeft className="icon icon-sm" aria-hidden="true" />
        Voltar aos universos
      </Link>
      <ObjectHeader
        kind="Universo"
        title={result.world.name}
        meta={<span>{usage(result.world)}</span>}
        description={result.world.description || undefined}
        secondaryActions={
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload className="icon icon-sm" aria-hidden="true" />
            Importar lore
          </Button>
        }
      />
      <LoreCollection key={key} scope={scope} />
      {importing && (
        <LoreImportDialog
          key={`${user.uid}:${universeId}`}
          uid={user.uid}
          universeId={universeId}
          onClose={() => setImporting(false)}
          onSuccess={() => {
            setImporting(false);
            setAttempt((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
