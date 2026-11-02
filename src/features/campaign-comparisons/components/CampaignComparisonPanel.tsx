import { useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Button, Card } from '@/shared/ui';
import { CampaignComparisonPreparations } from './CampaignComparisonPreparations';
import { ComparisonDialog } from './ComparisonDialog';
import styles from './Comparisons.module.css';
import type { ComparisonReadEnvelope } from '../model/campaignComparison';
export interface CampaignComparisonPanelProps {
  campaignId: string;
  currentBaseId: string;
  onReviewAdoption?: (context: ComparisonReadEnvelope) => void;
}
export function CampaignComparisonPanel(props: CampaignComparisonPanelProps) {
  const { user } = useAuth(),
    actor = useRef('');
  const key = JSON.stringify([user?.uid, props.campaignId, props.currentBaseId]);
  // Prevent callbacks from the previous actor/base during the changing render.
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  return user ? (
    <PanelSession key={key} uid={user.uid} {...props} isActive={() => actor.current === key} />
  ) : null;
}
function PanelSession(
  props: CampaignComparisonPanelProps & { uid: string; isActive: () => boolean },
) {
  const [open, setOpen] = useState(false),
    [attempt, setAttempt] = useState(0),
    activeAttempt = useRef(0);
  return (
    <section className={styles.stack} aria-label="Atualização da base da campanha">
      <Card className={styles.panel}>
        <h2>Comparar uma nova base</h2>
        <p>
          Prepare outra captura completa da aventura e confira as mudanças antes de qualquer
          atualização da campanha.
        </p>
        <Button
          onClick={() => {
            activeAttempt.current++;
            setAttempt(activeAttempt.current);
            setOpen(true);
          }}
        >
          Preparar nova candidata
        </Button>
      </Card>
      <ComparisonDialog
        key={attempt}
        uid={props.uid}
        selection={{ campaignId: props.campaignId, currentBaseId: props.currentBaseId }}
        open={open}
        isActive={() => props.isActive() && activeAttempt.current === attempt}
        onClose={() => setOpen(false)}
        onReviewAdoption={props.onReviewAdoption}
      />
      <CampaignComparisonPreparations
        campaignId={props.campaignId}
        onReviewAdoption={props.onReviewAdoption}
      />
    </section>
  );
}
