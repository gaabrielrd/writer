import { useCallback, useEffect, useRef } from 'react';
import { useWorkspaceLayout } from '@/shared/ui';

function scrollOwner(element: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (
      /auto|scroll/.test(getComputedStyle(node).overflowY) &&
      node.scrollHeight > node.clientHeight + 1
    )
      return node;
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
  const block = Array.from(area.querySelector('[contenteditable]')?.children ?? []).find(
    (element) => element.getBoundingClientRect().bottom > viewportTop,
  );
  if (!block) return () => undefined;
  const offset = block.getBoundingClientRect().top - viewportTop;
  return () => {
    if (!area.isConnected || !block.isConnected) return;
    const nextOwner = scrollOwner(area);
    const top = nextOwner === document.scrollingElement ? 0 : nextOwner.getBoundingClientRect().top;
    nextOwner.scrollTop += block.getBoundingClientRect().top - top - offset;
  };
}

export function useEditorFullscreen() {
  const { expanded, setExpanded } = useWorkspaceLayout();
  const frames = useRef<number[]>([]);
  const toggle = useCallback(() => {
    frames.current.forEach(cancelAnimationFrame);
    frames.current = [];
    const restorePassage = captureWorkingPassage();
    setExpanded(!expanded);
    frames.current.push(
      requestAnimationFrame(() => {
        frames.current.push(requestAnimationFrame(restorePassage));
      }),
    );
  }, [expanded, setExpanded]);
  useEffect(
    () => () => {
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
