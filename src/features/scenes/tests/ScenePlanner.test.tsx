import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { ScenePlanner } from '../components/ScenePlanner';
import * as api from '../services/sceneService';
import { listLoreEntities } from '@/features/lore';
import {
  target,
  group,
  groupDetail,
  summary,
  document,
  mutation,
  conflict,
  deferred,
} from './sceneFixtures';
import type { SceneGroup, ScenePage, SceneSummary } from '../model/scene';
const auth = vi.hoisted(() => {
  const value: { user: { uid: string } | null; loading: boolean } = {
    user: { uid: 'owner' },
    loading: false,
  };
  return value;
});
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/lore', async (original) => ({
  ...(await original<object>()),
  listLoreEntities: vi.fn(),
}));
vi.mock('../services/sceneService', () => ({
  getScene: vi.fn(),
  getSceneGroup: vi.fn(),
  listSceneGroups: vi.fn(),
  listScenes: vi.fn(),
  createScene: vi.fn(),
  updateScene: vi.fn(),
  moveScene: vi.fn(),
  archiveScene: vi.fn(),
  createSceneGroup: vi.fn(),
  convertChapterToScenes: vi.fn(),
  rebalanceSceneRanks: vi.fn(),
  deleteSceneGroup: vi.fn(),
  deleteSceneGroups: vi.fn(),
  getSceneJob: vi.fn(),
  listSceneReferences: vi.fn(),
  setSceneReference: vi.fn(),
}));
beforeEach(() => {
  auth.user = { uid: 'owner' };
  auth.loading = false;
  vi.clearAllMocks();
  vi.mocked(api.getScene).mockResolvedValue(document);
  vi.mocked(api.getSceneGroup).mockImplementation((input) =>
    Promise.resolve({
      ...groupDetail,
      group: input.parentId
        ? { ...group, id: input.parentId }
        : { ...group, id: null, title: 'Sem capítulo', kind: 'unassigned' },
    }),
  );
  vi.mocked(api.listSceneGroups).mockResolvedValue({
    items: [group],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(api.listScenes).mockResolvedValue({
    items: [summary],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(api.listSceneReferences).mockResolvedValue({
    items: [],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(listLoreEntities).mockResolvedValue([]);
  for (const method of [
    api.createScene,
    api.updateScene,
    api.moveScene,
    api.archiveScene,
    api.convertChapterToScenes,
    api.setSceneReference,
  ])
    vi.mocked(method).mockResolvedValue(mutation);
  vi.mocked(api.createSceneGroup).mockResolvedValue(group);
  vi.mocked(api.rebalanceSceneRanks).mockResolvedValue({ complete: true, processed: 1 });
  vi.mocked(api.deleteSceneGroup).mockResolvedValue({ complete: true, processed: 1 });
  vi.mocked(api.deleteSceneGroups).mockResolvedValue({ complete: true, processed: 1 });
  vi.mocked(api.getSceneJob).mockResolvedValue(null);
});
function mount(props: Partial<React.ComponentProps<typeof ScenePlanner>> = {}) {
  return render(
    <MemoryRouter>
      <ScenePlanner target={target} projectTitle="O farol" initialParentId="chapter" {...props} />
    </MemoryRouter>,
  );
}
async function choose(label: string, value: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(screen.getByRole('option', { name: value }));
}
async function action(label: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Ações da cena ' + summary.title }));
  await user.click(screen.getByRole('menuitem', { name: label }));
}
async function confirm(label: string) {
  const dialog = screen.getByRole('dialog');
  await userEvent.setup().click(within(dialog).getByRole('button', { name: label }));
}
it('lista dados reais, altera quadro por teclado e abre rota própria', async () => {
  mount();
  const link = await screen.findByRole('link', { name: summary.title });
  expect(link).toHaveAttribute('href', '/books/book/scenes/scene');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Quadro' }));
  expect(screen.getByRole('region', { name: 'Planejada' })).toContainElement(
    screen.getByRole('link', { name: summary.title }),
  );
  expect(screen.getByRole('button', { name: 'Quadro' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Lista' }));
  expect(screen.getByText('2 palavras · revisão 1')).toBeInTheDocument();
});
it('filtros reiniciam cursor e não exibem resposta antiga', async () => {
  const old = deferred<ScenePage<SceneSummary>>();
  vi.mocked(api.listScenes)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ items: [], nextCursor: null, projectRevision: 2 });
  mount();
  await screen.findByRole('combobox', { name: 'Estado da cena' });
  await choose('Estado da cena', 'Em revisão');
  await screen.findByText('Nenhuma cena neste agrupador');
  await act(async () => {
    old.resolve({ items: [summary], nextCursor: 'old', projectRevision: 1 });
    await old.promise;
  });
  expect(screen.queryByRole('link', { name: summary.title })).not.toBeInTheDocument();
  expect(api.listScenes).toHaveBeenLastCalledWith(
    expect.objectContaining({ stage: 'review', cursor: null, limit: 25 }),
  );
  await choose('Arquivo de cenas', 'Arquivadas');
  await waitFor(() =>
    expect(api.listScenes).toHaveBeenLastCalledWith(
      expect.objectContaining({ archived: true, cursor: null }),
    ),
  );
});
it('pagina grupos e cenas; erro parcial mantém página anterior e permite retry', async () => {
  vi.mocked(api.listSceneGroups).mockResolvedValueOnce({
    items: [group],
    nextCursor: 'groups-next',
    projectRevision: 1,
  });
  vi.mocked(api.listScenes)
    .mockResolvedValueOnce({ items: [summary], nextCursor: 'scenes-next', projectRevision: 1 })
    .mockRejectedValueOnce(new Error('Página indisponível'))
    .mockResolvedValueOnce({
      items: [{ ...summary, id: 'second', title: 'Depois do farol' }],
      nextCursor: null,
      projectRevision: 1,
    });
  mount();
  await screen.findByRole('link', { name: summary.title });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Carregar mais agrupadores' }));
  await waitFor(() =>
    expect(api.listSceneGroups).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'groups-next' }),
    ),
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Carregar mais cenas' }));
  await screen.findByText('Página indisponível');
  expect(screen.getByRole('link', { name: summary.title })).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByRole('link', { name: 'Depois do farol' });
  expect(api.listScenes).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: 'scenes-next' }),
  );
});
it('criação preserva dados e recibo em resposta incerta; campos ficam bloqueados', async () => {
  vi.mocked(api.createScene).mockRejectedValueOnce(
    Object.assign(new Error('Resposta não confirmada'), { code: 'functions/unavailable' }),
  );
  const changed = vi.fn();
  mount({ onManuscriptChange: changed });
  await screen.findByRole('link', { name: summary.title });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Nova cena' }));
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Título da cena' }), 'O farol se apaga');
  await user.type(screen.getByRole('textbox', { name: 'Objetivo' }), 'Encontrar Lia');
  await user.type(screen.getByRole('textbox', { name: 'Conflito' }), 'Água');
  await user.type(screen.getByRole('textbox', { name: 'Ponto de vista' }), 'Lia');
  await confirm('Salvar');
  await screen.findByText('Resposta não confirmada');
  expect(screen.getByRole('textbox', { name: 'Título da cena' })).toBeDisabled();
  const first = vi.mocked(api.createScene).mock.calls.at(0)?.[0];
  await confirm('Tentar novamente');
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(vi.mocked(api.createScene).mock.calls.at(1)?.[0]).toEqual(first);
  expect(first).toMatchObject({
    title: 'O farol se apaga',
    parentId: 'chapter',
    planning: { objective: 'Encontrar Lia', conflict: 'Água', pointOfView: 'Lia' },
  });
});
it('erro definitivo conserva formulário editável e permite corrigir pedido', async () => {
  vi.mocked(api.createScene).mockRejectedValueOnce(
    Object.assign(new Error('Título inválido'), { code: 'functions/invalid-argument' }),
  );
  mount();
  await screen.findByRole('link', { name: summary.title });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Nova cena' }));
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Título da cena' }), 'Antes');
  await confirm('Salvar');
  await screen.findByText('Título inválido');
  expect(screen.getByRole('textbox', { name: 'Título da cena' })).toBeEnabled();
  await userEvent.setup().clear(screen.getByRole('textbox', { name: 'Título da cena' }));
  await userEvent
    .setup()
    .type(screen.getByRole('textbox', { name: 'Título da cena' }), 'Corrigido');
  await confirm('Salvar');
  await waitFor(() => expect(api.createScene).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.createScene).mock.calls.at(1)?.[0].title).toBe('Corrigido');
  expect(vi.mocked(api.createScene).mock.calls.at(1)?.[0].operationId).not.toBe(
    vi.mocked(api.createScene).mock.calls.at(0)?.[0].operationId,
  );
});
it('edita planejamento separado da prosa e estado, sem sobrescrever conteúdo', async () => {
  mount();
  await action('Editar planejamento');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Objetivo' })).toHaveValue('Consertar o farol'),
  );
  await userEvent.setup().clear(screen.getByRole('textbox', { name: 'Objetivo' }));
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Objetivo' }), 'Novo objetivo');
  await choose('Estado da cena', 'Em escrita');
  await confirm('Salvar');
  await waitFor(() =>
    expect(api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        patch: {
          title: summary.title,
          stage: 'writing',
          planning: { ...document.planning, objective: 'Novo objetivo' },
        },
      }),
    ),
  );
  expect(vi.mocked(api.updateScene).mock.calls.at(0)?.[0].patch).not.toHaveProperty('content');
});
it('conflito de plano compara versão e mantém preenchimento para novo CAS', async () => {
  vi.mocked(api.updateScene).mockRejectedValueOnce(conflict());
  mount();
  await action('Editar planejamento');
  await screen.findByDisplayValue('Consertar o farol');
  await userEvent.setup().clear(screen.getByRole('textbox', { name: 'Objetivo' }));
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Objetivo' }), 'Meu objetivo');
  await confirm('Salvar');
  await screen.findByText('A revisão mudou.');
  vi.mocked(api.getScene).mockResolvedValueOnce({ ...document, revision: 5, title: 'Remoto' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Comparar com dados atuais' }));
  await screen.findByText(/Versão remota 5/);
  expect(screen.getByRole('textbox', { name: 'Objetivo' })).toHaveValue('Meu objetivo');
  await confirm('Salvar');
  await waitFor(() =>
    expect(api.updateScene).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 5,
        patch: {
          title: summary.title,
          stage: 'planned',
          planning: { ...document.planning, objective: 'Meu objetivo' },
        },
      }),
    ),
  );
});
it('muda estado mediante CAS e arquiva avisando preservação', async () => {
  mount();
  await action('Alterar estado');
  await choose('Novo estado da cena', 'Concluída');
  await confirm('Alterar estado');
  await waitFor(() =>
    expect(api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { stage: 'done' }, expectedRevision: 1 }),
    ),
  );
  await action('Arquivar cena');
  expect(screen.getByText(/sua prosa e suas referências permanecem/)).toBeInTheDocument();
  await confirm('Arquivar cena');
  await waitFor(() =>
    expect(api.archiveScene).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true, expectedRevision: 1 }),
    ),
  );
});
it('restaura arquivada no final sem apagar texto', async () => {
  vi.mocked(api.listScenes).mockResolvedValue({
    items: [{ ...summary, archived: true }],
    nextCursor: null,
    projectRevision: 1,
  });
  mount();
  await action('Restaurar cena');
  expect(screen.getByText(/agrupador original disponível/)).toBeInTheDocument();
  await confirm('Restaurar cena');
  await waitFor(() =>
    expect(api.archiveScene).toHaveBeenCalledWith(expect.objectContaining({ archived: false })),
  );
});
it('mover antes/depois usa vizinho real e duas revisões estruturais', async () => {
  vi.mocked(api.listScenes).mockResolvedValue({
    items: [summary, { ...summary, id: 'neighbor', title: 'A despedida' }],
    nextCursor: null,
    projectRevision: 1,
  });
  mount();
  await action('Mover cena');
  await choose('Posição', 'Antes de outra cena');
  await choose('Cena de referência da posição', 'A despedida');
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mover cena' }),
    ).toBeEnabled(),
  );
  await confirm('Mover cena');
  await waitFor(() =>
    expect(api.moveScene).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeId: 'neighbor',
        expectedSourceStructureRevision: 1,
        expectedTargetStructureRevision: 1,
        parentId: 'chapter',
      }),
    ),
  );
  await action('Mover cena');
  await choose('Posição', 'Depois de outra cena');
  await choose('Cena de referência da posição', 'A despedida');
  await confirm('Mover cena');
  await waitFor(() =>
    expect(api.moveScene).toHaveBeenLastCalledWith(
      expect.objectContaining({ afterId: 'neighbor' }),
    ),
  );
});
it('move para Sem capítulo com prosa guardada fora da composição', async () => {
  mount();
  await action('Mover cena');
  await choose('Destino', 'Sem capítulo');
  await screen.findByText(/A prosa fica guardada/);
  await confirm('Mover cena');
  await waitFor(() =>
    expect(api.moveScene).toHaveBeenCalledWith(expect.objectContaining({ parentId: null })),
  );
});
it('converte legado somente por confirmação explícita usando fingerprint observado', async () => {
  vi.mocked(api.getSceneGroup).mockResolvedValue({
    ...groupDetail,
    group: { ...group, contentMode: 'legacy' },
    sourceVersion: 'observed-source',
    legacy: { content: document.content, hash: 'hash' },
  });
  mount();
  await screen.findByRole('button', { name: 'Converter em cenas' });
  expect(api.convertChapterToScenes).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Nova cena' })).toBeDisabled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Converter em cenas' }));
  await confirm('Converter em cenas');
  await waitFor(() =>
    expect(api.convertChapterToScenes).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'chapter', expectedSourceVersion: 'observed-source' }),
    ),
  );
});
it('cria agrupador real sem livro auxiliar e permite cancelamento', async () => {
  mount({ target: { kind: 'adventure', id: 'adventure' } });
  await screen.findByRole('button', { name: 'Nova parte' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Nova parte' }));
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Título da parte' }), 'A torre');
  await confirm('Nova parte');
  await waitFor(() =>
    expect(api.createSceneGroup).toHaveBeenCalledWith(
      expect.objectContaining({ target: { kind: 'adventure', id: 'adventure' }, title: 'A torre' }),
    ),
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Nova parte' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('reorganização e remoção avançam em lotes com recibo estável e progresso real', async () => {
  vi.mocked(api.rebalanceSceneRanks)
    .mockResolvedValueOnce({ complete: false, processed: 50 })
    .mockResolvedValueOnce({ complete: true, processed: 51 });
  vi.mocked(api.deleteSceneGroup)
    .mockResolvedValueOnce({ complete: false, processed: 50 })
    .mockResolvedValueOnce({ complete: true, processed: 51 });
  mount();
  await screen.findByRole('button', { name: 'Reorganizar posições' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Reorganizar posições' }));
  await confirm('Reorganizar posições');
  await waitFor(() => expect(api.rebalanceSceneRanks).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.rebalanceSceneRanks).mock.calls.at(0)?.[0]).toEqual(
    vi.mocked(api.rebalanceSceneRanks).mock.calls.at(1)?.[0],
  );
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Remover capítulo' }));
  await confirm('Remover capítulo');
  await waitFor(() => expect(api.deleteSceneGroup).toHaveBeenCalledTimes(2));
  expect(api.deleteSceneGroup).toHaveBeenCalledWith(
    expect.objectContaining({ expectedUpdatedAt: 100, limit: 50 }),
  );
  await waitFor(() =>
    expect(api.listScenes).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: null })),
  );
});
it('retoma job original após reload e conserva revisões do pedido', async () => {
  const original = {
    target,
    operationId: 'original-job',
    groups: [{ id: 'chapter', expectedUpdatedAt: 42 }],
    limit: 50,
  };
  vi.mocked(api.getSceneGroup).mockResolvedValue({
    ...groupDetail,
    group: { ...group, deleting: true, deletionOperationId: 'original-job' },
  });
  vi.mocked(api.getSceneJob).mockResolvedValue({
    kind: 'delete-groups',
    input: original,
    progress: { complete: false, processed: 50 },
  });
  mount();
  await screen.findByRole('button', { name: 'Retomar remoção' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retomar remoção' }));
  await waitFor(() =>
    expect(api.getSceneJob).toHaveBeenCalledWith({ target, operationId: 'original-job' }),
  );
  await confirm('Remover capítulo');
  await waitFor(() => expect(api.deleteSceneGroups).toHaveBeenCalledWith(original));
  expect(api.deleteSceneGroup).not.toHaveBeenCalled();
});
it('troca de conta cancela respostas antigas sem executar callback de sucesso', async () => {
  const wait = deferred<typeof mutation>();
  vi.mocked(api.createScene).mockReturnValueOnce(wait.promise);
  const changed = vi.fn();
  const view = mount({ onManuscriptChange: changed });
  await screen.findByRole('link', { name: summary.title });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Nova cena' }));
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'Título da cena' }), 'Pendente');
  await confirm('Salvar');
  auth.user = { uid: 'other' };
  view.rerender(
    <MemoryRouter>
      <ScenePlanner target={target} onManuscriptChange={changed} />
    </MemoryRouter>,
  );
  await act(async () => {
    wait.resolve(mutation);
    await wait.promise;
  });
  expect(changed).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox', { name: 'Título da cena' })).not.toBeInTheDocument();
});
it('carregando, autenticação ausente, indisponibilidade e retry são observáveis', async () => {
  auth.loading = true;
  const view = mount();
  expect(screen.getByText('Carregando conta…')).toBeInTheDocument();
  auth.loading = false;
  auth.user = null;
  view.rerender(
    <MemoryRouter>
      <ScenePlanner target={target} />
    </MemoryRouter>,
  );
  expect(screen.getByText('Entre para planejar suas cenas')).toBeInTheDocument();
  auth.user = { uid: 'owner' };
  vi.mocked(api.getSceneGroup).mockRejectedValueOnce(new Error('Agrupador inacessível'));
  view.rerender(
    <MemoryRouter>
      <ScenePlanner target={target} />
    </MemoryRouter>,
  );
  await screen.findByText('Agrupador inacessível');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(screen.queryByText('Agrupador inacessível')).not.toBeInTheDocument());
  await userEvent.setup().click(screen.getByRole('button', { name: 'Atualizar planejamento' }));
  expect(api.listScenes).toHaveBeenCalled();
});

it('move carrega destinos e vizinhos adicionais com posição antes', async () => {
  const destinationsPage = deferred<ScenePage<SceneGroup>>();
  const neighborsPage = deferred<ScenePage<SceneSummary>>();
  const destinations = { items: [group], nextCursor: 'group-page', projectRevision: 1 };
  const neighbors = {
    items: [summary, { ...summary, id: 'neighbor', title: 'Vizinha' }],
    nextCursor: 'scene-page',
    projectRevision: 1,
  };
  vi.mocked(api.listSceneGroups)
    .mockResolvedValueOnce(destinations)
    .mockReturnValueOnce(destinationsPage.promise)
    .mockResolvedValue(destinations);
  vi.mocked(api.listScenes)
    .mockResolvedValueOnce(neighbors)
    .mockReturnValueOnce(neighborsPage.promise)
    .mockResolvedValue(neighbors);
  mount();
  await action('Mover cena');
  await screen.findByText('Carregando destinos…');
  expect(screen.queryByRole('button', { name: 'Carregar mais destinos' })).not.toBeInTheDocument();
  const destinationControl = screen.findByRole('button', { name: 'Carregar mais destinos' });
  await act(async () => {
    destinationsPage.resolve(destinations);
    await destinationsPage.promise;
  });
  const moreDestinations = await destinationControl;
  await waitFor(() => expect(moreDestinations).toBeEnabled());
  await userEvent.setup().click(moreDestinations);
  await waitFor(() =>
    expect(api.listSceneGroups).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'group-page' }),
    ),
  );
  await choose('Posição', 'Antes de outra cena');
  await screen.findByText('Carregando cenas do destino…');
  expect(
    screen.queryByRole('button', { name: 'Carregar mais cenas do destino' }),
  ).not.toBeInTheDocument();
  const neighborControl = screen.findByRole('button', { name: 'Carregar mais cenas do destino' });
  await act(async () => {
    neighborsPage.resolve(neighbors);
    await neighborsPage.promise;
  });
  const moreNeighbors = await neighborControl;
  await waitFor(() => expect(moreNeighbors).toBeEnabled());
  await userEvent.setup().click(moreNeighbors);
  await waitFor(() =>
    expect(api.listScenes).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'scene-page' }),
    ),
  );
  await choose('Cena de referência da posição', 'Vizinha');
  await confirm('Mover cena');
  await waitFor(() => expect(api.moveScene).toHaveBeenCalled());
});
it('conflito de movimento compara ordem atual sem perder destino ou posição', async () => {
  vi.mocked(api.listScenes).mockResolvedValue({
    items: [summary, { ...summary, id: 'neighbor', title: 'Vizinha' }],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(api.moveScene).mockRejectedValueOnce(conflict());
  mount();
  await action('Mover cena');
  await choose('Posição', 'Depois de outra cena');
  await choose('Cena de referência da posição', 'Vizinha');
  await confirm('Mover cena');
  await screen.findByText('A revisão mudou.');
  vi.mocked(api.getScene).mockResolvedValue({ ...document, revision: 4 });
  vi.mocked(api.getSceneGroup).mockResolvedValue({
    ...groupDetail,
    group: { ...group, structureRevision: 3 },
  });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Comparar com dados atuais' }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mover cena' }),
    ).toBeEnabled(),
  );
  await confirm('Mover cena');
  await waitFor(() =>
    expect(api.moveScene).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        expectedSourceStructureRevision: 3,
        expectedTargetStructureRevision: 3,
        afterId: 'neighbor',
      }),
    ),
  );
});
it('destino indisponível bloqueia movimento e retry recarrega metadados', async () => {
  mount();
  await screen.findByRole('link', { name: summary.title });
  vi.mocked(api.getSceneGroup).mockResolvedValueOnce(null);
  await action('Mover cena');
  await screen.findByText('Destino indisponível.');
  expect(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Mover cena' }),
  ).toBeDisabled();
  await userEvent
    .setup()
    .click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mover cena' }),
    ).toBeEnabled(),
  );
  await confirm('Mover cena');
  await waitFor(() => expect(api.moveScene).toHaveBeenCalled());
});
it('planejamento indisponível permite retry e cancelamento sem writes', async () => {
  mount();
  vi.mocked(api.getScene).mockResolvedValueOnce(null);
  await action('Editar planejamento');
  await screen.findByText('Esta cena está indisponível.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByDisplayValue('Consertar o farol');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(api.updateScene).not.toHaveBeenCalled();
});
it('retoma reorganização pelo pedido original e job ausente orienta atualizar', async () => {
  const original = { target, operationId: 'rank-job', parentId: 'chapter', limit: 50 };
  vi.mocked(api.getSceneGroup).mockResolvedValue({
    ...groupDetail,
    group: { ...group, rebalancing: true, rebalanceOperationId: 'rank-job' },
  });
  vi.mocked(api.getSceneJob)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      kind: 'rebalance',
      input: original,
      progress: { complete: false, processed: 50 },
    });
  mount();
  await screen.findByRole('button', { name: 'Retomar reorganização' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retomar reorganização' }));
  await screen.findByText('Pedido original indisponível. Atualize o planejamento.');
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Voltar e atualizar planejamento' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retomar reorganização' }));
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Reorganizar posições' }),
    ).toBeEnabled(),
  );
  await confirm('Reorganizar posições');
  await waitFor(() => expect(api.rebalanceSceneRanks).toHaveBeenCalledWith(original));
});
it('erro de comparação mantém bloqueio até revisão atual estar disponível', async () => {
  vi.mocked(api.updateScene).mockRejectedValueOnce(conflict());
  mount();
  await action('Alterar estado');
  await choose('Novo estado da cena', 'Em revisão');
  await confirm('Alterar estado');
  await screen.findByText('A revisão mudou.');
  vi.mocked(api.getScene).mockRejectedValueOnce(new Error('Comparação indisponível'));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Comparar com dados atuais' }));
  await screen.findByText('Comparação indisponível');
  expect(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Alterar estado' }),
  ).toBeDisabled();
});
