import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthProvider';
import { useAuth } from '../hooks/useAuth';
import * as authService from '../services/authService';
import type { UserProfile } from '../model/user';

function TestConsumer() {
  const {
    user,
    loading,
    error,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    updateUserCreditsState,
  } = useAuth();

  return (
    <div>
      <div data-testid="loading">{loading ? 'true' : 'false'}</div>
      <div data-testid="user">{user ? (user.displayName ?? user.email) : 'anonimo'}</div>
      <div data-testid="credits">{user ? user.credits : 0}</div>
      <div data-testid="error">{error ?? 'nenhum'}</div>

      <button
        onClick={() => {
          void signInWithGoogle().catch(() => {});
        }}
      >
        Login Google
      </button>
      <button
        onClick={() => {
          void signInWithEmail('teste@autor.com', '123456').catch(() => {});
        }}
      >
        Login Email
      </button>
      <button
        onClick={() => {
          void signUpWithEmail('novo@autor.com', '123456', 'Novo').catch(() => {});
        }}
      >
        Cadastro Email
      </button>
      <button
        onClick={() => {
          void signOut().catch(() => {});
        }}
      >
        Deslogar
      </button>
      <button onClick={() => updateUserCreditsState(77)}>Set Credits 77</button>
    </div>
  );
}

describe('AuthProvider & useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanca erro ao usar useAuth fora de AuthProvider', () => {
    // Silencia o console.error temporariamente para o teste de erro esperado do React
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(/useAuth deve ser utilizado/);
    spy.mockRestore();
  });

  it('inicializa estado e atualiza quando a sessao muda', () => {
    let authCallback: ((user: UserProfile | null) => void) | undefined;
    vi.spyOn(authService, 'subscribeToAuthState').mockImplementation((cb) => {
      authCallback = cb;
      return vi.fn();
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading').textContent).toBe('true');

    // Simula emissao de usuario nulo
    act(() => {
      if (authCallback) authCallback(null);
    });

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('anonimo');
  });

  it('permite signInWithGoogle, signInWithEmail, signUpWithEmail, signOut e updateCredits', async () => {
    const user = userEvent.setup();

    vi.spyOn(authService, 'subscribeToAuthState').mockImplementation((cb) => {
      cb(null);
      return vi.fn();
    });

    const mockProfile: UserProfile = {
      uid: 'u-1',
      email: 'autor@email.com',
      displayName: 'Autor Sucesso',
      photoUrl: null,
      credits: 100,
      tier: 'free',
      createdAt: 1000,
      updatedAt: 1000,
    };

    vi.spyOn(authService, 'signInWithGoogle').mockResolvedValueOnce(mockProfile);
    vi.spyOn(authService, 'signInWithEmail').mockResolvedValueOnce(mockProfile);
    vi.spyOn(authService, 'signUpWithEmail').mockResolvedValueOnce(mockProfile);
    vi.spyOn(authService, 'signOutUser').mockResolvedValueOnce();

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // Google
    await user.click(screen.getByRole('button', { name: /login google/i }));
    expect(screen.getByTestId('user').textContent).toBe('Autor Sucesso');

    // Update credits
    await user.click(screen.getByRole('button', { name: /set credits 77/i }));
    expect(screen.getByTestId('credits').textContent).toBe('77');

    // Sign out
    await user.click(screen.getByRole('button', { name: /deslogar/i }));
    expect(screen.getByTestId('user').textContent).toBe('anonimo');

    // Email
    await user.click(screen.getByRole('button', { name: /login email/i }));
    expect(screen.getByTestId('user').textContent).toBe('Autor Sucesso');

    // Sign up
    await user.click(screen.getByRole('button', { name: /cadastro email/i }));
    expect(screen.getByTestId('user').textContent).toBe('Autor Sucesso');
  });

  it('captura e expoe erros nas operacoes de autenticacao', async () => {
    const user = userEvent.setup();

    vi.spyOn(authService, 'subscribeToAuthState').mockImplementation((cb, errCb) => {
      cb(null);
      if (errCb) errCb(new Error('Erro de inscricao'));
      return vi.fn();
    });

    vi.spyOn(authService, 'signInWithGoogle').mockRejectedValueOnce(new Error('Falha no Google'));
    vi.spyOn(authService, 'signInWithEmail').mockRejectedValueOnce(new Error('Senha incorreta'));
    vi.spyOn(authService, 'signUpWithEmail').mockRejectedValueOnce(new Error('Email duplicado'));
    vi.spyOn(authService, 'signOutUser').mockRejectedValueOnce(new Error('Erro ao deslogar'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: /login google/i }));
    expect(screen.getByTestId('error').textContent).toBe('Falha no Google');

    await user.click(screen.getByRole('button', { name: /login email/i }));
    expect(screen.getByTestId('error').textContent).toBe('Senha incorreta');

    await user.click(screen.getByRole('button', { name: /cadastro email/i }));
    expect(screen.getByTestId('error').textContent).toBe('Email duplicado');

    await user.click(screen.getByRole('button', { name: /deslogar/i }));
    expect(screen.getByTestId('error').textContent).toBe('Erro ao deslogar');
  });
});
