import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthenticatedWorkspace } from '../components/AuthenticatedWorkspace';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { uid: 'author', credits: 84, tier: 'free' } }),
  AuthButton: () => <button>Conta</button>,
  CreditsBadge: () => <span>84 créditos</span>,
}));
vi.mock('@/features/books', () => ({ BookNavigation: () => null }));
vi.mock('@/features/ai-assistant', () => ({ useAISettings: () => vi.fn() }));
vi.mock('@/features/custom-themes', () => ({ CustomThemeSelector: () => <button>Tema</button> }));

function setup() {
  render(
    <MemoryRouter initialEntries={['/studio']}>
      <Routes>
        <Route element={<AuthenticatedWorkspace />}>
          <Route path="/studio" element={<h1>Meus projetos</h1>} />
          <Route path="/universes" element={<h1>Meus universos</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
describe('área logada', () => {
  it('recolhe e reabre a navegação sem remover o conteúdo e conserva o foco', async () => {
    setup();
    await userEvent.click(screen.getAllByRole('button', { name: 'Recolher navegação' })[0]!);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meus projetos' })).toBeVisible();
    const trigger = screen.getAllByRole('button', { name: 'Abrir navegação' })[0]!;
    expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('navigation')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Conta' })).toBeVisible();
  });
});
