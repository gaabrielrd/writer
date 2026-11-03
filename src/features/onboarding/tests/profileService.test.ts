import { beforeEach, expect, it, vi } from 'vitest';
import { defaultProfile } from '../model/profile';
import { loadWriterProfile, saveWriterProfile } from '../services/profileService';
const mocks = vi.hoisted(() => ({ read: vi.fn(), get: vi.fn(), set: vi.fn(), ref: vi.fn() }));
vi.mock('@/shared/lib', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => {
    const path = parts.join('/');
    mocks.ref(path);
    return path;
  },
  getDocFromServer: mocks.read,
  runTransaction: (
    _db: unknown,
    commit: (tx: { get: typeof mocks.get; set: typeof mocks.set }) => Promise<unknown>,
  ) => commit({ get: mocks.get, set: mocks.set }),
}));
const saved = (revision = 2) => ({ ...defaultProfile, schemaVersion: 1, revision });
beforeEach(() => vi.clearAllMocks());
it('distinguishes a new account from a malformed or unavailable server profile', async () => {
  mocks.read.mockResolvedValueOnce({ exists: () => false });
  expect(await loadWriterProfile('writer')).toBeNull();
  expect(mocks.ref).toHaveBeenCalledWith('users/writer/preferences/onboarding');
  mocks.read.mockResolvedValueOnce({ exists: () => true, data: () => saved() });
  expect(await loadWriterProfile('other')).toEqual(saved());
  expect(mocks.ref).toHaveBeenLastCalledWith('users/other/preferences/onboarding');
  mocks.read.mockResolvedValueOnce({
    exists: () => true,
    data: () => ({ ...saved(), credits: 100 }),
  });
  await expect(loadWriterProfile('writer')).rejects.toThrow('Perfil de criação inválido');
  mocks.read.mockRejectedValueOnce(new Error('offline'));
  await expect(loadWriterProfile('writer')).rejects.toThrow('offline');
});
it('creates at revision one and compares the observed revision before updating', async () => {
  mocks.get.mockResolvedValueOnce({ exists: () => false });
  expect(await saveWriterProfile('writer', 0, defaultProfile)).toEqual(saved(1));
  expect(mocks.set).toHaveBeenCalledWith('users/writer/preferences/onboarding', saved(1));
  mocks.get.mockResolvedValueOnce({ exists: () => true, data: () => saved(2) });
  const input = { ...defaultProfile, tour: 'completed' as const, step: 3 };
  expect(await saveWriterProfile('writer', 2, input)).toEqual({
    ...input,
    schemaVersion: 1,
    revision: 3,
  });
  expect(mocks.set).toHaveBeenLastCalledWith('users/writer/preferences/onboarding', {
    ...input,
    schemaVersion: 1,
    revision: 3,
  });
});
it('does not overwrite an intervening tab or silently retry an uncertain commit', async () => {
  mocks.get.mockResolvedValueOnce({ exists: () => true, data: () => saved(3) });
  await expect(saveWriterProfile('writer', 2, defaultProfile)).rejects.toThrow(
    'mudou em outra aba',
  );
  expect(mocks.set).not.toHaveBeenCalled();
  mocks.get.mockRejectedValueOnce(new Error('unavailable'));
  await expect(saveWriterProfile('writer', 2, defaultProfile)).rejects.toThrow('unavailable');
  expect(mocks.get).toHaveBeenCalledTimes(2);
  expect(mocks.set).not.toHaveBeenCalled();
});
