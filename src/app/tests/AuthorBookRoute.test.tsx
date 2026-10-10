import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorBookRoute } from '../components/AuthorBookRoute';
const state = vi.hoisted(() => ({
  user: null as { uid: string } | null,
  loading: false,
  getBook: vi.fn(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => state }));
vi.mock('@/features/books', () => ({ getBook: state.getBook }));
function setup() {
  const router = createMemoryRouter(
    [
      {
        path: '/books/:bookId',
        element: (
          <AuthorBookRoute>
            <div>Private author workspace</div>
          </AuthorBookRoute>
        ),
      },
      { path: '/login', element: <div>Login</div> },
      { path: '/', element: <div>Home</div> },
    ],
    { initialEntries: ['/books/one'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}
beforeEach(() => {
  state.user = { uid: 'owner' };
  state.loading = false;
  state.getBook.mockReset();
});
describe('author route access', () => {
  it('redirects anonymous visitors without requesting author data', async () => {
    state.user = null;
    setup();
    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(state.getBook).not.toHaveBeenCalled();
  });
  it('waits for authentication', () => {
    state.loading = true;
    setup();
    expect(screen.getByText('Verificando sessão...')).toBeInTheDocument();
    expect(screen.queryByText('Private author workspace')).not.toBeInTheDocument();
  });
  it('shows author content only for matching owner', async () => {
    state.getBook.mockResolvedValue({ authorId: 'owner' });
    setup();
    expect(await screen.findByText('Private author workspace')).toBeInTheDocument();
  });
  it.each([null, { authorId: 'other' }])('redirects missing or other-owner books', async (book) => {
    state.getBook.mockResolvedValue(book);
    setup();
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });
  it('handles permission-denied as unavailable', async () => {
    state.getBook.mockRejectedValue({ code: 'permission-denied' });
    setup();
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });
  it('retries connection failures', async () => {
    state.getBook
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ authorId: 'owner' });
    setup();
    await screen.findByText('Não foi possível verificar seu acesso');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Private author workspace')).toBeInTheDocument();
  });
  it('does not expose the prior book while a new route is loading', async () => {
    let resolve!: (v: unknown) => void;
    state.getBook.mockResolvedValueOnce({ authorId: 'owner' }).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const router = setup();
    await screen.findByText('Private author workspace');
    await act(() => router.navigate('/books/two'));
    expect(screen.queryByText('Private author workspace')).not.toBeInTheDocument();
    await act(async () => {
      resolve({ authorId: 'other' });
      await Promise.resolve();
    });
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });
});
