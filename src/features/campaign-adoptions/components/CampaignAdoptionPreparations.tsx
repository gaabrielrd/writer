import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Card, LoadingState } from '@/shared/ui';
import type { AdoptionProgress, AdoptionSelection } from '../model/campaignAdoption';
import * as api from '../services/campaignAdoptionService';
import { listAdoptionControls, subscribeAdoptions } from '../services/campaignAdoptionRecovery';
import { AdoptionDialog } from './AdoptionDialog';
import styles from './Adoptions.module.css';
export interface CampaignAdoptionPreparationsProps {
  campaignId?: string;
  onAdopted?: () => void;
  onAdaptLore?: () => void;
}
export function CampaignAdoptionPreparations(props: CampaignAdoptionPreparationsProps) {
  const { user } = useAuth(),
    actor = useRef('');
  const key = JSON.stringify([user?.uid, props.campaignId]);
  // Cancel old actor callbacks before layout cleanup during a session-changing render.
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  return user ? (
    <Preparations key={key} uid={user.uid} {...props} isActive={() => actor.current === key} />
  ) : null;
}
function Preparations({
  uid,
  campaignId,
  isActive,
  onAdopted,
  onAdaptLore,
}: { uid: string; isActive: () => boolean } & CampaignAdoptionPreparationsProps) {
  const [items, setItems] = useState<AdoptionProgress[]>([]),
    [local, setLocal] = useState(() => listAdoptionControls(uid, campaignId)),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<AdoptionSelection | null>(null),
    [open, setOpen] = useState(false);
  const alive = useRef(true),
    busy = useRef(false),
    generation = useRef(0),
    seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && isActive();
  async function load(next?: string) {
    if (busy.current || !active()) return;
    busy.current = true;
    const own = ++generation.current;
    setLoading(true);
    try {
      const page = await api.listCampaignAdoptions({
        ...(campaignId ? { campaignId } : {}),
        ...(next ? { cursor: next } : {}),
        limit: 25,
      });
      if (!active() || generation.current !== own) return;
      api.budget(page);
      api.keys(page, ['items', 'nextCursor']);
      if (!Array.isArray(page.items) || page.items.length > 50) api.fail();
      page.items.forEach((value) =>
        api.validateProgress(value, uid, campaignId ? { campaignId } : {}),
      );
      if (!next) seen.current.clear();
      api.validateCursor(page.nextCursor, seen.current);
      if (page.nextCursor) seen.current.add(page.nextCursor);
      setItems((old) =>
        next
          ? [...old, ...page.items.filter((v) => !old.some((p) => p.adoptionId === v.adoptionId))]
          : page.items,
      );
      setCursor(page.nextCursor);
      setError('');
    } catch (cause) {
      if (active() && generation.current === own) setError(api.message(cause));
    } finally {
      busy.current = false;
      if (active() && generation.current === own) setLoading(false);
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void load();
    });
    const unsubscribe = subscribeAdoptions(() => {
      if (active()) setLocal(listAdoptionControls(uid, campaignId));
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [uid, campaignId]); // eslint-disable-line react-hooks/exhaustive-deps
  function choose(selection: AdoptionSelection) {
    setSelected(selection);
    setOpen(true);
  }
  const represented = new Set(items.map((v) => v.adoptionId));
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
      <h2>Atualizações de base</h2>
      <p className={styles.meta}>
        Preparações e atualizações privadas. Retome ou cancele mesmo quando a campanha ou a origem
        não estiver mais disponível.
      </p>
      {loading && <LoadingState label="Carregando atualizações de base..." />}
      {local.unreadable && (
        <Alert variant="warning">
          Um controle local não pôde ser lido. Ele foi preservado e não será substituído por outro
          pedido.
        </Alert>
      )}
      {error && (
        <Alert variant="warning">
          {error}
          <Button disabled={loading} onClick={() => void load()}>
            Tentar listar atualizações novamente
          </Button>
        </Alert>
      )}
      <ul className={styles.list}>
        {items.map((value) => {
          const initial = local.items.find(
            (v) => v.scope.kind === 'start' && v.expected.adoptionId === value.adoptionId,
          );
          return (
            <li key={value.adoptionId}>
              <Button
                variant="outline"
                onClick={() =>
                  choose({
                    campaignId: value.campaignId,
                    adoptionId: value.adoptionId,
                    ...(!initial ? { expected: api.identityOf(value) } : {}),
                  })
                }
              >
                Atualização {value.adoptionId.slice(-8)} · {api.stateLabels[value.state]}
              </Button>
            </li>
          );
        })}
        {local.items
          .filter((v) => !represented.has(v.expected.adoptionId))
          .map((value, index) => (
            <li key={JSON.stringify(value.scope)}>
              <Button
                variant="outline"
                onClick={() =>
                  choose({
                    campaignId: value.scope.campaignId,
                    adoptionId: value.expected.adoptionId,
                    ...(value.scope.kind !== 'start'
                      ? {
                          expected:
                            value.expected as import('../model/campaignAdoption').AdoptionIdentity,
                        }
                      : {}),
                  })
                }
              >
                {value.scope.kind === 'known'
                  ? 'Consultar atualização conhecida'
                  : 'Confirmar pedido de atualização'}{' '}
                {index + 1}
              </Button>
            </li>
          ))}
      </ul>
      {!loading && !items.length && !local.items.length && cursor && (
        <p>Esta janela está vazia; há mais controles para consultar.</p>
      )}
      {cursor && (
        <Button disabled={loading} onClick={() => void load(cursor)}>
          Carregar mais atualizações
        </Button>
      )}
      <Button
        variant="outline"
        disabled={loading}
        onClick={() => {
          setLocal(listAdoptionControls(uid, campaignId));
          void load();
        }}
      >
        Consultar atualizações
      </Button>
      {selected && (
        <AdoptionDialog
          key={JSON.stringify(selected)}
          uid={uid}
          selection={selected}
          open={open}
          isActive={active}
          onAdopted={onAdopted}
          onAdaptLore={onAdaptLore}
          onClose={() => {
            setOpen(false);
            setLocal(listAdoptionControls(uid, campaignId));
            void load();
          }}
        />
      )}
    </Card>
  );
}
