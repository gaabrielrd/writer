import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/shared/ui';
import { useActiveDialog } from '../hooks/useActiveDialog';
import styles from './PageAssistant.module.css';
/** Keep one conception conversation available inside the active modal's focus scope. */
export function PageAssistantSurface({ children }: { children: ReactNode }) {
  const dialog = useActiveDialog();
  const [open, setOpen] = useState(false);
  if (!dialog) return <div data-page-assistant>{children}</div>;
  return createPortal(
    <div data-page-assistant className={styles.conceptionSurface} data-conception-assistant>
      {!open && (
        <Button className={styles.launcher} onClick={() => setOpen(true)}>
          Continuar conversa criativa
        </Button>
      )}
      {open && (
        <aside className={styles.panel} aria-label="Conversa criativa">
          <div className={styles.header}>
            <h2>Conversa criativa</h2>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Recolher conversa criativa"
              onClick={() => setOpen(false)}
            >
              <X className="icon" aria-hidden="true" />
            </Button>
          </div>
          <div className={styles.messages}>{children}</div>
        </aside>
      )}
    </div>,
    dialog,
  );
}
