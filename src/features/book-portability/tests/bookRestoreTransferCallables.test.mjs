// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({ data: { sentinel: true } })),
  app: vi.fn(() => 'app'),
  functions: vi.fn(() => 'functions'),
  callable: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.functions,
  httpsCallable: (...a) => {
    mocks.callable(...a);
    return mocks.invoke;
  },
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: mocks.app }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
it('importing transfer commands does not initialize Auth or Firebase', async () => {
  await import('../services/bookRestoreTransferCallables.ts');
  expect(mocks.app).not.toHaveBeenCalled();
  expect(mocks.functions).not.toHaveBeenCalled();
});
for (const [name, method] of [
  ['start', 'startBookRestore'],
  ['list', 'listBookRestores'],
  ['get', 'getBookRestore'],
  ['append', 'appendBookRestoreChunk'],
  ['resolveStart', 'resolveBookRestoreStart'],
])
  it(
    'fixed transfer command ' +
      name +
      ' forwards its original input and region without selecting a payload method',
    async () => {
      const { bookRestoreTransferApi: api } =
          await import('../services/bookRestoreTransferCallables.ts'),
        input = { sentinel: true, method: 'openPreparedBookRestoreLore' };
      expect(await api[name](input)).toEqual({ sentinel: true });
      expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', method);
      expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(input);
      expect(mocks.functions).toHaveBeenCalledExactlyOnceWith('app', 'us-central1');
    },
  );
it('transfer failure is preserved without retrying or changing command', async () => {
  const { bookRestoreTransferApi: api } =
      await import('../services/bookRestoreTransferCallables.ts'),
    failure = Error('No reply');
  mocks.invoke.mockRejectedValueOnce(failure);
  await expect(api.get({ restoreId: 'restore-client-0001' })).rejects.toBe(failure);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
