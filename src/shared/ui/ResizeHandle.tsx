import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import styles from './ResizeHandle.module.css';

// WAI-ARIA defines a focusable separator with aria-valuenow as an interactive window splitter.
// jsx-a11y still classifies every separator as noninteractive; the exemption is local to this widget.
// https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */

export interface ResizeHandleProps {
  label: string;
  controls?: string;
  containerRef: RefObject<HTMLElement | null>;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
}

/** Divisor vertical que controla a porcentagem ocupada pela região à direita. */
export function ResizeHandle({
  label,
  controls,
  containerRef,
  value,
  min,
  max,
  defaultValue,
  onValueChange,
  onValueCommit,
}: ResizeHandleProps) {
  const drag = useRef<{
    pointerId: number;
    x: number;
    width: number;
    initial: number;
    value: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (next: number) => Math.round(Math.min(max, Math.max(min, next)) * 10) / 10;
  const change = (next: number) => {
    const bounded = clamp(next);
    onValueChange(bounded);
    onValueCommit?.(bounded);
  };
  const cancel = useCallback(() => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragging(false);
    onValueChange(current.initial);
  }, [onValueChange]);
  useEffect(() => {
    if (!dragging) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || !drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [dragging, cancel]);

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamp(value)}
      aria-valuetext={`${clamp(value)}% da largura disponível`}
      className={styles.handle}
      data-dragging={dragging || undefined}
      title="Arraste ou use as setas. Duplo clique restaura a largura."
      onDoubleClick={() => change(defaultValue)}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        const width = containerRef.current?.getBoundingClientRect().width;
        if (!width) return;
        event.preventDefault();
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          width,
          initial: value,
          value,
        };
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        event.preventDefault();
        current.value = clamp(
          current.initial + ((current.x - event.clientX) / current.width) * 100,
        );
        onValueChange(current.value);
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        current.value = clamp(
          current.initial + ((current.x - event.clientX) / current.width) * 100,
        );
        drag.current = null;
        setDragging(false);
        if (current.value === clamp(current.initial)) onValueChange(current.initial);
        else {
          onValueChange(current.value);
          onValueCommit?.(current.value);
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && drag.current) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
          return;
        }
        const step = event.shiftKey ? 10 : 2;
        const next =
          event.key === 'ArrowLeft'
            ? value + step
            : event.key === 'ArrowRight'
              ? value - step
              : event.key === 'Home'
                ? min
                : event.key === 'End'
                  ? max
                  : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        change(next);
      }}
    />
  );
}
