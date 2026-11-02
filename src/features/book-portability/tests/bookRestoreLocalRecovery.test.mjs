// @vitest-environment node
import { it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({
  user: { uid: 'author' },
  get: vi.fn(),
  read: vi.fn(),
  compare: vi.fn(),
}));
vi.mock('@/shared/lib', () => ({
  auth: {
    get currentUser() {
      return m.user;
    },
  },
}));
vi.mock('../services/bookRestoreStartSession', () => ({
  createBookRestoreStartSession: () => ({ get: (...a) => m.get(...a) }),
}));
vi.mock('../services/bookRestorePreparationDb', () => ({
  readStoredBookRestorePreparation: (...a) => m.read(...a),
  compareStoredBookRestorePreparation: (...a) => m.compare(...a),
}));
import {
  checkBookRestoreAccount,
  hasBookRestoreLocalRecovery,
  discardBookRestoreLocalRecovery,
} from '../services/bookRestoreLocalRecovery.ts';
const context = {
  ownerId: 'author',
  restoreId: 'local-recovery-0001',
  bookId: 'book',
  jobToken: 'a'.repeat(64),
  keyId: 'b'.repeat(64),
  reviewHash: 'c'.repeat(64),
};
const job = { ...context, state: 'activated' };
const envelope = {
  schemaVersion: 1,
  context,
  stamp: '11111111-1111-4111-8111-111111111111',
  nonce: Buffer.alloc(12).toString('base64'),
  ciphertext: Buffer.alloc(17).toString('base64'),
};
const guard = () => checkBookRestoreAccount('author');
beforeEach(() => {
  vi.resetAllMocks();
  m.user = { uid: 'author' };
  m.get.mockResolvedValue(job);
  m.read.mockResolvedValue(envelope);
  m.compare.mockResolvedValue(true);
});
it('explicit discard reauthorizes terminal context and removes only exact ciphertext by whole-record CAS without fetching a key', async () => {
  expect(await hasBookRestoreLocalRecovery(job, guard)).toBe(true);
  await discardBookRestoreLocalRecovery(job, guard);
  expect(m.get).toHaveBeenCalledExactlyOnceWith(context);
  expect(m.compare).toHaveBeenCalledExactlyOnceWith(context, envelope, null, guard);
});
it('nonterminal, foreign incarnation or changed proof cannot discard the local recovery', async () => {
  for (const change of [
    { state: 'cancelling' },
    { state: 'content-verified' },
    { bookId: 'other' },
    { keyId: 'd'.repeat(64) },
    { reviewHash: 'e'.repeat(64) },
  ]) {
    m.get.mockResolvedValue({ ...job, ...change });
    await expect(discardBookRestoreLocalRecovery(job, guard)).rejects.toThrow();
  }
  expect(m.read).not.toHaveBeenCalled();
  expect(m.compare).not.toHaveBeenCalled();
});
it('missing envelope is a no-op and malformed or foreign envelopes are preserved', async () => {
  m.read.mockResolvedValueOnce(null);
  await discardBookRestoreLocalRecovery(job, guard);
  expect(m.compare).not.toHaveBeenCalled();
  for (const raw of [
    { ...envelope, title: 'NEVER_ADOPT' },
    { ...envelope, context: { ...context, jobToken: 'f'.repeat(64) } },
    { ...envelope, ciphertext: 'bad' },
  ]) {
    m.read.mockResolvedValueOnce(raw);
    await expect(discardBookRestoreLocalRecovery(job, guard)).rejects.toThrow();
  }
  expect(m.compare).not.toHaveBeenCalled();
});
it('CAS refusal or account invalidation preserves competing local recovery', async () => {
  m.compare.mockResolvedValueOnce(false);
  await expect(discardBookRestoreLocalRecovery(job, guard)).rejects.toThrow();
  m.compare.mockClear();
  m.get.mockImplementationOnce(async () => {
    m.user = { uid: 'other' };
    return job;
  });
  await expect(discardBookRestoreLocalRecovery(job, guard)).rejects.toThrow();
  expect(m.compare).not.toHaveBeenCalled();
});
