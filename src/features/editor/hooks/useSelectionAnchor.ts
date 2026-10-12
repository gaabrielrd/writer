import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

export interface SelectionAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Geometry belongs to the editor; the AI feature only receives viewport coordinates.
export function useSelectionAnchor(editor: Editor | null, enabled: boolean) {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);

  useEffect(() => {
    if (!editor || !enabled) return;
    let disposed = false;
    let dismissedSelection = '';
    const selectionKey = () => `${editor.state.selection.from}:${editor.state.selection.to}`;
    let previousSelection = selectionKey();
    const update = () => {
      if (disposed || editor.isDestroyed) return;
      const { from, to, empty } = editor.state.selection;
      if (previousSelection !== selectionKey()) dismissedSelection = '';
      previousSelection = selectionKey();
      const toolbarFocused = document.activeElement?.closest('[data-editor-selection-actions]');
      if (
        empty ||
        (!editor.isFocused && !toolbarFocused) ||
        dismissedSelection === selectionKey() ||
        !editor.state.doc.textBetween(from, to, '\n').trim()
      ) {
        setAnchor(null);
        return;
      }
      try {
        const start = editor.view.coordsAtPos(from);
        const end = editor.view.coordsAtPos(to);
        const bounds = editor.view.dom.getBoundingClientRect();
        const scrollArea = editor.view.dom.closest('[data-editor-scroll-area]');
        const area = scrollArea?.getBoundingClientRect() ?? bounds;
        const top = Math.min(start.top, end.top);
        const bottom = Math.max(start.bottom, end.bottom);
        if (bottom < Math.max(0, area.top) || top > Math.min(window.innerHeight, area.bottom)) {
          setAnchor(null);
          return;
        }
        setAnchor({
          top: Math.max(top, area.top, 0),
          bottom: Math.min(bottom, area.bottom, window.innerHeight),
          left: start.top === end.top ? Math.min(start.left, end.left) : bounds.left,
          right: start.top === end.top ? Math.max(start.right, end.right) : bounds.right,
        });
      } catch {
        setAnchor(null);
      }
    };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        if (
          event.target instanceof Node &&
          editor.view.dom.contains(event.target) &&
          (event.key.startsWith('Arrow') ||
            event.key === 'Home' ||
            event.key === 'End' ||
            ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a'))
        ) {
          dismissedSelection = '';
          queueMicrotask(update);
        }
        return;
      }
      dismissedSelection = selectionKey();
      setAnchor(null);
      if (document.activeElement?.closest('[data-editor-selection-actions]')) {
        editor.view.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (editor.view.dom.contains(event.target)) {
        dismissedSelection = '';
        return;
      }
      if (event.target.closest('[data-editor-selection-actions]')) return;
      dismissedSelection = selectionKey();
      setAnchor(null);
    };
    // Blur fires before the new activeElement is installed (including keyboard
    // navigation into the toolbar), so read focus after the native event finishes.
    const scheduleUpdate = () => queueMicrotask(update);
    editor.on('transaction', scheduleUpdate);
    editor.on('focus', scheduleUpdate);
    editor.on('blur', scheduleUpdate);
    // Capture Escape before a tooltip consumes it, so dismissal also returns
    // focus to the manuscript when an action has a keyboard tooltip open.
    document.addEventListener('keydown', dismiss, true);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    update();
    return () => {
      disposed = true;
      editor.off('transaction', scheduleUpdate);
      editor.off('focus', scheduleUpdate);
      editor.off('blur', scheduleUpdate);
      document.removeEventListener('keydown', dismiss, true);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor, enabled]);

  return enabled ? anchor : null;
}
