import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  const inherited = screen.getByRole('progressbar', { name: 'Tensão' });
  expect(inherited).toHaveAttribute('value', '40');
  expect(within(inherited.closest('article')!).getByText('Livro', { exact: true })).toBeVisible();
  await chooseDropdown(user, screen.getByLabelText('Aplicação de Tensão'), 'Definir no capítulo');
  fireEvent.change(screen.getByLabelText('Tensão'), { target: { value: '100' } });
  expect(
    within(screen.getByRole('slider', { name: 'Tensão' }).closest('article')!).getByText(
      'Ajuste do capítulo',
    ),
  ).toBeVisible();
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

it('mostra a origem complementar sem base e atualiza a prévia com valor zero e herança restaurada', async () => {
  const user = userEvent.setup();
  render(
    <PersonaBindingDialog ownerId="author" mode="chapter" onSave={vi.fn()} onClose={vi.fn()} />,
  );
  await chooseDropdown(user, await screen.findByLabelText('Persona complementar'), 'O Inquietante');
  expect(screen.getByRole('progressbar', { name: 'Tensão' })).toHaveAttribute('value', '95');
  expect(screen.getByLabelText('Aplicação de Tensão')).toHaveTextContent('Usar valor da persona');
  await chooseDropdown(user, screen.getByLabelText('Aplicação de Tensão'), 'Definir no capítulo');
  fireEvent.change(screen.getByRole('slider', { name: 'Tensão' }), { target: { value: '0' } });
  const article = within(screen.getByRole('slider', { name: 'Tensão' }).closest('article')!);
  expect(article.getByText('Ajuste do capítulo')).toBeVisible();
  expect(article.getByText('0')).toBeVisible();
  await chooseDropdown(user, screen.getByLabelText('Aplicação de Tensão'), 'Usar valor da persona');
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Tensão' })).toHaveAttribute('value', '95');
});
