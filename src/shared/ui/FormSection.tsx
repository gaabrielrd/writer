import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './FormSection.module.css';

export interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

/** Optional fields remain mounted so collapsing a section preserves the draft. */
export function FormSection({
  title,
  description,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
}: FormSectionProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(defaultOpen);
  const isOpen = open ?? expanded;
  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>
        <button
          id={`${id}-trigger`}
          type="button"
          className={styles.trigger}
          aria-expanded={isOpen}
          aria-controls={`${id}-content`}
          disabled={disabled}
          onClick={() => {
            setExpanded(!isOpen);
            onOpenChange?.(!isOpen);
          }}
        >
          <span className={styles.label}>
            <span>{title}</span>
            {description && <span className={styles.description}>{description}</span>}
          </span>
          <ChevronDown className="icon icon-sm" aria-hidden="true" />
        </button>
      </h3>
      <div id={`${id}-content`} className={styles.content} hidden={!isOpen}>
        {children}
      </div>
    </section>
  );
}
