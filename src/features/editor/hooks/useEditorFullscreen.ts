import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useWorkspaceLayout } from '@/shared/ui';

function scrollOwner(element: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    // O overflow pode desaparecer por um frame durante o reflow; a região CSS
    // continua sendo a dona da rolagem quando o texto volta a ocupar sua altura.
    if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
  }
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

function captureWorkingPassage() {
  const area = document.querySelector<HTMLElement>('[data-editor-scroll-area]');
  if (!area) return () => undefined;
  const owner = scrollOwner(area);
  const viewportTop = owner === document.scrollingElement ? 0 : owner.getBoundingClientRect().top;
  const editable = area.querySelector('[contenteditable]');
  const block = Array.from(editable?.children ?? []).find(
    (element) => element.getBoundingClientRect().bottom > viewportTop,
  );
  let anchor: Element | Range | undefined = block;
  const selection = window.getSelection();
  if (selection?.focusNode && editable?.contains(selection.focusNode)) {
    const caret = document.createRange();
    caret.setStart(selection.focusNode, selection.focusOffset);
    caret.collapse(true);
    if (typeof caret.getBoundingClientRect === 'function') {
      const rect = caret.getBoundingClientRect();
      const viewportHeight =
        owner === document.scrollingElement ? window.innerHeight : owner.clientHeight;
      if (rect.height > 0 && rect.top >= viewportTop && rect.bottom <= viewportTop + viewportHeight)
        anchor = caret;
    }
  }
  if (!anchor) return () => undefined;
  const passage = anchor;
  const offset = passage.getBoundingClientRect().top - viewportTop;
  return () => {
    const connected =
      'startContainer' in passage ? passage.startContainer.isConnected : passage.isConnected;
    if (!area.isConnected || !connected) return;
    const nextOwner = scrollOwner(area);
    const top = nextOwner === document.scrollingElement ? 0 : nextOwner.getBoundingClientRect().top;
    nextOwner.scrollTop += passage.getBoundingClientRect().top - top - offset;
  };
}

export function useEditorFullscreen() {
  const { expanded, setExpanded } = useWorkspaceLayout();
  const frames = useRef<number[]>([]);
  const teardownRestore = useRef<() => void>(() => undefined);
  const toggle = useCallback(() => {
    teardownRestore.current();
    frames.current.forEach(cancelAnimationFrame);
    frames.current = [];
    const restorePassage = captureWorkingPassage();
    // Escape também chega por um listener nativo: conclui o commit do shell
    // antes de medir a nova região, mesmo sob carga de renderização.
    flushSync(() => setExpanded(!expanded));
    // A região pode estabilizar depois dos primeiros frames (fontes/observadores).
    // Acompanha somente essa transição e cede imediatamente a uma ação do autor.
    let active = true;
    let scheduled = false;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (!active || scheduled) return;
            scheduled = true;
            frames.current.push(
              requestAnimationFrame(() => {
                scheduled = false;
                if (active) restorePassage();
              }),
            );
          });
    const area = document.querySelector('[data-editor-scroll-area]');
    if (area) {
      observer?.observe(area);
      const editable = area.querySelector('[contenteditable]');
      if (editable) observer?.observe(editable);
    }
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart', 'beforeinput'] as const;
    const stop = () => {
      active = false;
      observer?.disconnect();
      window.clearTimeout(timer);
      frames.current.forEach(cancelAnimationFrame);
      frames.current = [];
      events.forEach((event) => document.removeEventListener(event, stop, true));
    };
    const timer = window.setTimeout(stop, 500);
    events.forEach((event) => document.addEventListener(event, stop, true));
    teardownRestore.current = stop;
    // ResizeObserver pode provocar outro commit após os dois frames iniciais.
    // Restaura também nos dois frames seguintes, sem alterar seleção ou foco.
    const restore = (remaining: number) => {
      restorePassage();
      if (remaining > 1) frames.current.push(requestAnimationFrame(() => restore(remaining - 1)));
    };
    frames.current.push(
      requestAnimationFrame(() => {
        frames.current.push(requestAnimationFrame(() => restore(3)));
      }),
    );
  }, [expanded, setExpanded]);
  useEffect(
    () => () => {
      teardownRestore.current();
      frames.current.forEach(cancelAnimationFrame);
    },
    [],
  );
  useEffect(() => {
    if (!expanded) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="menu"], [role="listbox"]:not([data-editor-minimap-list]), [data-editor-selection-actions]',
        )
      )
        return;
      event.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', exit);
    return () => document.removeEventListener('keydown', exit);
  }, [expanded, toggle]);
  return { expanded, toggle };
}
