import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '@/shared/ui';
import type { PublicLoreEntity } from '../services/publicBookService';
import styles from './ReaderView.module.css';

const CATEGORY_LABELS: Record<PublicLoreEntity['category'], string> = {
  character: 'Personagem',
  location: 'Local',
  concept: 'Conceito',
  other: 'Outro',
};

export function ReaderLoreTooltip({
  entity,
  children,
}: {
  entity: PublicLoreEntity;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    // Hover-only tooltips must also dismiss when focus remains elsewhere.
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [open]);
  if (entity.isPublic !== true) return <>{children}</>;
  return (
    <span
      className={styles.loreTerm}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Button
        type="button"
        variant="link"
        className={styles.loreTrigger}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        aria-label={`Ver resumo de ${entity.name}`}
      >
        {children}
      </Button>
      {open && (
        <span className={styles.tooltip} role="tooltip" id={id}>
          <strong>{entity.name}</strong>
          <span className={styles.category}>{CATEGORY_LABELS[entity.category]}</span>
          <span>{entity.summary}</span>
        </span>
      )}
    </span>
  );
}
