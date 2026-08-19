import { Sparkles } from 'lucide-react';
import type { UserTier } from '../model/user';
import styles from './CreditsBadge.module.css';

export interface CreditsBadgeProps {
  credits: number;
  tier?: UserTier;
}

export function CreditsBadge({ credits, tier = 'free' }: CreditsBadgeProps) {
  return (
    <div className={styles.badge} title={`Saldo de créditos de IA (${tier})`}>
      <Sparkles className="icon icon-sm" aria-hidden="true" />
      <span className={styles.count}>{credits}</span>
      <span className={styles.label}>créditos</span>
      <span className={styles.tier}>({tier})</span>
    </div>
  );
}
