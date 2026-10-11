import { beforeEach, expect, it, vi } from 'vitest';
import {
  AssistedBookError,
  commitAssistedBook,
  loadAssistedBook,
  requestAssistedBook,
} from '../services/assistedBookService';
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn(), functions: vi.fn() }));
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.functions,
  httpsCallable: mocks.callable,
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.callable.mockReturnValue(mocks.call);
  mocks.call.mockResolvedValue({ data: { session: null } });
});
it('uses the authenticated callable for loading, mutations and explicit commit', async () => {
  await loadAssistedBook();
  await requestAssistedBook({
    action: 'start',
    sessionId: 'id',
    requestId: 'op',
    revision: 0,
    idea: 'Ideia',
  });
  await commitAssistedBook({
    sessionId: 'id',
    revision: 1,
    proposal: { title: 'Atlas', genre: 'Fantasia', synopsis: '', coverDirection: '', entities: [] },
    coverId: null,
    imageId: null,
    expectedCost: 2,
  });
  expect(mocks.callable).toHaveBeenCalledWith(undefined, 'assistedBook', { timeout: 120000 });
  expect(mocks.call).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'commit', expectedCost: 2 }),
  );
});
it('distinguishes definitive rejections from uncertain network responses', async () => {
  mocks.call.mockRejectedValueOnce({ code: 'functions/invalid-argument' });
  await expect(loadAssistedBook()).rejects.toMatchObject({ uncertain: false });
  mocks.call.mockRejectedValueOnce(new Error('offline'));
  await expect(loadAssistedBook()).rejects.toMatchObject({ uncertain: true });
  expect(new AssistedBookError('Insuficiente', 'functions/resource-exhausted').uncertain).toBe(
    false,
  );
});
