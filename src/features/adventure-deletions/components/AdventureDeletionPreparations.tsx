import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Card, LoadingState } from '@/shared/ui';
import type { AdventureDeletionProgress as Progress } from '../model/adventureDeletion';
import {
  adventureOf,
  floorOf,
  identityOf,
  readProgress,
} from '../model/adventureDeletionContracts';
import { listAdventureDeletions } from '../services/adventureDeletionCatalog';
import { listDeletions, subscribeDeletions } from '../services/adventureDeletionRecovery';
import { AdventureDeletionDialog } from './AdventureDeletionDialog';
import styles from './AdventureDeletion.module.css';

export function AdventureDeletionPreparations() {
  const { user } = useAuth(),
    actor = useRef('');
  const uid = user?.uid ?? '';
  // Protect delayed catalog reads before effect cleanup when the account changes.
  // eslint-disable-next-line react-hooks/refs
  actor.current = uid;
  return user ? <Preparations key={uid} uid={uid} isActive={() => actor.current === uid} /> : null;
}
function Preparations({ uid, isActive }: { uid: string; isActive: () => boolean }) {
  const [items, setItems] = useState<Progress[]>([]),
    [local, setLocal] = useState(() => listDeletions(uid)),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [open, setOpen] = useState(false);
  const alive = useRef(true),
    generation = useRef(0),
    seen = useRef(new Set<string>()),
    current = useRef<Progress[]>([]);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive();
  async function load(next?: string) {
    const own = ++generation.current;
    if (!active()) return;
    setLoading(true);
    try {
      const check = () => {
        if (!active() || own !== generation.current) throw Error('A consulta foi encerrada.');
      };
      const page = await listAdventureDeletions(
        { uid, check },
        { ...(next ? { cursor: next } : {}), limit: 25 },
        next ? seen.current : new Set(),
      );
      check();
      const previous = current.current,
        byId = new Map(previous.map((p) => [p.deletionId, p])),
        projects = new Map(previous.map((p) => [p.adventureId, p.deletionId]));
      for (const p of page.items) {
        const old = byId.get(p.deletionId),
          other = projects.get(p.adventureId);
        if (other && other !== p.deletionId)
          throw Error('A identidade da exclusão mudou. Consulte novamente.');
        if (old) readProgress(p, uid, identityOf(old), floorOf(old));
      }
      const merged = next ? [...previous] : [];
      for (const p of page.items) {
        const index = merged.findIndex((old) => old.deletionId === p.deletionId);
        if (index < 0) merged.push(p);
        else merged[index] = p;
      }
      current.current = merged;
      setItems(merged);
      if (!next) seen.current.clear();
      if (page.nextCursor) seen.current.add(page.nextCursor);
      setCursor(page.nextCursor);
      setError('');
    } catch (cause) {
      if (active() && own === generation.current)
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível consultar as exclusões.',
        );
    } finally {
      if (active() && own === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void load();
    });
    const stop = subscribeDeletions(() => {
      if (active()) setLocal(listDeletions(uid));
    });
    return () => {
      mounted = false;
      stop();
    };
    // Actor-keyed session and generation checks protect every continuation.
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const represented = new Set(items.map((p) => p.adventureId));
  if (
    !open &&
    !loading &&
    !error &&
    !cursor &&
    !items.length &&
    !local.items.length &&
    !local.unreadable
  )
    return null;
  function choose(id: string) {
    setSelected(id);
    setOpen(true);
  }
  return (
    <Card className={`${styles.stack} ${styles.panel}`} aria-label="Exclusões de aventuras">
      <h2>Exclusões de aventuras</h2>
      <p>Consulte ou retome a limpeza, mesmo quando a aventura já não aparece no Estúdio.</p>
      {loading && <LoadingState label="Carregando exclusões de aventuras..." />}
      {local.unreadable && (
        <Alert variant="warning">
          Um pedido local inválido foi preservado e não será substituído.
        </Alert>
      )}
      {error && (
        <Alert variant="warning">
          {error}
          <Button variant="outline" onClick={() => void load()}>
            Tentar listar exclusões de aventuras novamente
          </Button>
        </Alert>
      )}
      <ul className={styles.list}>
        {items.map((p) => {
          const pending = local.items.find(
            (c) => adventureOf(c) === p.adventureId && c.kind !== 'known',
          );
          return (
            <li key={p.deletionId}>
              <Button variant="outline" onClick={() => choose(p.adventureId)}>
                {p.title} · {p.complete ? 'Excluída' : 'Limpeza em andamento'}
                {pending ? ' · confirmação pendente' : ''}
              </Button>
            </li>
          );
        })}
        {local.items
          .filter((c) => !represented.has(adventureOf(c)))
          .map((c) => (
            <li key={adventureOf(c)}>
              <Button variant="outline" onClick={() => choose(adventureOf(c))}>
                {c.kind === 'known'
                  ? 'Consultar exclusão preservada'
                  : 'Confirmar exclusão preservada'}{' '}
                · {adventureOf(c).slice(-8)}
              </Button>
            </li>
          ))}
      </ul>
      {!loading && !items.length && !local.items.length && cursor && (
        <p>Esta janela está vazia; há mais exclusões para consultar.</p>
      )}
      {cursor && (
        <Button disabled={loading} onClick={() => void load(cursor)}>
          Carregar mais exclusões de aventuras
        </Button>
      )}
      <Button
        variant="outline"
        disabled={loading}
        onClick={() => {
          setLocal(listDeletions(uid));
          void load();
        }}
      >
        Atualizar exclusões de aventuras
      </Button>
      {selected && (
        <AdventureDeletionDialog
          adventureId={selected}
          open={open}
          onClose={() => {
            setOpen(false);
            setLocal(listDeletions(uid));
            void load();
          }}
        />
      )}
    </Card>
  );
}
