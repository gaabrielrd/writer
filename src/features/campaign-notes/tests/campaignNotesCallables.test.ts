import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as calls from '../services/campaignNotesCallables';
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
  [
    'listCampaignNotes',
    { campaignId: 'campaign', campaignToken: 'token', cursor: 'cursor', limit: 25 },
  ],
  ['getCampaignNote', { campaignId: 'campaign', campaignToken: 'token', noteId: 'note' }],
  [
    'saveCampaignNote',
    {
      campaignId: 'campaign',
      campaignToken: 'token',
      noteId: 'note',
      operationId: 'save',
      expectedRevision: 1,
      title: 'Nota',
      content: 'Texto\n🌕',
    },
  ],
  [
    'deleteCampaignNote',
    {
      campaignId: 'campaign',
      campaignToken: 'token',
      noteId: 'note',
      operationId: 'delete',
      expectedRevision: 2,
    },
  ],
] as const)('envia somente o contrato RPC de %s', async (name, input) => {
  const call = calls[name] as (input: unknown) => Promise<unknown>;
  expect(await call(input)).toEqual({ confirmed: true });
  expect(getFunctions).toHaveBeenCalledWith('app', 'us-central1');
  expect(httpsCallable).toHaveBeenCalledWith('functions', name);
  expect(rpc).toHaveBeenCalledWith(input);
});
it('mantém reason de conflito e normaliza erro desconhecido como incerto', async () => {
  const cause = Object.assign(new Error('Conflito'), {
    code: 'functions/failed-precondition',
    details: { reason: 'revision-conflict' },
  });
  rpc.mockRejectedValueOnce(cause).mockRejectedValueOnce(null);
  await expect(calls.listCampaignNotes({ campaignId: 'campaign' })).rejects.toBe(cause);
  await expect(calls.listCampaignNotes({ campaignId: 'campaign' })).rejects.toMatchObject({
    code: 'functions/unavailable',
  });
});
