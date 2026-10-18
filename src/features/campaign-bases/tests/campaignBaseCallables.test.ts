import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as calls from '../services/campaignBaseCallables';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'functions'),
  httpsCallable: vi.fn(() => rpc),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => 'app' }));
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: { confirmed: true } });
});
it.each([
  ['getCampaignCaptureSource', { adventureId: 'adventure' }],
  [
    'startCampaignCapture',
    {
      operationId: 'operation',
      adventureId: 'adventure',
      expectedSourceToken: 'token',
      title: 'Mesa',
      description: 'Notas',
      universeId: null,
    },
  ],
  ['getCampaignCapture', { captureId: 'capture' }],
  ['listCampaignCaptures', { adventureId: 'adventure', cursor: 'page', limit: 25 }],
  ['advanceCampaignCapture', { captureId: 'capture', operationId: 'next', expectedCheckpoint: 2 }],
  [
    'activateCampaignCapture',
    { captureId: 'capture', operationId: 'activate', expectedCheckpoint: 3 },
  ],
  [
    'resolveCampaignCaptureActivation',
    { captureId: 'capture', operationId: 'activate', expectedCheckpoint: 3 },
  ],
  ['cancelCampaignCapture', { captureId: 'capture', operationId: 'cancel', expectedCheckpoint: 4 }],
  ['getCampaignBase', { campaignId: 'campaign' }],
  [
    'listCampaignBaseItems',
    {
      campaignId: 'campaign',
      kind: 'scene',
      parentKey: null,
      archive: 'archived',
      cursor: 'page',
      limit: 25,
    },
  ],
  [
    'readCampaignBaseItem',
    { campaignId: 'campaign', sourceKey: 'scene-key', cursor: 'page', limit: 4 },
  ],
  ['readCampaignBaseImage', { campaignId: 'campaign', imageKey: 'image-key' }],
  [
    'listCampaignBaseReferences',
    { campaignId: 'campaign', sourceKey: 'scene-key', cursor: 'page', limit: 25 },
  ],
] as const)('chama %s com somente o input RPC aprovado', async (name, input) => {
  const call = calls[name] as (input: unknown) => Promise<unknown>;
  expect(await call(input)).toEqual({ confirmed: true });
  expect(getFunctions).toHaveBeenCalledWith('app', 'us-central1');
  expect(httpsCallable).toHaveBeenCalledWith('functions', name);
  expect(rpc).toHaveBeenCalledWith(input);
});
it('preserva código de conflito e normaliza falha sem recibo confirmado', async () => {
  const conflict = Object.assign(new Error('Conflito'), { code: 'functions/failed-precondition' });
  rpc.mockRejectedValueOnce(conflict).mockRejectedValueOnce('desconhecido');
  await expect(
    calls.advanceCampaignCapture({
      captureId: 'capture',
      operationId: 'same',
      expectedCheckpoint: 0,
    }),
  ).rejects.toBe(conflict);
  await expect(calls.getCampaignCapture({ captureId: 'capture' })).rejects.toMatchObject({
    code: 'functions/unavailable',
  });
});
