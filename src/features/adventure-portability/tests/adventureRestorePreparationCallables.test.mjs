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
const context = {
  ownerId: 'author',
  restoreId: 'client-restore-0001',
  adventureId: 'client-adventure-0001',
  jobToken: 'a'.repeat(64),
  reviewHash: 'b'.repeat(64),
  keyId: 'c'.repeat(64),
};
const commands = [
  'advanceAdventureRestoreIntegrity',
  'advanceAdventureRestoreValidation',
  'advanceAdventureRestoreStructure',
  'advanceAdventureRestoreResources',
  'advanceAdventureRestoreProfiles',
  'advanceAdventureRestoreHistory',
  'finalizeAdventureRestoreDraft',
  'advanceAdventureRestoreUniverse',
  'advanceAdventureRestorePersonaLibrary',
  'advanceAdventureRestoreImages',
  'advanceAdventureRestoreImageStorage',
  'advanceAdventureRestoreCounts',
  'advanceAdventureRestoreAudit',
  'advanceAdventureRestoreImageLibrary',
];
const input = (action) => ({
  restoreId: context.restoreId,
  jobToken: context.jobToken,
  operationId: 'preparation-remote-0001',
  expectedCheckpoint: 4,
  ...(action === commands[0] ? { limit: 16 } : {}),
});
const create = async (c = context, guard = () => {}) =>
  (
    await import('../services/adventureRestorePreparationCallables.ts')
  ).createAdventureRestorePreparationApi(c, guard);
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.auth.currentUser = { uid: 'author' };
  mocks.invoke.mockResolvedValue({ data: { sentinel: true } });
  mocks.app.mockReturnValue('app');
  mocks.functions.mockReturnValue('functions');
});
it('import and contextual factory are credential-free', async () => {
  await create();
  expect(mocks.app).not.toHaveBeenCalled();
  expect(mocks.functions).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
});
it.each(commands)(
  'only explicit preparation method %s is callable with the exact captured input',
  async (action) => {
    const api = await create(),
      request = input(action);
    expect(await api.advance(action, request)).toEqual({ sentinel: true });
    expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', action, {
      timeout: action === 'advanceAdventureRestoreValidation' ? 600_000 : 180_000,
    });
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(request);
    expect(mocks.functions).toHaveBeenCalledExactlyOnceWith('app', 'us-central1');
  },
);
it('getter is bound to the exact identity and rejects method selection in payload', async () => {
  const api = await create(),
    request = { restoreId: context.restoreId, jobToken: context.jobToken };
  await api.get(request);
  expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', 'getAdventureRestore', {
    timeout: 180_000,
  });
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(request);
  expect(() => api.get({ ...request, method: 'activateAdventureRestore' })).toThrow();
});
it.each([
  'activateAdventureRestore',
  'cancelAdventureRestore',
  'getAdventureRestoreRecoveryKey',
  'constructor',
  '__proto__',
  null,
  {},
])('unsafe command %j fails before Firebase initialization', async (action) => {
  const api = await create();
  expect(() => api.advance(action, input(action))).toThrow();
  expect(mocks.app).not.toHaveBeenCalled();
});
it.each([
  { restoreId: 'other-restore-0001' },
  { jobToken: 'd'.repeat(64) },
  { expectedCheckpoint: -1 },
  { operationId: 'short' },
  { privateText: 'NEVER_FORWARD' },
  { limit: 17 },
])('closed input %j fails before Firebase initialization', async (patch) => {
  const api = await create();
  expect(() => api.advance(commands[0], { ...input(commands[0]), ...patch })).toThrow();
  expect(mocks.app).not.toHaveBeenCalled();
});
it('input mutation while importing Firebase cannot retarget the command', async () => {
  const api = await create(),
    request = input(commands[0]),
    before = structuredClone(request);
  const pending = api.advance(commands[0], request);
  request.operationId = 'another-operation-0001';
  request.restoreId = 'another-restore-0001';
  await pending;
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(before);
});
it.each([null, { uid: 'other' }])(
  'missing or foreign account cannot send a command: %j',
  async (actor) => {
    mocks.auth.currentUser = actor;
    const api = await create();
    await expect(api.advance(commands[0], input(commands[0]))).rejects.toThrow();
    expect(mocks.app).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  },
);
it('account or guard change after send never returns the response data', async () => {
  const api = await create();
  mocks.invoke.mockImplementation(async () => {
    mocks.auth.currentUser = { uid: 'other' };
    return { data: { private: 'NEVER_RETURN' } };
  });
  await expect(api.advance(commands[0], input(commands[0]))).rejects.toThrow();
});

it.each(['before', 'after'])(
  'guard expires %s sending and no response data is returned',
  async (stage) => {
    let alive = true;
    const api = await create(context, () => {
      if (!alive) throw Error('Expired API scope');
    });
    if (stage === 'before') {
      alive = false;
      expect(() => api.get({ restoreId: context.restoreId, jobToken: context.jobToken })).toThrow(
        'Expired API scope',
      );
      expect(mocks.invoke).not.toHaveBeenCalled();
    } else {
      mocks.invoke.mockImplementation(async () => {
        alive = false;
        return { data: { private: 'NEVER_RETURN' } };
      });
      await expect(api.advance(commands[0], input(commands[0]))).rejects.toThrow(
        'Expired API scope',
      );
      expect(mocks.invoke).toHaveBeenCalledTimes(1);
    }
  },
);
