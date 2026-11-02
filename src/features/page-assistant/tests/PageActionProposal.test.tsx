import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageActionProposal } from '../components/PageActionProposal';
import { PageAssistantSurface } from '../components/PageAssistantSurface';
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
it('reviews and edits a text proposal before executing, without invoking during render', async () => {
  const execute = vi.fn(),
    discard = vi.fn();
  render(
    <PageActionProposal
      action={{ id: 'field', value: 'Original' }}
      capability={{ id: 'field', label: 'Título', kind: 'field' }}
      onExecute={execute}
      onDiscard={discard}
    />,
  );
  expect(execute).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText('Texto proposto'));
  await userEvent.type(screen.getByLabelText('Texto proposto'), 'Revisado');
  await userEvent.click(screen.getByRole('button', { name: 'Executar: Título' }));
  expect(execute).toHaveBeenCalledWith('Revisado');
  await userEvent.click(screen.getByRole('button', { name: 'Descartar sugestão' }));
  expect(discard).toHaveBeenCalledOnce();
});
it('confirms a plain action without inventing field content', async () => {
  const execute = vi.fn();
  render(
    <PageActionProposal
      action={{ id: 'action' }}
      capability={{ id: 'action', label: 'Abrir', kind: 'action' }}
      onExecute={execute}
      onDiscard={() => undefined}
    />,
  );
  expect(screen.queryByLabelText('Texto proposto')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Executar: Abrir' }));
  expect(execute).toHaveBeenCalledWith(undefined);
});
it('keeps the same conversation usable inside the active dialog and can recollect it', async () => {
  render(
    <>
      <div role="dialog" aria-label="Editor">
        <h2>Editor</h2>
      </div>
      <PageAssistantSurface>
        <p>Uma conversa preservada.</p>
      </PageAssistantSurface>
    </>,
  );
  const trigger = await screen.findByRole('button', { name: 'Continuar conversa criativa' });
  await userEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Editor' })).toContainElement(
    screen.getByText('Uma conversa preservada.'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Recolher conversa criativa' }));
  expect(screen.queryByText('Uma conversa preservada.')).not.toBeInTheDocument();
});
it('renders a selected option as an explicit editable choice', async () => {
  const execute = vi.fn();
  render(
    <PageActionProposal
      action={{ id: 'select', value: 'Rascunho' }}
      capability={{
        id: 'select',
        label: 'Estado',
        kind: 'select',
        options: ['Rascunho', 'Revisão'],
      }}
      onExecute={execute}
      onDiscard={() => undefined}
    />,
  );
  expect(screen.getByLabelText('Opção proposta')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Executar: Estado' }));
  expect(execute).toHaveBeenCalledWith('Rascunho');
});
