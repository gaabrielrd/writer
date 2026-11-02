import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { NarrativePlanner } from '../components/NarrativePlanner';
import * as api from '../services/narrativePlanningService';
import {
  arc,
  event,
  milestone,
  context,
  target,
  page,
  summary,
  deferred,
  transport,
  conflict,
} from './narrativeFixtures';
import type { NarrativeContext, NarrativeJob, NarrativeTarget } from '../model/narrative';
const auth = vi.hoisted(() => {
  const state: { user: { uid: string } | null; loading: boolean } = {
    user: { uid: 'owner' },
    loading: false,
  };
  return state;
});
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/narrativePlanningService');
vi.mock('@/features/scenes', () => ({
  listSceneGroups: vi.fn().mockResolvedValue({ items: [], nextCursor: null, projectRevision: 1 }),
  listScenes: vi.fn().mockResolvedValue({ items: [], nextCursor: null, projectRevision: 1 }),
  sceneRoute: (t: typeof target, id: string) =>
    `/${t.kind === 'book' ? 'books' : 'adventures'}/${t.id}/scenes/${id}`,
}));
const change = vi.fn();
function Position() {
  const location = useLocation();
  return <p aria-label="URL atual">{location.pathname + location.search}</p>;
}
function mount(path = '/books/book?tab=narrative', project: NarrativeTarget = target) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NarrativePlanner target={project} onProjectChange={change} />
      <Position />
    </MemoryRouter>,
  );
}
async function click(name: string) {
  await userEvent.setup().click(await screen.findByRole('button', { name }));
}
async function choose(label: string, value: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(screen.getByRole('option', { name: value }));
}
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid: 'owner' };
  auth.loading = false;
  vi.mocked(api.getNarrativeContext).mockImplementation(({ target: t }) =>
    Promise.resolve({
      ...context,
      target: t,
    }),
  );
  vi.mocked(api.listNarrativeItems).mockImplementation(({ resource }) =>
    Promise.resolve({
      ...page([
        summary(resource.kind === 'arc' ? arc : resource.kind === 'event' ? event : milestone),
      ]),
      sequence: { resource, structureRevision: 2, rankSlot: 'A', rebalancing: false },
    }),
  );
  vi.mocked(api.getNarrativeItem).mockImplementation(({ source }) =>
    Promise.resolve(source.kind === 'arc' ? arc : source.kind === 'event' ? event : milestone),
  );
  vi.mocked(api.listNarrativeReferences).mockResolvedValue(page([]));
  vi.mocked(api.listNarrativeLoreOptions).mockResolvedValue(
    page([
      {
        reference: { kind: 'book', scopeId: 'book', entityId: 'lia' },
        name: 'Lia',
        category: 'character',
      },
    ]),
  );
  vi.mocked(api.listEntityNarrativeItems).mockResolvedValue(page([summary(milestone)]));
  vi.mocked(api.listEntityScenes).mockResolvedValue(
    page([
      { id: 'link', sceneId: 'scene', available: true, title: 'A chegada de Lia', archived: true },
    ]),
  );
  for (const method of [
    api.createNarrativeItem,
    api.updateNarrativeItem,
    api.moveNarrativeItem,
    api.setNarrativeReference,
  ])
    vi.mocked(method).mockResolvedValue({
      item: summary(arc),
      projectRevision: 2,
      sceneRevision: 1,
    });
  for (const method of [
    api.deleteNarrativeItem,
    api.rebalanceNarrativeRanks,
    api.prepareEntitySceneIndex,
  ])
    vi.mocked(method).mockResolvedValue({ complete: true, processed: 1 });
  vi.mocked(api.getNarrativeJob).mockResolvedValue(null);
});
it('autor percorre arco e marco mantendo parâmetros próprios e tab da raiz', async () => {
  mount();
  await click('Abrir arco');
  expect(await screen.findByText(arc.kind === 'arc' ? arc.objective : '')).toBeInTheDocument();
  await click('Abrir marco');
  expect(
    await screen.findByText(milestone.kind === 'milestone' ? milestone.notes : ''),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('URL atual').textContent).toContain('tab=narrative');
  expect(screen.getByLabelText('URL atual').textContent).toContain('narrativeArc=arc');
  expect(screen.getByLabelText('URL atual').textContent).toContain('narrativeItem=milestone');
  await click('Voltar à lista');
  await screen.findByRole('button', { name: 'Abrir marco' });
  await click('Voltar à lista');
  await screen.findByRole('button', { name: 'Abrir arco' });
});
it('mestre encontra cronologia na aventura, data livre e evento sem data', async () => {
  vi.mocked(api.listNarrativeItems).mockResolvedValue(
    page([
      summary(event),
      { ...summary(event), id: 'no-date', title: 'Sem relógio', dateLabel: '' },
    ]),
  );
  mount('/adventures/book?tab=narrative', { kind: 'adventure', id: 'book' });
  await click('Cronologia');
  await screen.findByText('3º dia do inverno');
  expect(screen.getByText('Sem data')).toBeInTheDocument();
  expect(api.listNarrativeItems).toHaveBeenLastCalledWith({
    target: { kind: 'adventure', id: 'book' },
    resource: { kind: 'event' },
    cursor: null,
    limit: 25,
  });
});
it('abre contexto via URL diretamente, sem buscar todos os detalhes', async () => {
  mount('/books/book?tab=narrative&narrativeView=timeline&narrativeItem=event');
  await screen.findByText(event.kind === 'event' ? event.description : '');
  expect(api.getNarrativeItem).toHaveBeenCalledWith({
    target,
    source: { kind: 'event', id: 'event' },
  });
  expect(api.listNarrativeItems).not.toHaveBeenCalled();
});
it('cria marco próprio do arco e atualiza o projeto após confirmação', async () => {
  mount();
  await click('Abrir arco');
  await click('Novo marco');
  await userEvent.setup().type(screen.getByLabelText('Título'), 'Escolher a luz');
  await click('Salvar');
  await waitFor(() => expect(change).toHaveBeenCalled());
  expect(api.createNarrativeItem).toHaveBeenCalledWith(
    expect.objectContaining({
      resource: { kind: 'milestone', arcId: 'arc' },
      title: 'Escolher a luz',
      notes: '',
    }),
  );
});
it('cria evento com data livre e arco com os campos próprios', async () => {
  mount();
  await click('Novo arco');
  await userEvent.setup().type(screen.getByLabelText('Título'), 'Nova esperança');
  await click('Cancelar');
  await click('Cronologia');
  await click('Novo evento');
  await userEvent.setup().type(screen.getByLabelText('Título'), 'A água sobe');
  await userEvent.setup().type(screen.getByLabelText('Data livre (opcional)'), 'Depois do sino');
  await click('Salvar');
  await waitFor(() =>
    expect(api.createNarrativeItem).toHaveBeenCalledWith(
      expect.objectContaining({ resource: { kind: 'event' }, dateLabel: 'Depois do sino' }),
    ),
  );
});
it('editar e cancelar mantém o detalhe existente; confirmação refaz leitura', async () => {
  mount();
  await click('Abrir arco');
  await click('Editar');
  await click('Cancelar');
  await click('Editar');
  await userEvent.setup().type(screen.getByLabelText('Objetivo'), ' Hoje');
  await click('Salvar');
  await waitFor(() => expect(api.getNarrativeContext).toHaveBeenCalledTimes(2));
  expect(api.updateNarrativeItem).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 1 }),
  );
});
it('página adicional falha sem esconder itens; retry recupera e cursor novo mantém sequência', async () => {
  vi.mocked(api.listNarrativeItems)
    .mockResolvedValueOnce(page([summary(arc)], 'next'))
    .mockRejectedValueOnce(transport())
    .mockResolvedValueOnce(page([{ ...summary(arc), id: 'arc2', title: 'Outro arco' }]));
  mount();
  await click('Carregar mais arcos');
  expect(screen.getByText(arc.title)).toBeInTheDocument();
  await click('Tentar novamente');
  await screen.findByText('Outro arco');
  expect(api.listNarrativeItems).toHaveBeenLastCalledWith({
    target,
    resource: { kind: 'arc' },
    cursor: 'next',
    limit: 25,
  });
});
it('conflito de cursor reinicia primeira página sem reutilizar cursor velho', async () => {
  vi.mocked(api.listNarrativeItems)
    .mockResolvedValueOnce(page([summary(arc)], 'next'))
    .mockRejectedValueOnce(conflict())
    .mockResolvedValueOnce(page([{ ...summary(arc), title: 'Arco atualizado' }]));
  mount();
  await click('Carregar mais arcos');
  await click('Tentar novamente');
  await screen.findByText('Arco atualizado');
  expect(api.listNarrativeItems).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: null }),
  );
});
it('atualização falha e retry cobre estados sem flash privado de contexto anterior', async () => {
  vi.mocked(api.getNarrativeContext).mockRejectedValueOnce(new Error('Contexto indisponível'));
  mount();
  await click('Tentar novamente');
  await click('Atualizar planejamento');
  await waitFor(() => expect(api.getNarrativeContext).toHaveBeenCalledTimes(3));
  await screen.findByRole('button', { name: 'Abrir arco' });
});
it.each([
  null,
  { ...context, ownerId: 'other' },
  { ...context, target: { kind: 'adventure' as const, id: 'other' } },
])('origem ausente/alheia não mostra projetos privados', async (value) => {
  vi.mocked(api.getNarrativeContext).mockResolvedValue(value);
  mount();
  await screen.findByText('Planejamento indisponível');
  expect(api.listNarrativeItems).not.toHaveBeenCalled();
});
it('troca de conta ignora resposta privada pendente', async () => {
  const pending = deferred<NarrativeContext | null>();
  vi.mocked(api.getNarrativeContext)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(null);
  const mounted = mount();
  auth.user = { uid: 'other' };
  mounted.rerender(
    <MemoryRouter>
      <NarrativePlanner target={target} />
    </MemoryRouter>,
  );
  await screen.findByText('Planejamento indisponível');
  await act(async () => {
    pending.resolve(context);
    await pending.promise;
  });
  expect(screen.queryByText(arc.title)).not.toBeInTheDocument();
});
it('conta carregando e sessão ausente têm estados explícitos', () => {
  auth.loading = true;
  const mounted = mount();
  expect(screen.getByText('Carregando conta…')).toBeInTheDocument();
  auth.loading = false;
  auth.user = null;
  mounted.rerender(
    <MemoryRouter>
      <NarrativePlanner target={target} />
    </MemoryRouter>,
  );
  expect(screen.getByText('Entre para planejar arcos e cronologia')).toBeInTheDocument();
});
it('detalhe removido ou de outro dono não oferece navegação privada', async () => {
  vi.mocked(api.getNarrativeItem).mockResolvedValue({ ...arc, ownerId: 'other' });
  mount();
  await click('Abrir arco');
  await screen.findByText('Item indisponível');
  await click('Voltar à lista');
  await screen.findByRole('button', { name: 'Abrir arco' });
});
it('erro de detalhe permite tentar novamente e não perde contexto', async () => {
  vi.mocked(api.getNarrativeItem)
    .mockRejectedValueOnce(new Error('Falha no detalhe'))
    .mockResolvedValueOnce(event);
  mount('/books/book?narrativeView=timeline&narrativeItem=event');
  await click('Tentar novamente');
  await screen.findByText(event.kind === 'event' ? event.description : '');
});
it('movimento usa vizinho observado e revisão estrutural sem alterar prosa', async () => {
  vi.mocked(api.listNarrativeItems).mockImplementation(({ resource }) =>
    Promise.resolve({
      ...page([summary(arc), { ...summary(arc), id: 'arc2', title: 'Outro arco' }]),
      sequence: { resource, structureRevision: 7, rankSlot: 'A', rebalancing: false },
    }),
  );
  mount();
  const first = (await screen.findAllByRole('button', { name: 'Abrir arco' })).at(0);
  if (!first) throw new Error('Arco não encontrado');
  await userEvent.setup().click(first);
  await click('Mover');
  await choose('Item vizinho', 'Outro arco');
  await choose('Posição', 'Depois');
  await click('Salvar');
  await waitFor(() =>
    expect(api.moveNarrativeItem).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        expectedStructureRevision: 7,
        afterId: 'arc2',
      }),
    ),
  );
});
it('exclusão processa lotes e retorna à lista conservando eventos independentes', async () => {
  vi.mocked(api.deleteNarrativeItem)
    .mockResolvedValueOnce({ complete: false, processed: 50 })
    .mockRejectedValueOnce(transport())
    .mockResolvedValueOnce({ complete: true, processed: 51 });
  mount();
  await click('Abrir arco');
  await click('Excluir');
  await click('Confirmar exclusão');
  await screen.findByText('50 itens processados');
  await click('Tentar novamente');
  await waitFor(() => expect(api.deleteNarrativeItem).toHaveBeenCalledTimes(3));
  const first = vi.mocked(api.deleteNarrativeItem).mock.calls.at(0)?.[0];
  expect(first).toBeDefined();
  for (const call of vi.mocked(api.deleteNarrativeItem).mock.calls) expect(call[0]).toEqual(first);
  await screen.findByRole('button', { name: 'Abrir arco' });
});
it('retoma remoção listada com pedido original após recarga', async () => {
  vi.mocked(api.listNarrativeItems).mockResolvedValue(
    page([{ ...summary(arc), deleting: true, deletionOperationId: 'original' }]),
  );
  const original: NarrativeJob = {
    kind: 'delete-item',
    input: {
      target,
      source: { kind: 'arc', id: 'arc' },
      operationId: 'original',
      expectedRevision: 3,
      limit: 50,
    },
    progress: { complete: false, processed: 50 },
  };
  vi.mocked(api.getNarrativeJob).mockResolvedValue(original);
  mount();
  await click('Retomar exclusão');
  await click('Retomar operação');
  await waitFor(() => expect(api.deleteNarrativeItem).toHaveBeenCalledWith(original.input));
});
it('reorganiza ou retoma slot via pedido original e progresso', async () => {
  vi.mocked(api.listNarrativeItems).mockResolvedValue({
    ...page([summary(arc)]),
    sequence: {
      resource: { kind: 'arc' },
      structureRevision: 2,
      rankSlot: 'A',
      rebalancing: true,
      rebalanceOperationId: 'original',
    },
  });
  const job: NarrativeJob = {
    kind: 'rebalance',
    input: { target, resource: { kind: 'arc' }, operationId: 'original', limit: 50 },
    progress: { complete: false, processed: 50 },
  };
  vi.mocked(api.getNarrativeJob).mockResolvedValue(job);
  mount();
  await click('Retomar reorganização');
  await click('Retomar operação');
  await waitFor(() => expect(api.rebalanceNarrativeRanks).toHaveBeenCalledWith(job.input));
});
it('pedido original ausente não inventa nova operação', async () => {
  vi.mocked(api.listNarrativeItems).mockResolvedValue({
    ...page([summary(arc)]),
    sequence: {
      resource: { kind: 'arc' },
      structureRevision: 2,
      rankSlot: 'A',
      rebalancing: true,
      rebalanceOperationId: 'missing',
    },
  });
  mount();
  await click('Retomar reorganização');
  await screen.findByText(/Pedido original indisponível/);
  expect(api.rebalanceNarrativeRanks).not.toHaveBeenCalled();
});
it('entidades exigem preparação explícita e não mostram falso vazio de cenas', async () => {
  vi.mocked(api.getNarrativeContext)
    .mockResolvedValueOnce({ ...context, entityIndexReady: false })
    .mockResolvedValue(context);
  mount();
  await click('Entidades');
  await choose('Entidade', 'Lia');
  await click('Selecionar entidade');
  await screen.findByText(/Aguardando preparação/);
  expect(api.listEntityScenes).not.toHaveBeenCalled();
  await click('Preparar cenas vinculadas');
  await click('Iniciar');
  await waitFor(() =>
    expect(api.prepareEntitySceneIndex).toHaveBeenCalledWith(
      expect.objectContaining({ target, limit: 50 }),
    ),
  );
});
it('entidade abre marco relacionado e cena arquivada somente quando disponível', async () => {
  mount();
  await click('Entidades');
  await choose('Entidade', 'Lia');
  await click('Selecionar entidade');
  const link = await screen.findByRole('link', { name: 'Abrir cena vinculada' });
  expect(link).toHaveAttribute('href', '/books/book/scenes/scene');
  expect(screen.getByText('Arquivada')).toBeInTheDocument();
  await click('Abrir item relacionado');
  await screen.findByText(milestone.kind === 'milestone' ? milestone.notes : '');
});
it('entidades e cenas indisponíveis não expõem origem nem link', async () => {
  vi.mocked(api.listEntityScenes).mockResolvedValue(
    page([{ id: 'missing', sceneId: 'private', available: false }]),
  );
  mount();
  await click('Entidades');
  await choose('Entidade', 'Lia');
  await click('Selecionar entidade');
  await screen.findByText('Cena indisponível');
  expect(screen.queryByRole('link', { name: 'Abrir cena vinculada' })).not.toBeInTheDocument();
});
it('lista vazia mostra ação inicial e erro de preparação oferece retry', async () => {
  vi.mocked(api.listNarrativeItems).mockResolvedValue(page([]));
  vi.mocked(api.getNarrativeContext).mockResolvedValue({
    ...context,
    entityIndexReady: false,
    entityIndexOperationId: 'resume',
  });
  vi.mocked(api.getNarrativeJob)
    .mockRejectedValueOnce(new Error('Pedido temporariamente indisponível'))
    .mockResolvedValueOnce({
      kind: 'prepare-entity-scenes',
      input: { target, operationId: 'resume', limit: 50 },
      progress: { complete: false, processed: 50 },
    });
  mount();
  await screen.findByText('Nenhum arco planejado');
  await click('Entidades');
  await click('Retomar preparação');
  await click('Tentar novamente');
  await click('Retomar operação');
  await waitFor(() =>
    expect(api.prepareEntitySceneIndex).toHaveBeenCalledWith({
      target,
      operationId: 'resume',
      limit: 50,
    }),
  );
});

it('move conflito compara revisão e vizinhos novos antes de confirmar preenchimento', async () => {
  vi.mocked(api.moveNarrativeItem).mockRejectedValueOnce(conflict());
  vi.mocked(api.listNarrativeItems).mockImplementation(({ resource }) =>
    Promise.resolve({
      ...page([summary(arc), { ...summary(arc), id: 'arc2', title: 'Outro arco' }]),
      sequence: { resource, structureRevision: 7, rankSlot: 'A', rebalancing: false },
    }),
  );
  mount('/books/book?narrativeArc=arc');
  await click('Mover');
  await choose('Item vizinho', 'Outro arco');
  await click('Salvar');
  vi.mocked(api.getNarrativeItem).mockResolvedValue({ ...arc, revision: 4 });
  await click('Comparar com dados atuais');
  await choose('Item vizinho', 'Outro arco');
  await click('Salvar');
  await waitFor(() =>
    expect(api.moveNarrativeItem).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        expectedStructureRevision: 7,
        beforeId: 'arc2',
      }),
    ),
  );
});
it('move carrega vizinhos adicionais e retry incerto mantém a posição e CAS observados', async () => {
  vi.mocked(api.moveNarrativeItem).mockRejectedValueOnce(transport());
  vi.mocked(api.listNarrativeItems).mockImplementation(({ resource, cursor }) =>
    Promise.resolve(
      resource.kind === 'milestone'
        ? page([])
        : {
            ...page(
              cursor
                ? [{ ...summary(arc), id: 'neighbor', title: 'Outra trajetória' }]
                : [summary(arc)],
              cursor ? null : 'more',
            ),
            sequence: { resource, structureRevision: 3, rankSlot: 'A', rebalancing: false },
          },
    ),
  );
  mount('/books/book?narrativeArc=arc');
  await click('Mover');
  await click('Carregar mais posições');
  await choose('Item vizinho', 'Outra trajetória');
  await click('Salvar');
  await screen.findByText(/A resposta não foi confirmada/);
  expect(screen.getByRole('combobox', { name: 'Item vizinho' })).toBeDisabled();
  await click('Tentar novamente');
  await waitFor(() => expect(api.moveNarrativeItem).toHaveBeenCalledTimes(2));
  const original = vi.mocked(api.moveNarrativeItem).mock.calls.at(0)?.[0];
  expect(original).toBeDefined();
  expect(vi.mocked(api.moveNarrativeItem).mock.calls.at(1)?.[0]).toEqual(original);
});
it('exclusão em conflito conserva pedido até comparar revisão da origem', async () => {
  vi.mocked(api.deleteNarrativeItem).mockRejectedValueOnce(conflict());
  mount('/books/book?narrativeArc=arc');
  await click('Excluir');
  await click('Confirmar exclusão');
  vi.mocked(api.getNarrativeItem).mockResolvedValue({ ...arc, revision: 5 });
  await click('Comparar com dados atuais');
  await click('Confirmar exclusão');
  await waitFor(() =>
    expect(api.deleteNarrativeItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 5 }),
    ),
  );
});
it('cancelar movimentação e reorganização não escreve dados', async () => {
  mount('/books/book?narrativeArc=arc');
  await click('Mover');
  await click('Cancelar');
  await click('Reorganizar posições');
  await click('Cancelar');
  expect(api.moveNarrativeItem).not.toHaveBeenCalled();
  expect(api.rebalanceNarrativeRanks).not.toHaveBeenCalled();
});
