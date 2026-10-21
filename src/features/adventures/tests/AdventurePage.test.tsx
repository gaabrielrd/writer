import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from 'react-router';
import type { AdventurePersonaDialogProps } from '@/features/ai-assistant';
import { AdventurePage } from '../components/AdventurePage';
import { getAdventure } from '../services/adventureService';
import type { Adventure } from '../model/adventure';

const auth = vi.hoisted(
  (): {
    user: { uid: string } | null;
    loading: boolean;
    setPendingEditorOperation: ReturnType<typeof vi.fn>;
  } => ({
    user: { uid: 'owner' },
    loading: false,
    setPendingEditorOperation: vi.fn(),
  }),
);
const persona = vi.hoisted(() => ({
  pending: false,
  listeners: new Set<() => void>(),
  props: null as AdventurePersonaDialogProps | null,
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/ai-assistant', () => ({
  readEditorChatOperation: vi.fn((uid: string) =>
    persona.pending && uid === 'owner' ? { state: 'uncertain' } : null,
  ),
  subscribeEditorChatOperation: vi.fn((_uid: string, _scope: unknown, listener: () => void) => {
    persona.listeners.add(listener);
    return () => persona.listeners.delete(listener);
  }),
  AdventurePersonaDialog: (props: AdventurePersonaDialogProps) => {
    persona.props = props;
    return (
      <section aria-label="Persona da aventura aberta">
        <span>
          {props.uid}/{props.adventureId}/{String(props.sceneId)}
        </span>
        <button
          onClick={() => {
            persona.pending = true;
            for (const listener of persona.listeners) listener();
            props.onPendingChange?.(true);
          }}
        >
          Pedido incerto
        </button>
        <button
          onClick={() => {
            persona.pending = false;
            for (const listener of persona.listeners) listener();
            props.onPendingChange?.(false);
          }}
        >
          Resolver pedido
        </button>
        <button onClick={props.onChanged}>Persona alterada</button>
        <button onClick={props.onClose}>Fechar persona</button>
      </section>
    );
  },
}));
vi.mock('@/features/lore', () => ({
  LoreCollection: ({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) => (
    <>
      <h2>Lore da aventura</h2>
      <input aria-label="Rascunho de lore" defaultValue="" onChange={() => onBusyChange?.(true)} />
    </>
  ),
}));
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
  persona.pending = false;
  persona.listeners.clear();
  persona.props = null;
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

it('abre a persona base pela API pública com a conta e aventura atuais, sem inventar cena', async () => {
  render(tree());
  await userEvent.click(await screen.findByRole('button', { name: 'Persona da aventura' }));
  expect(screen.getByRole('region', { name: 'Persona da aventura aberta' })).toBeVisible();
  expect(persona.props).toMatchObject({ uid: 'owner', adventureId: 'project', sceneId: null });
  await userEvent.click(screen.getByRole('button', { name: 'Fechar persona' }));
  expect(
    screen.queryByRole('region', { name: 'Persona da aventura aberta' }),
  ).not.toBeInTheDocument();
});

it('compartilha o único guard de navegação e Auth com a pendência de persona, liberando após resolver', async () => {
  const router = createMemoryRouter(
    [
      { path: '/adventures/:adventureId', element: <AdventurePage /> },
      { path: '/studio', element: <h1>Estúdio</h1> },
    ],
    { initialEntries: ['/adventures/project'] },
  );
  render(<RouterProvider router={router} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Persona da aventura' }));
  await userEvent.click(screen.getByRole('button', { name: 'Pedido incerto' }));
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
  await userEvent.click(screen.getByRole('link', { name: 'Voltar ao Estúdio' }));
  expect(screen.getByRole('heading', { name: 'Meu projeto' })).toBeVisible();
  expect(router.state.location.pathname).toBe('/adventures/project');
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Resolver pedido' }));
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(false);
  await userEvent.click(screen.getByRole('link', { name: 'Voltar ao Estúdio' }));
  expect(await screen.findByRole('heading', { name: 'Estúdio' })).toBeVisible();
});

it.each(['falha', 'ausente'] as const)(
  'oferece recuperação metadata-only quando a origem %s',
  async (origin) => {
    persona.pending = true;
    if (origin === 'falha') vi.mocked(getAdventure).mockRejectedValueOnce(new Error('Sem conexão'));
    else vi.mocked(getAdventure).mockResolvedValueOnce(null);
    render(tree());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Recuperar pedido de persona' }),
    );
    expect(persona.props).toMatchObject({ uid: 'owner', adventureId: 'project', sceneId: null });
    expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Resolver pedido' }));
    expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(false);
  },
);

it('recarrega os metadados sem remontar ou sobrescrever o lore sujo, inclusive após falha transitória', async () => {
  const user = userEvent.setup();
  vi.mocked(getAdventure)
    .mockResolvedValueOnce(resource)
    .mockResolvedValueOnce({ ...resource, title: 'Projeto atualizado', updatedAt: 3000 })
    .mockRejectedValueOnce(new Error('Atualização sem resposta'));
  render(tree('?tab=lore'));
  await screen.findByRole('heading', { name: 'Meu projeto' });
  const draft = screen.getByLabelText('Rascunho de lore');
  await user.type(draft, 'Meu texto próprio ainda não salvo');
  await user.click(screen.getByRole('button', { name: 'Persona da aventura' }));
  await user.click(screen.getByRole('button', { name: 'Persona alterada' }));
  expect(await screen.findByRole('heading', { name: 'Projeto atualizado' })).toBeVisible();
  expect(screen.getByLabelText('Rascunho de lore')).toBe(draft);
  expect(draft).toHaveValue('Meu texto próprio ainda não salvo');
  await user.click(screen.getByRole('button', { name: 'Persona alterada' }));
  expect(await screen.findByText(/Atualização sem resposta/)).toBeVisible();
  expect(screen.getByLabelText('Rascunho de lore')).toBe(draft);
  expect(draft).toHaveValue('Meu texto próprio ainda não salvo');
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
});

it('encerra a projeção da persona e libera o guard anterior ao trocar de conta', async () => {
  const view = render(tree());
  await userEvent.click(await screen.findByRole('button', { name: 'Persona da aventura' }));
  await userEvent.click(screen.getByRole('button', { name: 'Pedido incerto' }));
  const previous = persona.props!;
  auth.user = { uid: 'new-owner' };
  vi.mocked(getAdventure).mockResolvedValueOnce(null);
  view.rerender(tree());
  expect(await screen.findByText('Aventura indisponível')).toBeVisible();
  expect(
    screen.queryByRole('region', { name: 'Persona da aventura aberta' }),
  ).not.toBeInTheDocument();
  expect(previous.uid).toBe('owner');
  await waitFor(() => expect(auth.setPendingEditorOperation).toHaveBeenCalledWith(false));
});
