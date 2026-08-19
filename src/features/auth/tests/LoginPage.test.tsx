import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LoginPage } from '../components/LoginPage';
import { AuthContext, type AuthContextValue } from '../context/AuthContext';

function renderLoginPage(authOverrides: Partial<AuthContextValue> = {}) {
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
    ...authOverrides,
  };

  return {
    ...render(
      <MemoryRouter>
        <AuthContext.Provider value={defaultAuth}>
          <LoginPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    ),
    auth: defaultAuth,
  };
}

describe('LoginPage', () => {
  it('renderiza o formulario de login e botao do Google', () => {
    renderLoginPage();

    expect(
      screen.getByRole('heading', { name: /entrar no writer assistant/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar com google/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^entrar$/i })).toBeInTheDocument();
  });

  it('submete login com email e senha com sucesso', async () => {
    const user = userEvent.setup();
    const mockSignInEmail = vi.fn().mockResolvedValue(undefined);
    renderLoginPage({ signInWithEmail: mockSignInEmail });

    await user.type(screen.getByLabelText(/e-mail/i), 'autor@teste.com');
    await user.type(screen.getByLabelText(/senha/i), '123456');
    await user.click(screen.getByRole('button', { name: /^entrar$/i }));

    expect(mockSignInEmail).toHaveBeenCalledWith('autor@teste.com', '123456');
  });

  it('alterna para cadastro e valida tamanho minimo de senha', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const toggleButton = screen.getByRole('button', { name: /cadastre-se gratuitamente/i });
    await user.click(toggleButton);

    expect(screen.getByRole('heading', { name: /criar sua conta de autor/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nome de autor/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/nome de autor/i), 'George Orwell');
    await user.type(screen.getByLabelText(/e-mail/i), 'orwell@teste.com');
    await user.type(screen.getByLabelText(/senha/i), '123'); // senha curta
    await user.click(screen.getByRole('button', { name: /criar conta gratuita/i }));

    expect(await screen.findByText(/no mínimo 6 caracteres/i)).toBeInTheDocument();
  });

  it('submete cadastro com sucesso quando formulario e valido', async () => {
    const user = userEvent.setup();
    const mockSignUpEmail = vi.fn().mockResolvedValue(undefined);
    renderLoginPage({ signUpWithEmail: mockSignUpEmail });

    await user.click(screen.getByRole('button', { name: /cadastre-se gratuitamente/i }));

    await user.type(screen.getByLabelText(/nome de autor/i), 'George Orwell');
    await user.type(screen.getByLabelText(/e-mail/i), 'orwell@teste.com');
    await user.type(screen.getByLabelText(/senha/i), '123456');
    await user.click(screen.getByRole('button', { name: /criar conta gratuita/i }));

    expect(mockSignUpEmail).toHaveBeenCalledWith('orwell@teste.com', '123456', 'George Orwell');
  });

  it('exibe alerta de erro quando a autenticacao com Google falha', async () => {
    const user = userEvent.setup();
    const mockSignInGoogle = vi.fn().mockRejectedValue(new Error('Popup cancelado'));
    renderLoginPage({ signInWithGoogle: mockSignInGoogle });

    await user.click(screen.getByRole('button', { name: /continuar com google/i }));
    expect(await screen.findByText(/autenticação cancelada/i)).toBeInTheDocument();
  });

  it('executa signInWithGoogle com sucesso', async () => {
    const user = userEvent.setup();
    const mockSignInGoogle = vi.fn().mockResolvedValue(undefined);
    renderLoginPage({ signInWithGoogle: mockSignInGoogle });

    await user.click(screen.getByRole('button', { name: /continuar com google/i }));
    expect(mockSignInGoogle).toHaveBeenCalledTimes(1);
  });

  it('exibe mensagem quando o usuario ja esta autenticado', () => {
    renderLoginPage({
      user: {
        uid: '123',
        email: 'autor@livro.com',
        displayName: 'Machado de Assis',
        photoUrl: null,
        credits: 100,
        tier: 'free',
        createdAt: 1000,
        updatedAt: 1000,
      },
    });

    expect(screen.getByRole('heading', { name: /você já está autenticado/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ir para meus livros/i })).toBeInTheDocument();
  });
});
