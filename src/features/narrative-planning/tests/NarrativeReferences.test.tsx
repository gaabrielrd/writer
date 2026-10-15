import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { listSceneGroups, listScenes, type SceneGroup, type SceneSummary } from '@/features/scenes';
import { NarrativeReferences } from '../components/NarrativeReferences';
import * as api from '../services/narrativePlanningService';
import {
  arc,
  context,
  target,
  page,
  conflict,
  transport,
  deferred,
  summary,
} from './narrativeFixtures';
import type { NarrativeContext, NarrativeMutationResult } from '../model/narrative';
vi.mock('../services/narrativePlanningService');
vi.mock('@/features/scenes', () => ({
  listSceneGroups: vi.fn(),
  listScenes: vi.fn(),
  sceneRoute: (t: typeof target, id: string) =>
    `/${t.kind === 'book' ? 'books' : 'adventures'}/${t.id}/scenes/${id}`,
}));
const group: SceneGroup = {
  id: 'chapter',
  title: 'A última luz',
  kind: 'chapter',
  contentMode: 'scenes',
  assemblyRevision: 1,
  structureRevision: 1,
  wordCount: 1,
  sceneCount: 1,
  rankSlot: 'A',
  order: 1,
  updatedAt: 100,
};
const scene: SceneSummary = {
  id: 'scene',
  ownerId: 'owner',
  schemaVersion: 1,
  revision: 1,
  title: 'Lia chega',
  parentId: 'chapter',
  stage: 'planned',
  archived: false,
  rank: 'U',
  wordCount: 1,
  bodyHash: 'hash',
  bodyBytes: 10,
  createdAt: 100,
  updatedAt: 100,
};
const done = vi.fn();
const open = vi.fn();
function mount(c: NarrativeContext = context) {
  return render(
    <MemoryRouter initialEntries={['/books/book?tab=narrative&narrativeArc=arc']}>
      <NarrativeReferences context={c} item={arc} onChange={done} onOpen={open} />
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
  vi.mocked(api.listNarrativeReferences).mockResolvedValue(page([]));
  vi.mocked(api.listNarrativeItems).mockResolvedValue(
    page([{ ...summary(arc), kind: 'event', id: 'event', title: 'O sino' }]),
  );
  vi.mocked(api.listNarrativeLoreOptions).mockResolvedValue(
    page([
      {
        reference: { kind: 'book', scopeId: 'book', entityId: 'lia' },
        name: 'Lia',
        category: 'character',
      },
    ]),
  );
  vi.mocked(api.setNarrativeReference).mockResolvedValue({
    item: summary(arc),
    projectRevision: 2,
    sceneRevision: 1,
  });
  vi.mocked(api.getNarrativeItem).mockResolvedValue({ ...arc, revision: 4 });
  vi.mocked(listSceneGroups).mockResolvedValue({
    items: [group],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(listScenes).mockResolvedValue({ items: [scene], nextCursor: null, projectRevision: 1 });
});
it('origem disponível abre cena arquivada e evento; indisponível conserva identidade sem nome ou URL', async () => {
  vi.mocked(api.listNarrativeReferences).mockResolvedValue(
    page([
      {
        id: 'scene',
        reference: { kind: 'scene', sceneId: 'scene' },
        available: true,
        label: 'Lia chega',
        archived: true,
      },
      {
        id: 'event',
        reference: { kind: 'event', eventId: 'event' },
        available: true,
        label: 'O sino',
      },
      { id: 'lost', reference: { kind: 'scene', sceneId: 'private' }, available: false },
    ]),
  );
  mount();
  expect(await screen.findByRole('link', { name: 'Abrir cena' })).toHaveAttribute(
    'href',
    '/books/book/scenes/scene',
  );
  expect(screen.getByText('Cena arquivada')).toBeInTheDocument();
  expect(screen.getByText('Referência indisponível')).toBeInTheDocument();
  expect(screen.getAllByRole('link')).toHaveLength(1);
  await click('Abrir evento vinculado');
  expect(open).toHaveBeenCalledWith({ kind: 'event', id: 'event' });
});
it('remover vínculo indisponível envia identidade original e CAS', async () => {
  vi.mocked(api.listNarrativeReferences).mockResolvedValue(
    page([
      {
        id: 'lost',
        reference: {
          kind: 'lore',
          reference: { kind: 'universe', scopeId: 'old-world', entityId: 'lia' },
        },
        available: false,
      },
    ]),
  );
  mount();
  await click('Remover referência indisponível');
  await click('Salvar');
  await waitFor(() =>
    expect(api.setNarrativeReference).toHaveBeenCalledWith(
      expect.objectContaining({
        target,
        source: { kind: 'arc', id: 'arc' },
        expectedRevision: 1,
        reference: {
          kind: 'lore',
          reference: { kind: 'universe', scopeId: 'old-world', entityId: 'lia' },
        },
        remove: true,
      }),
    ),
  );
  expect(done).toHaveBeenCalled();
});
it('picker cena usa resumo, agrupador e arquivo sem buscar prosa', async () => {
  mount();
  await click('Vincular referência');
  await choose('Capítulo', 'A última luz');
  await choose('Disponibilidade da cena', 'Arquivadas');
  await choose('Cena', 'Lia chega');
  await click('Selecionar cena');
  await click('Salvar');
  await waitFor(() =>
    expect(api.setNarrativeReference).toHaveBeenCalledWith(
      expect.objectContaining({ reference: { kind: 'scene', sceneId: 'scene' } }),
    ),
  );
  expect(listScenes).toHaveBeenLastCalledWith({
    target,
    parentId: 'chapter',
    archived: true,
    cursor: null,
    limit: 25,
  });
});
it('aventura oferece partes e cenas sem agrupador', async () => {
  mount({ ...context, target: { kind: 'adventure', id: 'adventure' } });
  await click('Vincular referência');
  expect(screen.getByRole('combobox', { name: 'Parte' })).toBeInTheDocument();
  expect(listScenes).toHaveBeenCalledWith({
    target: { kind: 'adventure', id: 'adventure' },
    parentId: null,
    archived: false,
    cursor: null,
    limit: 25,
  });
  await click('Fechar');
});
it('picker evento cria vínculo com evento existente sem copiar descrição', async () => {
  mount();
  await click('Vincular referência');
  await choose('Tipo de referência', 'Evento');
  await choose('Evento', 'O sino');
  await click('Selecionar evento');
  await click('Salvar');
  await waitFor(() =>
    expect(api.setNarrativeReference).toHaveBeenCalledWith(
      expect.objectContaining({ reference: { kind: 'event', eventId: 'event' } }),
    ),
  );
});
it('picker lore preserva escopo/identidade explícita', async () => {
  mount();
  await click('Vincular referência');
  await choose('Tipo de referência', 'Entidade de lore');
  await choose('Entidade', 'Lia');
  await click('Selecionar entidade');
  await click('Salvar');
  await waitFor(() =>
    expect(api.setNarrativeReference).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: { kind: 'lore', reference: { kind: 'book', scopeId: 'book', entityId: 'lia' } },
      }),
    ),
  );
  expect(api.listNarrativeLoreOptions).toHaveBeenCalledWith({
    target,
    scope: 'book',
    cursor: null,
    limit: 25,
  });
});
it('universo atualmente vinculado é selecionado por escopo, não nome igual', async () => {
  vi.mocked(api.listNarrativeLoreOptions).mockImplementation((input) =>
    Promise.resolve(
      page([
        {
          reference: {
            kind: input.scope,
            scopeId: input.scope === 'book' ? 'book' : 'world',
            entityId: 'lia',
          },
          name: 'Lia',
          category: 'character',
        },
      ]),
    ),
  );
  mount({ ...context, universeId: 'world' });
  await click('Vincular referência');
  await choose('Tipo de referência', 'Entidade de lore');
  await choose('Origem da entidade', 'Universo');
  await choose('Entidade', 'Lia');
  await click('Selecionar entidade');
  await click('Salvar');
  await waitFor(() =>
    expect(api.setNarrativeReference).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: {
          kind: 'lore',
          reference: { kind: 'universe', scopeId: 'world', entityId: 'lia' },
        },
      }),
    ),
  );
});
it('aventura sem universo não consulta lore inexistente nem impede cenas/eventos', async () => {
  mount({ ...context, target: { kind: 'adventure', id: 'adventure' } });
  await click('Vincular referência');
  await choose('Tipo de referência', 'Entidade de lore');
  await screen.findByText(/Vincule um universo à aventura/);
  expect(api.listNarrativeLoreOptions).not.toHaveBeenCalled();
  await choose('Tipo de referência', 'Evento');
  await screen.findByRole('combobox', { name: 'Evento' });
});
it('referências adicionais preservam resultados e exibem erro parcial', async () => {
  vi.mocked(api.listNarrativeReferences)
    .mockResolvedValueOnce(
      page(
        [
          {
            id: 'first',
            reference: { kind: 'scene', sceneId: 'scene' },
            available: true,
            label: 'Lia chega',
          },
        ],
        'refs-next',
      ),
    )
    .mockRejectedValueOnce(transport())
    .mockResolvedValueOnce(
      page([
        {
          id: 'second',
          reference: { kind: 'event', eventId: 'event' },
          available: true,
          label: 'O sino',
        },
      ]),
    );
  mount();
  await click('Carregar mais referências');
  expect(screen.getByText('Lia chega')).toBeInTheDocument();
  await click('Tentar novamente');
  await screen.findByText('O sino');
  expect(api.listNarrativeReferences).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: 'refs-next' }),
  );
});
it('paginação de seletor de entidades usa cursor opaco e não carrega fichas completas', async () => {
  vi.mocked(api.listNarrativeLoreOptions)
    .mockResolvedValueOnce(page([], 'lore-next'))
    .mockResolvedValueOnce(
      page([
        {
          reference: { kind: 'book', scopeId: 'book', entityId: 'mara' },
          name: 'Mara',
          category: 'character',
        },
      ]),
    );
  mount();
  await click('Vincular referência');
  await choose('Tipo de referência', 'Entidade de lore');
  await click('Carregar mais entidades');
  await choose('Entidade', 'Mara');
  await click('Selecionar entidade');
  expect(api.listNarrativeLoreOptions).toHaveBeenLastCalledWith({
    target,
    scope: 'book',
    cursor: 'lore-next',
    limit: 25,
  });
});
it('paginação de grupos e cenas conserva seleção válida', async () => {
  vi.mocked(listSceneGroups)
    .mockResolvedValueOnce({ items: [], nextCursor: 'groups-next', projectRevision: 1 })
    .mockResolvedValueOnce({ items: [group], nextCursor: null, projectRevision: 1 });
  vi.mocked(listScenes).mockImplementation((input) =>
    Promise.resolve(
      input.cursor
        ? {
            items: [{ ...scene, id: 'scene2', title: 'A torre' }],
            nextCursor: null,
            projectRevision: 1,
          }
        : { items: [scene], nextCursor: 'scene-next', projectRevision: 1 },
    ),
  );
  mount();
  await click('Vincular referência');
  await click('Carregar mais agrupadores');
  await choose('Capítulo', 'A última luz');
  await click('Carregar mais cenas');
  await choose('Cena', 'A torre');
  await click('Selecionar cena');
  await click('Salvar');
  await waitFor(() =>
    expect(api.setNarrativeReference).toHaveBeenCalledWith(
      expect.objectContaining({ reference: { kind: 'scene', sceneId: 'scene2' } }),
    ),
  );
});
it('paginação de eventos preserva identidade original e operação incerta', async () => {
  vi.mocked(api.listNarrativeItems)
    .mockResolvedValueOnce(page([], 'events-next'))
    .mockResolvedValueOnce(
      page([{ ...summary(arc), kind: 'event', id: 'event', title: 'O sino' }]),
    );
  vi.mocked(api.setNarrativeReference).mockRejectedValueOnce(transport());
  mount();
  await click('Vincular referência');
  await choose('Tipo de referência', 'Evento');
  await click('Carregar mais eventos');
  await choose('Evento', 'O sino');
  await click('Selecionar evento');
  await click('Salvar');
  await screen.findByText(/A resposta não foi confirmada/);
  await click('Tentar novamente');
  await waitFor(() => expect(api.setNarrativeReference).toHaveBeenCalledTimes(2));
  const first = vi.mocked(api.setNarrativeReference).mock.calls.at(0)?.[0];
  expect(first).toBeDefined();
  expect(vi.mocked(api.setNarrativeReference).mock.calls.at(1)?.[0]).toEqual(first);
});
it('conflito em vínculo compara revisão do item sem substituir referência escolhida', async () => {
  vi.mocked(api.setNarrativeReference).mockRejectedValueOnce(conflict());
  mount();
  await click('Vincular referência');
  await choose('Cena', 'Lia chega');
  await click('Selecionar cena');
  await click('Salvar');
  await click('Comparar com dados atuais');
  await click('Salvar');
  await waitFor(() =>
    expect(api.setNarrativeReference).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        reference: { kind: 'scene', sceneId: 'scene' },
      }),
    ),
  );
});
it('erro do picker impede confirmar seleção até resolver página', async () => {
  vi.mocked(listScenes).mockRejectedValueOnce(new Error('Cenas indisponíveis'));
  mount();
  await click('Vincular referência');
  await screen.findByText('Cenas indisponíveis');
  expect(screen.getByRole('button', { name: 'Selecionar cena' })).toBeDisabled();
  await click('Tentar novamente');
  await choose('Cena', 'Lia chega');
  expect(screen.getByRole('button', { name: 'Selecionar cena' })).toBeEnabled();
});
it('vínculo em andamento não notifica alteração depois de desmontar', async () => {
  const pending = deferred<NarrativeMutationResult>();
  vi.mocked(api.setNarrativeReference).mockReturnValue(pending.promise);
  const mounted = mount();
  await click('Vincular referência');
  await choose('Cena', 'Lia chega');
  await click('Selecionar cena');
  await click('Salvar');
  mounted.unmount();
  await act(async () => {
    pending.resolve({ item: summary(arc), projectRevision: 2, sceneRevision: 1 });
    await pending.promise;
  });
  expect(done).not.toHaveBeenCalled();
});
