import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './AnchoredPanel.module.css';
export function AnchoredPanel({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const update = () => {
      const a = anchor.current?.getBoundingClientRect(),
        p = panel.current?.getBoundingClientRect();
      if (!a || !p) return;
      const above = a.top - p.height - 8;
      setPosition({
        left: Math.max(12, Math.min(a.right - p.width, window.innerWidth - p.width - 12)),
        top: Math.max(
          12,
          above >= 12 ? above : Math.min(a.bottom + 8, window.innerHeight - p.height - 12),
        ),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor]);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (
        !panel.current?.contains(target) &&
        !anchor.current?.contains(target) &&
        !target.closest('[data-radix-popper-content-wrapper]')
      )
        onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && panel.current?.contains(e.target as Node)) {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      className={styles.panel}
      style={position}
    >
      {children}
    </div>,
    document.body,
  );
}
