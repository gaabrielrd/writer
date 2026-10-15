import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { StudioNavigation } from '../components/StudioNavigation';

const auth: { user: { uid: string } | null } = vi.hoisted(() => ({ user: { uid: 'author' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
beforeEach(() => {
  auth.user = { uid: 'author' };
});

describe('espaços do Writer', () => {
  it('oferece os cinco espaços e conserva a biblioteca de imagens', async () => {
    render(
      <MemoryRouter initialEntries={['/studio']}>
        <StudioNavigation />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('navigation', { name: 'Navegação principal' }).firstElementChild,
    ).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Estúdio' }));
    for (const [name, path] of [
      ['Universos', '/universes'],
      ['Estúdio', '/studio'],
      ['Publicações', '/publications'],
      ['Catálogo', '/catalog'],
      ['Biblioteca', '/biblioteca'],
      ['Biblioteca de Imagens', '/library'],
    ]) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute('href', path);
    }
    expect(screen.getByRole('menuitem', { name: 'Estúdio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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
  ])('identifica o espaço de %s', (path, label) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <StudioNavigation />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('navega por teclado e devolve foco com Escape', async () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<StudioNavigation />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.tab();
    const trigger = screen.getByRole('button', { name: 'Estúdio' });
    expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Biblioteca' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Biblioteca de Imagens' }));
    expect(screen.getByRole('button', { name: 'Biblioteca de Imagens' })).toBeInTheDocument();
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
