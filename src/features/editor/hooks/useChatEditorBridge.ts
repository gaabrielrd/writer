import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { DOMSerializer, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { LoreEntity } from '@/features/lore';
import {
  chatDocumentHash,
  relevantChatLore,
  type ChatEditorBridge,
  type ChatContextSource,
  type WritingPersonaContext,
} from '@/features/ai-assistant';
import { plainTextContent } from '../model/richDocument';

export function useChatEditorBridge(
  editor: Editor | null,
  area: RefObject<HTMLDivElement | null>,
  options: {
    title: string;
    bookTitle: string;
    persona: WritingPersonaContext;
    entities: LoreEntity[];
    setBusy: (busy: boolean) => void;
    onReady?: (bridge: ChatEditorBridge | null) => void;
  },
) {
  const current = useRef(options);
  useEffect(() => {
    current.current = options;
  });
  const [revision, setRevision] = useState(0);
  const lastVisible = useRef<{ doc: ProseMirrorNode; from: number; to: number } | null>(null);
  useEffect(() => {
    if (!editor) return;
    let frame = 0;
    const update = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setRevision((value) => value + 1);
        });
    };
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(editor.view.dom);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      editor.off('update', update);
      editor.off('selectionUpdate', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    const range = (requested: ChatContextSource) => {
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
        text: raw.slice(0, 18000),
        truncated: raw.length > 18000,
        from,
        to,
        surrounding: doc
          .textBetween(
            Math.max(0, contextFrom - 1800),
            Math.min(doc.content.size, contextTo + 1800),
            '\n',
          )
          .slice(0, 22000),
      };
    };
    range('auto');
    const bridge: ChatEditorBridge = {
      preview: (source) => range(source),
      async capture(source) {
        if (editor.isDestroyed) throw new Error('Editor indisponível.');
        const captured = range(source);
        if (source === 'selection' && captured.from === captured.to)
          throw new Error('Selecione um trecho no manuscrito.');
        const html = editor.getHTML();
        const hash = await chatDocumentHash(html);
        if (editor.isDestroyed || html !== editor.getHTML())
          throw new Error('O texto mudou durante a captura. Envie novamente.');
        const { title, bookTitle, persona, entities } = current.current;
        const personaVersion = await chatDocumentHash(persona.version);
        return {
          ...captured,
          title,
          bookTitle,
          persona: { instruction: persona.instruction, version: personaVersion },
          lore: relevantChatLore(entities, captured.text),
          target:
            captured.source === 'viewport' || captured.source === 'chapter'
              ? null
              : { hash, from: captured.from, to: captured.to },
        };
      },
      async prepare(target, text, replace) {
        const before = editor.getHTML();
        if (
          editor.isDestroyed ||
          (await chatDocumentHash(before)) !== target.hash ||
          before !== editor.getHTML()
        )
          throw new Error('O trecho mudou. Gere outra sugestão ou escolha um novo destino.');
        const transaction = editor.state.tr.replaceWith(
          replace ? target.from : target.to,
          target.to,
          editor.schema.nodeFromJSON({ type: 'doc', content: plainTextContent(text) }).content,
        );
        const container = document.createElement('div');
        container.append(
          DOMSerializer.fromSchema(editor.schema).serializeFragment(transaction.doc.content),
        );
        return {
          before,
          after: container.innerHTML,
          commit: () => {
            if (editor.isDestroyed || editor.getHTML() !== before)
              throw new Error(
                'O capítulo mudou durante o aceite. Reabra para recuperar a versão salva.',
              );
            editor.view.dispatch(transaction);
            editor.view.focus();
          },
        };
      },
      setBusy: (busy) => {
        editor.setEditable(!busy, false);
        current.current.setBusy(busy);
      },
      focus: () => {
        if (!editor.isDestroyed) editor.view.focus();
      },
    };
    current.current.onReady?.(bridge);
    return () => current.current.onReady?.(null);
  }, [editor, area, revision]);
}
