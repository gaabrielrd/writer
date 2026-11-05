import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';

type Position = { x: number; y: number };
const controls =
  'a, button, input, select, textarea, summary, label, [role="button"], [role="link"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function isControl(target: EventTarget, panel: HTMLElement) {
  const control = target instanceof Element ? target.closest(controls) : null;
  return control !== null && control !== panel && !control.hasAttribute('data-guide-drag-handle');
}

function constrain(panel: HTMLElement, x: number, y: number): Position {
  const viewport = window.visualViewport;
  const left = (viewport?.offsetLeft ?? 0) + 12;
  const top = (viewport?.offsetTop ?? 0) + 12;
  const rect = panel.getBoundingClientRect();
  return {
    x: Math.max(left, Math.min(x, left + (viewport?.width ?? window.innerWidth) - rect.width - 24)),
    y: Math.max(
      top,
      Math.min(y, top + (viewport?.height ?? window.innerHeight) - rect.height - 24),
    ),
  };
}

export function useGuideDrag(panel: RefObject<HTMLElement | null>, hidden: boolean) {
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    left: number;
    top: number;
    origin: Position | null;
  } | null>(null);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element || hidden) return;
    const resize = () =>
      setPosition((old) => {
        if (!old) return old;
        const next = constrain(element, old.x, old.y);
        return old.x === next.x && old.y === next.y ? old : next;
      });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(element);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
    };
  }, [panel, hidden]);

  const finish = (element: HTMLElement, cancel = false) => {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    setDragging(false);
    if (cancel)
      setPosition(start.origin ? constrain(element, start.origin.x, start.origin.y) : null);
    if (element.hasPointerCapture(start.pointer)) element.releasePointerCapture(start.pointer);
  };
  const endPointer = (event: PointerEvent<HTMLElement>, cancel = false) => {
    if (drag.current?.pointer === event.pointerId) finish(event.currentTarget, cancel);
  };

  return {
    style: position ? { left: position.x, top: position.y } : undefined,
    'data-dragging': dragging,
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const element = event.currentTarget;
      if (
        event.button !== 0 ||
        event.isPrimary === false ||
        drag.current ||
        isControl(event.target, element)
      )
        return;
      const rect = element.getBoundingClientRect();
      // Native scrollbar tracks are controls too; keep their pointer interaction.
      if (
        event.clientX >= rect.left + element.clientLeft + element.clientWidth ||
        event.clientY >= rect.top + element.clientTop + element.clientHeight
      )
        return;
      event.preventDefault();
      element.focus({ preventScroll: true });
      drag.current = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
        origin: position,
      };
      element.setPointerCapture(event.pointerId);
      setDragging(true);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId) return;
      setPosition(
        constrain(
          event.currentTarget,
          start.left + event.clientX - start.x,
          start.top + event.clientY - start.y,
        ),
      );
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => endPointer(event),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => endPointer(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => endPointer(event, true),
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault();
        event.stopPropagation();
        finish(event.currentTarget, true);
        return;
      }
      if (isControl(event.target, event.currentTarget)) return;
      const delta: Record<string, Position> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const direction = delta[event.key];
      if (!direction) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const amount = event.shiftKey ? 48 : 16;
      setPosition(
        constrain(
          event.currentTarget,
          rect.left + direction.x * amount,
          rect.top + direction.y * amount,
        ),
      );
    },
  };
}
