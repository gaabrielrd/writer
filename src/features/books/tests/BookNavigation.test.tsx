import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { BookNavigation } from '../components/BookNavigation';
import { watchBookTitle } from '../services/bookNavigationService';

const auth: { user: { uid: string } | null } = vi.hoisted(() => ({ user: { uid: 'author' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/bookNavigationService', () => ({ watchBookTitle: vi.fn(() => vi.fn()) }));

beforeEach(() => {
  auth.user = { uid: 'author' };
  vi.clearAllMocks();
});

describe('contexto privado do livro', () => {
  it.each(['/books/new/assisted', '/read/book-1', '/studio', '/library', '/universes/world/lore'])(
    'não procura título privado em %s',
    (path) => {
      const { container } = render(
        <MemoryRouter initialEntries={[path]}>
          <BookNavigation />
        </MemoryRouter>,
      );
      expect(watchBookTitle).not.toHaveBeenCalled();
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('atualiza o título e o remove imediatamente ao trocar de conta', () => {
    let deliverTitle!: (title: string) => void;
    const stop = vi.fn();
    vi.mocked(watchBookTitle).mockImplementation((_id, _uid, callback) => {
      deliverTitle = callback;
      return stop;
    });
    const view = render(
      <MemoryRouter initialEntries={['/books/book-1/lore']}>
        <BookNavigation />
      </MemoryRouter>,
    );
    const oldDelivery = deliverTitle;
    act(() => deliverTitle('Um título bem longo'));
    expect(screen.getByText('Um título bem longo')).toHaveAttribute('title', 'Um título bem longo');
    act(() => deliverTitle('Título atualizado'));
    expect(screen.getByText('Título atualizado')).toHaveAttribute('aria-current', 'page');
    auth.user = { uid: 'other' };
    view.rerender(
      <MemoryRouter initialEntries={['/books/book-1/lore']}>
        <BookNavigation />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Título atualizado')).not.toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
    act(() => deliverTitle('Livro da nova conta'));
    act(() => oldDelivery('Resposta atrasada da conta anterior'));
    expect(screen.queryByText('Resposta atrasada da conta anterior')).not.toBeInTheDocument();
    expect(screen.getByText('Livro da nova conta')).toBeInTheDocument();
  });

  it('remove o contexto ao sair da conta', () => {
    let deliverTitle!: (title: string) => void;
    vi.mocked(watchBookTitle).mockImplementation((_id, _uid, callback) => {
      deliverTitle = callback;
      return vi.fn();
    });
    const view = render(
      <MemoryRouter initialEntries={['/books/book-1']}>
        <BookNavigation />
      </MemoryRouter>,
    );
    act(() => deliverTitle('Livro particular'));
    auth.user = null;
    view.rerender(
      <MemoryRouter initialEntries={['/books/book-1']}>
        <BookNavigation />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Livro particular')).not.toBeInTheDocument();
  });
});
