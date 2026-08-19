import { useState, type ReactNode } from 'react';
import { Badge } from '@vitru/styleguide';
import type { LoreCategory, LoreEntity } from '../model/loreEntity';
import styles from './LoreTooltip.module.css';

export interface LoreTooltipProps {
  entity: LoreEntity;
  children: ReactNode;
}

const CATEGORY_LABELS: Record<LoreCategory, string> = {
  character: 'Personagem',
  location: 'Local',
  concept: 'Conceito',
  other: 'Outro',
};

const CATEGORY_BADGES: Record<
  LoreCategory,
  'neutral' | 'accent' | 'success' | 'danger' | 'highlight'
> = {
  character: 'accent',
  location: 'success',
  concept: 'highlight',
  other: 'neutral',
};

export function LoreTooltip({ entity, children }: LoreTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      tabIndex={0}
      role="button"
      aria-label={`Ver resumo de ${entity.name}`}
    >
      {children}
      {isVisible && (
        <div className={styles.tooltip} role="tooltip">
          <div className={styles.header}>
            <strong className={styles.name}>{entity.name}</strong>
            <Badge variant={CATEGORY_BADGES[entity.category]}>
              {CATEGORY_LABELS[entity.category]}
            </Badge>
          </div>
          <p className={styles.summary}>{entity.summary}</p>
          {entity.aliases.length > 0 && (
            <div className={styles.aliases}>
              <span className={styles.aliasLabel}>Apelidos:</span> {entity.aliases.join(', ')}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
