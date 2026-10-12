import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResizableEditorWorkspace } from '../components/ResizableEditorWorkspace';
import {
  readWorkspacePreferences,
  saveWorkspacePreferences,
} from '../services/workspacePreferencesStorage';
import { workspaceGeometry } from '../model/workspaceGeometry';

let width = 1000;
class TestPointerEvent extends MouseEvent {
  readonly pointerId = 1;
}
let resized: () => void = () => undefined;
const disconnected = vi.fn();
const mounted = vi.fn();
function Manuscript() {
  useEffect(() => {
    mounted();
  }, []);
  return (
    <div role="textbox" aria-label="Manuscrito" contentEditable suppressContentEditableWarning>
      Meu texto
    </div>
  );
}
const tree = (uid = 'author', panelOpen = true) => (
  <ResizableEditorWorkspace
    uid={uid}
    panelOpen={panelOpen}
    panel={<textarea aria-label="Rascunho do painel" defaultValue="" />}
  >
    <Manuscript />
  </ResizableEditorWorkspace>
);

beforeEach(() => {
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  width = 1000;
  mounted.mockClear();
  disconnected.mockClear();
  vi.stubGlobal('innerWidth', 1280);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return { width: this.hasAttribute('data-editor-workspace') ? width : 0 } as DOMRect;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe() {}
      disconnect = disconnected;
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('espaço lateral compartilhado', () => {
  it('cancelar drag limitado temporariamente conserva a preferência e a árvore', () => {
    saveWorkspacePreferences('author', { panelPercent: 70 });
    render(tree());
    const manuscript = screen.getByRole('textbox', { name: 'Manuscrito' });
    const handle = screen.getByRole('separator');
    Object.assign(handle, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    const constrained = handle.getAttribute('aria-valuenow');
    fireEvent.pointerDown(handle, { clientX: 600, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 700 });
    fireEvent.keyDown(manuscript, { key: 'Escape' });
    expect(handle).toHaveAttribute('aria-valuenow', constrained!);
    fireEvent.pointerUp(handle, { clientX: 700 });
    width = 1800;
    act(resized);
    expect(handle).toHaveAttribute('aria-valuenow', '70');
    expect(readWorkspacePreferences('author').panelPercent).toBe(70);
    expect(screen.getByRole('textbox', { name: 'Manuscrito' })).toBe(manuscript);
    expect(mounted).toHaveBeenCalledOnce();
  });

  it('cancelar drag conserva a largura da sessão quando a gravação anterior falhou', () => {
    render(tree());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sem espaço');
    });
    const handle = screen.getByRole('separator');
    Object.assign(handle, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.pointerDown(handle, { clientX: 600, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 500 });
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerUp(handle, { clientX: 500 });
    expect(handle).toHaveAttribute('aria-valuenow', '42');
    expect(readWorkspacePreferences('author').panelPercent).toBe(40);
    expect(screen.getByText('Preferência de largura não salva')).toBeVisible();
  });

  it('aplica/persiste a largura e conserva as árvores de manuscrito e painel ao fechar', () => {
    const { rerender } = render(tree());
    const manuscript = screen.getByRole('textbox', { name: 'Manuscrito' });
    const draft = screen.getByRole('textbox', { name: 'Rascunho do painel' });
    fireEvent.change(draft, { target: { value: 'Pedido não enviado' } });
    let handle = screen.getByRole('separator');
    expect(handle).toHaveAttribute('aria-valuenow', '40');
    const panel = document.getElementById(handle.getAttribute('aria-controls')!)!;
    expect(panel.style.width).toBe('396.8px');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(readWorkspacePreferences('author')).toEqual({ panelPercent: 42 });
    expect(panel.style.width).toBe('416.64px');
    rerender(tree('author', false));
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Rascunho do painel' })).not.toBeInTheDocument();
    rerender(tree());
    handle = screen.getByRole('separator');
    expect(handle).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByRole('textbox', { name: 'Rascunho do painel' })).toBe(draft);
    expect(draft).toHaveValue('Pedido não enviado');
    expect(screen.getByRole('textbox', { name: 'Manuscrito' })).toBe(manuscript);
    expect(manuscript).toHaveTextContent('Meu texto');
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  it('limita a largura sem perder a preferência quando o espaço volta a crescer', () => {
    saveWorkspacePreferences('author', { panelPercent: 70 });
    const { unmount } = render(tree());
    const handle = screen.getByRole('separator');
    expect(Number(handle.getAttribute('aria-valuenow'))).toBeLessThan(70);
    const panel = document.getElementById(handle.getAttribute('aria-controls')!)!;
    expect(1000 - Number.parseFloat(panel.style.width) - 8).toBeGreaterThanOrEqual(400);
    width = 1800;
    act(resized);
    expect(handle).toHaveAttribute('aria-valuenow', '70');
    expect(readWorkspacePreferences('author').panelPercent).toBe(70);
    unmount();
    expect(disconnected).toHaveBeenCalledTimes(1);
  });

  it('empilha quando os mínimos não cabem e também em viewport móvel', () => {
    width = 650;
    render(tree());
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAttribute('data-stacked', 'true');
    width = 1400;
    vi.stubGlobal('innerWidth', 700);
    act(resized);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    vi.stubGlobal('innerWidth', 1440);
    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('observa preferências atualizadas e usa somente a conta atual', () => {
    const { rerender } = render(tree());
    act(() => {
      saveWorkspacePreferences('other', { panelPercent: 35 });
    });
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '40');
    act(() => {
      saveWorkspacePreferences('author', { panelPercent: 50 });
    });
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50');
    rerender(tree('other'));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '35');
  });

  it('mantém a largura da sessão e oferece retentativa se a gravação falhar', () => {
    const { rerender } = render(tree());
    const failed = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sem espaço');
    });
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' });
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('Preferência de largura não salva')).toBeVisible();
    expect(readWorkspacePreferences('author').panelPercent).toBe(40);
    rerender(tree('other'));
    expect(screen.queryByText('Preferência de largura não salva')).not.toBeInTheDocument();
    rerender(tree());
    failed.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(readWorkspacePreferences('author').panelPercent).toBe(42);
    expect(screen.queryByText('Preferência de largura não salva')).not.toBeInTheDocument();
  });

  it('funciona sem ResizeObserver usando a medição inicial e resize da janela', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(tree());
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '40');
    width = 650;
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it.each([0, 300, 688, NaN, Infinity])(
    'trata uma largura não utilizável (%s) com apresentação empilhada',
    (value) => {
      expect(workspaceGeometry(value, 1280).stacked).toBe(true);
    },
  );
});
