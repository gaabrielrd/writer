import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { SceneReferences } from '../components/SceneReferences';
import { listLoreEntities, type LoreEntity } from '@/features/lore';
import { getScene, listSceneReferences, setSceneReference } from '../services/sceneService';
import { document, mutation, conflict, deferred } from './sceneFixtures';
vi.mock('@/features/lore', async (original) => ({
  ...(await original<object>()),
  listLoreEntities: vi.fn(),
}));
vi.mock('../services/sceneService', () => ({
  getScene: vi.fn(),
  listSceneReferences: vi.fn(),
  setSceneReference: vi.fn(),
}));
const local: LoreEntity = {
  id: 'lia',
  bookId: 'book',
  name: 'Lia',
  aliases: [],
  category: 'character',
  summary: 'Privado',
  details: '',
  relations: [],
  isPublic: false,
  createdAt: 1,
  updatedAt: 1,
};
const global: LoreEntity = {
  ...local,
  id: 'universe:world:mara',
  bookId: undefined,
  universeId: 'world',
  name: 'Mara',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listLoreEntities).mockResolvedValue([local]);
  vi.mocked(listSceneReferences).mockResolvedValue({
    items: [],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(setSceneReference).mockResolvedValue({
    ...mutation,
    scene: { ...mutation.scene, revision: 2 },
  });
  vi.mocked(getScene).mockResolvedValue({ ...document, revision: 4 });
});
async function choose(value: string) {
  await userEvent
    .setup()
    .click(await screen.findByRole('combobox', { name: 'Lore para vincular' }));
  await userEvent.setup().click(screen.getByRole('option', { name: value }));
}
async function confirm() {
  await userEvent
    .setup()
    .click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar referência' }),
    );
}
it('vincula identidade local e atualiza revisão observada sem incluir corpo', async () => {
  const changed = vi.fn();
  render(<SceneReferences document={document} onRevision={changed} />);
  await choose('Lia · Livro');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Vincular referência' }));
  await confirm();
  await waitFor(() =>
    expect(setSceneReference).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        reference: { kind: 'book', scopeId: 'book', entityId: 'lia' },
        remove: false,
      }),
    ),
  );
  expect(changed).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
});
it('aventura seleciona somente universo autorizado e extrai ID tipado sem comparar nomes', async () => {
  vi.mocked(listLoreEntities).mockResolvedValue([global]);
  render(
    <SceneReferences
      document={{
        ...document,
        project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: 'world' },
      }}
      onRevision={vi.fn()}
    />,
  );
  await choose('Mara · Universo');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Vincular referência' }));
  await confirm();
  await waitFor(() =>
    expect(setSceneReference).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: { kind: 'universe', scopeId: 'world', entityId: 'mara' },
      }),
    ),
  );
  expect(listLoreEntities).toHaveBeenCalledTimes(1);
  expect(listLoreEntities).toHaveBeenCalledWith({ kind: 'universe', id: 'world' });
});
it('indisponível não mostra nome antigo e permite remover identidade guardada', async () => {
  const ref = { kind: 'universe' as const, scopeId: 'revoked', entityId: 'mara' };
  vi.mocked(listSceneReferences).mockResolvedValue({
    items: [{ id: 'ref', reference: ref, available: false, name: 'Nome privado antigo' }],
    nextCursor: null,
    projectRevision: 1,
  });
  render(<SceneReferences document={document} onRevision={vi.fn()} />);
  await screen.findByText('Referência indisponível');
  expect(screen.queryByText('Nome privado antigo')).not.toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Remover referência indisponível' }));
  await confirm();
  await waitFor(() =>
    expect(setSceneReference).toHaveBeenCalledWith(
      expect.objectContaining({ reference: ref, remove: true }),
    ),
  );
});
it('revisão nova do corpo é usada em pedido novo, retry incerto conserva revisão original', async () => {
  const changed = vi.fn();
  const view = render(<SceneReferences document={document} onRevision={changed} />);
  await choose('Lia · Livro');
  view.rerender(<SceneReferences document={{ ...document, revision: 5 }} onRevision={changed} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Vincular referência' }));
  vi.mocked(setSceneReference).mockRejectedValueOnce(
    Object.assign(new Error('Não confirmado'), { code: 'functions/unavailable' }),
  );
  await confirm();
  await screen.findByText('Não confirmado');
  view.rerender(<SceneReferences document={{ ...document, revision: 8 }} onRevision={changed} />);
  const first = vi.mocked(setSceneReference).mock.calls.at(0)?.[0];
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(setSceneReference).toHaveBeenCalledTimes(2));
  expect(first?.expectedRevision).toBe(5);
  expect(vi.mocked(setSceneReference).mock.calls.at(1)?.[0]).toEqual(first);
});
it('conflito exige obter revisão atual antes de vínculo novo', async () => {
  vi.mocked(setSceneReference).mockRejectedValueOnce(conflict());
  render(<SceneReferences document={document} onRevision={vi.fn()} />);
  await choose('Lia · Livro');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Vincular referência' }));
  await confirm();
  await screen.findByText('A revisão mudou.');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Comparar com dados atuais' }));
  await waitFor(() => expect(getScene).toHaveBeenCalled());
  await confirm();
  await waitFor(() =>
    expect(setSceneReference).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 4 }),
    ),
  );
});
it('pagina referências e apresenta erro parcial de lore com retry', async () => {
  vi.mocked(listSceneReferences).mockResolvedValueOnce({
    items: [
      {
        id: 'ref',
        reference: { kind: 'book', scopeId: 'book', entityId: 'lia' },
        available: true,
        name: 'Lia',
      },
    ],
    nextCursor: 'more',
    projectRevision: 1,
  });
  vi.mocked(listLoreEntities).mockRejectedValueOnce(new Error('Lore indisponível'));
  render(<SceneReferences document={document} onRevision={vi.fn()} />);
  await screen.findByText('Lore indisponível');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await choose('Lia · Livro');
  await userEvent.setup().keyboard('{Escape}');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Carregar mais referências' }));
  await waitFor(() =>
    expect(listSceneReferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'more' }),
    ),
  );
});
it('sem universo em aventura informa próximo passo e não busca livro auxiliar', async () => {
  render(
    <SceneReferences
      document={{
        ...document,
        project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: null },
      }}
      onRevision={vi.fn()}
    />,
  );
  await screen.findByText('Vincule um universo à aventura para selecionar seu lore.');
  expect(listLoreEntities).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Vincular referência' })).toBeDisabled();
});
it('troca de escopo não conserva nomes antigos enquanto resposta nova está pendente', async () => {
  const next = deferred<LoreEntity[]>();
  vi.mocked(listLoreEntities).mockResolvedValueOnce([global]).mockReturnValueOnce(next.promise);
  const doc = {
    ...document,
    project: { ...document.project, kind: 'adventure' as const, universeId: 'world' },
  };
  const view = render(<SceneReferences document={doc} onRevision={vi.fn()} />);
  await choose('Mara · Universo');
  await userEvent.setup().keyboard('{Escape}');
  view.rerender(
    <SceneReferences
      document={{ ...doc, project: { ...doc.project, universeId: 'other' } }}
      onRevision={vi.fn()}
    />,
  );
  expect(screen.getByText('Carregando lore autorizado…')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Lore para vincular' })).not.toBeInTheDocument();
  view.unmount();
  await act(async () => {
    next.resolve([]);
    await next.promise;
  });
});

it('resposta de vínculo após desmontagem não atualiza o pai de outra sessão', async () => {
  const pending = deferred<typeof mutation>();
  vi.mocked(setSceneReference).mockReturnValueOnce(pending.promise);
  const changed = vi.fn();
  const view = render(<SceneReferences document={document} onRevision={changed} />);
  await choose('Lia · Livro');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Vincular referência' }));
  await confirm();
  view.unmount();
  await act(async () => {
    pending.resolve(mutation);
    await pending.promise;
  });
  expect(changed).not.toHaveBeenCalled();
});
