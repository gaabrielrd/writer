import { Tooltip } from '@/shared/ui';
import { Sparkles } from 'lucide-react';
import type { UserTier } from '../model/user';
import styles from './CreditsBadge.module.css';

export interface CreditsBadgeProps {
  credits: number;
  tier?: UserTier;
  className?: string;
}

export function CreditsBadge({ credits, tier = 'free', className = '' }: CreditsBadgeProps) {
  return (
    <Tooltip content={`${credits} créditos de IA · Plano ${tier.toUpperCase()}`}>
      <button
        type="button"
        className={styles.badge + ' ' + className}
        aria-label={`${credits} créditos de IA, plano ${tier}`}
      >
        <Sparkles className="icon icon-sm" aria-hidden="true" />
        <span className={styles.count}>{credits}</span>
      </button>
    </Tooltip>
  );
}
