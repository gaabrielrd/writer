import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/shared/theme';
import { CustomThemesProvider, CustomThemeSelector } from '../index';
import { newTheme, emptyCatalog, type ThemeCatalog } from '../model/customTheme';
import {
  subscribeThemes,
  saveCustomTheme,
  removeCustomTheme,
} from '../services/customThemeService';
vi.mock('../services/customThemeService', () => ({
  subscribeThemes: vi.fn(),
  saveCustomTheme: vi.fn(),
  removeCustomTheme: vi.fn(),
}));
let changed: (catalog: ThemeCatalog) => void;
let failed: (error: Error) => void;
const saved = { ...newTheme(), name: 'Floresta', revision: 1, createdAt: 1, updatedAt: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(subscribeThemes).mockImplementation((_uid, onChange, onError) => {
    changed = onChange;
    failed = onError;
    onChange(emptyCatalog());
    return vi.fn();
  });
  vi.mocked(saveCustomTheme).mockImplementation((_uid, input) =>
    Promise.resolve({
      ...input,
      revision: input.revision + 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  vi.mocked(removeCustomTheme).mockResolvedValue();
});
function Status() {
  const { customTheme, setTheme } = useTheme();
  return (
    <>
      <span data-testid="active">{customTheme?.id ?? 'native'}</span>
      <button onClick={() => setTheme('system')}>Usar sistema</button>
    </>
  );
}
function setup(uid: string | null = 'a') {
  return render(
    <ThemeProvider defaultTheme="sepia">
      <CustomThemesProvider uid={uid}>
        <CustomThemeSelector />
        <Status />
        <a href="#navigation">Navegar</a>
      </CustomThemesProvider>
    </ThemeProvider>,
  );
}
async function create() {
  await userEvent.click(screen.getByRole('button', { name: 'Temas personalizados' }));
  await userEvent.click(screen.getByRole('button', { name: 'Criar novo' }));
  fireEvent.change(screen.getByLabelText('Nome do tema'), { target: { value: 'Meu tema' } });
}
it('gera sugestões e permite comparar com o tema anterior', async () => {
  setup();
  await create();
  expect(document.documentElement).toHaveAttribute('data-custom-theme');
  const original = document.documentElement.style.getPropertyValue('--card');
  await userEvent.click(screen.getByRole('button', { name: /Tonal/ }));
  expect(document.documentElement.style.getPropertyValue('--card')).not.toBe(original);
  await userEvent.click(screen.getByRole('button', { name: 'Comparar com o tema anterior' }));
  expect(document.documentElement).toHaveAttribute('data-theme', 'sepia');
  await userEvent.click(screen.getByRole('button', { name: 'Voltar à prévia' }));
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
});
it('preserva ajustes, recolhe e salva o tema', async () => {
  setup();
  await create();
  await userEvent.click(screen.getByRole('button', { name: /Modo avançado/ }));
  fireEvent.change(screen.getByLabelText('Fundo da página'), { target: { value: '#f0f0f0' } });
  await userEvent.click(screen.getByRole('button', { name: /Expressiva/ }));
  expect(screen.getByLabelText('Fundo da página')).toHaveValue('#f0f0f0');
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar Fundo da página' }));
  await userEvent.click(screen.getByRole('button', { name: 'Recolher painel de tema' }));
  expect(screen.getByRole('link', { name: 'Navegar' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Expandir painel de tema' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }));
  await waitFor(() => expect(saveCustomTheme).toHaveBeenCalled());
  expect(screen.queryByRole('region', { name: /Criar tema/ })).not.toBeInTheDocument();
  expect(screen.getByTestId('active')).not.toHaveTextContent('native');
});
it('restaura ao cancelar, confirma descarte ao trocar e trata falha de gravação', async () => {
  setup();
  await create();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar editor de tema' }));
  expect(screen.getByRole('dialog', { name: 'Alterações no tema' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
  await userEvent.click(screen.getByRole('button', { name: 'Tema Escuro' }));
  await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  await create();
  vi.mocked(saveCustomTheme).mockRejectedValueOnce(new Error('Sem conexão'));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }));
  expect(await screen.findByText('Sem conexão')).toBeVisible();
  expect(screen.getByLabelText('Nome do tema')).toHaveValue('Meu tema');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(document.documentElement).not.toHaveAttribute('data-custom-theme');
});
it('aplica, edita e remove tema ativo sem selecionar ao abrir ações', async () => {
  setup();
  act(() => changed({ ...emptyCatalog(), themes: [saved] }));
  await userEvent.click(screen.getByRole('button', { name: 'Temas personalizados' }));
  await userEvent.click(screen.getByRole('button', { name: 'Opções do tema Floresta' }));
  expect(screen.getByTestId('active')).toHaveTextContent('native');
  await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
  expect(screen.getByLabelText('Nome do tema')).toHaveValue('Floresta');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Temas personalizados' }));
  await userEvent.click(screen.getByRole('button', { name: 'Aplicar tema Floresta' }));
  expect(screen.getByTestId('active')).toHaveTextContent(saved.id);
  await userEvent.click(screen.getByRole('button', { name: 'Temas personalizados' }));
  await userEvent.click(screen.getByRole('button', { name: 'Opções do tema Floresta' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Remover' }));
  await userEvent.click(
    within(screen.getByRole('dialog', { name: 'Remover tema' })).getByRole('button', {
      name: 'Remover tema',
    }),
  );
  await waitFor(() => expect(removeCustomTheme).toHaveBeenCalledWith('a', saved.id, 1));
  expect(document.documentElement).not.toHaveAttribute('data-custom-theme');
});
it('limita cinco vagas, permite retry e desabilita temas privados sem conta', async () => {
  const view = setup();
  act(() => failed(new Error('Falha de leitura')));
  await userEvent.click(screen.getByRole('button', { name: 'Temas personalizados' }));
  expect(screen.getByText('Falha de leitura')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  act(() =>
    changed({
      ...emptyCatalog(),
      themes: Array.from({ length: 5 }, (_, i) => ({
        ...saved,
        id: 'custom-' + i,
        name: 'Tema ' + i,
      })),
    }),
  );
  expect(screen.getByRole('button', { name: 'Criar novo' })).toBeDisabled();
  view.unmount();
  setup(null);
  expect(screen.getByRole('button', { name: 'Temas personalizados' })).toBeDisabled();
});

it('remove a prévia e a aparência privada ao trocar de conta', async () => {
  localStorage.setItem('writer_custom_theme_v1:a', JSON.stringify(saved));
  vi.mocked(subscribeThemes).mockImplementation((_uid, onChange, onError) => {
    changed = onChange;
    failed = onError;
    return vi.fn();
  });
  const view = setup('a');
  expect(document.documentElement).toHaveAttribute('data-custom-theme', saved.id);
  act(() => changed({ ...emptyCatalog(), themes: [saved] }));
  await userEvent.click(screen.getByRole('button', { name: 'Temas personalizados' }));
  await userEvent.click(screen.getByRole('button', { name: 'Criar novo' }));
  await userEvent.type(screen.getByLabelText('Nome do tema'), 'Rascunho privado');
  view.rerender(
    <ThemeProvider defaultTheme="sepia">
      <CustomThemesProvider uid="b">
        <CustomThemeSelector />
        <Status />
      </CustomThemesProvider>
    </ThemeProvider>,
  );
  expect(document.documentElement).not.toHaveAttribute('data-custom-theme');
  expect(screen.queryByLabelText('Nome do tema')).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('writer_custom_theme_v1:a')!)).toMatchObject({
    id: saved.id,
  });
});

it('reabre os ajustes avançados e foca a cor inválida ao tentar salvar', async () => {
  setup();
  await create();
  await userEvent.click(screen.getByRole('button', { name: /Modo avançado/ }));
  fireEvent.change(screen.getByLabelText('Fundo da página'), { target: { value: '#zzzzzz' } });
  await userEvent.click(screen.getByRole('button', { name: /Modo avançado/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }));
  // JSDOM does not emit native validation from the external form submit button.
  fireEvent.invalid(screen.getByLabelText('Fundo da página'));
  await waitFor(() => expect(screen.getByLabelText('Fundo da página')).toHaveFocus());
  expect(screen.getByLabelText('Fundo da página')).toBeVisible();
  expect(saveCustomTheme).not.toHaveBeenCalled();
});

it('herda a base atual, oferece pickers e mantém nome e base acessíveis sem labels visuais', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Tema Escuro' }));
  await create();
  expect(screen.getByRole('combobox', { name: 'Base do tema' })).toHaveTextContent('Escuro');
  expect(screen.getByPlaceholderText('Nome')).toHaveAccessibleName('Nome do tema');
  expect(screen.queryByText('Base do tema')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Escolher cor: Cor de destaque'), {
    target: { value: '#336699' },
  });
  expect(screen.getByLabelText('Cor de destaque')).toHaveValue('#336699');
  fireEvent.change(screen.getByRole('slider', { name: 'Intensidade' }), { target: { value: '0' } });
  expect(document.documentElement.style.getPropertyValue('--background')).toBe('0.00 0.00% 0.00%');
  fireEvent.change(screen.getByRole('slider', { name: 'Intensidade' }), {
    target: { value: '85' },
  });
  fireEvent.change(screen.getByLabelText('Matiz do fundo'), { target: { value: '#336699' } });
  await userEvent.click(screen.getByRole('button', { name: /Modo avançado/ }));
  fireEvent.change(screen.getByLabelText('Escolher cor: Fundo da página'), {
    target: { value: '#112233' },
  });
  expect(screen.getByLabelText('Fundo da página')).toHaveValue('#112233');
  expect(document.querySelectorAll('input[type="color"]')).toHaveLength(26);
  fireEvent.change(screen.getByRole('slider', { name: 'Intensidade' }), {
    target: { value: '75' },
  });
  expect(screen.getByLabelText('Fundo da página')).not.toHaveValue('#112233');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }));
  await waitFor(() =>
    expect(saveCustomTheme).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({
        base: 'dark',
        backgroundIntensity: 75,
        backgroundHue: '#336699',
        generatorVersion: 2,
      }),
      null,
    ),
  );
});
