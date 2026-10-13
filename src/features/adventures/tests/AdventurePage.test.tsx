import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AdventurePage } from '../components/AdventurePage';
import { getAdventure } from '../services/adventureService';
import type { Adventure } from '../model/adventure';

const auth = vi.hoisted((): { user: { uid: string } | null; loading: boolean } => ({
  user: { uid: 'owner' },
  loading: false,
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/adventureService', () => ({ getAdventure: vi.fn() }));
const resource: Adventure = {
  id: 'project',
  ownerId: 'owner',
  schemaVersion: 1,
  revision: 1,
  title: 'Meu projeto',
  synopsis: 'História privada',
  language: 'pt-BR',
  origin: { kind: 'authored' },
  status: 'draft',
  universeId: null,
  createdAt: 1000,
  updatedAt: 2000,
};
beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { uid: 'owner' };
  auth.loading = false;
  vi.mocked(getAdventure).mockResolvedValue(resource);
});
function tree() {
  return (
    <MemoryRouter initialEntries={['/adventures/project']}>
      <Routes>
        <Route path="/adventures/:adventureId" element={<AdventurePage />} />
        <Route path="/login" element={<p>Entrar na conta</p>} />
        <Route path="/studio" element={<h1>Estúdio</h1>} />
      </Routes>
    </MemoryRouter>
  );
}
it('abre metadados persistidos, mantém privacidade e permite retornar ao Estúdio', async () => {
  render(tree());
  expect(screen.getByText('Carregando aventura...')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Meu projeto' })).toBeInTheDocument();
  expect(screen.getByText('História privada')).toBeInTheDocument();
  expect(screen.getByText('Privada')).toBeInTheDocument();
  expect(screen.getByText('Projeto independente, sem universo vinculado.')).toBeInTheDocument();
  expect(getAdventure).toHaveBeenCalledWith('project');
  await userEvent.click(screen.getByRole('link', { name: 'Voltar ao Estúdio' }));
  expect(screen.getByRole('heading', { name: 'Estúdio' })).toBeInTheDocument();
});
it('mostra universo vinculado e campo vazio sem inventar sessão ou narrativa', async () => {
  vi.mocked(getAdventure).mockResolvedValue({ ...resource, synopsis: '', universeId: 'world' });
  render(tree());
  expect(await screen.findByRole('link', { name: 'Abrir universo vinculado' })).toHaveAttribute(
    'href',
    '/universes/world/lore',
  );
  expect(screen.getByText('Nenhuma sinopse cadastrada.')).toBeInTheDocument();
});
it.each([null, { ...resource, ownerId: 'another' }])(
  'não revela dados indisponíveis ou de outra conta (%j)',
  async (returned) => {
    vi.mocked(getAdventure).mockResolvedValue(returned);
    render(tree());
    expect(await screen.findByText('Aventura indisponível')).toBeInTheDocument();
    expect(screen.queryByText('História privada')).not.toBeInTheDocument();
  },
);
it('mantém erro acionável e tenta abrir novamente', async () => {
  vi.mocked(getAdventure)
    .mockRejectedValueOnce(new Error('Sem conexão'))
    .mockResolvedValue(resource);
  render(tree());
  expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('heading', { name: 'Meu projeto' })).toBeInTheDocument();
});
it('aguarda autenticação e direciona visitante ao login', async () => {
  auth.loading = true;
  const view = render(tree());
  expect(screen.getByText('Carregando sessão...')).toBeInTheDocument();
  expect(getAdventure).not.toHaveBeenCalled();
  auth.loading = false;
  auth.user = null;
  view.rerender(tree());
  expect(await screen.findByText('Entrar na conta')).toBeInTheDocument();
});
it('ignora resposta antiga ao trocar a conta', async () => {
  let finish!: (value: Adventure) => void;
  vi.mocked(getAdventure)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(null);
  const view = render(tree());
  auth.user = { uid: 'new-owner' };
  view.rerender(tree());
  await act(async () => {
    finish(resource);
    await Promise.resolve();
  });
  expect(await screen.findByText('Aventura indisponível')).toBeInTheDocument();
  expect(screen.queryByText('História privada')).not.toBeInTheDocument();
});
it('não quebra a tela nem inventa data quando o DTO traz data inválida', async () => {
  vi.mocked(getAdventure).mockResolvedValue({ ...resource, updatedAt: Number.POSITIVE_INFINITY });
  render(tree());
  expect(await screen.findByText('Data indisponível')).toBeInTheDocument();
});
