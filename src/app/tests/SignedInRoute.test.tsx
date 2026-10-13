import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { Input } from '@/shared/ui';
import { SignedInRoute } from '../components/SignedInRoute';

const auth: { user: { uid: string } | null; loading: boolean } = vi.hoisted(() => ({
  user: { uid: 'author' },
  loading: false,
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
beforeEach(() => {
  auth.user = { uid: 'author' };
  auth.loading = false;
});

function LoginDestination() {
  const location = useLocation();
  return <p>Entrar para continuar: {(location.state as { from: string }).from}</p>;
}

describe('entrada privada do Estúdio', () => {
  it('leva visitante ao login com o destino preservado', () => {
    auth.user = null;
    render(
      <MemoryRouter initialEntries={['/campaigns/private']}>
        <Routes>
          <Route
            path="/campaigns/:id"
            element={
              <SignedInRoute>
                <p>Conteúdo privado</p>
              </SignedInRoute>
            }
          />
          <Route path="/login" element={<LoginDestination />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Entrar para continuar: /campaigns/private')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument();
  });

  it('aguarda a sessão sem montar conteúdo privado', () => {
    auth.loading = true;
    render(
      <MemoryRouter>
        <SignedInRoute>
          <p>Conteúdo privado</p>
        </SignedInRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText('Carregando sua sessão...')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo privado')).not.toBeInTheDocument();
  });

  it('descarta o formulário da conta anterior antes de montar outra sessão', async () => {
    function Draft() {
      const [text, setText] = useState('');
      return (
        <Input
          label="Rascunho particular"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      );
    }
    const tree = () => (
      <MemoryRouter>
        <SignedInRoute>
          <Draft />
        </SignedInRoute>
      </MemoryRouter>
    );
    const view = render(tree());
    await userEvent.type(screen.getByLabelText('Rascunho particular'), 'Da conta A');
    auth.user = { uid: 'another' };
    view.rerender(tree());
    expect(screen.getByLabelText('Rascunho particular')).toHaveValue('');
  });
});
