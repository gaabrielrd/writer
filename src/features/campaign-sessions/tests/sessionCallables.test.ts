import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import * as calls from '../services/campaignSessionCallables';

const sdk = vi.hoisted(() => ({
  app: { name: 'writer-test' },
  functions: { region: 'test' },
  rpc: vi.fn<(input: unknown) => Promise<{ data: unknown; transportOnly?: string }>>(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => sdk.functions),
  httpsCallable: vi.fn(() => sdk.rpc),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: vi.fn(() => sdk.app) }));
beforeEach(() => vi.clearAllMocks());
const scope = { campaignId: 'campaign-private', campaignToken: 'a'.repeat(64) };
const id = 'session-operation-first-001';
const cases = [
  ['listCampaignSessions', { campaignId: scope.campaignId, cursor: 'opaque-page', limit: 25 }],
  ['getCampaignSession', { ...scope, sessionId: id }],
  [
    'saveCampaignSession',
    {
      ...scope,
      sessionId: id,
      operationId: id,
      expectedRevision: 0,
      title: '  Encontro  ',
      scheduledDate: '0099-12-31',
      status: 'planned',
      summary: '  Texto próprio\n🐉  ',
    },
  ],
  [
    'moveCampaignSession',
    {
      ...scope,
      sessionId: id,
      operationId: 'session-operation-move-0001',
      expectedRevision: 1,
      expectedCollectionRevision: 2,
      direction: 'up',
    },
  ],
  [
    'deleteCampaignSession',
    { ...scope, sessionId: id, operationId: 'session-operation-delete-001', expectedRevision: 2 },
  ],
] as const;

it.each(cases)(
  'transporta %s com região, nome, payload exato e dados sem envelope Firebase',
  async (name, input) => {
    const payload = structuredClone(input),
      before = structuredClone(payload),
      data = { schemaVersion: 1, confirmed: name };
    sdk.rpc.mockResolvedValueOnce({ data, transportOnly: 'omitido' });
    const call = calls[name] as (input: unknown) => Promise<unknown>;
    expect(await call(payload)).toBe(data);
    expect(getFirebaseApp).toHaveBeenCalledOnce();
    expect(getFunctions).toHaveBeenCalledExactlyOnceWith(sdk.app, 'us-central1');
    expect(httpsCallable).toHaveBeenCalledExactlyOnceWith(sdk.functions, name);
    expect(sdk.rpc).toHaveBeenCalledExactlyOnceWith(payload);
    expect(sdk.rpc.mock.calls[0]![0]).toBe(payload);
    expect(payload).toEqual(before);
  },
);

it('propaga erro de conflito sem trocar identidade ou repetir automaticamente; retry explícito usa pedido idêntico', async () => {
  const input = cases[2][1],
    before = structuredClone(input),
    cause = Object.assign(new Error('Conflito exato'), {
      code: 'functions/failed-precondition',
      details: { reason: 'revision-conflict' },
    });
  const data = { receipt: { operationId: id }, session: null };
  sdk.rpc.mockRejectedValueOnce(cause).mockResolvedValueOnce({ data });
  await expect(calls.saveCampaignSession(input)).rejects.toBe(cause);
  expect(sdk.rpc).toHaveBeenCalledTimes(1);
  expect(input).toEqual(before);
  expect(await calls.saveCampaignSession(input)).toBe(data);
  expect(sdk.rpc).toHaveBeenCalledTimes(2);
  expect(sdk.rpc.mock.calls.map((call) => call[0])).toEqual([before, before]);
  expect(vi.mocked(httpsCallable).mock.calls.map((call) => call[1])).toEqual([
    'saveCampaignSession',
    'saveCampaignSession',
  ]);
});

it('erro incerto do SDK é preservado sem fabricar confirmação nem retry', async () => {
  const cause = Object.assign(new Error('Sem resposta'), { code: 'functions/unavailable' });
  sdk.rpc.mockRejectedValueOnce(cause);
  await expect(calls.listCampaignSessions({ campaignId: scope.campaignId })).rejects.toBe(cause);
  expect(sdk.rpc).toHaveBeenCalledTimes(1);
  expect(httpsCallable).toHaveBeenCalledExactlyOnceWith(sdk.functions, 'listCampaignSessions');
});
