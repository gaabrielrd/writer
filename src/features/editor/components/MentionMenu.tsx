import { useEffect, useRef } from 'react';
import { Badge } from '@/shared/ui';
import type { LoreCategory, LoreEntity } from '@/features/lore';
import styles from './MentionMenu.module.css';

export interface MentionMenuProps {
  entities: LoreEntity[];
  query: string;
  selectedIndex: number;
  onSelect: (entity: LoreEntity) => void;
  onHoverIndex: (index: number) => void;
}

const CATEGORY_BADGES: Record<LoreCategory, 'default' | 'accent' | 'success' | 'secondary'> = {
  character: 'accent',
  location: 'success',
  concept: 'default',
  other: 'secondary',
};

const CATEGORY_LABELS: Record<LoreCategory, string> = {
  character: 'Personagem',
  location: 'Local',
  concept: 'Conceito',
  other: 'Outro',
};

export function MentionMenu({ entities, selectedIndex, onSelect, onHoverIndex }: MentionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeItem = menuRef.current?.querySelector(`.${styles.itemSelected}`);
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (entities.length === 0) {
    return (
      <div className={styles.menu} ref={menuRef} role="listbox">
        <div className={styles.emptyItem}>Nenhuma entidade encontrada</div>
      </div>
    );
  }

  return (
    <div
      className={styles.menu}
      ref={menuRef}
      role="listbox"
      aria-label="Sugestões de menção do compêndio"
    >
      <div className={styles.header}>
        <span className={styles.headerTitle}>Mencionar do Compêndio</span>
        <span className={styles.headerHint}>Use ↑ ↓ e Enter</span>
      </div>
      <div className={styles.list}>
        {entities.map((entity, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={entity.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
              onMouseEnter={() => onHoverIndex(index)}
              onClick={() => onSelect(entity)}
            >
              <div className={styles.itemHeader}>
                <strong className={styles.itemName}>{entity.name}</strong>
                <Badge variant={CATEGORY_BADGES[entity.category]}>
                  {CATEGORY_LABELS[entity.category]}
                </Badge>
              </div>
              <p className={styles.itemSummary}>{entity.summary}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
