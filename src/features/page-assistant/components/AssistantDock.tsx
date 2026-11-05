import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Expand, GripVertical, LocateFixed, Minus, Shrink, Sparkles } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui';
import { useActiveDialog } from '../hooks/useActiveDialog';
import {
  defaultDock,
  readDockPosition,
  saveDockPosition,
  type DockMode,
  type DockPosition,
} from '../services/dockPreferences';
import styles from './PageAssistant.module.css';
function viewport() {
  const v = window.visualViewport;
  return {
    width: v?.width ?? window.innerWidth,
    height: v?.height ?? window.innerHeight,
    left: v?.offsetLeft ?? 0,
    top: v?.offsetTop ?? 0,
  };
}
export function AssistantDock({
  context,
  scope,
  initialOpen = false,
  visible = true,
  children,
}: {
  context: string;
  /**
   * Project or area being assisted. The dock minimizes again whenever it
   * changes, but stays as it is while moving inside the same project.
   */
  scope?: string;
  initialOpen?: boolean;
  visible?: boolean;
  children: (expanded: boolean, expand: () => void, compact: () => void) => ReactNode;
}) {
  const { user } = useAuth();
  const dialog = useActiveDialog();
  const contentId = useId();
  const [preferences, setPreferences] = useState<DockPosition>(() =>
    user ? readDockPosition(user.uid) : { ...defaultDock },
  );
  const [chosenMode, setChosenMode] = useState<DockMode>(initialOpen ? 'expanded' : 'minimized');
  const [observedScope, setObservedScope] = useState(scope);
  const [bounds, setBounds] = useState(viewport);
  const [size, setSize] = useState({ width: 560, height: 120 });
  const [unsaved, setUnsaved] = useState(false);
  const [writing, setWriting] = useState(false);
  const [conceptionInDialog, setConceptionInDialog] = useState(false);
  if (observedScope !== scope) {
    setObservedScope(scope);
    if (!initialOpen) {
      setWriting(false);
      setChosenMode('minimized');
    }
  }
  const mode =
    writing || (dialog && bounds.width <= 760 && chosenMode === 'compact')
      ? 'minimized'
      : chosenMode;
  const panel = useRef<HTMLElement>(null);
  const grip = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const preferencesRef = useRef(preferences);
  const previousInitialOpen = useRef(initialOpen);
  useEffect(() => {
    if (initialOpen && !previousInitialOpen.current) {
      void Promise.resolve().then(() => {
        setWriting(false);
        setChosenMode('expanded');
      });
    }
    previousInitialOpen.current = initialOpen;
  }, [initialOpen]);
  const drag = useRef<{
    pointer: number;
    dx: number;
    dy: number;
    origin: typeof preferences;
  } | null>(null);
  const suppress =
    !visible ||
    conceptionInDialog ||
    Boolean(dialog?.querySelector('[data-writer-onboarding], [data-writer-navigation]'));
  useEffect(() => {
    const update = () =>
      setConceptionInDialog(Boolean(dialog?.querySelector('[data-conception-assistant]')));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => observer.disconnect();
  }, [dialog]);
  const persist = (next: DockPosition) => {
    setPreferences(next);
    if (user) setUnsaved(!saveDockPosition(user.uid, next));
  };
  const setMode = (next: DockMode) => {
    setWriting(false);
    if (next !== 'expanded' && document.activeElement?.closest('[data-assistant-content]'))
      document.querySelector<HTMLButtonElement>('[data-assistant-grip]')?.focus();
    setChosenMode(next);
  };
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element || suppress) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((old) =>
        old.width === rect.width && old.height === rect.height
          ? old
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mode, dialog, suppress]);
  useLayoutEffect(() => {
    if (suppress) return;
    const host = dialog ?? document.documentElement;
    const previous = host.style.getPropertyValue('--page-assistant-height');
    host.style.setProperty('--page-assistant-height', `${size.height}px`);
    return () => {
      if (previous) host.style.setProperty('--page-assistant-height', previous);
      else host.style.removeProperty('--page-assistant-height');
    };
  }, [dialog, size.height, suppress]);
  useEffect(() => {
    const resize = () => setBounds(viewport());
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
    };
  }, []);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || focused.closest('[data-page-assistant]')) return;
      if (!focused.matches('input, textarea, [contenteditable="true"]')) {
        setWriting(false);
        return;
      }
      const dock = panel.current?.getBoundingClientRect();
      if (!dock) return;
      const selection = focused.isContentEditable ? window.getSelection() : null;
      const range = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
      const rect = range?.height ? range : focused.getBoundingClientRect();
      // Keep the current caret/field clear without changing the saved presentation preference.
      if (
        rect.bottom > dock.top &&
        rect.top < dock.bottom &&
        rect.right >= dock.left &&
        rect.left <= dock.right
      )
        setWriting(true);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    document.addEventListener('focusin', update);
    document.addEventListener('selectionchange', update);
    document.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', update);
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('scroll', update, true);
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        panel.current?.contains(event.target as Node)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setMode(mode === 'expanded' ? 'compact' : 'minimized');
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });
  const availableX = Math.max(0, bounds.width - size.width - 24);
  const availableY = Math.max(0, bounds.height - size.height - 24);
  const left = bounds.left + 12 + preferences.x * availableX;
  const top = bounds.top + 12 + preferences.y * availableY;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  if (suppress) return null;
  return createPortal(
    <aside
      tabIndex={-1}
      ref={panel}
      data-page-assistant
      data-writer-tour="assistant"
      data-mode={mode}
      className={`${styles.dock} ${dialog ? styles.inDialog : ''}`}
      style={
        dialog
          ? undefined
          : {
              left,
              top,
              maxHeight: Math.max(96, bounds.height - 24),
              maxWidth: Math.max(0, bounds.width - 24),
            }
      }
      aria-label="Assistente da página"
    >
      <header className={styles.header}>
        <Button
          ref={grip}
          data-assistant-grip
          size="icon"
          variant="ghost"
          className={styles.grip}
          aria-label="Mover assistente"
          title="Arraste ou use as setas; Escape cancela o movimento"
          onPointerDown={(e) => {
            if (dialog || e.button !== 0) return;
            preferencesRef.current = preferences;
            drag.current = {
              pointer: e.pointerId,
              dx: e.clientX - left,
              dy: e.clientY - top,
              origin: preferencesRef.current,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const start = drag.current;
            if (!start || start.pointer !== e.pointerId) return;
            const next = {
              ...preferencesRef.current,
              x: availableX ? clamp((e.clientX - start.dx - bounds.left - 12) / availableX) : 0.5,
              y: availableY ? clamp((e.clientY - start.dy - bounds.top - 12) / availableY) : 1,
            };
            preferencesRef.current = next;
            setPreferences(next);
          }}
          onPointerUp={() => {
            if (drag.current) {
              drag.current = null;
              persist(preferencesRef.current);
            }
          }}
          onPointerCancel={() => {
            if (drag.current) {
              const origin = drag.current.origin;
              drag.current = null;
              preferencesRef.current = origin;
              setPreferences(origin);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && drag.current) {
              e.preventDefault();
              e.stopPropagation();
              const origin = drag.current.origin;
              drag.current = null;
              preferencesRef.current = origin;
              setPreferences(origin);
              return;
            }
            if (dialog) return;
            const delta: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const movement = delta[e.key];
            if (movement) {
              e.preventDefault();
              const [x, y] = movement;
              const amount = e.shiftKey ? 48 : 16;
              persist({
                ...preferences,
                x: clamp(preferences.x + (x * amount) / Math.max(1, availableX)),
                y: clamp(preferences.y + (y * amount) / Math.max(1, availableY)),
              });
            }
          }}
        >
          <GripVertical className="icon icon-sm" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          className={styles.title}
          aria-label="Assistente da página"
          aria-expanded={mode !== 'minimized'}
          aria-controls={contentId}
          onClick={() => {
            if (mode !== 'minimized') setMode('minimized');
            // Narrow dialogs keep the compact bar out of the way, so open the full conversation.
            else setMode(dialog && bounds.width <= 760 ? 'expanded' : 'compact');
          }}
        >
          <Sparkles className="icon icon-sm" aria-hidden="true" />
          Assistente
        </Button>
        {mode !== 'minimized' && (
          <>
            <span className={styles.context} title={`Contexto: ${context}`}>
              <span className="sr-only">Contexto: </span>
              {context}
            </span>
            <span className={styles.spacer} />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Restaurar posição do assistente"
              title="Restaurar posição"
              onClick={() => persist({ x: 0.5, y: 1 })}
            >
              <LocateFixed className="icon icon-sm" aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={mode === 'expanded' ? 'Recolher conversa' : 'Expandir conversa'}
              title={mode === 'expanded' ? 'Recolher conversa' : 'Expandir conversa'}
              onClick={() => setMode(mode === 'expanded' ? 'compact' : 'expanded')}
            >
              {mode === 'expanded' ? (
                <Shrink className="icon icon-sm" aria-hidden="true" />
              ) : (
                <Expand className="icon icon-sm" aria-hidden="true" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Minimizar assistente"
              title="Minimizar"
              onClick={() => setMode('minimized')}
            >
              <Minus className="icon icon-sm" aria-hidden="true" />
            </Button>
          </>
        )}
      </header>
      <div
        id={contentId}
        data-assistant-content
        ref={content}
        className={styles.dockContent}
        hidden={mode === 'minimized'}
      >
        {children(
          mode === 'expanded',
          () => setMode('expanded'),
          () => setMode('compact'),
        )}
        {unsaved && (
          <p className={styles.meta} role="status">
            Posição mantida apenas nesta sessão: armazenamento indisponível.
          </p>
        )}
      </div>
    </aside>,
    dialog ?? document.body,
  );
}
