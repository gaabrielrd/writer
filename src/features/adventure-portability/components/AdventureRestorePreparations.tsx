import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, Tooltip } from '@/shared/ui';
import { createAdventureRestoreStartSession } from '../services/adventureRestoreStartSession';
import { listStoredAdventureRestoreEffects } from '../services/adventureRestoreEffectStore';
import { checkAdventureRestoreAccount } from '../services/adventureRestoreLocalRecovery';
import type { AdventureRestoreTransferJob } from '../services/adventureRestoreTransferJob';
import styles from './AdventureRestore.module.css';
type Group = 'remote' | 'starts' | 'effects';
type Row = { id: string; job?: AdventureRestoreTransferJob };
const labels: Record<AdventureRestoreTransferJob['state'], string> = {
  uploading: 'Envio aguardando continuação',
  uploaded: 'Backup recebido',
  checking: 'Conferindo backup',
  'bytes-verified': 'Arquivo conferido',
  validating: 'Conferindo conteúdo',
  'content-verified': 'Preparação disponível',
  rejected: 'Arquivo não aceito',
  'content-rejected': 'Conteúdo não aceito',
  activated: 'Cópia criada',
  cancelling: 'Cancelamento em andamento',
  cancelled: 'Preparação cancelada',
};
type AdventureRestorePreparationsProps = {
  ownerId: string;
  revision?: number;
  onResume: (id: string) => void;
};
export function AdventureRestorePreparations(props: AdventureRestorePreparationsProps) {
  return <PreparationsSession key={props.ownerId} {...props} />;
}
function PreparationsSession({
  ownerId,
  revision = 0,
  onResume,
}: AdventureRestorePreparationsProps) {
  const [rows, setRows] = useState<Record<Group, Row[]>>({ remote: [], starts: [], effects: [] }),
    [cursors, setCursors] = useState<Record<Group, string | null>>({
      remote: null,
      starts: null,
      effects: null,
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const lifetime = useRef(0),
    busy = useRef(false);
  useEffect(() => {
    const generation = ++lifetime.current,
      guard = () => {
        if (lifetime.current !== generation) throw Error('Sessão encerrada');
        checkAdventureRestoreAccount(ownerId);
      };
    busy.current = true;
    const s = createAdventureRestoreStartSession({ ownerId, check: guard });
    void Promise.allSettled([
      s.listRemote({ limit: 10 }),
      s.list({ limit: 10 }),
      listStoredAdventureRestoreEffects(ownerId, guard, { limit: 10 }),
    ])
      .then(([remote, starts, effects]) => {
        guard();
        const messages: string[] = [];
        if (remote.status === 'fulfilled') {
          setRows((old) => ({
            ...old,
            remote: remote.value.items.map((job) => ({ id: job.restoreId, job })),
          }));
          setCursors((old) => ({ ...old, remote: remote.value.nextCursor }));
        } else messages.push('Não foi possível consultar as restaurações da conta.');
        if (starts.status === 'fulfilled') {
          setRows((old) => ({
            ...old,
            starts: starts.value.items.map((r) => ({ id: r.intent.operationId })),
          }));
          setCursors((old) => ({ ...old, starts: starts.value.nextCursor }));
        } else
          messages.push(
            'Os inícios salvos neste dispositivo não puderam ser lidos e foram preservados.',
          );
        if (effects.status === 'fulfilled') {
          setRows((old) => ({
            ...old,
            effects: effects.value.items.map((r) => ({ id: r.intent.restoreId })),
          }));
          setCursors((old) => ({ ...old, effects: effects.value.nextCursor }));
        } else
          messages.push(
            'Os pedidos salvos neste dispositivo não puderam ser lidos e foram preservados.',
          );
        setError(messages.join(' '));
        setLoading(false);
      })
      .catch(() => {
        /* Late account replies are suppressed. */
      })
      .finally(() => {
        if (lifetime.current === generation) busy.current = false;
      });
    return () => {
      lifetime.current = generation + 1;
    };
  }, [ownerId, revision, attempt]);
  function reload() {
    if (busy.current) return;
    setLoading(true);
    setError('');
    setAttempt((n) => n + 1);
  }
  async function more(group: Group) {
    const cursor = cursors[group];
    if (!cursor || busy.current) return;
    const generation = lifetime.current,
      guard = () => {
        if (lifetime.current !== generation) throw Error('Sessão encerrada');
        checkAdventureRestoreAccount(ownerId);
      };
    busy.current = true;
    setLoading(true);
    try {
      const s = createAdventureRestoreStartSession({ ownerId, check: guard });
      let items: Row[], nextCursor: string | null;
      if (group === 'remote') {
        const page = await s.listRemote({ cursor, limit: 10 });
        items = page.items.map((job) => ({ id: job.restoreId, job }));
        nextCursor = page.nextCursor;
      } else if (group === 'starts') {
        const page = await s.list({ cursor, limit: 10 });
        items = page.items.map((r) => ({ id: r.intent.operationId }));
        nextCursor = page.nextCursor;
      } else {
        const page = await listStoredAdventureRestoreEffects(ownerId, guard, { cursor, limit: 10 });
        items = page.items.map((r) => ({ id: r.intent.restoreId }));
        nextCursor = page.nextCursor;
      }
      guard();
      setRows((old) => ({
        ...old,
        [group]: [
          ...old[group],
          ...items.filter((row) => !old[group].some((p) => p.id === row.id)),
        ],
      }));
      setCursors((old) => ({ ...old, [group]: nextCursor }));
      setError('');
    } catch {
      try {
        guard();
        setError('Não foi possível carregar a próxima página. Os pedidos foram preservados.');
      } catch {
        /* Retired scope. */
      }
    } finally {
      if (lifetime.current === generation) {
        busy.current = false;
        setLoading(false);
      }
    }
  }
  const items = [
    ...new Map([...rows.effects, ...rows.starts, ...rows.remote].map((r) => [r.id, r])).values(),
  ];
  return (
    <Card className={styles.panel}>
      <section className={styles.stack} aria-label="Restaurações de aventuras">
        <div className={styles.panelHeader}>
          <h2>Restaurações de aventuras</h2>
          <Tooltip content="Atualizar restaurações">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Atualizar restaurações"
              disabled={loading}
              onClick={reload}
            >
              <RefreshCw className="icon icon-sm" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
        <p className={styles.muted}>
          Retome preparações ou confira a finalização de uma cópia privada.
        </p>
        {loading && <LoadingState label="Carregando restaurações..." />}
        {error && (
          <ErrorState
            title="Não foi possível consultar todas as restaurações"
            description={error}
            onRetry={reload}
          />
        )}
        {!loading && !error && !items.length && (
          <EmptyState
            title="Nenhuma restauração encontrada"
            description="Selecione Restaurar backup de aventura para preparar uma nova cópia privada."
          />
        )}
        {items.map((row) => (
          <div className={styles.section} key={row.id}>
            <div className={styles.stack}>
              <h3>
                {row.job
                  ? 'Backup de ' + new Date(row.job.createdAt).toLocaleString('pt-BR')
                  : 'Pedido deste dispositivo aguardando confirmação'}
              </h3>
              <p>
                {row.job
                  ? labels[row.job.state]
                  : 'O pedido original foi preservado para retomada.'}
              </p>
              <Button variant="secondary" disabled={loading} onClick={() => onResume(row.id)}>
                Retomar restauração
              </Button>
            </div>
          </div>
        ))}
        <div className={styles.actions}>
          {cursors.remote && (
            <Button disabled={loading} variant="secondary" onClick={() => void more('remote')}>
              Mais restaurações da conta
            </Button>
          )}
          {cursors.starts && (
            <Button disabled={loading} variant="secondary" onClick={() => void more('starts')}>
              Mais inícios do dispositivo
            </Button>
          )}
          {cursors.effects && (
            <Button disabled={loading} variant="secondary" onClick={() => void more('effects')}>
              Mais pedidos do dispositivo
            </Button>
          )}
        </div>
        {!loading && !items.length && Object.values(cursors).some(Boolean) && (
          <Alert>Há mais preparações para consultar nas próximas páginas.</Alert>
        )}
      </section>
    </Card>
  );
}
