import { chooseDropdown } from '@/test/dropdown';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { UniversePage } from '../components/UniversePage';
import { UniverseLorePage } from '../components/UniverseLorePage';
import { UniverseSelect } from '../components/UniverseSelect';
import * as service from '../services/universeService';
import * as lore from '@/features/lore';
import type { Universe } from '../model/universe';
import type { LoreEntity } from '@/features/lore';

const auth = vi.hoisted((): { user: { uid: string } | null; loading: boolean } => ({
  user: { uid: 'author' },
  loading: false,
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/universeService', () => ({
  listUniverses: vi.fn(),
  getUniverse: vi.fn(),
  createUniverse: vi.fn(),
  updateUniverse: vi.fn(),
  deleteUniverse: vi.fn(),
}));
vi.mock('@/features/lore/services/loreService', () => ({
  listLoreEntities: vi.fn(),
  subscribeLoreEntities: vi.fn(),
  createLoreEntity: vi.fn(),
  updateLoreEntity: vi.fn(),
  deleteLoreEntity: vi.fn(),
}));
const world: Universe = {
  id: 'world',
  authorId: 'author',
  name: 'Atlas',
  description: 'Um mundo',
  bookCount: 0,
  privacyVersion: 0,
  loreVersion: 0,
  createdAt: 1,
  updatedAt: 1,
};
const global: LoreEntity = {
  id: 'universe:world:arthur',
  universeId: 'world',
  name: 'Arthur',
  aliases: [],
  category: 'character',
  summary: 'O rei',
  details: '',
  relations: [],
  isPublic: true,
  createdAt: 1,
  updatedAt: 1,
};
const stop = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { uid: 'author' };
  auth.loading = false;
  vi.mocked(service.listUniverses).mockResolvedValue([world]);
  vi.mocked(service.getUniverse).mockResolvedValue(world);
  vi.mocked(service.createUniverse).mockResolvedValue(world);
  vi.mocked(service.updateUniverse).mockResolvedValue(world);
  vi.mocked(service.deleteUniverse).mockResolvedValue(undefined);
  vi.mocked(lore.subscribeLoreEntities).mockImplementation((_scope, changed) => {
    changed([]);
    return stop;
  });
  vi.mocked(lore.listLoreEntities).mockResolvedValue([]);
  vi.mocked(lore.createLoreEntity).mockResolvedValue(global);
  vi.mocked(lore.updateLoreEntity).mockResolvedValue(undefined);
  vi.mocked(lore.deleteLoreEntity).mockResolvedValue(undefined);
});
function page(path = '/universes') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/universes" element={<UniversePage />} />
        <Route path="/universes/:universeId/lore" element={<UniverseLorePage />} />
        <Route path="/login" element={<p>Entrar</p>} />
        <Route path="/" element={<p>Meus Livros</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
it('carrega a lista e abre o lore do universo selecionado', async () => {
  page();
  expect(screen.getByText('Carregando universos...')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'Abrir lore' }));
  expect(await screen.findByRole('heading', { name: 'Atlas' })).toBeInTheDocument();
  expect(await screen.findByText('Nenhuma entidade cadastrada')).toBeInTheDocument();
  expect(lore.subscribeLoreEntities).toHaveBeenCalledWith(
    { kind: 'universe', id: 'world' },
    expect.any(Function),
    expect.any(Function),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Voltar aos universos' }));
  expect(await screen.findByRole('heading', { name: 'Lore compartilhado' })).toBeInTheDocument();
});
it('cria o primeiro universo preservando os dados e o ID após falha', async () => {
  vi.mocked(service.listUniverses).mockResolvedValue([]);
  vi.mocked(service.createUniverse)
    .mockRejectedValueOnce(new Error('Sem conexão'))
    .mockResolvedValue(world);
  const user = userEvent.setup();
  page();
  await user.click(await screen.findByRole('button', { name: 'Criar primeiro universo' }));
  expect(screen.getByRole('button', { name: 'Salvar universo' })).toBeDisabled();
  await user.type(screen.getByLabelText('Nome do universo'), 'Atlas');
  await user.type(screen.getByLabelText('Descrição do universo'), 'Um mundo');
  await user.click(screen.getByRole('button', { name: 'Salvar universo' }));
  expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
  expect(screen.getByLabelText('Nome do universo')).toHaveValue('Atlas');
  await user.click(screen.getByRole('button', { name: 'Salvar universo' }));
  expect(vi.mocked(service.createUniverse).mock.calls[0]).toEqual(
    vi.mocked(service.createUniverse).mock.calls[1],
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('edita um universo e permite cancelar sem persistir', async () => {
  const user = userEvent.setup();
  page();
  await user.click(await screen.findByRole('button', { name: 'Editar universo' }));
  expect(screen.getByLabelText('Nome do universo')).toHaveValue('Atlas');
  await user.clear(screen.getByLabelText('Nome do universo'));
  await user.type(screen.getByLabelText('Nome do universo'), 'Atlas II');
  await user.click(screen.getByRole('button', { name: 'Salvar universo' }));
  await waitFor(() =>
    expect(service.updateUniverse).toHaveBeenCalledWith('world', {
      name: 'Atlas II',
      description: 'Um mundo',
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await user.click(await screen.findByRole('button', { name: 'Novo universo' }));
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(service.createUniverse).not.toHaveBeenCalled();
});
it('impede excluir universos vinculados e indica como desvincular', async () => {
  vi.mocked(service.listUniverses).mockResolvedValue([{ ...world, bookCount: 2 }]);
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir universo' }));
  expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Abrir Meus Livros' })).toHaveAttribute('href', '/');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(service.deleteUniverse).not.toHaveBeenCalled();
});
it('retoma uma exclusão incompleta e mantém erro disponível para retry', async () => {
  vi.mocked(service.listUniverses).mockResolvedValue([{ ...world, deleting: true }]);
  vi.mocked(service.deleteUniverse)
    .mockRejectedValueOnce(new Error('Falha na limpeza'))
    .mockResolvedValue(undefined);
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir universo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  expect(await screen.findByText('Falha na limpeza')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(service.deleteUniverse).toHaveBeenCalledTimes(2);
});
it('recupera falhas na lista sem confundir conta e conteúdo antigos', async () => {
  vi.mocked(service.listUniverses)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue([world]);
  page();
  await userEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('heading', { name: 'Atlas' })).toBeInTheDocument();
});
it('mostra sessão carregando e redireciona visitantes para login', () => {
  auth.loading = true;
  const view = page();
  expect(screen.getByText('Carregando sessão...')).toBeInTheDocument();
  auth.loading = false;
  auth.user = null;
  view.rerender(
    <MemoryRouter>
      <UniversePage />
    </MemoryRouter>,
  );
  expect(screen.queryByText('Atlas')).not.toBeInTheDocument();
});
it('recusa universo de outro autor e permite tentar abrir novamente', async () => {
  vi.mocked(service.getUniverse)
    .mockResolvedValueOnce({ ...world, authorId: 'other' })
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(world);
  page('/universes/world/lore');
  expect(await screen.findByText('Universo indisponível.')).toBeInTheDocument();
  expect(lore.subscribeLoreEntities).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Offline')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('heading', { name: 'Atlas' })).toBeInTheDocument();
});
it('cria, edita e exclui entidades globais através das etapas', async () => {
  page('/universes/world/lore');
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Nova Entidade' }));
  await user.type(screen.getByLabelText('Nome da Entidade'), 'Arthur');
  await user.type(screen.getByLabelText(/Resumo Curto/), 'O rei');
  for (let step = 0; step < 3; step++)
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
  await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));
  expect(await screen.findByRole('heading', { name: 'Arthur' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Editar Arthur/ }));
  for (let step = 0; step < 3; step++)
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
  await user.click(screen.getByLabelText(/Tornar visível/));
  expect(screen.getByText(/As publicações dos livros deste universo/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  await waitFor(() =>
    expect(lore.updateLoreEntity).toHaveBeenCalledWith(
      { kind: 'universe', id: 'world' },
      global.id,
      expect.objectContaining({ isPublic: false }),
    ),
  );
  await user.click(screen.getByRole('button', { name: /excluir/i }));
  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
  await waitFor(() =>
    expect(lore.deleteLoreEntity).toHaveBeenCalledWith(
      { kind: 'universe', id: 'world' },
      global.id,
    ),
  );
});
it('seleciona universo, permite remover vínculo indisponível e recupera falha da lista', async () => {
  const changed = vi.fn();
  vi.mocked(service.listUniverses)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue([world]);
  const view = render(<UniverseSelect value={null} onChange={changed} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
  await chooseDropdown(userEvent, await screen.findByLabelText('Universo compartilhado'), 'Atlas');
  expect(changed).toHaveBeenLastCalledWith('world');
  view.rerender(<UniverseSelect value="missing" onChange={changed} />);
  expect(screen.getByText(/Universo indisponível/)).toBeInTheDocument();
  await chooseDropdown(userEvent, screen.getByLabelText('Universo compartilhado'), 'Sem universo');
  expect(changed).toHaveBeenLastCalledWith(null);
});
it('descarta resposta atrasada de outra conta e esconde diálogo aberto', async () => {
  let finish!: (worlds: Universe[]) => void;
  vi.mocked(service.listUniverses).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = page();
  auth.user = { uid: 'other' };
  vi.mocked(service.listUniverses).mockResolvedValue([]);
  view.rerender(
    <MemoryRouter>
      <UniversePage />
    </MemoryRouter>,
  );
  act(() => {
    finish([world]);
  });
  expect(await screen.findByText('Nenhum universo cadastrado')).toBeInTheDocument();
  expect(screen.queryByText('Atlas')).not.toBeInTheDocument();
});

it('mantém a ficha aberta em falha de sincronização e retoma a assinatura após retry', async () => {
  let fail!: (cause: unknown) => void;
  vi.mocked(lore.subscribeLoreEntities)
    .mockImplementationOnce((_scope, changed, error) => {
      changed([]);
      fail = error;
      return stop;
    })
    .mockImplementation((_scope, changed) => {
      changed([global]);
      return stop;
    });
  page('/universes/world/lore');
  await userEvent.click(await screen.findByRole('button', { name: 'Nova Entidade' }));
  await userEvent.type(screen.getByLabelText('Nome da Entidade'), 'Ficha preservada');
  act(() => {
    fail(new Error('Sincronização indisponível'));
  });
  expect(screen.getByLabelText('Nome da Entidade')).toHaveValue('Ficha preservada');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('heading', { name: 'Arthur' })).toBeInTheDocument();
  expect(stop).toHaveBeenCalled();
});
