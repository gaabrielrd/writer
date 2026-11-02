// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
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
const source = {
  format: 'writer-adventure-archive',
  version: 1,
  byteLength: 65536,
  sha256: 'a'.repeat(64),
};
const inputs = {
  start: { operationId: 'native-start-callable-0001', source, reviewHash: 'b'.repeat(64) },
  get: { restoreId: 'native-start-callable-0001', jobToken: 'c'.repeat(64) },
  list: { limit: 2, cursor: null },
  append: {
    restoreId: 'native-start-callable-0001',
    jobToken: 'c'.repeat(64),
    operationId: 'native-chunk-callable-0001',
    expectedCheckpoint: 0,
    index: 0,
    chunkBase64: Buffer.alloc(32, 65).toString('base64'),
    chunkHash: createHash('sha256').update(Buffer.alloc(32, 65)).digest('hex'),
  },
  resolveStart: {
    operationId: 'native-start-callable-0001',
    requestHash: 'a'.repeat(64),
    intent: 'cancel',
  },
};
const names = {
  start: 'startAdventureRestore',
  get: 'getAdventureRestore',
  list: 'listAdventureRestores',
  append: 'appendAdventureRestoreChunk',
  resolveStart: 'resolveAdventureRestoreStart',
};
const create = async (guard = () => {}) =>
  (
    await import('../services/adventureRestoreTransferCallables.ts')
  ).createAdventureRestoreTransferApi('author', guard);
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.auth.currentUser = { uid: 'author' };
  mocks.invoke.mockResolvedValue({ data: { sentinel: true } });
  mocks.app.mockReturnValue('app');
  mocks.functions.mockReturnValue('functions');
});
it('import and factory do not initialize Firebase', async () => {
  await create();
  expect(mocks.app).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
});
it.each(Object.keys(names))(
  '%s selects only its explicit method and exact metadata/body',
  async (method) => {
    const api = await create();
    expect(await api[method](inputs[method])).toEqual({ sentinel: true });
    expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', names[method], {
      timeout: 180000,
    });
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(inputs[method]);
    expect(mocks.functions).toHaveBeenCalledExactlyOnceWith('app', 'us-central1');
  },
);
it.each(Object.keys(names))(
  '%s refuses extra data before initializing Firebase',
  async (method) => {
    const api = await create();
    expect(() =>
      api[method]({
        ...inputs[method],
        method: 'getAdventureRestoreRecoveryKey',
        privateText: 'NEVER_SEND',
      }),
    ).toThrow();
    expect(mocks.app).not.toHaveBeenCalled();
  },
);
it('invalid names, owner or guard cannot reach SDK through the common internal helper', async () => {
  const { callAdventureRestore } = await import('../services/adventureRestoreCallables.ts');
  for (const method of [
    'getAdventureRestoreRecoveryKey',
    'activateBookRestore',
    'constructor',
    'toString',
    '__proto__',
  ])
    await expect(callAdventureRestore('author', () => {}, method, {})).rejects.toThrow();
  await expect(
    callAdventureRestore('../other', () => {}, 'getAdventureRestore', {}),
  ).rejects.toThrow();
  expect(mocks.app).not.toHaveBeenCalled();
});
it.each([null, { uid: 'other' }])('foreign account %j never sends metadata', async (actor) => {
  mocks.auth.currentUser = actor;
  const api = await create();
  await expect(api.start(inputs.start)).rejects.toThrow();
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('captures nested source and request body before imports resolve', async () => {
  const api = await create(),
    request = structuredClone(inputs.start),
    before = structuredClone(request);
  const pending = api.start(request);
  request.source.sha256 = 'd'.repeat(64);
  request.operationId = 'another-operation-0001';
  await pending;
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(before);
});
it('account/guard loss after SDK response prevents returning data, without automatic retry', async () => {
  let alive = true;
  const api = await create(() => {
    if (!alive) throw Error('Expired');
  });
  mocks.invoke.mockImplementation(async () => {
    alive = false;
    return { data: { private: 'NEVER_RETURN' } };
  });
  await expect(api.start(inputs.start)).rejects.toThrow('Expired');
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
it('remote failure is propagated once without calling a replacement method', async () => {
  const failure = Error('Offline'),
    api = await create();
  mocks.invoke.mockRejectedValueOnce(failure);
  await expect(api.get(inputs.get)).rejects.toBe(failure);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
