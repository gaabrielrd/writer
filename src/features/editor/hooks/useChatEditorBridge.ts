import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { DOMSerializer, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { LoreMentionEntity } from '@/features/lore';
import {
  chatDocumentHash,
  relevantChatLore,
  type ChatEditorBridge,
  type WritingPersonaContext,
} from '@/features/ai-assistant';
import { plainTextContent } from '../model/richDocument';
import { createEditorContextRange } from '../model/editorContextRange';

export function useChatEditorBridge(
  editor: Editor | null,
  area: RefObject<HTMLDivElement | null>,
  options: {
    enabled?: boolean;
    title: string;
    bookTitle: string;
    persona: WritingPersonaContext;
    entities: LoreMentionEntity[];
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
    if (!editor || options.enabled === false) return;
    const range = createEditorContextRange(editor, area, lastVisible);
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
    const onReady = current.current.onReady;
    onReady?.(bridge);
    return () => onReady?.(null);
  }, [editor, area, revision, options.enabled]);
}
