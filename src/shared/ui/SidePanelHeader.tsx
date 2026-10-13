import type { ReactNode } from 'react';
import styles from './SidePanelHeader.module.css';

export interface SidePanelHeaderProps {
  title: string;
  children: ReactNode;
}

export function SidePanelHeader({ title, children }: SidePanelHeaderProps) {
  return (
    <header className={styles.header} data-side-panel-header>
      <h2 className={styles.title} title={title}>
        {title}
      </h2>
      <div className={styles.actions} role="group" aria-label={`Ações de ${title}`}>
        {children}
      </div>
    </header>
  );
}
