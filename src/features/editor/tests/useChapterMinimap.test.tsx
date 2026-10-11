import { act, renderHook, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoreEntity } from '@/features/lore';
import { useChapterMinimap } from '../hooks/useChapterMinimap';
import { ghostSuggestionKey } from '../model/richDocument';

const entity: LoreEntity = {
  id: 'lia',
  bookId: 'book',
  name: 'Lia',
  aliases: [],
  category: 'character',
  summary: '',
  details: '',
  relations: [],
  isPublic: false,
  createdAt: 1,
  updatedAt: 1,
};
const rect = (top: number, height: number) => ({
  top,
  bottom: top + height,
  left: 0,
  right: 400,
  width: 400,
  height,
  x: 0,
  y: top,
  toJSON: () => ({}),
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sincronização da área visível do minimapa', () => {
  it('mede texto e ocorrências, acompanha scroll e resize e navega sem editar nem selecionar', async () => {
    let resize: () => void = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const editor = new Editor({
      extensions: [StarterKit],
      content: '<h2>Início</h2><p>Lia chegou.</p><p>Fim</p>',
    });
    const area = document.createElement('div');
    area.style.overflowY = 'auto';
    area.appendChild(editor.view.dom);
    document.body.appendChild(area);
    Object.defineProperties(area, { clientHeight: { value: 400 }, scrollHeight: { value: 1200 } });
    const rootTop = () => 100 - area.scrollTop;
    vi.spyOn(area, 'getBoundingClientRect').mockImplementation(() => rect(50, 400));
    vi.spyOn(editor.view.dom, 'getBoundingClientRect').mockImplementation(() =>
      rect(rootTop(), 1000),
    );
    const block = document.createElement('p');
    vi.spyOn(block, 'getBoundingClientRect').mockImplementation(() => rect(rootTop(), 200));
    vi.spyOn(editor.view, 'nodeDOM').mockReturnValue(block);
    vi.spyOn(editor.view, 'coordsAtPos').mockImplementation(() => ({
      top: rootTop() + 300,
      bottom: rootTop() + 320,
      left: 0,
      right: 50,
    }));
    const scrolling = vi.fn((options: ScrollToOptions) => {
      area.scrollTop = options.top ?? 0;
    });
    Object.defineProperty(area, 'scrollTo', { value: scrolling });
    const windowScrolling = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const scrollArea = { current: area };
    const { result, rerender, unmount } = renderHook(
      ({ entities }) => useChapterMinimap(editor, entities, scrollArea),
      { initialProps: { entities: [entity] } },
    );
    await waitFor(() => expect(result.current.destinations).toHaveLength(4));
    expect(result.current.destinations.find(({ kind }) => kind === 'entity')?.start).toBe(0.3);
    expect(result.current.viewport).toEqual({ start: 0, end: 0.35 });
    const before = editor.getHTML();
    const selection = editor.state.selection;
    act(() => result.current.navigate(0.5));
    expect(scrolling).toHaveBeenLastCalledWith({ top: 550, behavior: 'instant' });
    await waitFor(() => expect(result.current.viewport).toEqual({ start: 0.5, end: 0.9 }));
    act(() => {
      area.scrollTop = 700;
      window.dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => expect(result.current.viewport.end).toBe(1));
    act(() => result.current.navigate(0.3, 11));
    expect(scrolling).toHaveBeenLastCalledWith({ top: 350, behavior: 'instant' });
    expect(editor.getHTML()).toBe(before);
    expect(editor.state.selection).toBe(selection);
    rerender({ entities: [] });
    await waitFor(() => expect(result.current.destinations).toHaveLength(3));
    area.style.overflowY = 'visible';
    act(() => result.current.navigate(0.5));
    expect(windowScrolling).toHaveBeenCalled();
    act(() => {
      editor.commands.setContent('<p>Novo capítulo</p>');
      // Stale destinations must not be used before the new document is measured.
      result.current.navigate(1, 9999);
      resize();
      window.dispatchEvent(new Event('resize'));
    });
    await waitFor(() =>
      expect(result.current.destinations[0]?.label).toBe('Parágrafo: Novo capítulo'),
    );
    await waitFor(() => expect(result.current.destinations).toHaveLength(1));
    act(() => editor.view.dispatch(editor.state.tr.setMeta(ghostSuggestionKey, null)));
    unmount();
    expect(disconnect).toHaveBeenCalled();
    editor.destroy();
    area.remove();
  });

  it('não oferece navegação antes do editor montar', () => {
    const { result } = renderHook(() => useChapterMinimap(null, [], { current: null }));
    expect(result.current.destinations).toEqual([]);
    expect(() => result.current.navigate(0.5)).not.toThrow();
  });
});
