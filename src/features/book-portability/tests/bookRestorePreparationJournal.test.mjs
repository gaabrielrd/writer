// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const mocks = vi.hoisted(() => ({
  value: null,
  available: true,
  read: vi.fn(),
  write: vi.fn(),
  authorize: vi.fn(),
  tails: new Map(),
}));
vi.mock('../services/bookRestorePreparationDb', () => ({
  bookRestorePreparationStorageAvailable: () => mocks.available,
  readStoredBookRestorePreparation: (...a) => mocks.read(...a),
  compareStoredBookRestorePreparation: (...a) => mocks.write(...a),
}));
vi.mock('../services/bookRestoreRecoveryKey', async (original) => ({
  ...(await original()),
  getBookRestoreRecoveryGrant: (...a) => mocks.authorize(...a),
}));
import { createBookRestorePreparationJournal as create } from '../services/bookRestorePreparationJournal.ts';
import { sameBookRestorePreparationEnvelope } from '../services/bookRestorePreparationCrypto.ts';
const context = {
    ownerId: 'author',
    restoreId: 'journal-test-0001',
    bookId: 'book',
    jobToken: 'a'.repeat(64),
    reviewHash: 'b'.repeat(64),
    keyId: 'c'.repeat(64),
  },
  intent = {
    schemaVersion: 1,
    ownerId: context.ownerId,
    restoreId: context.restoreId,
    bookId: context.bookId,
    jobToken: context.jobToken,
    action: 'advanceBookRestoreIntegrity',
    operationId: 'pending-operation',
    expectedCheckpoint: 4,
    limit: 16,
  },
  guard = () => {};
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.value = null;
  mocks.available = true;
  mocks.tails.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', {
    locks: {
      request(name, work) {
        const next = (mocks.tails.get(name) ?? Promise.resolve()).catch(() => {}).then(work);
        mocks.tails.set(
          name,
          next.catch(() => {}),
        );
        return next;
      },
    },
  });
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  mocks.authorize.mockResolvedValue({ ...context, key });
  mocks.read.mockImplementation(async () => structuredClone(mocks.value));
  mocks.write.mockImplementation(async (c, old, next, check) => {
    check();
    if (!sameBookRestorePreparationEnvelope(mocks.value, old, c)) return false;
    mocks.value = structuredClone(next);
    return true;
  });
});
afterEach(() => vi.unstubAllGlobals());
it('empty read requires no grant and null/null CAS performs no write', async () => {
  const journal = create(context, guard);
  expect(await journal.read()).toBeNull();
  expect(await journal.compareAndSet(null, null)).toBe(true);
  expect(mocks.authorize).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});
it('default key authorization is used for sealing and opening without persisting a key', async () => {
  const journal = create(context, guard);
  expect(await journal.compareAndSet(null, intent)).toBe(true);
  const cipher = structuredClone(mocks.value);
  expect(JSON.stringify(cipher)).not.toContain(intent.operationId);
  expect(await create(context, guard).read()).toEqual(intent);
  expect(mocks.authorize).toHaveBeenCalledTimes(2);
  expect(cipher).not.toHaveProperty('key');
  expect(cipher).not.toHaveProperty('keyBase64');
  expect(await journal.compareAndSet(intent, null)).toBe(true);
  expect(mocks.value).toBeNull();
});
it('intent mismatch, occupied slot or missing expected envelope returns false without deleting debt', async () => {
  const journal = create(context, guard);
  expect(await journal.compareAndSet(intent, null)).toBe(false);
  await journal.compareAndSet(null, intent);
  const before = structuredClone(mocks.value);
  expect(await journal.compareAndSet(null, intent)).toBe(false);
  expect(await journal.compareAndSet({ ...intent, operationId: 'other' }, null)).toBe(false);
  expect(mocks.value).toEqual(before);
});
it('reauthorization or read failures preserve the exact encrypted record', async () => {
  const journal = create(context, guard);
  await journal.compareAndSet(null, intent);
  const before = structuredClone(mocks.value);
  mocks.authorize.mockRejectedValue(Error('Revoked'));
  await expect(journal.read()).rejects.toThrow('Revoked');
  await expect(journal.compareAndSet(intent, null)).rejects.toThrow('Revoked');
  expect(mocks.value).toEqual(before);
  mocks.read.mockRejectedValueOnce(Error('Read unavailable'));
  await expect(journal.read()).rejects.toThrow('Read unavailable');
  expect(mocks.value).toEqual(before);
});
it('corrupt or foreign envelopes are preserved without using them as authority', async () => {
  const journal = create(context, guard);
  await journal.compareAndSet(null, intent);
  const original = structuredClone(mocks.value);
  for (const extra of [
    { context: { ...context, ownerId: 'other' } },
    { ciphertext: 'invalid' },
    { privateText: 'NEVER_ADOPT' },
  ]) {
    mocks.value = { ...original, ...extra };
    const before = structuredClone(mocks.value);
    await expect(journal.read()).rejects.toThrow();
    expect(mocks.value).toEqual(before);
    await expect(journal.compareAndSet(intent, null)).rejects.toThrow();
    expect(mocks.value).toEqual(before);
  }
});
it('changing the whole envelope during authorization loses write CAS and preserves the other record', async () => {
  const journal = create(context, guard);
  await journal.compareAndSet(null, intent);
  const changed = { ...mocks.value, stamp: crypto.randomUUID() };
  const grant = await mocks.authorize(context, guard);
  mocks.authorize.mockImplementation(async () => {
    mocks.value = structuredClone(changed);
    return grant;
  });
  expect(await journal.compareAndSet(intent, null)).toBe(false);
  expect(mocks.value).toEqual(changed);
});
it('changing the envelope while opening prevents returning a stale pending intent', async () => {
  const journal = create(context, guard);
  await journal.compareAndSet(null, intent);
  const changed = { ...mocks.value, stamp: crypto.randomUUID() },
    grant = await mocks.authorize(context, guard);
  mocks.authorize.mockImplementation(async () => {
    mocks.value = structuredClone(changed);
    return grant;
  });
  await expect(journal.read()).rejects.toThrow();
  expect(mocks.value).toEqual(changed);
});
it('concurrent instances serialize through the scoped lock and only one CAS replaces an intent', async () => {
  const a = create(context, guard),
    b = create(context, guard);
  await a.compareAndSet(null, intent);
  const results = await Promise.all([
    a.compareAndSet(intent, { ...intent, operationId: 'first' }),
    b.compareAndSet(intent, { ...intent, operationId: 'second' }),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await a.read()).operationId).toBe('first');
});
it('guard invalidation after key authorization cannot write or open the protected record', async () => {
  let alive = true;
  const check = () => {
      if (!alive) throw Error('Inactive');
    },
    journal = create(context, check);
  await journal.compareAndSet(null, intent);
  const before = structuredClone(mocks.value),
    grant = await mocks.authorize(context, guard);
  mocks.authorize.mockImplementation(async () => {
    alive = false;
    return grant;
  });
  await expect(journal.read()).rejects.toThrow('Inactive');
  expect(mocks.value).toEqual(before);
  alive = true;
  await expect(journal.compareAndSet(intent, null)).rejects.toThrow('Inactive');
  expect(mocks.value).toEqual(before);
});
it('unsupported storage and invalid intents refuse persistence with no plaintext fallback', async () => {
  const journal = create(context, guard);
  mocks.available = false;
  await expect(journal.read()).rejects.toThrow();
  await expect(journal.compareAndSet(null, intent)).rejects.toThrow();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.authorize).not.toHaveBeenCalled();
  mocks.available = true;
  await expect(
    journal.compareAndSet(null, { ...intent, privateText: 'NEVER_STORE' }),
  ).rejects.toThrow();
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.value).toBeNull();
});
it('write failure or a lost CAS leaves the pending record untouched and never retries automatically', async () => {
  const journal = create(context, guard);
  await journal.compareAndSet(null, intent);
  const before = structuredClone(mocks.value);
  mocks.write.mockRejectedValueOnce(Error('Quota'));
  await expect(journal.compareAndSet(intent, null)).rejects.toThrow('Quota');
  expect(mocks.value).toEqual(before);
  mocks.write.mockResolvedValueOnce(false);
  expect(await journal.compareAndSet(intent, null)).toBe(false);
  expect(mocks.value).toEqual(before);
});
