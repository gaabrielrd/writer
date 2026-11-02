// @vitest-environment node
import { it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({
  user: { uid: 'author' },
  get: vi.fn(),
  read: vi.fn(),
  compare: vi.fn(),
  grant: vi.fn(),
}));
vi.mock('@/shared/lib', () => ({
  auth: {
    get currentUser() {
      return m.user;
    },
  },
}));
vi.mock('../services/adventureRestoreStartSession', () => ({
  createAdventureRestoreStartSession: () => ({ get: (...a) => m.get(...a) }),
}));
vi.mock('../services/adventureRestorePreparationDb', () => ({
  readStoredAdventureRestorePreparationMetadata: (...a) => m.read(...a),
  compareStoredAdventureRestorePreparation: (...a) => m.compare(...a),
}));
vi.mock('../services/adventureRestoreRecoveryKey', () => ({
  getAdventureRestoreRecoveryGrant: (...a) => m.grant(...a),
}));
import {
  checkAdventureRestoreAccount,
  adventureRestorePreparationContext,
  hasAdventureRestoreLocalRecovery,
  discardAdventureRestoreLocalRecovery,
} from '../services/adventureRestoreLocalRecovery.ts';
const identity = {
    ownerId: 'author',
    restoreId: 'local-adventure-0001',
    adventureId: 'local-adventure-copy-0001',
    jobToken: 'a'.repeat(64),
    reviewHash: 'b'.repeat(64),
  },
  context = { ...identity, keyId: 'c'.repeat(64) },
  job = { ...identity, state: 'activated' },
  envelope = {
    schemaVersion: 1,
    context,
    stamp: '11111111-1111-4111-8111-111111111111',
    nonce: Buffer.alloc(12).toString('base64'),
    ciphertext: Buffer.alloc(17).toString('base64'),
  };
const guard = () => checkAdventureRestoreAccount('author');
beforeEach(() => {
  vi.resetAllMocks();
  m.user = { uid: 'author' };
  m.get.mockResolvedValue(job);
  m.read.mockResolvedValue(envelope);
  m.compare.mockResolvedValue(true);
  m.grant.mockResolvedValue({ ...context, key: { private: 'not persisted' } });
});
it('an existing envelope keeps its keyId without fetching or returning the key', async () => {
  expect(await adventureRestorePreparationContext(identity, guard)).toEqual(context);
  expect(await hasAdventureRestoreLocalRecovery(identity, guard)).toBe(true);
  expect(m.grant).not.toHaveBeenCalled();
});
it('first context discovers keyId through real grant port, without fabricated or persisted key', async () => {
  m.read.mockResolvedValue(null);
  const result = await adventureRestorePreparationContext(identity, guard);
  expect(m.grant).toHaveBeenCalledExactlyOnceWith(identity, guard);
  expect(result).toEqual(context);
  expect(result).not.toHaveProperty('key');
  expect(m.compare).not.toHaveBeenCalled();
});
it.each(['activated', 'cancelled'])(
  'explicit terminal discard %s reauthorizes job then removes exact envelope by CAS without key',
  async (state) => {
    m.get.mockResolvedValue({ ...job, state });
    await discardAdventureRestoreLocalRecovery(identity, guard);
    expect(m.get).toHaveBeenCalledExactlyOnceWith(identity);
    expect(m.compare).toHaveBeenCalledExactlyOnceWith(context, envelope, null, guard);
    expect(m.grant).not.toHaveBeenCalled();
  },
);
it.each([
  { state: 'cancelling' },
  { state: 'content-verified' },
  { adventureId: 'other-adventure-0001' },
  { jobToken: 'f'.repeat(64) },
  { reviewHash: 'f'.repeat(64) },
])('foreign/nonterminal job cannot discard %j', async (delta) => {
  m.get.mockResolvedValue({ ...job, ...delta });
  await expect(discardAdventureRestoreLocalRecovery(identity, guard)).rejects.toThrow();
  expect(m.read).not.toHaveBeenCalled();
  expect(m.compare).not.toHaveBeenCalled();
});
it('corrupt or foreign envelope is kept; missing record is a no-op', async () => {
  m.read.mockResolvedValueOnce(null);
  await discardAdventureRestoreLocalRecovery(identity, guard);
  for (const raw of [
    { ...envelope, text: 'NO' },
    { ...envelope, context: { ...context, jobToken: 'f'.repeat(64) } },
    { ...envelope, ciphertext: 'bad' },
  ]) {
    m.read.mockResolvedValueOnce(raw);
    await expect(discardAdventureRestoreLocalRecovery(identity, guard)).rejects.toThrow();
  }
  expect(m.compare).not.toHaveBeenCalled();
  expect(m.grant).not.toHaveBeenCalled();
});
it('CAS or account loss preserves pending metadata and suppresses private response', async () => {
  m.compare.mockResolvedValueOnce(false);
  await expect(discardAdventureRestoreLocalRecovery(identity, guard)).rejects.toThrow();
  m.compare.mockClear();
  m.get.mockImplementationOnce(async () => {
    m.user = { uid: 'other' };
    return job;
  });
  await expect(discardAdventureRestoreLocalRecovery(identity, guard)).rejects.toThrow();
  expect(m.compare).not.toHaveBeenCalled();
});
