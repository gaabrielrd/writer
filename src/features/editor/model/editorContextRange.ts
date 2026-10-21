import type { RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { ChatContextSource } from '@/features/ai-assistant';

export interface LastVisibleEditorRange {
  current: { doc: ProseMirrorNode; from: number; to: number } | null;
}

function contextPrefix(text: string, limit: number, preservePairs: boolean): string {
  const before = text.charCodeAt(limit - 1);
  const after = text.charCodeAt(limit);
  const cutsPair = before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
  return text.slice(0, preservePairs && cutsPair ? limit - 1 : limit);
}

/** Geometry shared with the legacy bridge; chapter remains its internal whole-document mode. */
export function createEditorContextRange(
  editor: Editor,
  area: RefObject<HTMLDivElement | null>,
  lastVisible: LastVisibleEditorRange,
  preservePairs = false,
) {
  return (requested: ChatContextSource) => {
    const doc = editor.state.doc;
    const { from, to } = editor.state.selection;
    const bounds = area.current?.getBoundingClientRect();
    const top = Math.max(0, bounds?.top ?? 0);
    const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight);
    const blocks: { from: number; to: number; visible: boolean }[] = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const dom = editor.view.nodeDOM(pos);
      const rect = dom instanceof Element ? dom.getBoundingClientRect() : null;
      blocks.push({
        from: pos + 1,
        to: pos + node.nodeSize - 1,
        visible: Boolean(rect && rect.bottom > top && rect.top < bottom),
      });
      return false;
    });
    const cursorIndex = Math.max(
      0,
      blocks.findIndex((block) => from >= block.from && from <= block.to),
    );
    let cursorVisible = Boolean(blocks[cursorIndex]?.visible);
    try {
      const caret = editor.view.coordsAtPos(from);
      cursorVisible = caret.bottom > top && caret.top < bottom;
    } catch {
      /* DOM geometry is unavailable until layout settles. */
    }
    const source =
      requested === 'auto'
        ? from !== to
          ? 'selection'
          : cursorVisible
            ? 'cursor'
            : 'viewport'
        : requested;
    const visible = blocks.filter((block) => block.visible);
    let visibleFrom = visible[0]?.from;
    let visibleTo = visible.at(-1)?.to;
    if (visible.length) {
      try {
        const root = editor.view.dom.getBoundingClientRect();
        const start = editor.view.posAtCoords({
          left: root.left + 2,
          top: Math.max(top, root.top) + 2,
        });
        const end = editor.view.posAtCoords({
          left: root.right - 2,
          top: Math.min(bottom, root.bottom) - 2,
        });
        if (start && end && end.pos >= start.pos) {
          visibleFrom = start.pos;
          visibleTo = end.pos;
        }
      } catch {
        /* Whole visible blocks remain a safe fallback. */
      }
      lastVisible.current = { doc, from: visibleFrom!, to: visibleTo! };
    } else if (lastVisible.current?.doc === doc) {
      visibleFrom = lastVisible.current.from;
      visibleTo = lastVisible.current.to;
    }
    const first = blocks[Math.max(0, cursorIndex - 2)];
    const last = blocks[Math.min(blocks.length - 1, cursorIndex + 2)];
    const contextFrom =
      source === 'chapter'
        ? 0
        : source === 'selection'
          ? from
          : source === 'cursor'
            ? (first?.from ?? from)
            : (visibleFrom ?? from);
    const contextTo =
      source === 'chapter'
        ? doc.content.size
        : source === 'selection'
          ? to
          : source === 'cursor'
            ? (last?.to ?? to)
            : (visibleTo ?? to);
    const raw = doc.textBetween(contextFrom, contextTo, '\n');
    return {
      source,
      text: contextPrefix(raw, 18000, preservePairs),
      truncated: raw.length > 18000,
      from,
      to,
      surrounding: contextPrefix(
        doc.textBetween(
          Math.max(0, contextFrom - 1800),
          Math.min(doc.content.size, contextTo + 1800),
          '\n',
        ),
        22000,
        preservePairs,
      ),
    };
  };
}
