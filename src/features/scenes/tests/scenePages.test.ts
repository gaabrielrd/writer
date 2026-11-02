import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useScenePage } from '../hooks/useScenePage';
import { useSceneResource } from '../hooks/useSceneResource';
import type { ScenePage, SceneSummary } from '../model/scene';
import { deferred, summary } from './sceneFixtures';
it('página usa cursor opaco, deduplica e conserva itens no erro recuperável', async () => {
  const loader = vi
    .fn()
    .mockResolvedValueOnce({ items: [summary], nextCursor: 'next', projectRevision: 1 })
    .mockRejectedValueOnce(new Error('Falha parcial'))
    .mockResolvedValueOnce({
      items: [summary, { ...summary, id: 'second' }],
      nextCursor: null,
      projectRevision: 1,
    });
  const { result } = renderHook(() => useScenePage<SceneSummary>('scope', loader));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.more());
  expect(result.current.items).toHaveLength(1);
  expect(result.current.error).toBe('Falha parcial');
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items).toHaveLength(2));
  expect(loader).toHaveBeenLastCalledWith('next');
});
it('cursor invalidado conserva contexto mas retry reinicia desde primeira página', async () => {
  const loader = vi
    .fn()
    .mockResolvedValueOnce({ items: [summary], nextCursor: 'old', projectRevision: 1 })
    .mockRejectedValueOnce(
      Object.assign(new Error('Ordem mudou'), { details: { reason: 'cursor-invalidated' } }),
    )
    .mockResolvedValueOnce({
      items: [{ ...summary, revision: 2 }],
      nextCursor: null,
      projectRevision: 2,
    });
  const { result } = renderHook(() => useScenePage<SceneSummary>('scope', loader));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.more());
  expect(result.current.invalidCursor).toBe(true);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items.at(0)?.revision).toBe(2));
  expect(loader).toHaveBeenLastCalledWith(null);
});
it('troca de filtro esconde página anterior imediatamente e ignora resposta antiga', async () => {
  const old = deferred<ScenePage<SceneSummary>>();
  const fresh = deferred<ScenePage<SceneSummary>>();
  const loader = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const { result, rerender } = renderHook(({ key }) => useScenePage<SceneSummary>(key, loader), {
    initialProps: { key: 'first' },
  });
  rerender({ key: 'second' });
  expect(result.current.items).toEqual([]);
  expect(result.current.loading).toBe(true);
  await act(async () => {
    old.resolve({ items: [summary], nextCursor: null, projectRevision: 1 });
    await old.promise;
  });
  expect(result.current.items).toEqual([]);
  await act(async () => {
    fresh.resolve({ items: [{ ...summary, id: 'fresh' }], nextCursor: null, projectRevision: 2 });
    await fresh.promise;
  });
  expect(result.current.items.at(0)?.id).toBe('fresh');
});
it('erro inicial permite retry e bloqueia dupla paginação', async () => {
  const wait = deferred<ScenePage<SceneSummary>>();
  const loader = vi
    .fn()
    .mockRejectedValueOnce(new Error('Inicial'))
    .mockResolvedValueOnce({ items: [summary], nextCursor: 'next', projectRevision: 1 })
    .mockReturnValueOnce(wait.promise);
  const { result } = renderHook(() => useScenePage<SceneSummary>('key', loader));
  await waitFor(() => expect(result.current.error).toBe('Inicial'));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.cursor).toBe('next'));
  act(() => {
    void result.current.more();
    void result.current.more();
  });
  expect(loader).toHaveBeenCalledTimes(3);
  await act(async () => {
    wait.resolve({ items: [], nextCursor: null, projectRevision: 1 });
    await wait.promise;
  });
  expect(result.current.items).toHaveLength(1);
});
it('recurso inclui identidade e retry; resposta desmontada não é aplicada', async () => {
  const wait = deferred<string>();
  const loader = vi
    .fn()
    .mockRejectedValueOnce(new Error('Indisponível'))
    .mockReturnValueOnce(wait.promise);
  const { result, unmount } = renderHook(() => useSceneResource('resource', loader));
  await waitFor(() => expect(result.current.error).toBe('Indisponível'));
  act(() => result.current.retry());
  expect(result.current.loading).toBe(true);
  unmount();
  await act(async () => {
    wait.resolve('Privado');
    await wait.promise;
  });
  expect(result.current.value).toBeUndefined();
});
