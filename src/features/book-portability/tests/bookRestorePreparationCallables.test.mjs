import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({ data: { sentinel: true } })),
  app: vi.fn(() => 'app'),
  functions: vi.fn(() => 'functions'),
  callable: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.functions,
  httpsCallable: (...args) => {
    mocks.callable(...args);
    return mocks.invoke;
  },
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: mocks.app }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
it('importing the preparation adapter does not initialize Firebase or request credentials', async () => {
  await import('../services/bookRestorePreparationCallables.ts');
  expect(mocks.app).not.toHaveBeenCalled();
  expect(mocks.functions).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
});
const commands = [
  'advanceBookRestoreIntegrity',
  'advanceBookRestoreValidation',
  'advanceBookRestoreStructure',
  'advanceBookRestoreLore',
  'advanceBookRestoreResources',
  'advanceBookRestoreCounts',
  'advanceBookRestorePersonas',
  'advanceBookRestoreUniverse',
  'advanceBookRestoreHistory',
  'advanceBookRestoreDraft',
  'finalizeBookRestoreDraft',
  'advanceBookRestoreCover',
  'reserveBookRestoreCover',
  'materializeBookRestoreCover',
  'advanceBookRestorePersonaLibrary',
  'advanceBookRestoreSourceIndexes',
  'advanceBookRestoreAudit',
];
for (const action of commands)
  it(
    'preparation callable forwards only the explicit name and literal input: ' + action,
    async () => {
      const { bookRestorePreparationApi: api } =
        await import('../services/bookRestorePreparationCallables.ts');
      const input = {
        restoreId: 'restore',
        jobToken: 'a'.repeat(64),
        operationId: 'operation',
        expectedCheckpoint: 2,
        ...(action === 'advanceBookRestoreIntegrity' ? { limit: 16 } : {}),
      };
      expect(await api.advance(action, input)).toEqual({ sentinel: true });
      expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', action);
      expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(input);
      expect(mocks.functions).toHaveBeenCalledExactlyOnceWith('app', 'us-central1');
    },
  );
it('preparation getter uses the original token and never selects a method from its payload', async () => {
  const { bookRestorePreparationApi: api } =
    await import('../services/bookRestorePreparationCallables.ts');
  const input = { restoreId: 'restore', jobToken: 'a'.repeat(64), method: 'activateBookRestore' };
  await api.get(input);
  expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', 'getBookRestore');
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(input);
});
it('unsafe runtime command names are refused before initializing Firebase', async () => {
  const { bookRestorePreparationApi: api } =
    await import('../services/bookRestorePreparationCallables.ts');
  for (const action of [
    'activateBookRestore',
    'openPreparedBookRestoreLore',
    'getBookRestoreRecoveryKey',
    'constructor',
    '__proto__',
    null,
    {},
  ])
    expect(() => api.advance(action, {})).toThrow();
  expect(mocks.app).not.toHaveBeenCalled();
  expect(mocks.callable).not.toHaveBeenCalled();
});
it('transport rejection is returned without automatic repeat or replacement', async () => {
  const { bookRestorePreparationApi: api } =
    await import('../services/bookRestorePreparationCallables.ts');
  const failure = Error('No response');
  mocks.invoke.mockRejectedValueOnce(failure);
  await expect(api.get({ restoreId: 'restore', jobToken: 'a'.repeat(64) })).rejects.toBe(failure);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
