import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Button } from '../Button';
import { SidePanelHeader } from '../SidePanelHeader';

it('nomeia cabeçalho e ações e mantém operação de fechar acessível por teclado', async () => {
  const user = userEvent.setup();
  const close = vi.fn();
  render(
    <SidePanelHeader title="Detalhes">
      <Button onClick={close}>Fechar painel</Button>
    </SidePanelHeader>,
  );
  expect(screen.getByRole('heading', { level: 2, name: 'Detalhes' })).toBeVisible();
  expect(
    within(screen.getByRole('group', { name: 'Ações de Detalhes' })).getByRole('button'),
  ).toHaveAccessibleName('Fechar painel');
  await user.tab();
  await user.keyboard('{Enter}');
  expect(close).toHaveBeenCalledOnce();
});
