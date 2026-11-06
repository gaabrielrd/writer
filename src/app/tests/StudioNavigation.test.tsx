import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { StudioNavigation } from '../components/StudioNavigation';

const auth: { user: { uid: string } | null } = vi.hoisted(() => ({ user: { uid: 'author' } }));
const profile = vi.hoisted(() => ({ interests: [] as ('book' | 'adventure' | 'campaign')[] }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/onboarding', async (original) => ({
  ...(await original<object>()),
  useOnboarding: () => ({ profile }),
}));
beforeEach(() => {
  auth.user = { uid: 'author' };
  profile.interests = [];
});

describe('espaços do Writer', () => {
  it.each([false, true])('mostra ícones nos destaques do perfil (compacto: %s)', (compact) => {
    profile.interests = ['book', 'adventure', 'campaign'];
    render(
      <MemoryRouter initialEntries={['/studio']}>
        <StudioNavigation compact={compact} />
      </MemoryRouter>,
    );
    for (const [name, kind] of [
      ['Livros', 'book'],
      ['Aventuras', 'adventure'],
      ['Campanhas', 'campaign'],
    ]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', `/studio/projects?kind=${kind}`);
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('identifica os ícones por tooltip e conserva navegação e ferramentas', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <MemoryRouter initialEntries={['/studio']}>
        <StudioNavigation compact />
      </MemoryRouter>,
    );
    const universes = screen.getByRole('link', { name: 'Universos' });
    await user.hover(universes);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Universos');
    await user.unhover(universes);
    await user.click(screen.getByRole('button', { name: 'Todas as ferramentas' }));
    expect(screen.getByRole('link', { name: 'Catálogo' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });
  it('oferece links diretos e conserva os cinco espaços, imagens e configurações', async () => {
    render(
      <MemoryRouter initialEntries={['/studio']}>
        <StudioNavigation />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Catálogo' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Todas as ferramentas' }));
    for (const [name, path] of [
      ['Universos', '/universes'],
      ['Estúdio', '/studio'],
      ['Publicações', '/publications'],
      ['Catálogo', '/catalog'],
      ['Biblioteca', '/biblioteca'],
      ['Biblioteca de Imagens', '/library'],
      ['Inteligência artificial', '/settings/ai'],
      ['Preferências', '/settings/preferences'],
      ['Ajuda', '/help'],
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', path);
    }
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });
  it.each([
    ['/universes/world/lore', 'Universos'],
    ['/books/book/editor/chapter', 'Estúdio'],
    ['/adventures/a', 'Estúdio'],
    ['/campaigns/c', 'Estúdio'],
    ['/publications', 'Publicações'],
    ['/catalog', 'Catálogo'],
    ['/biblioteca', 'Biblioteca'],
    ['/library', 'Biblioteca de Imagens'],
    ['/settings/ai', 'Inteligência artificial'],
    ['/settings/preferences', 'Preferências'],
    ['/help', 'Ajuda'],
    ['/studio', 'Home'],
    ['/studio/projects?kind=book', 'Projetos'],
    ['/studio/import', 'Importar e restaurar'],
    ['/studio/operations', 'Em andamento'],
  ])('identifica o espaço de %s', (path, label) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <StudioNavigation />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getAllByRole('link').filter((link) => link.hasAttribute('aria-current')),
    ).toHaveLength(1);
  });
  it('mostra as quatro seções dentro do Estúdio', () => {
    render(
      <MemoryRouter initialEntries={['/studio/projects']}>
        <StudioNavigation />
      </MemoryRouter>,
    );
    expect(screen.getByRole('group', { name: 'Seções do Estúdio' })).toBeInTheDocument();
    for (const [name, path] of [
      ['Home', '/studio'],
      ['Projetos', '/studio/projects'],
      ['Importar e restaurar', '/studio/import'],
      ['Em andamento', '/studio/operations'],
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', path);
    }
  });
  it('mantém a lateral simples fora do Estúdio', () => {
    render(
      <MemoryRouter initialEntries={['/universes']}>
        <StudioNavigation />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('group', { name: 'Seções do Estúdio' })).not.toBeInTheDocument();
  });
  it('navega por teclado e comunica a escolha ao contêiner', async () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<StudioNavigation onNavigate={onNavigate} />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Estúdio' })).toHaveFocus();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('link', { name: 'Universos' })).toHaveAttribute('aria-current', 'page');
    expect(onNavigate).toHaveBeenCalledOnce();
  });
  it('preserva o menu compacto no cabeçalho público', async () => {
    render(
      <MemoryRouter initialEntries={['/read/book']}>
        <StudioNavigation presentation="menu" />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: 'Estúdio' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Universos' })).toHaveAttribute(
      'href',
      '/universes',
    );
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
  it('não oferece espaços privados ao visitante', () => {
    auth.user = null;
    render(
      <MemoryRouter>
        <StudioNavigation />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
