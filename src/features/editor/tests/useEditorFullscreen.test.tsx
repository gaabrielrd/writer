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
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('tela cheia do editor', () => {
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
