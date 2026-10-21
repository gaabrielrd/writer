import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { listValidatedAdventureImports } from '../services/adventureImportService';
import {
  listLocalAdventureImports,
  subscribeAdventureImportRecovery,
} from '../services/adventureImportRecovery';
import type { ImportProgress } from '../model/adventureImport';
import { AdventureImportDialog } from './AdventureImportDialog';
import styles from './AdventureImport.module.css';
export function AdventureImportPreparations({
  onActivated,
}: {
  onActivated: (id: string) => void;
}) {
  const { user } = useAuth();
  return user ? <Preparations key={user.uid} uid={user.uid} onActivated={onActivated} /> : null;
}
function Preparations({ uid, onActivated }: { uid: string; onActivated: (id: string) => void }) {
  const [items, setItems] = useState<ImportProgress[]>([]),
    [localIds, setLocalIds] = useState<string[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [selection, setSelection] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const owner = ++generation.current;
    void Promise.allSettled([listValidatedAdventureImports(uid), listLocalAdventureImports(uid)])
      .then(([remote, local]) => {
        if (!active || owner !== generation.current) return;
        const messages: string[] = [];
        if (remote.status === 'fulfilled') {
          setItems(remote.value.items);
          setCursor(remote.value.nextCursor);
        } else messages.push('Não foi possível consultar as preparações remotas.');
        if (local.status === 'fulfilled') setLocalIds(local.value.map((r) => r.importId));
        else messages.push('A recuperação local não pôde ser lida e foi preservada.');
        setError(messages.join(' '));
      })
      .finally(() => {
        if (active && owner === generation.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [uid, attempt]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listLocalAdventureImports(uid)
        .then((rows) => {
          if (active) setLocalIds(rows.map((r) => r.importId));
        })
        .catch(() => {
          if (active) setError('Não foi possível conferir a recuperação local.');
        });
    };
    const stop = subscribeAdventureImportRecovery(uid, refresh);
    return () => {
      active = false;
      stop();
    };
  }, [uid]);
  function reload() {
    setLoading(true);
    setError('');
    setAttempt((n) => n + 1);
  }
  async function more() {
    if (!cursor || loading) return;
    const owner = ++generation.current;
    setLoading(true);
    try {
      const page = await listValidatedAdventureImports(uid, cursor);
      if (owner === generation.current) {
        setItems((rows) => [
          ...rows,
          ...page.items.filter((p) => !rows.some((r) => r.importId === p.importId)),
        ]);
        setCursor(page.nextCursor);
        setError('');
      }
    } catch (cause) {
      if (owner === generation.current)
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível consultar a próxima página.',
        );
    } finally {
      if (owner === generation.current) setLoading(false);
    }
  }
  const ids = [...new Set([...items.map((p) => p.importId), ...localIds])];
  return (
    <Card>
      <div className={styles.stack}>
        <h2>Importações de aventura em preparação</h2>
        <p>Retome ou encerre preparações privadas. Elas ainda não são aventuras utilizáveis.</p>
        <Button variant="secondary" disabled={loading} onClick={reload}>
          Atualizar importações
        </Button>
        {loading && <LoadingState label="Carregando importações..." />}
        {error && (
          <ErrorState
            title="Não foi possível consultar importações"
            description={error}
            action={<Button onClick={reload}>Tentar novamente</Button>}
          />
        )}
        {!loading && !error && !ids.length && !cursor && (
          <EmptyState
            title="Nenhuma importação pendente"
            description="Confirme uma revisão para começar uma nova aventura."
          />
        )}
        {ids.map((id) => {
          const p = items.find((p) => p.importId === id);
          return (
            <div className={styles.section} key={id}>
              <h3>{p?.title ?? 'Pedido local aguardando confirmação'}</h3>
              {p && (
                <p>
                  {p.uploadedSections} de {p.sectionCount} seções recebidas.
                </p>
              )}
              <Button variant="secondary" onClick={() => setSelection(id)}>
                Retomar importação
              </Button>
            </div>
          );
        })}
        {cursor && (
          <Button disabled={loading} onClick={() => void more()}>
            Carregar mais importações
          </Button>
        )}
        {!loading && cursor && !ids.length && (
          <Alert>
            Há outra janela para consultar. Continue carregando para verificar as preparações.
          </Alert>
        )}
      </div>
      {selection && (
        <AdventureImportDialog
          open
          importId={selection}
          onClose={() => {
            setSelection(null);
            setAttempt((n) => n + 1);
          }}
          onActivated={onActivated}
        />
      )}
    </Card>
  );
}
