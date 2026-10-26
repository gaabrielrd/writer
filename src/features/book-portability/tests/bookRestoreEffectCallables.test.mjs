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
it('importing terminal operations does not initialize Firebase or credentials', async () => {
  await import('../services/bookRestoreEffectCallables.ts');
  expect(mocks.app).not.toHaveBeenCalled();
});
for (const method of [
  'activateBookRestore',
  'finalizeBookRestoreMedia',
  'advanceBookRestoreArchiveCleanup',
  'cancelBookRestore',
  'advanceBookRestoreCleanup',
])
  it('terminal callable ' + method + ' is fixed and preserves exact input', async () => {
    const { bookRestoreEffectApi: api } = await import('../services/bookRestoreEffectCallables.ts');
    const input = { operationId: 'terminal-operation-0001', method: 'openPreparedBookRestoreLore' };
    expect(await api.mutate(method, input)).toEqual({ sentinel: true });
    expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', method);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(input);
    expect(mocks.functions).toHaveBeenCalledExactlyOnceWith('app', 'us-central1');
  });
for (const [name, method] of [
  ['retireActivation', 'retireBookRestoreActivation'],
  ['review', 'getBookRestoreActivationReview'],
  ['media', 'getBookRestoreMediaState'],
  ['archive', 'getBookRestoreArchiveCleanup'],
  ['resolve', 'resolveBookRestoreOperation'],
])
  it('terminal getter ' + name + ' uses only its declared command', async () => {
    const { bookRestoreEffectApi: api } = await import('../services/bookRestoreEffectCallables.ts');
    const input = { restoreId: 'terminal-restore-0001', jobToken: 'a'.repeat(64) };
    await api[name](input);
    expect(mocks.callable).toHaveBeenCalledExactlyOnceWith('functions', method);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(input);
  });
it('unknown operation is rejected before Firebase and failure is never retried automatically', async () => {
  const { bookRestoreEffectApi: api } = await import('../services/bookRestoreEffectCallables.ts');
  expect(() => api.mutate('openPreparedBookRestoreLore', {})).toThrow();
  expect(mocks.app).not.toHaveBeenCalled();
  const error = Error('No reply');
  mocks.invoke.mockRejectedValueOnce(error);
  await expect(api.media({})).rejects.toBe(error);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
