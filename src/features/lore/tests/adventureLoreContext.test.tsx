import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { publishInvalidation } from '@/shared/services';
import * as api from '../services/adventureLoreCallables';
import { useAdventureLoreContext } from '../hooks/useAdventureLoreContext';
import { useAdventureLoreCollection } from '../hooks/useAdventureLoreCollection';
import type {
  AdventureLoreGet,
  AdventureLoreList,
  AdventureLoreOutcome,
} from '../model/adventureLore';
import {
  adventureId,
  uid,
  identity,
  row,
  globalRow,
  entity,
  contextToken,
  list,
  save,
  deferred,
} from './adventureLoreFixtures';
const auth = vi.hoisted(() => ({ user: { uid: 'owner' } }));
const hints = vi.hoisted(() => ({ notify: null as null | ((kind: 'root' | 'universe') => void) }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/adventureLoreCallables');
vi.mock('../services/adventureLoreContext', () => ({
  subscribeAdventureLoreHints: (_input: unknown, notify: typeof hints.notify) => {
    hints.notify = notify;
    return vi.fn();
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid };
  hints.notify = null;
  vi.mocked(api.listAdventureLore).mockImplementation((input) => Promise.resolve(list(input)));
  vi.mocked(api.getAdventureLore).mockImplementation(() =>
    Promise.resolve({
      ...identity,
      collectionRevision: 1,
      contextToken,
      item: {
        ...row,
        details: entity.details,
        structuredDetails: entity.structuredDetails,
        relations: [],
      },
    }),
  );
});
it('reúne todas as páginas locais antes das globais e nunca usa a página visível como contexto', async () => {
  const second = deferred<AdventureLoreList>();
  vi.mocked(api.listAdventureLore).mockImplementation((input) => {
    if (input.scope === 'universe') return Promise.resolve(list(input, [globalRow]));
    if (input.limit === 1) return Promise.resolve(list(input));
    if (input.cursor) return second.promise;
    return Promise.resolve({ ...list(input), nextCursor: 'last-local-page' });
  });
  const view = renderHook(() => useAdventureLoreContext(adventureId));
  await waitFor(() =>
    expect(api.listAdventureLore).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'last-local-page' }),
    ),
  );
  expect(view.result.current.items).toEqual([]);
  expect(
    vi.mocked(api.listAdventureLore).mock.calls.some(([input]) => input.scope === 'universe'),
  ).toBe(false);
  await act(async () => {
    await Promise.resolve();
    second.resolve({
      ...list({ adventureId, scope: 'adventure' }),
      items: [
        {
          ...row,
          id: 'adventure:' + adventureId + ':second-entity-long',
          reference: { ...row.reference, entityId: 'second-entity-long' },
        },
      ],
    });
  });
  await waitFor(() => expect(view.result.current.items).toHaveLength(3));
  expect(view.result.current.items[1]?.aliases).toContain('Serpente');
});
it('falha local bloqueia fallback global', async () => {
  vi.mocked(api.listAdventureLore).mockRejectedValue(new Error('Local não autorizado'));
  const { result } = renderHook(() => useAdventureLoreContext(adventureId));
  await waitFor(() => expect(result.current.error).toBe('Local não autorizado'));
  expect(result.current.items).toEqual([]);
  expect(api.listAdventureLore).toHaveBeenCalledTimes(1);
});
it.each(['token', 'cursor', 'duplicate'])(
  'recusa janela inconsistente sem expor metadata parcial: %s',
  async (kind) => {
    vi.mocked(api.listAdventureLore).mockImplementation((input) => {
      if (input.limit === 1) return Promise.resolve(list(input));
      if (kind === 'token')
        return Promise.resolve({ ...list(input), contextToken: 'd'.repeat(64) });
      if (kind === 'duplicate') return Promise.resolve({ ...list(input), items: [row, row] });
      return Promise.resolve({
        ...list(input),
        items: input.cursor ? [] : [row],
        nextCursor: 'same',
      });
    });
    const { result } = renderHook(() => useAdventureLoreContext(adventureId));
    await waitFor(() => expect(result.current.error).not.toBe(''));
    expect(result.current.items).toEqual([]);
  },
);
it('hint invalida imediatamente get pendente e resposta antiga não reabre corpo', async () => {
  const pending = deferred<AdventureLoreGet>();
  vi.mocked(api.getAdventureLore).mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useAdventureLoreContext(adventureId));
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  let body: Promise<AdventureLoreGet | null>;
  act(() => {
    body = result.current.get(result.current.items[0]!);
  });
  act(() => hints.notify?.('universe'));
  expect(result.current.context).toBeNull();
  await act(async () => {
    pending.resolve({
      ...identity,
      collectionRevision: 1,
      contextToken,
      item: {
        ...row,
        details: 'CORPO ANTIGO',
        structuredDetails: entity.structuredDetails,
        relations: [],
      },
    });
    expect(await body!).toBeNull();
  });
});
it('conta nova impede continuação anterior antes da limpeza do efeito', async () => {
  const pending = deferred<AdventureLoreList>();
  vi.mocked(api.listAdventureLore).mockReturnValueOnce(pending.promise);
  const view = renderHook(() => useAdventureLoreContext(adventureId));
  auth.user = { uid: 'second' };
  view.rerender();
  await act(async () => {
    pending.resolve(list({ adventureId, scope: 'adventure' }));
    await Promise.resolve();
  });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  expect(view.result.current.items).toEqual([]);
  expect(view.result.current.error).not.toBe('');
});
it('pulse, foco e retorno de visibilidade exigem contexto novo, sem corpos do SDK', async () => {
  const { result } = renderHook(() => useAdventureLoreContext(adventureId));
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  const first = result.current.context!;
  act(() => publishInvalidation({ actorId: uid, scope: 'lore-context' }));
  expect(result.current.isCurrent(first)).toBe(false);
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
});
it('escopo desabilitado não lê nem observa outra origem', () => {
  const { result } = renderHook(() => useAdventureLoreContext(null));
  expect(result.current.items).toEqual([]);
  expect(api.listAdventureLore).not.toHaveBeenCalled();
  expect(hints.notify).toBeNull();
});
it('pedido incerto repete bytes/operationId; cancelamento envia somente hash e descritor', async () => {
  const { result } = renderHook(() => useAdventureLoreCollection(adventureId));
  await waitFor(() => expect(result.current.context).not.toBeNull());
  vi.mocked(api.saveAdventureLore).mockRejectedValueOnce(new Error('Sem resposta'));
  await act(async () => {
    await expect(result.current.submit('save', save)).rejects.toThrow('Sem resposta');
  });
  expect(result.current.pending?.request).toEqual(save);
  vi.mocked(api.resolveAdventureLoreOperation).mockImplementation((input) =>
    Promise.resolve({
      ...identity,
      kind: 'canceled',
      action: input.action,
      operationId: input.operationId,
    }),
  );
  await act(async () => {
    await result.current.cancel();
  });
  expect(result.current.pending).toBeNull();
  const canceledRequest = vi.mocked(api.resolveAdventureLoreOperation).mock.calls[0]![0];
  expect(canceledRequest.requestHash).toMatch(/^[a-f0-9]{64}$/);
  expect(canceledRequest.intent).toBe('cancel');
  expect(vi.mocked(api.resolveAdventureLoreOperation).mock.calls[0]![0]).not.toHaveProperty(
    'entity',
  );
});
it('recibo confirmado libera controle sem ler corpo para rebase', async () => {
  const outcome: AdventureLoreOutcome = {
    ...identity,
    kind: 'confirmed',
    receipt: {
      operationId: save.operationId,
      action: 'save',
      entityId: save.entityId,
      expectedRevision: 0,
      revision: 1,
      collectionRevision: 1,
    },
  };
  vi.mocked(api.saveAdventureLore)
    .mockRejectedValueOnce(new Error('Perdeu resposta'))
    .mockResolvedValueOnce(outcome);
  const { result } = renderHook(() => useAdventureLoreCollection(adventureId));
  await waitFor(() => expect(result.current.context).not.toBeNull());
  await act(async () => {
    await expect(result.current.submit('save', save)).rejects.toThrow();
  });
  await act(async () => {
    expect(await result.current.retry()).toBe(true);
  });
  expect(api.saveAdventureLore).toHaveBeenNthCalledWith(
    2,
    vi.mocked(api.saveAdventureLore).mock.calls[0]![0],
  );
  expect(api.getAdventureLore).not.toHaveBeenCalled();
  expect(result.current.pending).toBeNull();
});
