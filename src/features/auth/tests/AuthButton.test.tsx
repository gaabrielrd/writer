import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AuthButton } from '../components/AuthButton';
import { AuthContext, type AuthContextValue } from '../context/AuthContext';

function renderWithAuth(authOverrides: Partial<AuthContextValue> = {}) {
  const defaultAuth: AuthContextValue = {
    user: null,
    loading: false,
    error: null,
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    signOut: vi.fn(),
    updateUserCreditsState: vi.fn(),
    ...authOverrides,
  };

  return {
    ...render(
      <MemoryRouter>
        <AuthContext.Provider value={defaultAuth}>
          <AuthButton />
        </AuthContext.Provider>
      </MemoryRouter>,
    ),
    auth: defaultAuth,
  };
}

describe('AuthButton', () => {
  it('exibe estado de carregamento quando loading e true', () => {
    renderWithAuth({ loading: true });
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
  });

  it('exibe botao Entrar quando nao ha usuario autenticado', () => {
    renderWithAuth({ user: null });
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });

  it('exibe nome do autor e botao Sair quando usuario esta logado', async () => {
    const user = userEvent.setup();
    const signOutMock = vi.fn();
    renderWithAuth({
      user: {
        uid: '123',
        email: 'autor@livro.com',
        displayName: 'Clarice Lispector',
        photoUrl: null,
        credits: 100,
        tier: 'free',
        createdAt: 1000,
        updatedAt: 1000,
      },
      signOut: signOutMock,
    });

    expect(screen.getByText('Clarice Lispector')).toBeInTheDocument();
    const signOutButton = screen.getByRole('button', { name: /sair/i });
    expect(signOutButton).toBeInTheDocument();

    await user.click(signOutButton);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('renderiza imagem de avatar quando usuario possui photoUrl', () => {
    renderWithAuth({
      user: {
        uid: '123',
        email: null,
        displayName: null,
        photoUrl: 'https://exemplo.com/avatar.jpg',
        credits: 50,
        tier: 'premium',
        createdAt: 1000,
        updatedAt: 1000,
      },
    });

    expect(screen.getByAltText(/foto de autor/i)).toHaveAttribute(
      'src',
      'https://exemplo.com/avatar.jpg',
    );
    expect(screen.getByText('Autor')).toBeInTheDocument();
  });
});
