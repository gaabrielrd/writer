import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCampaignPreparationOperation } from '../hooks/useCampaignPreparationOperation';
import * as calls from '../services/campaignPreparationCallables';
import * as store from '../services/campaignPreparationRecovery';
import {
  requests,
  pending,
  outcome,
  uid,
  campaignId,
  identity,
  installLocks,
  deferred,
  operationId,
} from './preparationTestHelpers';
import type { PreparationOutcome, ResolvePreparationInput } from '../model/campaignPreparation';
vi.mock('../services/campaignPreparationCallables', () => ({
  listCampaignPreparationItems: vi.fn(),
  getCampaignPreparationItem: vi.fn(),
  saveCampaignPreparationItem: vi.fn(),
  deleteCampaignPreparationItem: vi.fn(),
  moveCampaignPreparationItem: vi.fn(),
  listCampaignSessionPreparationLinks: vi.fn(),
  addCampaignSessionPreparationLink: vi.fn(),
  removeCampaignSessionPreparationLink: vi.fn(),
  moveCampaignSessionPreparationLink: vi.fn(),
  resolveCampaignPreparationOperation: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  installLocks();
});
const names = {
  'save-item': 'saveCampaignPreparationItem',
  'delete-item': 'deleteCampaignPreparationItem',
  'move-item': 'moveCampaignPreparationItem',
  'add-link': 'addCampaignSessionPreparationLink',
  'remove-link': 'removeCampaignSessionPreparationLink',
  'move-link': 'moveCampaignSessionPreparationLink',
} as const;
function setup() {
  const onConfirmed = vi.fn(),
    onUnavailable = vi.fn(),
    state = { active: true };
  const hook = renderHook(() =>
    useCampaignPreparationOperation({
      uid,
      campaignId,
      isActive: () => state.active,
      onConfirmed,
      onUnavailable,
    }),
  );
  return { ...hook, onConfirmed, onUnavailable, state };
}
it.each(requests)(
  'envia $action somente após reservar e reconhece recibo sem corpo',
  async (request) => {
    const rpc = vi.mocked(calls[names[request.action]]);
    rpc.mockImplementation(() => {
      expect(store.readPendingCampaignPreparation(uid, campaignId)).toEqual(pending(request));
      return Promise.resolve(outcome(request));
    });
    const h = setup();
    await act(() => h.result.current.execute(request));
    expect(rpc).toHaveBeenCalledWith(request.request);
    expect(h.onConfirmed).toHaveBeenCalledWith(outcome(request), pending(request));
    expect(store.readPendingCampaignPreparation(uid, campaignId)).toBeNull();
  },
);
it('resposta perdida mantém pedido e replay usa o mesmo snapshot', async () => {
  const request = requests[0]!,
    rpc = vi.mocked(calls.saveCampaignPreparationItem);
  rpc.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(outcome(request));
  const h = setup();
  await act(() => h.result.current.execute(request));
  expect(h.result.current.pending).toEqual(pending(request));
  expect(h.result.current.error).toBe('timeout');
  await act(() => h.result.current.recover());
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  expect(h.result.current.pending).toBeNull();
});
it('cancelamento grava intenção antes de RPC e reload repete resolver sem salvar', async () => {
  const p = pending();
  await store.reserveCampaignPreparation(p, () => {});
  const rpc = vi.mocked(calls.resolveCampaignPreparationOperation);
  rpc.mockImplementation((input) => {
    expect(store.readPendingCampaignPreparation(uid, campaignId)?.intent).toBe('cancel');
    expect(Object.keys(input).sort()).toEqual(['action', 'intent', 'request']);
    return Promise.reject(new Error('lost cancel'));
  });
  const h = setup();
  await act(() => h.result.current.cancel());
  expect(h.result.current.pending?.intent).toBe('cancel');
  h.unmount();
  rpc.mockImplementation((input: ResolvePreparationInput) =>
    Promise.resolve({
      ...identity,
      kind: 'canceled',
      action: input.action,
      operationId: input.request.operationId,
    }),
  );
  const again = setup();
  await act(() => again.result.current.recover());
  expect(calls.saveCampaignPreparationItem).not.toHaveBeenCalled();
  expect(store.readPendingCampaignPreparation(uid, campaignId)).toBeNull();
});
it('controle B substituído durante resposta A não é apagado nem reconhecido', async () => {
  const request = requests[0]!,
    reply = deferred<PreparationOutcome>();
  vi.mocked(calls.saveCampaignPreparationItem).mockReturnValue(reply.promise);
  const h = setup();
  let run!: Promise<void>;
  act(() => {
    run = h.result.current.execute(request);
  });
  await waitFor(() => expect(calls.saveCampaignPreparationItem).toHaveBeenCalled());
  const b = pending();
  b.request.operationId = 'operation-000000002';
  localStorage.setItem(store.campaignPreparationJournalKey(uid, campaignId), JSON.stringify(b));
  await act(async () => {
    reply.resolve(outcome(request));
    await run;
  });
  expect(store.readPendingCampaignPreparation(uid, campaignId)).toEqual(b);
  expect(h.onConfirmed).not.toHaveBeenCalled();
});
it('troca de ator e resposta inválida preservam controle sem confirmação', async () => {
  const request = requests[0]!,
    reply = deferred<PreparationOutcome>();
  vi.mocked(calls.saveCampaignPreparationItem).mockReturnValue(reply.promise);
  const h = setup();
  let run!: Promise<void>;
  act(() => {
    run = h.result.current.execute(request);
  });
  await waitFor(() => expect(calls.saveCampaignPreparationItem).toHaveBeenCalled());
  h.state.active = false;
  await act(async () => {
    reply.resolve(outcome(request));
    await run;
  });
  expect(store.readPendingCampaignPreparation(uid, campaignId)).not.toBeNull();
  expect(h.onConfirmed).not.toHaveBeenCalled();
  h.unmount();
  vi.mocked(calls.saveCampaignPreparationItem).mockResolvedValue({
    ...outcome(request),
    ownerId: 'other',
  });
  const again = setup();
  await act(() => again.result.current.recover());
  expect(again.onConfirmed).not.toHaveBeenCalled();
  expect(again.result.current.pending).not.toBeNull();
});
it('C4 comprovado oculta conteúdo mas mantém journal para closer explícito', async () => {
  const request = requests[0]!;
  vi.mocked(calls.saveCampaignPreparationItem).mockRejectedValue(
    Object.assign(new Error('deleted'), {
      code: 'functions/failed-precondition',
      details: { reason: 'campaign-deleted', campaignId, deletionId: operationId },
    }),
  );
  const h = setup();
  await act(() => h.result.current.execute(request));
  expect(h.onUnavailable).toHaveBeenCalledTimes(1);
  expect(h.result.current.pending).not.toBeNull();
});
it('controle ilegível e ausência de locks bloqueiam novos RPCs', async () => {
  localStorage.setItem(store.campaignPreparationJournalKey(uid, campaignId), 'future');
  const h = setup();
  await act(() => h.result.current.execute(requests[0]!));
  expect(h.result.current.blocked).toBe(true);
  expect(calls.saveCampaignPreparationItem).not.toHaveBeenCalled();
  h.unmount();
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  const again = setup();
  await act(() => again.result.current.execute(requests[0]!));
  expect(again.result.current.locksAvailable).toBe(false);
  expect(calls.saveCampaignPreparationItem).not.toHaveBeenCalled();
});
