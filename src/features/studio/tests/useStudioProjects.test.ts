import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { listStudioBooks, prepareStudioBooks, type StudioBookSummary } from '@/features/books';
import { listAdventures, type AdventureSummary } from '@/features/adventures';
import { listCampaigns, type CampaignSummary } from '@/features/campaigns';
import { useStudioProjects } from '../hooks/useStudioProjects';
import type { StudioProjectKind } from '../model/project';

const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/books', () => ({ listStudioBooks: vi.fn(), prepareStudioBooks: vi.fn() }));
vi.mock('@/features/adventures', () => ({ listAdventures: vi.fn() }));
vi.mock('@/features/campaigns', () => ({ listCampaigns: vi.fn() }));

const adventure: AdventureSummary = {
  id: 'adventure',
  kind: 'adventure',
  title: 'Aventura privada',
  status: 'ready',
  editorialState: 'draft',
  revision: 1,
  universeId: null,
  createdAt: 1,
  updatedAt: 2,
};
const book: StudioBookSummary = {
  ...adventure,
  id: 'book',
  kind: 'book',
  title: 'Livro privado',
  status: 'draft',
  coverUrl: null,
  wordCount: 0,
};
const campaign: CampaignSummary = {
  ...adventure,
  id: 'campaign',
  kind: 'campaign',
  title: 'Campanha privada',
  status: 'planning',
};
type AdventurePage = Awaited<ReturnType<typeof listAdventures>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
beforeEach(() => {
  auth.user = { uid: 'owner' };
  vi.mocked(prepareStudioBooks).mockReset().mockResolvedValue({ complete: true, processed: 0 });
  vi.mocked(listStudioBooks)
    .mockReset()
    .mockResolvedValue({ items: [book], nextCursor: null });
  vi.mocked(listAdventures)
    .mockReset()
    .mockResolvedValue({ items: [adventure], nextCursor: null });
  vi.mocked(listCampaigns)
    .mockReset()
    .mockResolvedValue({ items: [campaign], nextCursor: null });
});

it.each<StudioProjectKind>(['book', 'adventure', 'campaign'])(
  'mantém payload sem filtro editorial para todos os estados em %s',
  async (kind) => {
    const { result } = renderHook(() => useStudioProjects(kind, 'all'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const service =
      kind === 'book' ? listStudioBooks : kind === 'adventure' ? listAdventures : listCampaigns;
    expect(service).toHaveBeenLastCalledWith({ status: 'all', cursor: null, limit: 25 });
  },
);
it.each(['book', 'adventure'] as const)(
  'combina estado editorial e condição do domínio sem reinterpretar status em %s',
  async (kind) => {
    const status = kind === 'book' ? 'published' : 'archived';
    const { result } = renderHook(() => useStudioProjects(kind, status, 'review'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(kind === 'book' ? listStudioBooks : listAdventures).toHaveBeenLastCalledWith({
      status,
      editorialState: 'review',
      cursor: null,
      limit: 25,
    });
  },
);
it('nunca envia filtro editorial para campanhas', async () => {
  const { result } = renderHook(() => useStudioProjects('campaign', 'planning', 'ready'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(listCampaigns).toHaveBeenLastCalledWith({ status: 'planning', cursor: null, limit: 25 });
});
it('segue janelas iniciais vazias em carregamento até encontrar o estado solicitado', async () => {
  const final = deferred<AdventurePage>();
  vi.mocked(listAdventures)
    .mockResolvedValueOnce({ items: [], nextCursor: 'window-2' })
    .mockResolvedValueOnce({ items: [], nextCursor: 'window-3' })
    .mockReturnValueOnce(final.promise);
  const { result } = renderHook(() => useStudioProjects('adventure', 'all', 'draft'));
  await waitFor(() => expect(listAdventures).toHaveBeenCalledTimes(3));
  expect(result.current.loading).toBe(true);
  expect(result.current.result?.items).toBeUndefined();
  await act(async () => {
    final.resolve({ items: [adventure], nextCursor: 'window-4' });
    await Promise.resolve();
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.result?.items).toEqual([adventure]);
  expect(result.current.result?.nextCursor).toBe('window-4');
  expect(listAdventures).toHaveBeenLastCalledWith({
    status: 'all',
    editorialState: 'draft',
    cursor: 'window-3',
    limit: 25,
  });
});
it('confirma vazio somente ao esgotar todas as janelas filtradas', async () => {
  vi.mocked(listAdventures)
    .mockResolvedValueOnce({ items: [], nextCursor: 'window-2' })
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  const { result } = renderHook(() => useStudioProjects('adventure', 'all', 'ready'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(listAdventures).toHaveBeenCalledTimes(2);
  expect(result.current.result).toMatchObject({ items: [], nextCursor: null });
});
it('segue janelas em carregar mais, preserva itens e cursor em erro e deduplica no retry', async () => {
  vi.mocked(listAdventures)
    .mockResolvedValueOnce({ items: [adventure], nextCursor: 'window-2' })
    .mockResolvedValueOnce({ items: [], nextCursor: 'window-3' })
    .mockRejectedValueOnce(new Error('Falha na continuação'))
    .mockResolvedValueOnce({ items: [], nextCursor: 'window-3' })
    .mockResolvedValueOnce({ items: [adventure, { ...adventure, id: 'other' }], nextCursor: null });
  const { result } = renderHook(() => useStudioProjects('adventure', 'all', 'draft'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.loadMore());
  expect(result.current.result).toMatchObject({
    items: [adventure],
    nextCursor: 'window-2',
    moreError: 'Falha na continuação',
    loadingMore: false,
  });
  await act(() => result.current.loadMore());
  expect(result.current.result?.items.map((item) => item.id)).toEqual(['adventure', 'other']);
  expect(result.current.result?.nextCursor).toBeNull();
  expect(result.current.result?.moreError).toBeUndefined();
  expect(listAdventures).toHaveBeenNthCalledWith(4, {
    status: 'all',
    editorialState: 'draft',
    cursor: 'window-2',
    limit: 25,
  });
});
it.each(['filter', 'account', 'unmount'] as const)(
  'cancela continuação inicial vazia sem consultar outra janela após mudança de %s',
  async (change) => {
    const old = deferred<AdventurePage>();
    vi.mocked(listAdventures)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ items: [], nextCursor: null });
    const view = renderHook(
      ({ state }: { state: 'draft' | 'review' }) => useStudioProjects('adventure', 'all', state),
      { initialProps: { state: 'draft' } },
    );
    await waitFor(() => expect(listAdventures).toHaveBeenCalledTimes(1));
    if (change === 'account') auth.user = { uid: 'other-owner' };
    if (change === 'unmount') view.unmount();
    else view.rerender({ state: change === 'filter' ? 'review' : 'draft' });
    await act(async () => {
      old.resolve({ items: [], nextCursor: 'private-old-cursor' });
      await Promise.resolve();
    });
    const inputs = vi.mocked(listAdventures).mock.calls.map(([input]) => input);
    expect(inputs.some((input) => input?.cursor === 'private-old-cursor')).toBe(false);
    if (change !== 'unmount') {
      await waitFor(() => expect(view.result.current.loading).toBe(false));
      expect(view.result.current.result?.items).toEqual([]);
    }
  },
);
it('não expõe nem continua página tardia de carregar mais após mudar o filtro editorial', async () => {
  const old = deferred<AdventurePage>();
  vi.mocked(listAdventures)
    .mockResolvedValueOnce({ items: [adventure], nextCursor: 'old-page' })
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue({ items: [], nextCursor: null });
  const view = renderHook(
    ({ state }: { state: 'draft' | 'review' }) => useStudioProjects('adventure', 'all', state),
    { initialProps: { state: 'draft' } },
  );
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  let pending!: Promise<void>;
  act(() => {
    pending = view.result.current.loadMore();
  });
  expect(view.result.current.result?.loadingMore).toBe(true);
  view.rerender({ state: 'review' });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(async () => {
    old.resolve({ items: [], nextCursor: 'old-private-next' });
    await pending;
  });
  expect(view.result.current.result?.items).toEqual([]);
  expect(
    vi.mocked(listAdventures).mock.calls.some(([input]) => input?.cursor === 'old-private-next'),
  ).toBe(false);
});
it('não inicia leitura sem conta e interrompe preparação de livros ao sair', async () => {
  auth.user = null;
  const preparation = deferred<{ complete: boolean; processed: number }>();
  vi.mocked(prepareStudioBooks).mockReturnValueOnce(preparation.promise);
  const view = renderHook(() => useStudioProjects('book', 'all', 'draft'));
  expect(prepareStudioBooks).not.toHaveBeenCalled();
  auth.user = { uid: 'owner' };
  view.rerender();
  await waitFor(() => expect(prepareStudioBooks).toHaveBeenCalledTimes(1));
  auth.user = null;
  view.rerender();
  await act(async () => {
    preparation.resolve({ complete: false, processed: 25 });
    await Promise.resolve();
  });
  expect(prepareStudioBooks).toHaveBeenCalledTimes(1);
  expect(listStudioBooks).not.toHaveBeenCalled();
});
it('apresenta erro recuperável se o servidor repetir uma janela sem avançar', async () => {
  vi.mocked(listAdventures).mockResolvedValue({ items: [], nextCursor: 'repeated' });
  const { result } = renderHook(() => useStudioProjects('adventure', 'all', 'draft'));
  await waitFor(() => expect(result.current.result?.error).toContain('Não foi possível avançar'));
  expect(listAdventures).toHaveBeenCalledTimes(2);
  expect(result.current.loading).toBe(false);
});
