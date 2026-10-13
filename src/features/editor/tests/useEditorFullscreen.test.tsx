import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLayoutProvider } from '@/shared/ui';
import { useEditorFullscreen } from '../hooks/useEditorFullscreen';

function Workspace() {
  const { expanded, toggle } = useEditorFullscreen();
  return <button onClick={toggle}>{expanded ? 'Sair' : 'Expandir'}</button>;
}

function setup() {
  return render(
    <WorkspaceLayoutProvider>
      <Workspace />
    </WorkspaceLayoutProvider>,
  );
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('tela cheia do editor', () => {
  it.each(['caretPositionFromPoint', 'caretRangeFromPoint'] as const)(
    'ancora a passagem visível por %s quando o cursor está fora dela',
    (method) => {
      const callbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      });
      const area = document.createElement('div');
      area.setAttribute('data-editor-scroll-area', '');
      area.style.overflowY = 'auto';
      Object.defineProperties(area, {
        scrollHeight: { value: 1500 },
        clientHeight: { value: 500 },
      });
      area.innerHTML =
        '<div contenteditable="true"><p>Um parágrafo longo com passagem visível</p></div>';
      document.body.append(area);
      const editable = area.querySelector('div')!;
      const node = area.querySelector('p')!.firstChild!;
      vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
      vi.spyOn(editable, 'getBoundingClientRect').mockReturnValue({
        left: 20,
        width: 300,
      } as DOMRect);
      vi.spyOn(area.querySelector('p')!, 'getBoundingClientRect').mockReturnValue({
        top: -1000,
        bottom: 1000,
        height: 2000,
      } as DOMRect);
      const original = document.createRange();
      original.setStart(node, 0);
      original.collapse(true);
      window.getSelection()!.addRange(original);
      const caret = original.cloneRange();
      Object.assign(caret, {
        getBoundingClientRect: () => ({ top: -1000, bottom: -980, height: 20 }),
      });
      const passage = original.cloneRange();
      passage.setStart(node, 12);
      passage.collapse(true);
      const rect = vi.fn().mockReturnValue({ top: 140, bottom: 160, height: 20 });
      Object.assign(passage, { getBoundingClientRect: rect });
      vi.spyOn(document, 'createRange').mockReturnValueOnce(caret).mockReturnValue(passage);
      const point = vi.fn(() =>
        method === 'caretPositionFromPoint' ? { offsetNode: node, offset: 12 } : passage,
      );
      const previous = Object.getOwnPropertyDescriptor(document, method);
      Object.defineProperty(document, method, { configurable: true, value: point });
      try {
        setup();
        fireEvent.click(screen.getByRole('button'));
        rect.mockReturnValue({ top: 190, bottom: 210, height: 20 });
        act(() => {
          callbacks.shift()!(0);
          callbacks.shift()!(0);
        });
        expect(area.scrollTop).toBe(50);
        expect(window.getSelection()!.focusOffset).toBe(0);
        expect(point).toHaveBeenCalledOnce();
      } finally {
        if (previous) Object.defineProperty(document, method, previous);
        else Reflect.deleteProperty(document, method);
      }
    },
  );

  it('ancora o caret visível no parágrafo longo mesmo durante reflow sem overflow', () => {
    let resized: () => void = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const area = document.createElement('div');
    area.setAttribute('data-editor-scroll-area', '');
    area.style.overflowY = 'auto';
    // A altura de conteúdo pode coincidir temporariamente com a viewport no reflow.
    Object.defineProperties(area, { scrollHeight: { value: 500 }, clientHeight: { value: 500 } });
    area.innerHTML =
      '<div contenteditable="true"><p>Um parágrafo longo com cursor no meio</p></div>';
    document.body.append(area);
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(area.querySelector('p')!, 'getBoundingClientRect').mockReturnValue({
      top: -1000,
      bottom: 1000,
    } as DOMRect);
    const selection = window.getSelection()!;
    const original = document.createRange();
    original.setStart(area.querySelector('p')!.firstChild!, 12);
    original.collapse(true);
    selection.addRange(original);
    const caret = document.createRange();
    const caretRect = vi.fn().mockReturnValue({ top: 140, bottom: 160, height: 20 });
    Object.assign(caret, {
      getBoundingClientRect: caretRect,
    });
    vi.spyOn(document, 'createRange').mockReturnValue(caret);
    setup();
    fireEvent.click(screen.getByRole('button'));
    caretRect.mockReturnValue({
      top: 190,
      bottom: 210,
      height: 20,
    });
    act(() => {
      callbacks.shift()!(0);
      callbacks.shift()!(0);
    });
    expect(area.scrollTop).toBe(50);
    expect(selection.focusOffset).toBe(12);
    expect(selection.focusNode).toBe(original.startContainer);
    // Um commit posterior do ResizeObserver ainda pode mudar a linha do caret.
    caretRect.mockReturnValue({
      top: 240,
      bottom: 260,
      height: 20,
    });
    act(() => callbacks.shift()!(0));
    expect(area.scrollTop).toBe(150);
    caretRect.mockReturnValue({
      top: 140,
      bottom: 160,
      height: 20,
    });
    act(() => callbacks.shift()!(0));
    expect(area.scrollTop).toBe(150);
    expect(callbacks).toHaveLength(0);
    caretRect.mockReturnValue({ top: 170, bottom: 190, height: 20 });
    act(resized);
    act(() => callbacks.shift()!(0));
    expect(area.scrollTop).toBe(180);
    fireEvent.wheel(area);
    expect(disconnect).toHaveBeenCalledOnce();
    act(resized);
    expect(callbacks).toHaveLength(0);
  });

  it('alterna no mesmo workspace e sai com Escape', () => {
    setup();
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button).toHaveTextContent('Sair');
    const minimap = document.createElement('div');
    minimap.setAttribute('role', 'listbox');
    minimap.setAttribute('data-editor-minimap-list', '');
    document.body.append(minimap);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(button).toHaveTextContent('Sair');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveTextContent('Expandir');
  });

  it.each(['dialog', 'menu', 'listbox'])(
    'preserva tela cheia enquanto um %s está aberto',
    (role) => {
      setup();
      fireEvent.click(screen.getByRole('button'));
      const overlay = document.createElement('div');
      overlay.setAttribute('role', role);
      document.body.append(overlay);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('button')).toHaveTextContent('Sair');
      overlay.remove();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('button')).toHaveTextContent('Expandir');
    },
  );

  it('respeita composição e Escape já tratado por outro controle', () => {
    setup();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(document, { key: 'Escape', isComposing: true });
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    document.dispatchEvent(handled);
    expect(screen.getByRole('button')).toHaveTextContent('Sair');
  });

  it('mantém o parágrafo visível na mesma posição após a mudança de layout', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const area = document.createElement('div');
    area.setAttribute('data-editor-scroll-area', '');
    area.style.overflowY = 'auto';
    Object.defineProperties(area, { scrollHeight: { value: 1500 }, clientHeight: { value: 500 } });
    area.innerHTML = '<div contenteditable="true"><p>Primeiro</p><p>Trecho em edição</p></div>';
    document.body.append(area);
    const blocks = area.querySelectorAll('p');
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(blocks[0]!, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 50,
    } as DOMRect);
    const working = vi
      .spyOn(blocks[1]!, 'getBoundingClientRect')
      .mockReturnValue({ top: 130, bottom: 200 } as DOMRect);
    setup();
    fireEvent.click(screen.getByRole('button'));
    working.mockReturnValue({ top: 180, bottom: 250 } as DOMRect);
    act(() => {
      callbacks.shift()!(0);
      callbacks.shift()!(0);
    });
    expect(area.scrollTop).toBe(50);
  });

  it('tolera documento vazio e cancela restauração ao sair da rota', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const area = document.createElement('div');
    area.setAttribute('data-editor-scroll-area', '');
    document.body.append(area);
    const view = setup();
    fireEvent.click(screen.getByRole('button'));
    act(() => {
      callbacks.shift()!(0);
      callbacks.shift()!(0);
    });
    fireEvent.click(screen.getByRole('button'));
    view.unmount();
    expect(cancel).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
  });
});
