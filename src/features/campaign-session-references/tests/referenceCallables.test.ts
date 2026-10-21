import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as calls from '../services/sessionReferenceCallables';
import { scope, context, operation, row } from './referenceTestHelpers';
import { sceneScope, mainKey } from './sceneReferenceHelpers';
const sdk = vi.hoisted(() => ({
  app: { name: 'writer-test' },
  functions: { region: 'test' },
  rpc: vi.fn<(input: unknown) => Promise<{ data: unknown }>>(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => sdk.functions),
  httpsCallable: vi.fn(() => sdk.rpc),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => sdk.app }));
beforeEach(() => vi.clearAllMocks());
const remove = {
  ...scope,
  referenceId: row.id,
  operationId: 'remove-reference-0001',
  expectedRevision: 1,
  expectedReferenceCollectionRevision: 1,
};
const cases = [
  [
    'listCampaignSessionReferences',
    { ...scope, view: 'candidates', sourceContext: context, cursor: 'opaque', limit: 25 },
  ],
  ['addCampaignSessionReference', operation.request],
  ['removeCampaignSessionReference', remove],
  [
    'readCampaignSessionLoreReference',
    {
      ...scope,
      sourceContext: context,
      referenceId: row.id,
      expectedRevision: 1,
      expectedReferenceCollectionRevision: 1,
    },
  ],
  [
    'resolveCampaignSessionReferenceOperation',
    { intent: 'cancel', action: 'remove', request: remove },
  ],
  [
    'listCampaignSessionSceneBlocks',
    { ...sceneScope, archive: 'archived', cursor: 'opaque-blocks', limit: 25 },
  ],
  [
    'readCampaignSessionSceneReference',
    { ...sceneScope, blockKey: mainKey, cursor: 'opaque-text', limit: 4 },
  ],
  ['readCampaignSessionSceneImage', { ...sceneScope, blockKey: mainKey }],
] as const;
it.each(cases)(
  'transporta %s sem transformar identidades, contexto observado ou resposta',
  async (name, input) => {
    const before = structuredClone(input),
      data = { observed: name };
    sdk.rpc.mockResolvedValueOnce({ data });
    const call = calls[name] as (input: unknown) => Promise<unknown>;
    expect(await call(input)).toBe(data);
    expect(getFunctions).toHaveBeenCalledExactlyOnceWith(sdk.app, 'us-central1');
    expect(httpsCallable).toHaveBeenCalledExactlyOnceWith(sdk.functions, name);
    expect(sdk.rpc).toHaveBeenCalledExactlyOnceWith(input);
    expect(sdk.rpc.mock.calls[0]![0]).toBe(input);
    expect(input).toEqual(before);
  },
);
it('erro incerto mantém identidade e não dispara resolver, novo pedido ou retry automático', async () => {
  const cause = Object.assign(new Error('Resposta perdida'), { code: 'functions/unavailable' });
  sdk.rpc.mockRejectedValueOnce(cause);
  await expect(calls.addCampaignSessionReference(operation.request)).rejects.toBe(cause);
  expect(sdk.rpc).toHaveBeenCalledOnce();
  expect(httpsCallable).toHaveBeenCalledExactlyOnceWith(
    sdk.functions,
    'addCampaignSessionReference',
  );
  sdk.rpc.mockResolvedValueOnce({ data: { confirmed: true } });
  await calls.addCampaignSessionReference(operation.request);
  expect(sdk.rpc.mock.calls.map(([input]) => input)).toEqual([
    operation.request,
    operation.request,
  ]);
});
