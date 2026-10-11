import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ChapterPersonaDialog } from '../components/ChapterPersonaDialog';
import { chooseDropdown } from '@/test/dropdown';
import { savePersona } from '../services/personaService';

vi.mock('../services/personaService', () => ({
  subscribePersonas: vi.fn((_owner, callback: (items: unknown[]) => void) => {
    callback([]);
    return vi.fn();
  }),
  savePersona: vi.fn(),
}));
it('concentra vínculos, biblioteca, detalhes e edição em um único modal', async () => {
  const user = userEvent.setup();
  const book = vi.fn().mockResolvedValue(undefined);
  const chapter = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn();
  const retry = vi.fn();
  render(
    <ChapterPersonaDialog
      ownerId="author"
      bookPersonaId="preset-atmospheric"
      instruction="Orientações combinadas"
      error="Falha de configuração"
      onRetry={retry}
      onSaveBook={book}
      onSaveChapter={chapter}
      onClose={close}
    />,
  );
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(retry).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('tab', { name: 'Livro' }));
  await chooseDropdown(user, screen.getByLabelText('Persona base'), 'O Incisivo');
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  await waitFor(() => expect(book).toHaveBeenCalledWith('preset-incisive'));
  await user.click(screen.getByRole('tab', { name: 'Capítulo' }));
  await chooseDropdown(user, screen.getByLabelText('Persona complementar'), 'O Inquietante');
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  await waitFor(() =>
    expect(chapter).toHaveBeenCalledWith({ personaId: 'preset-unsettling', overrides: [] }),
  );
  await user.click(screen.getByRole('tab', { name: 'Biblioteca' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await user.click(screen.getByText('Orientações efetivas'));
  expect(screen.getByText('Orientações combinadas')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Ver detalhes de O Incisivo' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('progressbar', { name: 'Concisão' })).toHaveAttribute('value', '95');
  await user.click(screen.getByRole('button', { name: 'Personalizar O Incisivo' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getAllByRole('slider')).toHaveLength(8);
  await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));
  await user.click(screen.getByRole('button', { name: 'Fechar detalhes' }));
  vi.mocked(savePersona).mockImplementation((_owner, input) => Promise.resolve(input));
  await user.click(screen.getByRole('button', { name: 'Nova persona' }));
  await user.type(screen.getByLabelText('Nome da persona'), 'Voz do capítulo');
  await user.type(screen.getByLabelText('Instruções permanentes'), 'Use diálogos breves.');
  await user.click(screen.getByRole('button', { name: 'Salvar persona' }));
  await waitFor(() =>
    expect(screen.getByRole('list', { name: 'Personas disponíveis' })).toBeVisible(),
  );
  await user.keyboard('{Escape}');
  expect(close).toHaveBeenCalledTimes(3);
});
