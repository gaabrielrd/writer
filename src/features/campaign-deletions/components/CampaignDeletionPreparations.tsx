import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Card, LoadingState } from '@/shared/ui';
import type { DeletionProgress } from '../model/campaignDeletion';
import * as api from '../services/campaignDeletionService';
import * as store from '../services/campaignDeletionRecovery';
import { CampaignDeletionDialog, type CampaignDeletionDialogProps } from './CampaignDeletionDialog';
import styles from './Deletions.module.css';
export type CampaignDeletionPreparationsProps = Pick<
  CampaignDeletionDialogProps,
  'onRevoked' | 'onReviewRecovery' | 'recoveryActions'
>;
export function CampaignDeletionPreparations(props: CampaignDeletionPreparationsProps) {
  const { user } = useAuth(),
    actor = useRef('');
  const uid = user?.uid ?? '';
  // eslint-disable-next-line react-hooks/refs
  actor.current = uid;
  return user ? (
    <Preparations key={uid} uid={uid} isActive={() => actor.current === uid} {...props} />
  ) : null;
}
function Preparations({
  uid,
  isActive,
  ...props
}: CampaignDeletionPreparationsProps & { uid: string; isActive: () => boolean }) {
  const [items, setItems] = useState<DeletionProgress[]>([]),
    [local, setLocal] = useState(() => store.listDeletions(uid)),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [open, setOpen] = useState(false);
  const alive = useRef(true),
    generation = useRef(0),
    owner = useRef<number | null>(null),
    seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive();
  async function load(next?: string) {
    const own = ++generation.current;
    owner.current = own;
    setLoading(true);
    try {
      const page = await api.listCampaignDeletions({
        ...(next ? { cursor: next } : {}),
        limit: 25,
      });
      if (!active() || own !== generation.current) return;
      api.budget(page);
      api.keys(page, ['items', 'nextCursor']);
      if (!Array.isArray(page.items) || page.items.length > 50) api.fail();
      page.items.forEach((p) => api.validateProgress(p, uid));
      api.validateCursor(page.nextCursor, next ? seen.current : undefined);
      if (!next) seen.current.clear();
      if (page.nextCursor) seen.current.add(page.nextCursor);
      setItems((old) =>
        next
          ? [...old, ...page.items.filter((p) => !old.some((x) => x.deletionId === p.deletionId))]
          : page.items,
      );
      setCursor(page.nextCursor);
      setError('');
    } catch (cause) {
      if (active() && own === generation.current) setError(api.message(cause));
    } finally {
      if (owner.current === own) {
        owner.current = null;
        if (active()) setLoading(false);
      }
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void load();
    });
    const unsub = store.subscribeDeletions(() => {
      if (active()) setLocal(store.listDeletions(uid));
    });
    return () => {
      current = false;
      unsub();
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  function choose(cid: string) {
    setSelected(cid);
    setOpen(true);
  }
  const represented = new Set(items.map((p) => p.campaignId));
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
  return (
    <Card className={styles.panel}>
      <h2>Exclusões em andamento</h2>
      <p className={styles.meta}>Retome a limpeza mesmo sem a campanha ou a aventura original.</p>
      {loading && <LoadingState label="Carregando exclusões..." />}
      {local.unreadable && (
        <Alert variant="warning">
          Um controle local inválido foi preservado e não será substituído.
        </Alert>
      )}
      {error && (
        <Alert variant="warning">
          {error}
          <Button onClick={() => void load()}>Tentar listar exclusões novamente</Button>
        </Alert>
      )}
      <ul className={styles.list}>
        {items.map((p) => (
          <li key={p.deletionId}>
            <Button variant="outline" onClick={() => choose(p.campaignId)}>
              Exclusão {p.deletionId.slice(-8)} · {p.complete ? 'Concluída' : 'Em andamento'}
            </Button>
          </li>
        ))}
        {local.items
          .filter((c) => !represented.has(api.campaignOf(c)))
          .map((c) => (
            <li key={api.campaignOf(c)}>
              <Button variant="outline" onClick={() => choose(api.campaignOf(c))}>
                {c.kind === 'known'
                  ? 'Consultar exclusão preservada'
                  : 'Confirmar exclusão preservada'}{' '}
                · {api.campaignOf(c).slice(-8)}
              </Button>
            </li>
          ))}
      </ul>
      {!loading && !items.length && cursor && (
        <p>Esta janela está vazia; há mais exclusões para consultar.</p>
      )}
      {cursor && (
        <Button disabled={loading} onClick={() => void load(cursor)}>
          Carregar mais exclusões
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => {
          setLocal(store.listDeletions(uid));
          void load();
        }}
      >
        Consultar exclusões
      </Button>
      {selected && (
        <CampaignDeletionDialog
          key={selected}
          campaignId={selected}
          open={open}
          {...props}
          onClose={() => {
            setOpen(false);
            setLocal(store.listDeletions(uid));
            void load();
          }}
        />
      )}
    </Card>
  );
}
