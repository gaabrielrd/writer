import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Dialog } from '../Dialog';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function Workspace() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir histórico</button>
      <textarea aria-label="Manuscrito" />
      <Dialog open={open} onClose={() => setOpen(false)} title="Histórico">
        <button onClick={() => setOpen(false)}>Fechar histórico</button>
      </Dialog>
    </>
  );
}
function openHistory() {
  vi.useFakeTimers();
  render(<Workspace />);
  const opener = screen.getByRole('button', { name: 'Abrir histórico' });
  act(() => opener.focus());
  fireEvent.click(opener);
  expect(screen.getByRole('dialog', { name: 'Histórico' })).toBeVisible();
  return opener;
}
it('retorna ao acionador após fechar quando o usuário ainda não escolheu outro foco', () => {
  const opener = openHistory();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar histórico' }));
  act(() => {
    vi.runOnlyPendingTimers();
  });
  expect(opener).toHaveFocus();
});
it('retorno diferido do diálogo não rouba foco da escrita retomada pelo usuário', () => {
  openHistory();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar histórico' }));
  const editor = screen.getByRole('textbox', { name: 'Manuscrito' });
  act(() => editor.focus());
  expect(editor).toHaveFocus();
  act(() => {
    vi.runOnlyPendingTimers();
  });
  expect(editor).toHaveFocus();
});
