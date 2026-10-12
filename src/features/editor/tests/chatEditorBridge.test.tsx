import { webcrypto } from 'node:crypto';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatEditorBridge } from '../hooks/useChatEditorBridge';
import type { ChatEditorBridge } from '@/features/ai-assistant';
let editor: Editor;
let bridge: ChatEditorBridge | null;
const options = {
  title: 'Capítulo',
  bookTitle: 'Livro',
  persona: { instruction: 'Persona', version: 'v1' },
  entities: [],
  setBusy: vi.fn(),
  onReady: (value: ChatEditorBridge | null) => {
    bridge = value;
  },
};
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  bridge = null;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const top = this.tagName === 'P' && this.textContent?.startsWith('Segundo') ? 300 : 10;
    return {
      top,
      bottom: top + 40,
      height: 40,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: top,
      toJSON: () => ({}),
    };
  });
  const root = document.createElement('div');
  document.body.append(root);
  editor = new Editor({
    element: root,
    extensions: [StarterKit],
    content: '<p>Lia chegou.</p><p>Segundo trecho.</p>',
  });
});
afterEach(() => {
  editor.destroy();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const area = document.createElement('div');
  area.getBoundingClientRect = () => ({
    top: 0,
    bottom: 150,
    height: 150,
    left: 0,
    right: 200,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return renderHook(() => useChatEditorBridge(editor, { current: area }, options));
}
describe('contexto real do manuscrito', () => {
  it('captura seleção, entorno e persona sem mover cursor ou alterar conteúdo', async () => {
    setup();
    await waitFor(() => expect(bridge).not.toBeNull());
    act(() =>
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)),
      ),
    );
    const before = editor.getHTML();
    const value = await bridge!.capture('auto');
    expect(value.source).toBe('selection');
    expect(value.text).toBe('Lia');
    expect(value.surrounding).toContain('Segundo trecho');
    expect(value.persona.instruction).toBe('Persona');
    expect(editor.getHTML()).toBe(before);
    expect(editor.state.selection.from).toBe(1);
  });
  it('usa viewport quando o cursor fica fora dela e não oferece alvo implícito', async () => {
    setup();
    await waitFor(() => expect(bridge).not.toBeNull());
    const position = editor.state.doc.child(0).nodeSize + 1;
    const second = editor.view.dom.querySelectorAll('p')[1]!;
    second.getBoundingClientRect = () => ({
      top: 300,
      bottom: 340,
      height: 40,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: 300,
      toJSON: () => ({}),
    });
    act(() =>
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position)),
      ),
    );
    expect((await bridge!.capture('auto')).source).toBe('viewport');
    expect((await bridge!.capture('viewport')).target).toBeNull();
    expect(bridge!.preview('viewport').text).toBe('Lia chegou.');
    expect((await bridge!.capture('cursor')).text).toContain('Segundo trecho');
    expect((await bridge!.capture('chapter')).target).toBeNull();
    await expect(bridge!.capture('selection')).rejects.toThrow('Selecione');
  });
  it('prepara sem alterar e aplica como uma transação com desfazer, sem HTML ativo', async () => {
    setup();
    await waitFor(() => expect(bridge).not.toBeNull());
    act(() =>
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 4)),
      ),
    );
    const context = await bridge!.capture('selection');
    const original = editor.getHTML();
    const operation = await bridge!.prepare(context.target!, '<script>texto</script>', true);
    expect(editor.getHTML()).toBe(original);
    expect(operation.after).toContain('&lt;script&gt;');
    act(() => {
      bridge!.setBusy(true);
      operation.commit();
      bridge!.setBusy(false);
    });
    expect(editor.getText()).toContain('<script>texto</script>');
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getHTML()).toBe(original);
    const insertion = await bridge!.prepare(context.target!, 'continuação', false);
    act(() => insertion.commit());
    expect(editor.getText()).toMatch(/Lia[\s\S]*continuação[\s\S]*chegou/);
  });
  it('recusa alvo antigo e limpa a integração ao desmontar', async () => {
    const rendered = setup();
    await waitFor(() => expect(bridge).not.toBeNull());
    const value = await bridge!.capture('cursor');
    act(() => {
      editor.commands.insertContent('Outro texto');
    });
    await expect(bridge!.prepare(value.target!, 'Novo', false)).rejects.toThrow('mudou');
    rendered.unmount();
    expect(bridge).toBeNull();
  });
});
