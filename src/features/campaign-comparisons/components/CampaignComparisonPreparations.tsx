import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Card, LoadingState } from '@/shared/ui';
import type {
  ComparisonProgress,
  ComparisonSelection,
  ComparisonReadEnvelope,
} from '../model/campaignComparison';
import * as api from '../services/campaignComparisonService';
import {
  listComparisonControls,
  subscribeComparisons,
} from '../services/campaignComparisonRecovery';
import { ComparisonDialog } from './ComparisonDialog';
import styles from './Comparisons.module.css';
export interface CampaignComparisonPreparationsProps {
  campaignId?: string;
  onReviewAdoption?: (context: ComparisonReadEnvelope) => void;
}
export function CampaignComparisonPreparations(props: CampaignComparisonPreparationsProps) {
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
  onReviewAdoption,
}: { uid: string; isActive: () => boolean } & CampaignComparisonPreparationsProps) {
  const [items, setItems] = useState<ComparisonProgress[]>([]),
    [local, setLocal] = useState(() => listComparisonControls(uid, campaignId)),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<ComparisonSelection | null>(null),
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
      const page = await api.listCampaignComparisons({
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
          ? [
              ...old,
              ...page.items.filter((v) => !old.some((p) => p.comparisonId === v.comparisonId)),
            ]
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
    const unsubscribe = subscribeComparisons(() => {
      if (active()) setLocal(listComparisonControls(uid, campaignId));
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [uid, campaignId]); // eslint-disable-line react-hooks/exhaustive-deps
  function choose(selection: ComparisonSelection) {
    setSelected(selection);
    setOpen(true);
  }
  const represented = new Set(items.map((v) => v.comparisonId));
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
      <h2>Candidatas de base</h2>
      <p className={styles.meta}>
        Preparações e comparações privadas. Retome ou descarte mesmo quando a campanha ou a origem
        não estiver mais disponível.
      </p>
      {loading && <LoadingState label="Carregando candidatas de base..." />}
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
            Tentar listar candidatas novamente
          </Button>
        </Alert>
      )}
      <ul className={styles.list}>
        {items.map((value) => {
          const initial = local.items.find(
            (v) => v.scope.kind === 'start' && v.expected.comparisonId === value.comparisonId,
          );
          return (
            <li key={value.comparisonId}>
              <Button
                variant="outline"
                onClick={() =>
                  choose({
                    campaignId: value.campaignId,
                    comparisonId: value.comparisonId,
                    ...(!initial ? { expected: api.identityOf(value) } : {}),
                  })
                }
              >
                Candidata {value.comparisonId.slice(-8)} · {api.stateLabels[value.state]}
              </Button>
            </li>
          );
        })}
        {local.items
          .filter((v) => !represented.has(v.expected.comparisonId))
          .map((value, index) => (
            <li key={JSON.stringify(value.scope)}>
              <Button
                variant="outline"
                onClick={() =>
                  choose({
                    campaignId: value.scope.campaignId,
                    comparisonId: value.expected.comparisonId,
                    ...(value.scope.kind !== 'start'
                      ? {
                          expected:
                            value.expected as import('../model/campaignComparison').ComparisonIdentity,
                        }
                      : {}),
                  })
                }
              >
                {value.scope.kind === 'known'
                  ? 'Consultar candidata conhecida'
                  : 'Confirmar pedido de candidata'}{' '}
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
          Carregar mais candidatas
        </Button>
      )}
      <Button
        variant="outline"
        disabled={loading}
        onClick={() => {
          setLocal(listComparisonControls(uid, campaignId));
          void load();
        }}
      >
        Atualizar candidatas
      </Button>
      {selected && (
        <ComparisonDialog
          key={JSON.stringify(selected)}
          uid={uid}
          selection={selected}
          open={open}
          isActive={active}
          onReviewAdoption={onReviewAdoption}
          onClose={() => {
            setOpen(false);
            setLocal(listComparisonControls(uid, campaignId));
            void load();
          }}
        />
      )}
    </Card>
  );
}
