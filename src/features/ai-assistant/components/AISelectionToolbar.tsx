import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Feather, Search, Sparkles, Wand2 } from 'lucide-react';
import { Button, Tooltip } from '@/shared/ui';
import type { AIActionType } from '../model/aiPrompt';
import styles from './AISelectionToolbar.module.css';

interface AISelectionToolbarProps {
  anchor: { top: number; bottom: number; left: number; right: number };
  onAction: (action: AIActionType) => void;
}

const actions = [
  { action: 'continue', label: 'Continuar Cena', shortLabel: 'Continuar', Icon: Wand2 },
  { action: 'improve_style', label: 'Aprimorar Estilo', shortLabel: 'Estilo', Icon: Feather },
  {
    action: 'check_consistency',
    label: 'Coerência com Lore',
    shortLabel: 'Coerência',
    Icon: Search,
  },
  { action: 'custom', label: 'Instrução personalizada', shortLabel: '', Icon: Sparkles },
] as const;

export function AISelectionToolbar({ anchor, onAction }: AISelectionToolbarProps) {
  const toolbar = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    const place = () => {
      const { width, height } = element.getBoundingClientRect();
      const above = anchor.top - height - 8;
      setPosition({
        top: Math.max(
          8,
          Math.min(above >= 8 ? above : anchor.bottom + 8, window.innerHeight - height - 8),
        ),
        left: Math.max(
          8,
          Math.min((anchor.left + anchor.right - width) / 2, window.innerWidth - width - 8),
        ),
      });
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, [anchor]);

  return createPortal(
    <div
      ref={toolbar}
      data-editor-selection-actions
      role="toolbar"
      aria-label="Assistente IA para o texto selecionado"
      className={styles.toolbar}
      style={position}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          buttons[
            (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
          ]?.focus();
        }
      }}
    >
      {actions.map(({ action, label, shortLabel, Icon }) => (
        <Tooltip key={action} content={label}>
          <Button variant="ghost" size="sm" aria-label={label} onClick={() => onAction(action)}>
            <Icon className="icon icon-sm" aria-hidden="true" />
            {shortLabel && <span className={styles.label}>{shortLabel}</span>}
          </Button>
        </Tooltip>
      ))}
    </div>,
    document.body,
  );
}
