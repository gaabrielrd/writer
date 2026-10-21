import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';
import {
  editorChatTextHash,
  type EditorChatCaptureSource,
  type EditorChatEditorBridge,
} from '@/features/ai-assistant';
import { createEditorContextRange, type LastVisibleEditorRange } from '../model/editorContextRange';
import { plainTextContent } from '../model/richDocument';

export function useEditorChatEditorBridge(
  editor: Editor | null,
  area: RefObject<HTMLDivElement | null>,
  options: {
    enabled: boolean;
    setBusy: (busy: boolean) => void;
    onReady?: (bridge: EditorChatEditorBridge | null) => void;
  },
) {
  const { enabled, onReady } = options;
  const current = useRef(options);
  const lastVisible = useRef<LastVisibleEditorRange['current']>(null);
  useLayoutEffect(() => {
    current.current = options;
  });
  useLayoutEffect(() => {
    if (!editor || !enabled) return;
    let live = true;
    let ownsBusy = false;
    const ensureLive = () => {
      if (!live || editor.isDestroyed || !current.current.enabled)
        throw new Error('Editor indisponível.');
    };
    const snapshot = () => {
      ensureLive();
      const doc = editor.state.doc;
      const selection = editor.state.selection;
      const html = editor.getHTML();
      const checkCurrent = () => {
        ensureLive();
        if (
          editor.state.doc !== doc ||
          !editor.state.selection.eq(selection) ||
          editor.getHTML() !== html
        )
          throw new Error('O texto ou a seleção mudou. Capture o destino novamente.');
      };
      return { doc, html, checkCurrent };
    };
    const range = createEditorContextRange(editor, area, lastVisible, true);
    const ownRange = (source: EditorChatCaptureSource) => {
      ensureLive();
      const value = range(source === 'document' ? 'chapter' : source);
      return {
        ...value,
        source: value.source === 'chapter' ? ('document' as const) : value.source,
      };
    };
    const bridge: EditorChatEditorBridge = {
      preview(source) {
        const value = ownRange(source);
        return { source: value.source, text: value.text, truncated: value.truncated };
      },
      async capture(source) {
        const before = snapshot();
        const value = ownRange(source);
        if (source === 'selection' && value.from === value.to)
          throw new Error('Selecione um trecho no manuscrito.');
        const editorHash = await editorChatTextHash(before.html);
        before.checkCurrent();
        return {
          capture: {
            source: value.source,
            editorHash,
            from: value.from,
            to: value.to,
            text: value.text,
            surroundingText: value.surrounding,
            truncated: value.truncated,
          },
          html: before.html,
          checkCurrent: before.checkCurrent,
        };
      },
      async prepare(target, text, replace) {
        const before = snapshot();
        const hash = await editorChatTextHash(before.html);
        before.checkCurrent();
        if (
          target.editorHash !== hash ||
          !Number.isSafeInteger(target.from) ||
          !Number.isSafeInteger(target.to) ||
          target.from < 0 ||
          target.to < target.from ||
          target.to > before.doc.content.size
        )
          throw new Error('O trecho mudou. Capture o destino novamente.');
        const transaction = editor.state.tr.replaceWith(
          replace ? target.from : target.to,
          target.to,
          editor.schema.nodeFromJSON({ type: 'doc', content: plainTextContent(text) }).content,
        );
        const container = document.createElement('div');
        container.append(
          DOMSerializer.fromSchema(editor.schema).serializeFragment(transaction.doc.content),
        );
        let committed = false;
        const checkCurrent = () => {
          before.checkCurrent();
          if (committed) throw new Error('Esta aplicação já foi confirmada.');
        };
        return {
          before: before.html,
          after: container.innerHTML,
          checkCurrent,
          commit() {
            checkCurrent();
            committed = true;
            editor.view.dispatch(transaction);
            editor.view.focus();
          },
        };
      },
      setBusy(busy) {
        ensureLive();
        ownsBusy = busy;
        current.current.setBusy(busy);
      },
      focus() {
        ensureLive();
        editor.view.focus();
      },
    };
    onReady?.(bridge);
    return () => {
      live = false;
      if (ownsBusy) current.current.setBusy(false);
      onReady?.(null);
    };
  }, [editor, area, enabled, onReady]);
}
