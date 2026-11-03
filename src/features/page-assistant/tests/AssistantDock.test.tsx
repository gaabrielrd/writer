import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssistantDock } from '../components/AssistantDock';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'writer' } }) }));
const key = 'writer-assistant-dock:v1:writer';
const saved = () =>
  JSON.parse(localStorage.getItem(key) ?? '{}') as { x?: number; y?: number; mode?: string };

it('reserves the measured dock height in dialogs and releases it on unmount', async () => {
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  document.body.append(modal);
  const view = render(tree());
  try {
    await waitFor(() =>
      expect(modal.style.getPropertyValue('--page-assistant-height')).toBe('120px'),
    );
    view.unmount();
    expect(modal.style.getPropertyValue('--page-assistant-height')).toBe('');
  } finally {
    modal.remove();
  }
});

it('temporarily minimizes a compact dock in a narrow dialog and preserves explicit expansion', async () => {
  vi.stubGlobal('innerWidth', 320);
  render(tree());
  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  document.body.append(modal);
  try {
    await waitFor(() =>
      expect(screen.getByRole('complementary')).toHaveAttribute('data-mode', 'minimized'),
    );
    expect(localStorage.getItem(key)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Assistente da página' }));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-mode', 'expanded');
    expect(screen.getByLabelText('Pergunta do dock')).toHaveValue('Minha pergunta');
  } finally {
    modal.remove();
  }
});

it('shares clearance with workspace portals and releases it on unmount', async () => {
  const view = render(<div data-writer-workspace>{tree()}</div>);
  await waitFor(() =>
    expect(document.documentElement.style.getPropertyValue('--page-assistant-height')).toBe(
      '120px',
    ),
  );
  expect(localStorage.getItem(key)).toBeNull();
  view.unmount();
  expect(document.documentElement.style.getPropertyValue('--page-assistant-height')).toBe('');
});

function tree(external = false, initialOpen = false) {
  return (
    <>
      {external && <textarea aria-label="Texto principal" defaultValue="Prosa preservada" />}
      <AssistantDock context="Livro" initialOpen={initialOpen}>
        {(expanded, expand, compact) => (
          <>
            <span>{expanded ? 'Conversa aberta' : 'Barra compacta'}</span>
            <textarea aria-label="Pergunta do dock" defaultValue="Minha pergunta" />
            <button onClick={expand}>Abrir pelo conteúdo</button>
            <button onClick={compact}>Recolher pelo conteúdo</button>
          </>
        )}
      </AssistantDock>
    </>
  );
}
let captureDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute('aria-label') === 'Texto principal'
      ? new DOMRect(400, 700, 200, 50)
      : new DOMRect(
          Number.parseFloat(this.style.left) || 0,
          Number.parseFloat(this.style.top) || 0,
          320,
          120,
        );
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly update: () => void;
      constructor(update: () => void) {
        this.update = update;
      }
      observe() {
        this.update();
      }
      disconnect() {}
    },
  );
  captureDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture');
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (captureDescriptor)
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', captureDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
});
it('moves by keyboard, restores the lower center and preserves text through collapse', async () => {
  render(tree());
  const dock = screen.getByRole('complementary', { name: 'Assistente da página' });
  const grip = screen.getByRole('button', { name: 'Mover assistente' });
  const original = Number.parseFloat(dock.style.top);
  grip.focus();
  await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}');
  expect(Number.parseFloat(dock.style.top)).toBeLessThan(original);
  expect(saved().y).toBeLessThan(1);
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar posição do assistente' }));
  expect(saved()).toMatchObject({ x: 0.5, y: 1 });
  await userEvent.click(screen.getByRole('button', { name: 'Abrir pelo conteúdo' }));
  expect(dock).toHaveAttribute('data-mode', 'expanded');
  await userEvent.click(screen.getByRole('button', { name: 'Recolher conversa' }));
  await userEvent.click(screen.getByRole('button', { name: 'Expandir conversa' }));
  await userEvent.click(screen.getByRole('button', { name: 'Recolher pelo conteúdo' }));
  const input = screen.getByLabelText('Pergunta do dock');
  input.focus();
  await userEvent.keyboard('{Escape}');
  expect(dock).toHaveAttribute('data-mode', 'minimized');
  expect(grip).toHaveFocus();
  await userEvent.click(screen.getByRole('button', { name: 'Assistente da página' }));
  expect(input).toHaveValue('Minha pergunta');
  await userEvent.click(screen.getByRole('button', { name: 'Minimizar assistente' }));
  expect(input).not.toBeVisible();
});
it('commits a drag only on release and restores the original position on cancel or Escape', () => {
  render(tree());
  const dock = screen.getByRole('complementary');
  const grip = screen.getByRole('button', { name: 'Mover assistente' });
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 550, clientY: 600 });
  fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientX: 500, clientY: 700 });
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 550, clientY: 650 });
  expect(localStorage.getItem(key)).toBeNull();
  fireEvent.pointerUp(grip, { pointerId: 1 });
  const committed = saved();
  const top = dock.style.top;
  expect(committed.x).toBeGreaterThan(0.5);
  expect(committed.y).toBeLessThan(1);
  fireEvent.pointerDown(grip, { button: 0, pointerId: 2, clientX: 500, clientY: 600 });
  fireEvent.pointerMove(grip, { pointerId: 2, clientX: 500, clientY: 500 });
  fireEvent.pointerCancel(grip, { pointerId: 2 });
  expect(dock.style.top).toBe(top);
  fireEvent.pointerDown(grip, { button: 0, pointerId: 3, clientX: 500, clientY: 600 });
  fireEvent.pointerMove(grip, { pointerId: 3, clientX: 500, clientY: 500 });
  fireEvent.keyDown(grip, { key: 'Escape' });
  expect(dock.style.top).toBe(top);
  expect(saved()).toEqual(committed);
  expect(dock).toHaveAttribute('data-mode', 'compact');
});
it('keeps writing available when presentation storage fails and clamps after resizing', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  render(tree());
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar posição do assistente' }));
  expect(screen.getByRole('status')).toHaveTextContent('armazenamento indisponível');
  const input = screen.getByLabelText('Pergunta do dock');
  await userEvent.clear(input);
  await userEvent.type(input, 'Texto preservado');
  vi.stubGlobal('innerHeight', 400);
  fireEvent(window, new Event('resize'));
  expect(Number.parseFloat(screen.getByRole('complementary').style.top)).toBeLessThan(400);
  expect(input).toHaveValue('Texto preservado');
});
it('temporarily minimizes for an overlapping writing field without persisting the preference', async () => {
  render(tree(true));
  const main = screen.getByLabelText('Texto principal');
  main.focus();
  await waitFor(() =>
    expect(screen.getByRole('complementary')).toHaveAttribute('data-mode', 'minimized'),
  );
  expect(main).toHaveFocus();
  expect(localStorage.getItem(key)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Assistente da página' }));
  expect(main).toHaveValue('Prosa preservada');
  expect(saved().mode).toBe('expanded');
});

it('opens a newly adopted conception without resetting its existing question', async () => {
  const view = render(tree());
  await userEvent.type(screen.getByLabelText('Pergunta do dock'), ' preservada');
  view.rerender(tree(false, true));
  await waitFor(() =>
    expect(screen.getByRole('complementary')).toHaveAttribute('data-mode', 'expanded'),
  );
  expect(screen.getByLabelText('Pergunta do dock')).toHaveValue('Minha pergunta preservada');
});
it.each(['data-conception-assistant', 'data-writer-navigation'])(
  'suspends the global dock in %s and restores it afterwards',
  async (attribute) => {
    render(tree());
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Escolha de imagem');
    const conception = document.createElement('div');
    conception.setAttribute(attribute, '');
    modal.append(conception);
    document.body.append(modal);
    try {
      await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    } finally {
      modal.remove();
    }
    await waitFor(() => expect(screen.getByRole('complementary')).toBeVisible());
  },
);
