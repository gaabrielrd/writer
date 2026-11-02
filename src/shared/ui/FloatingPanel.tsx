import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Minus, Expand, X, LocateFixed } from 'lucide-react';
import { Button } from './Button';
import styles from './FloatingPanel.module.css';

export function FloatingPanel({
  title,
  base,
  collapsed,
  onCollapse,
  onClose,
  children,
  footer,
  dirty = false,
}: {
  title: string;
  base: 'light' | 'dark';
  collapsed: boolean;
  onCollapse: (value: boolean) => void;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  dirty?: boolean;
}) {
  const id = useId(),
    panel = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: Math.max(12, window.innerWidth - 400), y: 96 });
  const [blocked, setBlocked] = useState(false);
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const clamp = (x: number, y: number) => {
    const rect = panel.current?.getBoundingClientRect();
    return {
      x: Math.max(12, Math.min(x, window.innerWidth - (rect?.width ?? 380) - 12)),
      y: Math.max(12, Math.min(y, window.innerHeight - (rect?.height ?? 60) - 12)),
    };
  };
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() =>
      setPosition((p) => {
        const next = clamp(p.x, p.y);
        return next.x === p.x && next.y === p.y ? p : next;
      }),
    );
    if (panel.current) observer.observe(panel.current);
    const resize = () => setPosition((p) => clamp(p.x, p.y));
    resize();
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
    const check = () =>
      setBlocked(
        Array.from(document.querySelectorAll('[role="dialog"]')).some(
          (element) =>
            element.getAttribute('aria-modal') !== 'false' &&
            !element.closest('[data-radix-popper-content-wrapper]'),
        ),
      );
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal'],
    });
    check();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        panel.current?.contains(event.target as Node)
      ) {
        event.stopPropagation();
        onCollapse(true);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onCollapse]);
  useEffect(() => {
    if (collapsed && panel.current?.contains(document.activeElement))
      collapseButton.current?.focus();
  }, [collapsed]);
  return createPortal(
    <section
      ref={panel}
      aria-labelledby={id}
      data-floating-panel=""
      inert={blocked}
      className={styles.panel}
      data-collapsed={collapsed}
      style={{ left: position.x, top: position.y, colorScheme: base }}
    >
      <header className={styles.header}>
        <button
          type="button"
          className={styles.grip}
          aria-label="Mover painel de tema"
          title="Arraste ou use as setas para mover"
          onPointerDown={(event) => {
            if (window.matchMedia('(max-width: 600px)').matches || event.button !== 0) return;
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              originX: position.x,
              originY: position.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (start)
              setPosition(
                clamp(
                  start.originX + event.clientX - start.x,
                  start.originY + event.clientY - start.y,
                ),
              );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            const deltas: Record<string, [number, number]> = {
              ArrowLeft: [-16, 0],
              ArrowRight: [16, 0],
              ArrowUp: [0, -16],
              ArrowDown: [0, 16],
            };
            const delta = deltas[event.key];
            if (delta) {
              event.preventDefault();
              setPosition((p) => clamp(p.x + delta[0], p.y + delta[1]));
            }
          }}
        >
          <GripVertical className="icon icon-sm" aria-hidden="true" />
        </button>
        <h2 id={id} ref={heading} tabIndex={-1}>
          {title}
          {dirty ? ' •' : ''}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Reposicionar painel"
          onClick={() => setPosition(clamp(window.innerWidth - 400, 96))}
        >
          <LocateFixed className="icon icon-sm" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          ref={collapseButton}
          aria-label={collapsed ? 'Expandir painel de tema' : 'Recolher painel de tema'}
          onClick={() => onCollapse(!collapsed)}
        >
          {collapsed ? (
            <Expand className="icon icon-sm" aria-hidden="true" />
          ) : (
            <Minus className="icon icon-sm" aria-hidden="true" />
          )}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Fechar editor de tema" onClick={onClose}>
          <X className="icon icon-sm" aria-hidden="true" />
        </Button>
      </header>
      <div hidden={collapsed} className={styles.body}>
        {children}
      </div>
      {!collapsed && <footer className={styles.footer}>{footer}</footer>}
    </section>,
    document.body,
  );
}
