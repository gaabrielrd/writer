import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { AISettingsPage } from '../components/AISettingsPage';
import { AISettingsProvider } from '../components/AISettingsProvider';
import { useAISettings } from '../hooks/useAISettings';
import { getBYOKConfig, saveBYOKConfig } from '../services/byokStorage';
import { chooseDropdown } from '@/test/dropdown';

vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('../services/personaService', () => ({
  subscribePersonas: vi.fn((_owner, callback: (items: unknown[]) => void) => {
    callback([]);
    return vi.fn();
  }),
}));
vi.mock('../services/byokStorage', () => ({
  getBYOKConfig: vi.fn(),
  saveBYOKConfig: vi.fn(),
  clearBYOKConfig: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBYOKConfig).mockReturnValue({ provider: 'firebase_ai' });
});

it('navega pelo contexto para a rota com lista e abre detalhes gráficos, devolvendo foco à linha', async () => {
  function Entry() {
    const open = useAISettings();
    return <button onClick={open}>Configurar IA</button>;
  }
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AISettingsProvider>
        <Routes>
          <Route path="/" element={<Entry />} />
          <Route path="/settings/ai" element={<AISettingsPage />} />
        </Routes>
      </AISettingsProvider>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Configurar IA' }));
  expect(screen.getByRole('heading', { name: 'Inteligência artificial' })).toBeVisible();
  expect(screen.getByRole('list', { name: 'Personas disponíveis' })).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const row = screen.getByRole('button', { name: 'Ver detalhes de O Épico' });
  await user.click(row);
  expect(screen.getByRole('dialog', { name: 'O Épico' })).toBeVisible();
  expect(screen.getByRole('progressbar', { name: 'Solenidade' })).toHaveAttribute('value', '95');
  await user.keyboard('{Escape}');
  expect(row).toHaveFocus();
  const tab = screen.getByRole('tab', { name: 'Personas' });
  tab.focus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Provedor' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{Home}');
  expect(tab).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{End}');
  await user.keyboard('{ArrowLeft}');
  expect(tab).toHaveFocus();
});

it('abre diretamente a aba do provedor e salva as preferências na página', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/settings/ai', search: '?tab=provider', state: { returnTo: '/books/book' } },
      ]}
    >
      <AISettingsPage />
    </MemoryRouter>,
  );
  expect(screen.getByRole('tabpanel', { name: 'Provedor' })).toBeVisible();
  await chooseDropdown(
    user,
    screen.getByLabelText('Provedor de IA'),
    'OpenAI API (Chave Própria — BYOK)',
  );
  await user.type(screen.getByLabelText('Chave de API da OpenAI'), 'chave-ficticia');
  await user.click(screen.getByRole('button', { name: 'Salvar Preferências' }));
  expect(saveBYOKConfig).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'openai_byok', openaiApiKey: 'chave-ficticia' }),
  );
  expect(screen.getByText('Configurações salvas com sucesso!')).toBeVisible();
  await user.click(screen.getByRole('tab', { name: 'Personas' }));
  expect(screen.getByRole('list', { name: 'Personas disponíveis' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Voltar ao livro' })).toHaveAttribute(
    'href',
    '/books/book',
  );
});
