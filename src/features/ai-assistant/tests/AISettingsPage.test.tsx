import { render, screen, waitFor, within } from '@testing-library/react';
import { mockMatchMedia } from '@/test/matchMedia';
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
  expect(screen.getByRole('region', { name: 'Inteligência artificial' })).toBeVisible();
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
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Provedor' })).toHaveAttribute('aria-selected', 'true'),
  );
  await user.keyboard('{Home}');
  await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
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
    screen.getByLabelText('Como deseja usar a IA?'),
    'Chave própria — BYOK',
  );
  await chooseDropdown(user, screen.getByLabelText('Provedor BYOK'), 'OpenAI API');
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

it('em tela larga mostra a persona no inspetor e abre os detalhes completos pelo botão', async () => {
  const user = userEvent.setup();
  const restore = mockMatchMedia('(min-width: 1100px)');
  try {
    render(
      <MemoryRouter initialEntries={['/settings/ai']}>
        <AISettingsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('complementary', { name: 'Detalhes' })).toHaveTextContent(
      'Escolha uma persona',
    );
    await user.click(screen.getByRole('button', { name: 'Ver detalhes de O Épico' }));
    const panel = screen.getByRole('complementary', { name: 'Detalhes de O Épico' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Abrir detalhes' }));
    expect(screen.getByRole('dialog', { name: 'O Épico' })).toBeVisible();
  } finally {
    restore();
  }
});
