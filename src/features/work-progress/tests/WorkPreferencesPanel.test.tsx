import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { chooseDropdown } from '@/test/dropdown';
import { WorkPreferencesPanel } from '../components/WorkPreferencesPanel';
import * as service from '../services/workProgressService';
import { conflict, uncertain, deferred } from './workFixtures';
import type { WorkPreferences } from '../model/workProgress';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/workProgressService');
vi.mock('../services/workTimeZone', async (original) => ({
  ...(await original<object>()),
  deviceTimeZone: () => 'America/Sao_Paulo',
  availableTimeZones: () => ['UTC', 'America/Sao_Paulo'],
}));
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid: 'owner' };
  vi.mocked(service.getWorkPreferences).mockResolvedValue({ revision: 1, timeZone: 'UTC' });
  vi.mocked(service.saveWorkPreferences).mockImplementation((input) =>
    Promise.resolve({
      revision: input.expectedRevision + 1,
      timeZone: input.timeZone,
    }),
  );
});
it('inicializa uma vez pelo dispositivo e preserva preferência entre renderizações', async () => {
  vi.mocked(service.getWorkPreferences).mockResolvedValue({ revision: 0, timeZone: null });
  const changed = vi.fn();
  const rendered = render(<WorkPreferencesPanel onTimeZone={changed} />);
  expect(screen.getByText('Carregando fuso horário…')).toBeVisible();
  await waitFor(() => expect(changed).toHaveBeenCalledWith('America/Sao_Paulo'));
  expect(service.saveWorkPreferences).toHaveBeenCalledTimes(1);
  expect(service.saveWorkPreferences).toHaveBeenCalledWith({
    operationId: String(vi.mocked(service.saveWorkPreferences).mock.calls[0]?.[0].operationId),
    expectedRevision: 0,
    timeZone: 'America/Sao_Paulo',
  });
  rendered.rerender(<WorkPreferencesPanel onTimeZone={changed} />);
  expect(service.saveWorkPreferences).toHaveBeenCalledTimes(1);
});
it('CAS de outro dispositivo conserva o fuso já inicializado sem sobrescrever', async () => {
  vi.mocked(service.getWorkPreferences)
    .mockResolvedValueOnce({ revision: 0, timeZone: null })
    .mockResolvedValueOnce({ revision: 1, timeZone: 'UTC' });
  vi.mocked(service.saveWorkPreferences).mockRejectedValueOnce(conflict());
  const changed = vi.fn();
  render(<WorkPreferencesPanel onTimeZone={changed} />);
  await waitFor(() => expect(changed).toHaveBeenCalledWith('UTC'));
  expect(screen.getByRole('combobox', { name: 'Fuso horário' })).toHaveTextContent('UTC');
  expect(service.saveWorkPreferences).toHaveBeenCalledTimes(1);
});
it('falha de leitura ou inicialização oferece retry e conserva recibo inicial incerto', async () => {
  vi.mocked(service.getWorkPreferences).mockResolvedValue({ revision: 0, timeZone: null });
  vi.mocked(service.saveWorkPreferences)
    .mockRejectedValueOnce(uncertain())
    .mockResolvedValueOnce({ revision: 1, timeZone: 'America/Sao_Paulo' });
  render(<WorkPreferencesPanel />);
  await screen.findByText('Não foi possível confirmar esta operação. Tente novamente.');
  const first = vi.mocked(service.saveWorkPreferences).mock.calls[0]?.[0];
  if (!first) throw new Error('Inicialização ausente');
  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole('button', { name: 'Tentar carregar fuso' }));
  expect(await screen.findByRole('combobox', { name: 'Fuso horário' })).toHaveTextContent(
    'America/Sao Paulo',
  );
  expect(vi.mocked(service.saveWorkPreferences).mock.calls[1]?.[0]).toEqual(first);
});
it('mudança explícita salva com CAS e repete payload ao perder resposta', async () => {
  vi.mocked(service.saveWorkPreferences).mockRejectedValueOnce(uncertain());
  render(<WorkPreferencesPanel />);
  const field = await screen.findByRole('combobox', { name: 'Fuso horário' });
  const user = userEvent.setup({ delay: null });
  await chooseDropdown(user, field, 'America/Sao Paulo');
  await user.click(screen.getByRole('button', { name: 'Salvar fuso' }));
  await screen.findByText('Não foi possível confirmar esta operação. Tente novamente.');
  expect(field).toBeDisabled();
  const first = vi.mocked(service.saveWorkPreferences).mock.calls[0]?.[0];
  if (!first) throw new Error('Pedido ausente');
  await user.click(screen.getByRole('button', { name: 'Confirmar fuso novamente' }));
  expect(await screen.findByText('Fuso horário salvo.')).toBeVisible();
  expect(vi.mocked(service.saveWorkPreferences).mock.calls[1]?.[0]).toEqual(first);
  expect(first).toMatchObject({ expectedRevision: 1, timeZone: 'America/Sao_Paulo' });
});
it('conflito mostra preferência atual sem perder escolha local e permite confirmação consciente', async () => {
  vi.mocked(service.saveWorkPreferences).mockRejectedValueOnce(conflict());
  vi.mocked(service.getWorkPreferences)
    .mockResolvedValueOnce({ revision: 1, timeZone: 'UTC' })
    .mockResolvedValueOnce({ revision: 3, timeZone: 'UTC' });
  render(<WorkPreferencesPanel />);
  const user = userEvent.setup({ delay: null });
  await chooseDropdown(
    user,
    await screen.findByRole('combobox', { name: 'Fuso horário' }),
    'America/Sao Paulo',
  );
  await user.click(screen.getByRole('button', { name: 'Salvar fuso' }));
  await user.click(await screen.findByRole('button', { name: 'Atualizar preferência' }));
  expect(await screen.findByText(/Fuso atual: UTC/)).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Fuso horário' })).toHaveTextContent(
    'America/Sao Paulo',
  );
  await user.click(screen.getByRole('button', { name: 'Salvar fuso' }));
  await screen.findByText('Fuso horário salvo.');
  expect(service.saveWorkPreferences).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: 3, timeZone: 'America/Sao_Paulo' }),
  );
});
it('mudança de UID cancela inicialização tardia antes de gravar na nova conta', async () => {
  const old = deferred<WorkPreferences>();
  vi.mocked(service.getWorkPreferences)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ revision: 1, timeZone: 'UTC' });
  const rendered = render(<WorkPreferencesPanel />);
  auth.user = { uid: 'other' };
  rendered.rerender(<WorkPreferencesPanel />);
  await screen.findByRole('combobox', { name: 'Fuso horário' });
  await act(async () => {
    old.resolve({ revision: 0, timeZone: null });
    await Promise.resolve();
  });
  expect(service.saveWorkPreferences).not.toHaveBeenCalled();
  auth.user = null;
  rendered.rerender(<WorkPreferencesPanel />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});
