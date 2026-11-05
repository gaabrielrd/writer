import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { SidePanelHeader } from './SidePanelHeader';
import styles from './InspectorLayout.module.css';

export interface InspectorLayoutProps {
  /** The collection: table, list or grid. */
  list: ReactNode;
  /** Inspector content; omit to show the list alone. */
  inspector?: ReactNode;
}

/**
 * Collection with a fixed inspector at the right, for reviewing many items in
 * sequence. Callers decide when there is room for it (see `useMediaQuery`).
 */
export function InspectorLayout({ list, inspector }: InspectorLayoutProps) {
  return (
    <div className={styles.layout} data-inspector={inspector ? 'open' : 'closed'}>
      <div className={styles.list}>{list}</div>
      {inspector}
    </div>
  );
}

export interface InspectorProps {
  /** Accessible name of the region and visible heading. */
  title: string;
  /** Short context above the details, such as the category. */
  eyebrow?: ReactNode;
  children: ReactNode;
  /** Item actions; at most one primary. */
  actions?: ReactNode;
  onClose?: () => void;
}

export function Inspector({ title, eyebrow, children, actions, onClose }: InspectorProps) {
  return (
    <aside className={styles.inspector} aria-label={`Detalhes de ${title}`}>
      <SidePanelHeader title={title}>
        {onClose && (
          <Button variant="ghost" size="icon" aria-label="Fechar detalhes" onClick={onClose}>
            <X className="icon icon-sm" aria-hidden="true" />
          </Button>
        )}
      </SidePanelHeader>
      <div className={styles.body}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        {children}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </aside>
  );
}

/** Placeholder shown while nothing is selected. */
export function InspectorEmpty({ children }: { children: ReactNode }) {
  return (
    <aside className={`${styles.inspector} ${styles.empty}`} aria-label="Detalhes">
      <p>{children}</p>
    </aside>
  );
}
