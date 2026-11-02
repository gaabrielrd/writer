import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAuth } from '@/features/auth';
import { Card } from '@/shared/ui';
import { useSessionReferenceOperation } from '../hooks/useSessionReferenceOperation';
import { ReferenceRecoveryActions } from './ReferenceRecoveryActions';
import styles from './References.module.css';
export interface CampaignSessionReferenceControlsProps {
  campaignId: string;
  onPendingChange?: (pending: boolean) => void;
}
export function CampaignSessionReferenceControls(props: CampaignSessionReferenceControlsProps) {
  const { user } = useAuth(),
    actor = useRef(''),
    key = JSON.stringify([user?.uid, props.campaignId]);
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  return user ? (
    <Controls key={key} {...props} uid={user.uid} isActive={() => actor.current === key} />
  ) : null;
}
function Controls({
  campaignId,
  uid,
  isActive,
  onPendingChange,
}: CampaignSessionReferenceControlsProps & { uid: string; isActive: () => boolean }) {
  const alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const op = useSessionReferenceOperation({
    uid,
    campaignId,
    isActive: () => alive.current && isActive(),
  });
  useEffect(() => {
    onPendingChange?.(op.busy || !!op.pending || op.blocked);
    return () => onPendingChange?.(false);
  }, [op.busy, op.pending, op.blocked, onPendingChange]);
  if (!op.pending && !op.error && !op.notice) return null;
  return (
    <Card className={styles.panel}>
      <h2>Pedidos de vínculo de sessão</h2>
      <ReferenceRecoveryActions op={op} />
    </Card>
  );
}
