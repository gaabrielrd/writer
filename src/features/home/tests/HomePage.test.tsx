import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HomePage } from '../components/HomePage';
import * as authHook from '@/features/auth';

vi.mock('@/features/books', () => ({
  BookList: vi.fn(({ authorId }: { authorId: string }) => (
    <div data-testid="book-list">BookList do autor {authorId}</div>
  )),
}));

describe('HomePage', () => {
  it('renderiza landing para usuarios anonimos', () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: null,
      loading: false,
      error: null,
      signInWithGoogle: vi.fn(),
      signInWithGoogleIdToken: vi.fn(),
      signInWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      signOut: vi.fn(),
      updateUserCreditsState: vi.fn(),
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: /assistente para autores de ficção/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /começar a escrever gratuitamente/i }),
    ).toBeInTheDocument();
  });

  it('renderiza BookList quando o autor esta logado', () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: {
        uid: 'author-456',
        email: 'autor@teste.com',
        displayName: 'Autor Teste',
        photoUrl: null,
        credits: 100,
        tier: 'free',
        createdAt: 1000,
        updatedAt: 1000,
      },
      loading: false,
      error: null,
      signInWithGoogle: vi.fn(),
      signInWithGoogleIdToken: vi.fn(),
      signInWithEmail: vi.fn(),
      signUpWithEmail: vi.fn(),
      signOut: vi.fn(),
      updateUserCreditsState: vi.fn(),
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('book-list')).toHaveTextContent('BookList do autor author-456');
  });
});
