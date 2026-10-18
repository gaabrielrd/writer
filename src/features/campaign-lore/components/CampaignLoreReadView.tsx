import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Badge, LoadingState } from '@/shared/ui';
import type { CampaignLoreScope, CampaignLoreState } from '../model/campaignLore';
import * as api from '../services/campaignLoreService';
import styles from './CampaignLore.module.css';
export interface CampaignLoreReadViewProps {
  scope: CampaignLoreScope;
  sourceKey: string;
  expectedCollectionRevision: number;
  isActive: () => boolean;
  onInvalidated: () => void;
}
export function CampaignLoreReadView(props: CampaignLoreReadViewProps) {
  const { user } = useAuth(),
    actor = useRef('');
  const identity = JSON.stringify([user?.uid, props.scope, props.sourceKey]);
  // eslint-disable-next-line react-hooks/refs
  actor.current = identity;
  return user ? (
    <ReadView
      key={identity}
      {...props}
      uid={user.uid}
      isActive={() => actor.current === identity && props.isActive()}
    />
  ) : null;
}
function ReadView({
  scope,
  sourceKey,
  expectedCollectionRevision,
  isActive,
  onInvalidated,
  uid,
}: CampaignLoreReadViewProps & { uid: string }) {
  const [item, setItem] = useState<CampaignLoreState | null>(null),
    [error, setError] = useState(''),
    alive = useRef(true),
    latest = useRef({ isActive, onInvalidated });
  useLayoutEffect(() => {
    latest.current = { isActive, onInvalidated };
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    const active = () => current && alive.current && latest.current.isActive();
    void api
      .getCampaignLore({ ...scope, sourceKey })
      .then((value) => {
        if (!active()) return;
        api.validateEnvelope(value, uid, scope.campaignId, scope.baseId, scope.campaignToken);
        if (value.collectionRevision !== expectedCollectionRevision || !value.item)
          throw new Error('A ficha ou a revisão do lore mudou. Reveja as escolhas.');
        api.validateState(value.item, sourceKey);
        setItem(value.item);
      })
      .catch((cause) => {
        if (active()) {
          setItem(null);
          setError(api.loreMessage(cause));
          latest.current.onInvalidated();
        }
      });
    return () => {
      current = false;
    };
  }, [uid, scope, sourceKey, expectedCollectionRevision]);
  if (error) return <Alert variant="warning">{error}</Alert>;
  if (!item) return <LoadingState label="Conferindo ficha inteira da mesa..." />;
  return (
    <section className={styles.form} aria-label="Ficha inteira atual da mesa">
      {item.legacy && <Badge variant="outline">Legado da mesa</Badge>}
      <p>
        {api.loreModes[item.mode]} · Revisão {item.revision}
      </p>
      {item.entity ? (
        <>
          <h4>{item.entity.name}</h4>
          <p>Outros nomes: {item.entity.aliases.join(', ') || 'Nenhum'}</p>
          <p>{item.entity.summary}</p>
          <p className={styles.text}>{item.entity.details}</p>
          {Object.entries(item.entity.structuredDetails).map(([key, text]) => (
            <p className={styles.text} key={key}>
              {
                (
                  {
                    appearance: 'Aparência',
                    personality: 'Personalidade',
                    history: 'História',
                    notes: 'Notas',
                  } as Record<string, string>
                )[key]
              }
              : {text}
            </p>
          ))}
          {item.entity.relations.map((r, i) => (
            <p key={r.targetKey + ':' + i}>
              {r.targetName} · {r.relationType}: {r.description}
            </p>
          ))}
        </>
      ) : (
        <p>
          Ficha retirada. O texto não é entregue neste modo; restaurar preserva o modo anterior.
        </p>
      )}
    </section>
  );
}
