import { webcrypto } from 'node:crypto';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeEditorChatCapture } from '../../../../functions/src/editorChatContracts.mjs';
import { useEditorChatEditorBridge } from '../hooks/useEditorChatEditorBridge';
import { editorChatTextHash, type EditorChatEditorBridge } from '@/features/ai-assistant';

let editor: Editor;
let bridge: EditorChatEditorBridge | null;
const setBusy = vi.fn();
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  const rect = {
    top: 0,
    bottom: 20,
    left: 0,
    right: 200,
    width: 200,
    height: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => Object.assign([rect], { item: () => rect }),
  });
  bridge = null;
  setBusy.mockClear();
  window.scrollBy = vi.fn();
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
    content: '<p><strong>Lia</strong> chegou.</p><p>Segundo trecho.</p>',
  });
});
afterEach(() => {
  cleanup();
  editor.destroy();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(enabled = true) {
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
  const areaRef = { current: area };
  const onReady = (value: EditorChatEditorBridge | null) => {
    bridge = value;
  };
  return renderHook(
    ({ enabled }) => useEditorChatEditorBridge(editor, areaRef, { enabled, setBusy, onReady }),
    { initialProps: { enabled } },
  );
}
function select(from = 1, to = 4) {
  act(() =>
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
    ),
  );
}
function delayedDigest() {
  const real = crypto.subtle.digest.bind(crypto.subtle);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
    await gate;
    return real(algorithm, data);
  });
  return release;
}

describe('own manuscript bridge for editor chat', () => {
  it.each(['selection', 'cursor', 'viewport', 'document'] as const)(
    'captures %s with a real hash and PM target, without lore/persona or writing',
    async (source) => {
      setup();
      select();
      const before = editor.getHTML();
      const selection = editor.state.selection;
      const value = await bridge!.capture(source);
      expect(value.capture).toMatchObject({
        source,
        editorHash: await editorChatTextHash(before),
        from: 1,
        to: 4,
      });
      expect(Object.keys(value.capture).sort()).toEqual(
        ['source', 'editorHash', 'from', 'to', 'text', 'surroundingText', 'truncated'].sort(),
      );
      expect(value.html).toBe(before);
      expect(editor.getHTML()).toBe(before);
      expect(editor.state.selection.eq(selection)).toBe(true);
      expect(() => value.checkCurrent()).not.toThrow();
      if (source === 'selection') expect(value.capture.text).toBe('Lia');
      if (source === 'document') expect(value.capture.text).toContain('Segundo trecho.');
    },
  );
  it('uses selection/cursor/viewport for automatic mode, and provides a target even for viewport', async () => {
    setup();
    select();
    expect((await bridge!.capture('auto')).capture.source).toBe('selection');
    select(1, 1);
    vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({
      top: 10,
      bottom: 30,
      left: 0,
      right: 1,
    });
    expect((await bridge!.capture('auto')).capture.source).toBe('cursor');
    vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({
      top: 300,
      bottom: 330,
      left: 0,
      right: 1,
    });
    const capture = await bridge!.capture('auto');
    expect(capture.capture).toMatchObject({ source: 'viewport', from: 1, to: 1 });
    expect(bridge!.preview('viewport')).toEqual({
      source: 'viewport',
      text: 'Lia chegou.',
      truncated: false,
    });
  });
  it('refuses an explicit empty selection without changing the document', async () => {
    setup();
    select(1, 1);
    await expect(bridge!.capture('selection')).rejects.toThrow('Selecione');
  });
  it('caps own text and surrounding text and reports truncation', async () => {
    editor.commands.setContent(`<p>${'a'.repeat(24000)}</p>`);
    setup();
    const value = await bridge!.capture('document');
    expect(value.capture.text).toHaveLength(18000);
    expect(value.capture.surroundingText).toHaveLength(22000);
    expect(value.capture.truncated).toBe(true);
  });
  it('keeps valid emoji at both truncation boundaries without changing other code units', async () => {
    const text = 'a'.repeat(17999) + '🐉' + 'b'.repeat(3998) + '🐉' + 'c';
    editor.commands.setContent(`<p>${text}</p>`);
    setup();
    const { capture } = await bridge!.capture('document');
    expect(capture.text).toBe(text.slice(0, 17999));
    expect(capture.surroundingText).toBe(text.slice(0, 21999));
    expect(capture.truncated).toBe(true);
    expect(normalizeEditorChatCapture(capture)).toEqual(capture);
  });
  it('does not confuse normalized editor HTML with the persisted body hash or autosave on load', async () => {
    editor.commands.setContent('<p><b>Lia</b> chegou.</p>');
    const update = vi.fn();
    editor.on('update', update);
    setup();
    const own = await bridge!.capture('document');
    expect(own.capture.editorHash).not.toBe(await editorChatTextHash('<p><b>Lia</b> chegou.</p>'));
    expect(own.html).toBe('<p><strong>Lia</strong> chegou.</p>');
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['text', 'selection', 'unmount'] as const)(
    'fences a late capture after %s changed during SHA',
    async (change) => {
      const rendered = setup();
      select();
      const release = delayedDigest();
      const pending = bridge!.capture('selection');
      if (change === 'text')
        act(() => {
          editor.commands.insertContent('Novo');
        });
      if (change === 'selection') select(1, 2);
      if (change === 'unmount') rendered.unmount();
      release();
      await expect(pending).rejects.toThrow();
    },
  );
  it('preserves literal output/formatting in prepared HTML, commits once and supports undo', async () => {
    setup();
    select();
    const capture = await bridge!.capture('selection');
    const before = editor.getHTML();
    const prepared = await bridge!.prepare(
      capture.capture,
      '<script>texto</script>\nOutra linha & fim',
      true,
    );
    expect(editor.getHTML()).toBe(before);
    expect(prepared.before).toBe(before);
    expect(prepared.after).toContain('&lt;script&gt;texto&lt;/script&gt;');
    expect(prepared.after).toContain('Outra linha &amp; fim');
    expect(() => prepared.checkCurrent()).not.toThrow();
    act(() => prepared.commit());
    expect(editor.getText()).toContain('<script>texto</script>');
    expect(editor.getHTML()).toContain('Segundo trecho.');
    expect(() => prepared.commit()).toThrow();
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getHTML()).toBe(before);
  });
  it('inserts at the captured target and retains surrounding marks', async () => {
    setup();
    select();
    const own = await bridge!.capture('selection');
    const prepared = await bridge!.prepare(own.capture, 'Nova', false);
    act(() => prepared.commit());
    expect(editor.getText()).toMatch(/Lia[\s\S]*Nova[\s\S]*chegou/);
    expect(editor.getHTML()).toContain('<strong>Lia</strong>');
  });
  it('refuses an obsolete target hash and invalid PM offsets without dispatch', async () => {
    setup();
    select();
    const own = await bridge!.capture('selection');
    const before = editor.getHTML();
    for (const target of [
      { ...own.capture, editorHash: 'a'.repeat(64) },
      { ...own.capture, from: -1 },
      { ...own.capture, to: editor.state.doc.content.size + 1 },
      { ...own.capture, from: 4, to: 1 },
      { ...own.capture, from: 1.2 },
    ])
      await expect(bridge!.prepare(target, 'Novo', true)).rejects.toThrow('trecho mudou');
    expect(editor.getHTML()).toBe(before);
  });
  it.each(['text', 'selection', 'unmount'] as const)(
    'fences prepare after %s changed during SHA, with no prepared dispatch',
    async (change) => {
      const rendered = setup();
      select();
      const own = await bridge!.capture('selection');
      const release = delayedDigest();
      const pending = bridge!.prepare(own.capture, 'Novo', true);
      if (change === 'text')
        act(() => {
          editor.commands.insertContent('Atual');
        });
      if (change === 'selection') select(1, 2);
      if (change === 'unmount') rendered.unmount();
      release();
      await expect(pending).rejects.toThrow();
      expect(editor.getText()).not.toContain('Novo');
    },
  );
  it.each(['text', 'selection', 'unmount'] as const)(
    'fences a prepared commit after %s changes',
    async (change) => {
      const rendered = setup();
      select();
      const own = await bridge!.capture('selection');
      const prepared = await bridge!.prepare(own.capture, 'Novo', true);
      if (change === 'text')
        act(() => {
          editor.commands.insertContent('Atual');
        });
      if (change === 'selection') select(1, 2);
      if (change === 'unmount') rendered.unmount();
      expect(() => prepared.checkCurrent()).toThrow();
      expect(() => prepared.commit()).toThrow();
      expect(editor.getText()).not.toContain('Novo');
    },
  );
  it('fences captures and bridge methods on capability removal, then exposes a fresh bridge', async () => {
    const rendered = setup(false);
    expect(bridge).toBeNull();
    rendered.rerender({ enabled: true });
    const old = bridge!;
    const own = await old.capture('cursor');
    old.setBusy(true);
    expect(setBusy).toHaveBeenLastCalledWith(true);
    const focus = vi.spyOn(editor.view, 'focus');
    old.focus();
    expect(focus).toHaveBeenCalled();
    rendered.rerender({ enabled: false });
    expect(bridge).toBeNull();
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(() => own.checkCurrent()).toThrow('indisponível');
    expect(() => old.preview('cursor')).toThrow('indisponível');
    expect(() => old.setBusy(false)).toThrow('indisponível');
    expect(() => old.focus()).toThrow('indisponível');
    rendered.rerender({ enabled: true });
    expect(bridge).not.toBeNull();
    expect(bridge).not.toBe(old);
  });
});
