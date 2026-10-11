import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { chooseDropdown } from '@/test/dropdown';
import { PersonaBindingDialog } from '../components/PersonaBindingDialog';
import { subscribePersonas } from '../services/personaService';
vi.mock('../services/personaService', () => ({ subscribePersonas: vi.fn() }));
beforeEach(() => {
  vi.mocked(subscribePersonas).mockImplementation((_owner, callback) => {
    callback([]);
    return vi.fn();
  });
});
it('vincula uma base e permite remover a persona', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  render(<PersonaBindingDialog ownerId="author" mode="book" onSave={save} onClose={vi.fn()} />);
  await chooseDropdown(user, await screen.findByLabelText('Persona base'), 'O Incisivo');
  expect(screen.getByRole('img', { name: 'Avatar de O Incisivo' })).toHaveAttribute(
    'src',
    '/img/persona/02-incisivo.png',
  );
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith('preset-incisive', null));
  await chooseDropdown(user, screen.getByLabelText('Persona base'), 'Sem persona');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(null, null));
});
it('herda atributos e salva um complemento com substituição explícita, preservando falhas', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockRejectedValueOnce(new Error('Sem conexão')).mockResolvedValue(undefined);
  const close = vi.fn();
  render(
    <PersonaBindingDialog
      ownerId="author"
      mode="chapter"
      bookPersonaId="preset-atmospheric"
      onSave={save}
      onClose={close}
    />,
  );
  await chooseDropdown(user, await screen.findByLabelText('Persona complementar'), 'O Inquietante');
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  await chooseDropdown(user, screen.getByLabelText('Aplicação de Tensão'), 'Definir no capítulo');
  fireEvent.change(screen.getByLabelText('Tensão'), { target: { value: '100' } });
  await user.click(screen.getByText('Orientações efetivas'));
  expect(screen.getByText(/Sensorialidade: 90\/100/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  expect(await screen.findByText('Sem conexão')).toBeVisible();
  expect(close).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(null, {
      personaId: 'preset-unsettling',
      overrides: [{ traitId: 'tension', value: 100 }],
    }),
  );
});
