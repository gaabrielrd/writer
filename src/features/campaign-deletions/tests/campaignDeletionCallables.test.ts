import { beforeEach, expect, it, vi } from 'vitest';
import {
  advanceCampaignDeletion,
  getCampaignDeletion,
  getCampaignDeletionSource,
  listCampaignDeletions,
  resolveCampaignDeletionStart,
  startCampaignDeletion,
} from '../services/campaignDeletionCallables';
import type {
  DeletionLookup,
  DeletionMutation,
  DeletionStartCanceled,
  StartDeletionInput,
} from '../model/campaignDeletion';
import { campaignId, progress, source, start, step, uid } from './fixtures';

const sdk = vi.hoisted(() => ({
  app: { name: 'writer-test' },
  client: { name: 'functions-test' },
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
  request: vi.fn<(name: string, input: unknown) => Promise<{ data: unknown }>>(),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => sdk.app }));
vi.mock('firebase/functions', () => ({
  getFunctions: sdk.getFunctions,
  httpsCallable: sdk.httpsCallable,
}));
beforeEach(() => {
  vi.resetAllMocks();
  sdk.getFunctions.mockReturnValue(sdk.client);
  sdk.httpsCallable.mockImplementation(
    (_client: unknown, name: string) => (input: unknown) => sdk.request(name, input),
  );
});

it('consulta, confirma, avança e retoma exclusão na região e endpoints corretos sem alterar dados ou payload', async () => {
  const started: DeletionMutation = {
    receipt: {
      action: 'start',
      operationId: start.input.operationId,
      expectedCheckpoint: null,
      confirmedCheckpoint: 0,
    },
    progress,
  };
  const advanced: DeletionMutation = {
    receipt: {
      action: 'advance',
      operationId: step.input.operationId,
      expectedCheckpoint: 0,
      confirmedCheckpoint: 1,
    },
    progress: { ...progress, checkpoint: 1, phase: 'controls', updatedAt: 1001 },
  };
  const lookup: DeletionLookup = {
    schemaVersion: 1,
    ownerId: uid,
    lookup: { campaignId },
    deletion: advanced.progress,
  };
  const capturedLookup: DeletionLookup = { ...lookup, lookup: { captureId: 'capture-original' } };
  const firstPage = { items: [advanced.progress], nextCursor: 'opaque-page' };
  const lastPage = { items: [], nextCursor: null };
  const otherStart: StartDeletionInput = { ...start.input, operationId: 'never-received' };
  const canceled: DeletionStartCanceled = {
    kind: 'canceled',
    schemaVersion: 1,
    ownerId: uid,
    request: otherStart,
  };
  sdk.request
    .mockResolvedValueOnce({ data: source })
    .mockResolvedValueOnce({ data: started })
    .mockResolvedValueOnce({ data: advanced })
    .mockResolvedValueOnce({ data: lookup })
    .mockResolvedValueOnce({ data: capturedLookup })
    .mockResolvedValueOnce({ data: firstPage })
    .mockResolvedValueOnce({ data: lastPage })
    .mockResolvedValueOnce({ data: canceled });

  const receivedSource = await getCampaignDeletionSource({ campaignId });
  expect(receivedSource).toBe(source);
  const input = Object.freeze({
    campaignId: receivedSource!.campaignId,
    campaignToken: receivedSource!.campaignToken,
    expectedRevision: receivedSource!.revision,
    operationId: start.input.operationId,
  });
  expect(await startCampaignDeletion(input)).toBe(started);
  expect(await advanceCampaignDeletion(Object.freeze(step.input))).toBe(advanced);
  expect(await getCampaignDeletion({ campaignId })).toBe(lookup);
  expect(await getCampaignDeletion({ captureId: 'capture-original' })).toBe(capturedLookup);
  expect(await listCampaignDeletions()).toBe(firstPage);
  expect(await listCampaignDeletions({ cursor: firstPage.nextCursor, limit: 25 })).toBe(lastPage);
  expect(await resolveCampaignDeletionStart({ ...otherStart, intent: 'cancel' })).toBe(canceled);

  expect(sdk.request.mock.calls).toEqual([
    ['getCampaignDeletionSource', { campaignId }],
    ['startCampaignDeletion', input],
    ['advanceCampaignDeletion', step.input],
    ['getCampaignDeletion', { campaignId }],
    ['getCampaignDeletion', { captureId: 'capture-original' }],
    ['listCampaignDeletions', {}],
    ['listCampaignDeletions', { cursor: 'opaque-page', limit: 25 }],
    ['resolveCampaignDeletionStart', { ...otherStart, intent: 'cancel' }],
  ]);
  expect(sdk.request.mock.calls[1]?.[1]).toBe(input);
  expect(sdk.request.mock.calls[2]?.[1]).toBe(step.input);
  expect(sdk.getFunctions.mock.calls).toEqual(
    Array.from({ length: 8 }, () => [sdk.app, 'us-central1']),
  );
  expect(sdk.httpsCallable.mock.calls).toEqual(
    sdk.request.mock.calls.map(([name]) => [sdk.client, name]),
  );
  expect(Object.keys(input).sort()).toEqual(
    ['campaignId', 'campaignToken', 'expectedRevision', 'operationId'].sort(),
  );
});

it('erro do servidor preserva identidade para replay explícito e respostas ausentes ou canceladas não viram sucesso inventado', async () => {
  const cause = Object.assign(new Error('Resposta perdida'), {
    code: 'functions/unavailable',
    details: { reason: 'connection-lost' },
  });
  const input = Object.freeze({ ...start.input });
  const canceled: DeletionStartCanceled = {
    kind: 'canceled',
    schemaVersion: 1,
    ownerId: uid,
    request: input,
  };
  sdk.request
    .mockRejectedValueOnce(cause)
    .mockResolvedValueOnce({ data: canceled })
    .mockResolvedValueOnce({ data: null });
  await expect(startCampaignDeletion(input)).rejects.toBe(cause);
  expect(sdk.request).toHaveBeenCalledOnce();
  expect(await startCampaignDeletion(input)).toBe(canceled);
  expect(sdk.request.mock.calls[0]?.[1]).toBe(input);
  expect(sdk.request.mock.calls[1]?.[1]).toBe(input);
  expect(await getCampaignDeletionSource({ campaignId })).toBeNull();
  expect(sdk.request.mock.calls.map(([name]) => name)).toEqual([
    'startCampaignDeletion',
    'startCampaignDeletion',
    'getCampaignDeletionSource',
  ]);
});
