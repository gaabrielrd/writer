import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { updateCampaign, runCampaignManagement } from '../services/campaignManagementService';
const app = vi.hoisted(() => ({ name: 'authenticated-app' }));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => app }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn().mockReturnValue({}),
  httpsCallable: vi.fn(),
}));
const call = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  call.mockReset();
  vi.mocked(httpsCallable).mockReturnValue(call as never);
});
it('transporte novo envia somente revisão, operação, alvo e patch observados', async () => {
  const input = {
      campaignId: 'campaign',
      operationId: 'same',
      expectedRevision: 2,
      patch: {
        title: 'Mesa',
        description: 'Descrição',
        status: 'archived' as const,
        universeId: null,
      },
    },
    campaign = { id: 'campaign', revision: 3 };
  call.mockResolvedValue({ data: campaign });
  expect(await updateCampaign(input)).toBe(campaign);
  expect(getFunctions).toHaveBeenCalledWith(app, 'us-central1');
  expect(httpsCallable).toHaveBeenCalledWith({}, 'updateCampaign');
  expect(call).toHaveBeenCalledWith(input);
});
it('preserva códigos de conflito e reconhece resposta desconhecida como incerta', async () => {
  const conflict = Object.assign(new Error('Conflito'), {
      code: 'functions/failed-precondition',
      details: { reason: 'revision-conflict' },
    }),
    input = {
      campaignId: 'campaign',
      operationId: 'same',
      expectedRevision: 1,
      patch: { title: 'Mesa' },
    };
  call.mockRejectedValueOnce(conflict).mockRejectedValueOnce(null);
  await expect(updateCampaign(input)).rejects.toBe(conflict);
  await expect(updateCampaign(input)).rejects.toMatchObject({ code: 'functions/unavailable' });
});
it('reserva por UID e campanha mantém ordem após falha sem bloquear outra identidade', async () => {
  let reject!: (cause: Error) => void;
  const first = runCampaignManagement(
      'owner',
      'campaign',
      () =>
        new Promise<never>((_done, fail) => {
          reject = fail;
        }),
    ),
    next = vi.fn().mockResolvedValue('next'),
    second = runCampaignManagement('owner', 'campaign', next);
  await expect(
    runCampaignManagement('other', 'campaign', () => Promise.resolve('other')),
  ).resolves.toBe('other');
  await expect(
    runCampaignManagement('owner', 'other-campaign', () => Promise.resolve('other-campaign')),
  ).resolves.toBe('other-campaign');
  expect(next).not.toHaveBeenCalled();
  reject(new Error('Offline'));
  await expect(first).rejects.toThrow('Offline');
  await expect(second).resolves.toBe('next');
});
