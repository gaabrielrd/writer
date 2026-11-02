import { useRef } from 'react';
import { useAuth } from '@/features/auth';
import type { AdoptionSelection } from '../model/campaignAdoption';
import { AdoptionDialog } from './AdoptionDialog';
export interface CampaignAdoptionDialogProps {
  selection: AdoptionSelection;
  open: boolean;
  onClose: () => void;
  onAdopted?: () => void;
  onAdaptLore?: () => void;
  onPendingChange?: (pending: boolean) => void;
}
export function CampaignAdoptionDialog(props: CampaignAdoptionDialogProps) {
  const { user } = useAuth(),
    actor = useRef('');
  const key = JSON.stringify([user?.uid, props.selection]);
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  return user ? (
    <AdoptionDialog key={key} {...props} uid={user.uid} isActive={() => actor.current === key} />
  ) : null;
}
