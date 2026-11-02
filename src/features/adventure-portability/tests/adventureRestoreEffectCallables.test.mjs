// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  app: vi.fn(),
  functions: vi.fn(),
  callable: vi.fn(),
  auth: { currentUser: null },
}));
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.functions,
  httpsCallable: (...args) => {
    mocks.callable(...args);
    return mocks.invoke;
  },
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: mocks.app, auth: mocks.auth }));
const scope = { restoreId: 'adventure-effect-call-0001', jobToken: 'b'.repeat(64) };
const request = { ...scope, operationId: 'adventure-effect-operation-0001', expectedCheckpoint: 4 };
const cases = [
  ['activateAdventureRestore', { ...request, reviewToken: 'c'.repeat(64) }],
  ['cancelAdventureRestore', request],
  ['advanceAdventureRestoreCleanup', { ...request, limit: 16 }],
  ['advanceAdventureRestoreMedia', request],
  ['advanceAdventureRestoreArchiveCleanup', request],
  ['retireAdventureRestoreActivation', { ...request, reviewToken: 'c'.repeat(64) }],
  ['getAdventureRestoreActivationReview', scope],
  ['getAdventureRestoreMediaState', scope],
  ['getAdventureRestoreArchiveCleanup', scope],
  [
    'resolveAdventureRestoreOperation',
    { ...scope, operationId: request.operationId, requestHash: 'd'.repeat(64) },
  ],
];
const create = async (guard = () => {}) =>
  (await import('../services/adventureRestoreEffectCallables.ts')).createAdventureRestoreEffectApi(
    'author',
    guard,
  );
const invoke = (api, name, input) =>
  name === 'retireAdventureRestoreActivation'
    ? api.retireActivation(input)
    : name === 'getAdventureRestoreActivationReview'
      ? api.review(input)
      : name === 'getAdventureRestoreMediaState'
        ? api.media(input)
        : name === 'getAdventureRestoreArchiveCleanup'
          ? api.archive(input)
          : name === 'resolveAdventureRestoreOperation'
            ? api.resolve(input)
            : api.mutate(name, input);
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.auth.currentUser = { uid: 'author' };
  mocks.invoke.mockResolvedValue({ data: { sentinel: true } });
  mocks.app.mockReturnValue('app');
  mocks.functions.mockReturnValue('functions');
});
it('factory is lazy', async () => {
  await create();
  expect(mocks.app).not.toHaveBeenCalled();
});
it.each(cases)('%s selects literal adventure endpoint and original body', async (name, input) => {
  expect(await invoke(await create(), name, input)).toEqual({ sentinel: true });
  expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', name, { timeout: 180000 });
  expect(mocks.functions).toHaveBeenCalledExactlyOnceWith('app', 'us-central1');
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(input);
});
it.each(cases)(
  '%s refuses payload-selected method/private data before SDK',
  async (name, input) => {
    const api = await create();
    expect(() =>
      invoke(api, name, { ...input, method: 'getAdventureRestoreRecoveryKey', text: 'NO' }),
    ).toThrow();
    expect(mocks.app).not.toHaveBeenCalled();
  },
);
it.each([
  'activateBookRestore',
  'constructor',
  'getAdventureRestoreRecoveryKey',
  'retireAdventureRestoreActivation',
])('mutate refuses action %s', async (action) => {
  const api = await create();
  expect(() => api.mutate(action, request)).toThrow();
  expect(mocks.app).not.toHaveBeenCalled();
});
it('rejects invalid checkpoint, cleanup limit, token and scope', async () => {
  const api = await create();
  for (const args of [
    ['activateAdventureRestore', request],
    ['advanceAdventureRestoreCleanup', { ...request, limit: 50 }],
    ['advanceAdventureRestoreMedia', { ...request, expectedCheckpoint: Number.MAX_SAFE_INTEGER }],
  ])
    expect(() => api.mutate(...args)).toThrow();
  expect(() => api.media({ ...scope, jobToken: 'bad' })).toThrow();
  expect(mocks.app).not.toHaveBeenCalled();
});
it.each([null, { uid: 'other' }])('foreign current user %j sends nothing', async (actor) => {
  mocks.auth.currentUser = actor;
  await expect((await create()).media(scope)).rejects.toThrow();
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('snapshots intent before imports resolve and checks guard after response', async () => {
  const api = await create(),
    raw = structuredClone(cases[0][1]),
    before = structuredClone(raw),
    p = api.mutate(cases[0][0], raw);
  raw.reviewToken = 'f'.repeat(64);
  await p;
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(before);
  let active = true;
  const guarded = await create(() => {
    if (!active) throw Error('Expired');
  });
  mocks.invoke.mockImplementation(async () => {
    active = false;
    return { data: { private: 'NO' } };
  });
  await expect(guarded.media(scope)).rejects.toThrow('Expired');
});
it('SDK failure propagates without automatic alternative mutation', async () => {
  const error = Error('Offline');
  mocks.invoke.mockRejectedValue(error);
  await expect((await create()).archive(scope)).rejects.toBe(error);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
