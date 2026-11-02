import styles from './WorkProgress.module.css';
import { Alert, Button } from '@/shared/ui';
import type { WorkActivityFeedback } from '../hooks/useWorkActivity';
export function WorkActivityNotice({ activity }: { activity: WorkActivityFeedback }) {
  if (!activity.error) return null;
  return (
    <Alert variant="warning" title="Retomada não atualizada">
      {activity.error}
      <p>Você pode continuar trabalhando neste projeto.</p>
      <Button
        className={styles.wrapButton}
        variant="secondary"
        disabled={activity.loading}
        onClick={activity.retry}
      >
        {activity.conflict
          ? 'Registrar este recurso como último acesso'
          : 'Tentar registrar novamente'}
      </Button>
    </Alert>
  );
}
