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
    signInWithGoogleIdToken: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    signOut: vi.fn(),
    updateUserCreditsState: vi.fn(),
    pendingEditorOperation: false,
    setPendingEditorOperation: vi.fn(),
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
    await user.click(screen.getByRole('button', { name: /Clarice Lispector/i }));
    expect(screen.getByText('autor@livro.com')).toBeInTheDocument();
    const signOutButton = screen.getByRole('menuitem', { name: /sair/i });
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
  it('disables sign-out until an accepted suggestion has been inserted', async () => {
    const signOut = vi.fn();
    renderWithAuth({
      user: {
        uid: 'u',
        email: null,
        displayName: 'Autora',
        photoUrl: null,
        credits: 10,
        tier: 'free',
        createdAt: 1,
        updatedAt: 1,
      },
      pendingEditorOperation: true,
      signOut,
    });
    await userEvent.click(screen.getByRole('button', { name: /Autora/i }));
    const button = screen.getByRole('menuitem', { name: 'Sair' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('title', expect.stringContaining('Aguarde'));
    await userEvent.click(button);
    expect(signOut).not.toHaveBeenCalled();
  });
});
