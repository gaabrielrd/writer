import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useNarrativePage } from '../hooks/useNarrativePage';
import { useNarrativeResource } from '../hooks/useNarrativeResource';
import { conflict, deferred, page } from './narrativeFixtures';
it('pagina por cursor e conserva resultados quando a página seguinte falha', async () => {
  const loader = vi
    .fn()
    .mockResolvedValueOnce(page([{ id: 'a' }], 'next'))
    .mockRejectedValueOnce(new Error('Falha de rede'))
    .mockResolvedValueOnce(page([{ id: 'a' }, { id: 'b' }]));
  const { result } = renderHook(() =>
    useNarrativePage<{ id: string }>('items', loader, (item) => item.id),
  );
  await waitFor(() => expect(result.current.items).toEqual([{ id: 'a' }]));
  await act(() => result.current.more());
  expect(result.current.error).toBe('Falha de rede');
  expect(result.current.items).toEqual([{ id: 'a' }]);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items).toEqual([{ id: 'a' }, { id: 'b' }]));
  expect(loader).toHaveBeenLastCalledWith('next');
});
it('cursor invalidado atualiza da primeira página sem conservar ordem velha', async () => {
  const loader = vi
    .fn()
    .mockResolvedValueOnce(page([{ id: 'a' }], 'next'))
    .mockRejectedValueOnce(conflict())
    .mockResolvedValueOnce(page([{ id: 'b' }]));
  const { result } = renderHook(() =>
    useNarrativePage<{ id: string }>('items', loader, (item) => item.id),
  );
  await waitFor(() => expect(result.current.cursor).toBe('next'));
  await act(() => result.current.more());
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items).toEqual([{ id: 'b' }]));
  expect(loader).toHaveBeenLastCalledWith(null);
});
it('resposta antiga de recurso ou página não atravessa troca de alvo', async () => {
  const old = deferred<ReturnType<typeof page<{ id: string }>>>();
  const loader = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue(page([{ id: 'new' }]));
  const { result, rerender } = renderHook(
    ({ key }) => useNarrativePage<{ id: string }>(key, loader, (item) => item.id),
    { initialProps: { key: 'old' } },
  );
  rerender({ key: 'new' });
  expect(result.current.items).toEqual([]);
  await waitFor(() => expect(result.current.items).toEqual([{ id: 'new' }]));
  await act(async () => {
    old.resolve(page([{ id: 'private-old' }]));
    await old.promise;
  });
  expect(result.current.items).toEqual([{ id: 'new' }]);
});
it('erro inicial anuncia falha e retry inicia nova consulta', async () => {
  const loader = vi
    .fn()
    .mockRejectedValueOnce(null)
    .mockResolvedValueOnce(page([{ id: 'ready' }]));
  const { result } = renderHook(() =>
    useNarrativePage<{ id: string }>('items', loader, (item) => item.id),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toContain('Não foi possível');
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.items).toEqual([{ id: 'ready' }]));
  await act(() => result.current.more());
  expect(loader).toHaveBeenCalledTimes(2);
});
it('bloqueia pedido duplicado e ignora página pendente depois de mudar contexto', async () => {
  const pending = deferred<ReturnType<typeof page<{ id: string }>>>();
  const loader = vi
    .fn()
    .mockResolvedValueOnce(page([{ id: 'a' }], 'next'))
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(page([{ id: 'b' }]));
  const { result, rerender } = renderHook(
    ({ key }) => useNarrativePage<{ id: string }>(key, loader, (item) => item.id),
    { initialProps: { key: 'first' } },
  );
  await waitFor(() => expect(result.current.cursor).toBe('next'));
  let running: Promise<void>;
  act(() => {
    running = result.current.more();
  });
  await act(() => result.current.more());
  expect(loader).toHaveBeenCalledTimes(2);
  rerender({ key: 'second' });
  await waitFor(() => expect(result.current.items).toEqual([{ id: 'b' }]));
  await act(async () => {
    pending.resolve(page([{ id: 'old' }]));
    await running;
  });
  expect(result.current.items).toEqual([{ id: 'b' }]);
});
it('recurso cobre erro, retry, troca de identidade e resposta antiga', async () => {
  const old = deferred<string>();
  const loader = vi
    .fn()
    .mockRejectedValueOnce(new Error('Indisponível'))
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce('novo');
  const { result, rerender } = renderHook(({ key }) => useNarrativeResource(key, loader), {
    initialProps: { key: 'old' },
  });
  await waitFor(() => expect(result.current.error).toBe('Indisponível'));
  act(() => result.current.retry());
  rerender({ key: 'new' });
  await waitFor(() => expect(result.current.value).toBe('novo'));
  await act(async () => {
    old.resolve('segredo antigo');
    await old.promise;
  });
  expect(result.current.value).toBe('novo');
});
