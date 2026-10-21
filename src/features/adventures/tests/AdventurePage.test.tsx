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
vi.mock('@/features/lore', () => ({ LoreCollection: () => <h2>Lore da aventura</h2> }));
vi.mock('@/features/campaign-bases', () => ({
  CampaignCapturePreparations: () => null,
  CampaignCaptureDialog: ({
    open,
    adventureId,
    onActivated,
  }: {
    open: boolean;
    adventureId: string;
    onActivated: (id: string) => void;
  }) =>
    open ? (
      <section aria-label={'Criar mesa de ' + adventureId}>
        <button onClick={() => onActivated('new-campaign')}>Abrir campanha preparada</button>
      </section>
    ) : null,
}));
vi.mock('../services/adventureService', () => ({ getAdventure: vi.fn() }));
vi.mock('@/features/narrative-planning', () => ({
  NarrativePlanner: ({ target }: { target: { kind: string; id: string } }) => (
    <h2>
      Planejamento de {target.kind}/{target.id}
    </h2>
  ),
}));
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
function tree(search = '') {
  return (
    <MemoryRouter initialEntries={['/adventures/project' + search]}>
      <Routes>
        <Route path="/adventures/:adventureId" element={<AdventurePage />} />
        <Route path="/login" element={<p>Entrar na conta</p>} />
        <Route path="/studio" element={<h1>Estúdio</h1>} />
        <Route path="/campaigns/:campaignId" element={<h1>Campanha criada</h1>} />
      </Routes>
    </MemoryRouter>
  );
}
it('abre criação com a aventura atual e navega apenas após confirmação da campanha', async () => {
  render(tree());
  await userEvent.click(
    await screen.findByRole('button', { name: 'Criar campanha desta aventura' }),
  );
  expect(screen.getByRole('region', { name: 'Criar mesa de project' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Campanha criada' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Abrir campanha preparada' }));
  expect(await screen.findByRole('heading', { name: 'Campanha criada' })).toBeInTheDocument();
});
it('abre narrativa contextual da aventura e alterna por teclado sem trocar o projeto', async () => {
  render(tree('?tab=narrative&narrativeView=timeline'));
  expect(
    await screen.findByRole('heading', { name: 'Planejamento de adventure/project' }),
  ).toBeInTheDocument();
  const narrative = screen.getByRole('tab', { name: 'Arcos e cronologia' });
  expect(narrative).toHaveAttribute('aria-selected', 'true');
  narrative.focus();
  await userEvent.keyboard('{Home}');
  expect(screen.getByRole('tab', { name: 'Cenas' })).toHaveFocus();
  expect(
    screen.queryByRole('heading', { name: 'Planejamento de adventure/project' }),
  ).not.toBeInTheDocument();
  await userEvent.keyboard('{End}');
  expect(screen.getByRole('tab', { name: 'Lore' })).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'Lore da aventura' })).toBeVisible();
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByRole('tab', { name: 'Progresso' })).toHaveFocus();
  expect(
    screen.getByRole('heading', { name: 'Progresso de adventure/project' }),
  ).toBeInTheDocument();
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByRole('tab', { name: 'Arcos e cronologia' })).toHaveFocus();
  expect(
    screen.getByRole('heading', { name: 'Planejamento de adventure/project' }),
  ).toBeInTheDocument();
});
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

vi.mock('@/features/work-progress', async (original) => ({
  ...(await original<object>()),
  ProjectProgressPanel: ({ target }: { target: { kind: string; id: string } }) => (
    <h2>
      Progresso de {target.kind}/{target.id}
    </h2>
  ),
  ContinueWorkPanel: () => <h2>Continuar meu trabalho</h2>,
  useWorkActivity: vi.fn(() => ({ loading: false, error: '', conflict: false, retry: vi.fn() })),
  WorkActivityNotice: () => null,
}));

it('estado editorial atual substitui o legado ready e arquivo permanece condição independente', async () => {
  vi.mocked(getAdventure).mockResolvedValue({
    ...resource,
    status: 'ready',
    editorialState: 'review',
  });
  const rendered = render(tree('?tab=progress'));
  expect(await screen.findByText('Em revisão')).toBeVisible();
  expect(screen.queryByText('Pronto')).not.toBeInTheDocument();
  expect(screen.queryByText('Pronta')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Progresso de adventure/project' })).toBeVisible();
  rendered.unmount();
  vi.mocked(getAdventure).mockResolvedValue({
    ...resource,
    status: 'archived',
    editorialState: 'ready',
  });
  render(tree());
  expect(await screen.findByText('Arquivada')).toBeVisible();
  expect(screen.getByText('Pronto')).toBeVisible();
});
