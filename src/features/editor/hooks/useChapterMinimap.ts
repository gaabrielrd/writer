import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import type { LoreEntity } from '@/features/lore';
import {
  buildChapterMinimap,
  clampMinimap,
  minimapViewport,
  type MinimapDestination,
} from '../model/chapterMinimap';
import { ghostSuggestionKey } from '../model/richDocument';

export interface MeasuredMinimapDestination extends MinimapDestination {
  start: number;
  end: number;
}

export function useChapterMinimap(
  editor: Editor | null,
  entities: LoreEntity[],
  scrollArea: RefObject<HTMLDivElement | null>,
) {
  const [destinations, setDestinations] = useState<MeasuredMinimapDestination[]>([]);
  const [viewport, setViewport] = useState({ start: 0, end: 1 });
  const navigation = useRef<(ratio: number, position?: number) => void>(() => undefined);

  useEffect(() => {
    const area = scrollArea.current;
    if (!editor || !area) return;
    const root = editor.view.dom;
    let document = editor.state.doc;
    let entries = buildChapterMinimap(document, entities);
    let geometryDirty = true;
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const bounds = root.getBoundingClientRect();
      const areaBounds = area.getBoundingClientRect();
      const height = Math.max(1, bounds.height);
      if (geometryDirty) {
        geometryDirty = false;
        const blocks = new Map<number, DOMRect>();
        setDestinations(
          entries.map((entry) => {
            let block = blocks.get(entry.blockPosition);
            if (!block) {
              const element = editor.view.nodeDOM(entry.blockPosition);
              block = element instanceof Element ? element.getBoundingClientRect() : bounds;
              blocks.set(entry.blockPosition, block);
            }
            // Entity offsets include real wrapping and inline formatting.
            const top =
              entry.kind === 'entity' && bounds.height > 0
                ? editor.view.coordsAtPos(entry.position).top
                : block.top;
            return {
              ...entry,
              start: clampMinimap((top - bounds.top) / height),
              end: clampMinimap((block.bottom - bounds.top) / height),
            };
          }),
        );
      }
      const visibleTop = Math.max(0, areaBounds.top + area.clientTop);
      const visibleBottom = Math.min(window.innerHeight, areaBounds.bottom - area.clientTop);
      setViewport(minimapViewport(bounds.top, height, visibleTop, visibleBottom));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resized = () => {
      geometryDirty = true;
      schedule();
    };
    const changed = ({ transaction }: { transaction: Transaction }) => {
      if (document !== editor.state.doc) {
        document = editor.state.doc;
        entries = buildChapterMinimap(document, entities);
        resized();
      } else if (transaction.getMeta(ghostSuggestionKey) !== undefined) {
        resized();
      }
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resized);
    observer?.observe(root);
    observer?.observe(area);
    editor.on('transaction', changed);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', resized);
    navigation.current = (ratio, position) => {
      if (editor.isDestroyed || geometryDirty) return;
      const rootBounds = root.getBoundingClientRect();
      const areaBounds = area.getBoundingClientRect();
      const target =
        position === undefined
          ? rootBounds.top + clampMinimap(ratio) * rootBounds.height
          : editor.view.coordsAtPos(position).top;
      const internalScroll =
        area.scrollHeight > area.clientHeight + 1 &&
        /auto|scroll/.test(getComputedStyle(area).overflowY);
      // Scroll only: a ProseMirror focus/selection command would move the caret.
      if (internalScroll)
        area.scrollTo({
          top: area.scrollTop + target - areaBounds.top - area.clientTop,
          behavior: 'instant',
        });
      else {
        // Keep the end of the manuscript in view without scrolling past the rail.
        const top = Math.min(target - 16, areaBounds.bottom - window.innerHeight + 16);
        window.scrollTo({ top: window.scrollY + top, behavior: 'instant' });
      }
      schedule();
    };
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      editor.off('transaction', changed);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', resized);
      navigation.current = () => undefined;
    };
  }, [editor, entities, scrollArea]);

  return {
    destinations,
    viewport,
    navigate: (ratio: number, position?: number) => navigation.current(ratio, position),
  };
}
