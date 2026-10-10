import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BookNavigation } from '../components/BookNavigation';
import { watchBookTitle } from '../services/bookNavigationService';
const auth: { user: { uid: string } | null } = vi.hoisted(() => ({ user: { uid: 'author' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/bookNavigationService', () => ({ watchBookTitle: vi.fn(() => vi.fn()) }));
describe('book navigation', () => {
  it('shows the selected library in the dropdown, with a separator before it', async () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="*" element={<BookNavigation />} />
        </Routes>
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: 'Biblioteca de Imagens' });
    const nav = screen.getByRole('navigation');
    expect(nav.firstElementChild).toHaveTextContent('/');
    expect(nav.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByText('Biblioteca de Imagens')).toHaveLength(1);
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Meus Livros' }));
    expect(screen.getByRole('button', { name: 'Meus Livros' })).toBeInTheDocument();
    expect(screen.queryByText('Biblioteca de Imagens')).not.toBeInTheDocument();
  });
  it('opens library destinations by keyboard and restores focus on Escape', async () => {
    render(
      <MemoryRouter>
        <BookNavigation />
      </MemoryRouter>,
    );
    await userEvent.tab();
    const trigger = screen.getByRole('button', { name: 'Meus Livros' });
    expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: 'Biblioteca de Imagens' })).toHaveAttribute(
      'href',
      '/library',
    );
    expect(screen.getByRole('menuitem', { name: 'Meus Livros' })).toHaveAttribute('href', '/');
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
  it('updates the book crumb but immediately removes it on account change', () => {
    let title!: (title: string) => void;
    const stop = vi.fn();
    vi.mocked(watchBookTitle).mockImplementation((_bookId, _uid, callback) => {
      title = callback;
      return stop;
    });
    const view = render(
      <MemoryRouter initialEntries={['/books/book-1/lore']}>
        <BookNavigation />
      </MemoryRouter>,
    );
    act(() => title('Um título bem longo'));
    expect(screen.getByText('Um título bem longo')).toHaveAttribute('title', 'Um título bem longo');
    act(() => title('Título atualizado'));
    expect(screen.getByText('Título atualizado')).toBeInTheDocument();
    auth.user = { uid: 'other' };
    view.rerender(
      <MemoryRouter initialEntries={['/books/book-1/lore']}>
        <BookNavigation />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Título atualizado')).not.toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
    auth.user = { uid: 'author' };
  });
  it('never requests private titles on public reading routes and hides navigation on sign-out', () => {
    vi.mocked(watchBookTitle).mockClear();
    const view = render(
      <MemoryRouter initialEntries={['/read/book-1']}>
        <BookNavigation />
      </MemoryRouter>,
    );
    expect(watchBookTitle).not.toHaveBeenCalled();
    auth.user = null;
    view.rerender(
      <MemoryRouter>
        <BookNavigation />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    auth.user = { uid: 'author' };
  });
});

it('identifica lore compartilhado no header inclusive dentro de um universo', async () => {
  auth.user = { uid: 'author' };
  vi.clearAllMocks();
  render(
    <MemoryRouter initialEntries={['/universes/world/lore']}>
      <BookNavigation />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lore compartilhado' }));
  expect(screen.getByRole('menuitem', { name: 'Lore compartilhado' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(watchBookTitle).not.toHaveBeenCalled();
});
