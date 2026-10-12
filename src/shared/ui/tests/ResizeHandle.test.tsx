import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResizeHandle } from '../ResizeHandle';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

const committed = vi.fn();
function Demo() {
  const container = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(40);
  return (
    <div ref={container} data-testid="workspace">
      <div
        role="textbox"
        aria-label="Texto preservado"
        contentEditable
        suppressContentEditableWarning
      >
        Meu texto
      </div>
      <ResizeHandle
        label="Largura do painel"
        controls="panel"
        containerRef={container}
        value={value}
        min={28}
        max={60}
        defaultValue={40}
        onValueChange={setValue}
        onValueCommit={committed}
      />
      <aside id="panel">Painel</aside>
    </div>
  );
}

function setup(width = 1000) {
  render(<Demo />);
  const workspace = screen.getByTestId('workspace');
  vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
  const handle = screen.getByRole('separator', { name: 'Largura do painel' });
  const capture = vi.fn();
  const release = vi.fn();
  Object.assign(handle, { setPointerCapture: capture, releasePointerCapture: release });
  return { handle, capture, release };
}

beforeEach(() => {
  committed.mockClear();
  vi.stubGlobal('PointerEvent', TestPointerEvent);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('divisor redimensionável', () => {
  it('expõe orientação, valor, limites e painel controlado', () => {
    const { handle } = setup();
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '40');
    expect(handle).toHaveAttribute('aria-valuemin', '28');
    expect(handle).toHaveAttribute('aria-valuemax', '60');
    expect(handle).toHaveAttribute('aria-controls', 'panel');
    expect(handle).toHaveAttribute('aria-valuetext', '40% da largura disponível');
  });

  it('redimensiona por teclado, respeita limites e restaura com duplo clique', () => {
    const { handle } = setup();
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '42');
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(handle).toHaveAttribute('aria-valuenow', '32');
    fireEvent.keyDown(handle, { key: 'Home' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '28');
    fireEvent.keyDown(handle, { key: 'End' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '60');
    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute('aria-valuenow', '40');
    expect(committed).toHaveBeenLastCalledWith(40);
    fireEvent.keyDown(handle, { key: 'Tab' });
    expect(committed).toHaveBeenCalledTimes(7);
  });

  it('captura drag e persiste somente a largura final, conservando texto/seleção/foco', () => {
    const { handle, capture, release } = setup();
    const text = screen.getByRole('textbox');
    text.focus();
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(window.getSelection()!.toString()).toBe('Meu texto');
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 600, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 500 });
    expect(handle).toHaveAttribute('aria-valuenow', '50');
    expect(handle).toHaveAttribute('data-dragging', 'true');
    expect(committed).not.toHaveBeenCalled();
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 0 });
    expect(handle).toHaveAttribute('aria-valuenow', '60');
    fireEvent.pointerUp(handle, { pointerId: 2, clientX: 0 });
    expect(capture).toHaveBeenCalledWith(2);
    expect(release).toHaveBeenCalledWith(2);
    expect(committed).toHaveBeenCalledExactlyOnceWith(60);
    expect(handle).not.toHaveAttribute('data-dragging');
    expect(text).toHaveTextContent('Meu texto');
    expect(text).toHaveFocus();
    expect(window.getSelection()!.toString()).toBe('Meu texto');
  });

  it.each(['pointerCancel', 'lostPointerCapture', 'Escape'])(
    'cancela %s sem salvar uma largura parcial',
    (action) => {
      const { handle } = setup();
      fireEvent.pointerDown(handle, { clientX: 600, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 400 });
      expect(handle).toHaveAttribute('aria-valuenow', '60');
      if (action === 'Escape') fireEvent.keyDown(handle, { key: 'Escape' });
      else if (action === 'pointerCancel') fireEvent.pointerCancel(handle);
      else fireEvent.lostPointerCapture(handle);
      expect(handle).toHaveAttribute('aria-valuenow', '40');
      expect(committed).not.toHaveBeenCalled();
      fireEvent.pointerUp(handle);
      fireEvent.pointerMove(handle, { clientX: 100 });
      expect(handle).toHaveAttribute('aria-valuenow', '40');
    },
  );

  it('ignora ponteiros alheios, segundo início e botões secundários', () => {
    const { handle, capture } = setup();
    fireEvent.pointerDown(handle, { button: 2 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 600 });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 100 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 100 });
    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(handle).toHaveAttribute('aria-valuenow', '40');
    expect(capture).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700 });
    expect(handle).toHaveAttribute('aria-valuenow', '30');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 700 });
    expect(committed).toHaveBeenCalledExactlyOnceWith(30);
  });

  it('confirma a posição final mesmo se o último movimento não for entregue', () => {
    const { handle } = setup();
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 600, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 550 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 500 });
    expect(handle).toHaveAttribute('aria-valuenow', '50');
    expect(committed).toHaveBeenCalledExactlyOnceWith(50);
  });

  it('ignora drag quando a largura ainda não pode ser medida', () => {
    const { handle, capture } = setup(0);
    fireEvent.pointerDown(handle, { button: 0 });
    expect(capture).not.toHaveBeenCalled();
  });
});
