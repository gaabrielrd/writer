// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  sealBookRestorePreparationIntent as seal,
  openBookRestorePreparationIntent as open,
  readBookRestorePreparationEnvelope as read,
  sameBookRestorePreparationEnvelope as sameEnvelope,
  sameBookRestorePreparationIntent as sameIntent,
} from '../services/bookRestorePreparationCrypto.ts';
const context = {
    ownerId: 'author',
    restoreId: 'restore-crypto-0001',
    jobToken: 'a'.repeat(64),
    bookId: 'book',
    reviewHash: 'b'.repeat(64),
    keyId: 'c'.repeat(64),
  },
  intent = {
    schemaVersion: 1,
    ownerId: context.ownerId,
    restoreId: context.restoreId,
    jobToken: context.jobToken,
    bookId: context.bookId,
    action: 'advanceBookRestoreIntegrity',
    operationId: 'pending-private-operation',
    expectedCheckpoint: 3,
    limit: 16,
  },
  guard = () => {};
let grant;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  grant = {
    ...context,
    key: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]),
  };
});
afterEach(() => vi.unstubAllGlobals());
it('encrypted envelope stores only context and opaque bytes, and recovers the exact complete intent', async () => {
  const e = await seal(context, grant, intent, guard);
  expect(await open(context, grant, e, guard)).toEqual(intent);
  expect(Object.keys(e).sort()).toEqual(
    ['schemaVersion', 'context', 'stamp', 'nonce', 'ciphertext'].sort(),
  );
  expect(JSON.stringify(e)).not.toContain(intent.operationId);
  expect(e).not.toHaveProperty('key');
  expect(e).not.toHaveProperty('keyBase64');
  expect(Object.isFrozen(e)).toBe(true);
  expect(Object.isFrozen(e.context)).toBe(true);
  expect(Buffer.from(e.ciphertext, 'base64').length).toBeLessThanOrEqual(4112);
});
it('each write obtains fresh nonce and stamp even for the same intent', async () => {
  const a = await seal(context, grant, intent, guard),
    b = await seal(context, grant, intent, guard);
  expect(a.nonce).not.toBe(b.nonce);
  expect(a.stamp).not.toBe(b.stamp);
  expect(a.ciphertext).not.toBe(b.ciphertext);
  expect(sameEnvelope(a, b, context)).toBe(false);
});
it('every context field is authenticated even if local metadata and grant are changed together', async () => {
  const e = await seal(context, grant, intent, guard);
  for (const [field, value] of Object.entries({
    ownerId: 'other',
    restoreId: 'other',
    bookId: 'other',
    jobToken: 'd'.repeat(64),
    reviewHash: 'd'.repeat(64),
    keyId: 'd'.repeat(64),
  })) {
    const c = { ...context, [field]: value },
      changed = { ...e, context: c };
    await expect(open(c, { ...grant, ...c }, changed, guard)).rejects.toThrow();
  }
});
it('stamp, nonce and ciphertext tampering fails authentication and preserves the input envelope', async () => {
  const e = await seal(context, grant, intent, guard),
    bytes = Buffer.from(e.ciphertext, 'base64');
  bytes[0] ^= 1;
  for (const extra of [
    { stamp: crypto.randomUUID() },
    { nonce: Buffer.alloc(12, 9).toString('base64') },
    { ciphertext: bytes.toString('base64') },
  ]) {
    const changed = { ...e, ...extra },
      before = structuredClone(changed);
    await expect(open(context, grant, changed, guard)).rejects.toThrow();
    expect(changed).toEqual(before);
  }
});
it('a different AES key or foreign grant cannot recover the pending request', async () => {
  const e = await seal(context, grant, intent, guard),
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
  await expect(open(context, { ...grant, key }, e, guard)).rejects.toThrow();
  await expect(open(context, { ...grant, ownerId: 'other' }, e, guard)).rejects.toThrow();
});
it('extractable, weak or incomplete crypto grants are refused', async () => {
  for (const [length, extractable, usages] of [
    [256, true, ['encrypt', 'decrypt']],
    [128, false, ['encrypt', 'decrypt']],
    [256, false, ['encrypt']],
    [256, false, ['decrypt']],
  ]) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length }, extractable, usages);
    await expect(seal(context, { ...grant, key }, intent, guard)).rejects.toThrow();
  }
});
it('closed envelope rejects extra plaintext, missing fields, wrong schema and overlarge ciphertext', async () => {
  const e = await seal(context, grant, intent, guard);
  for (const extra of [
    { privateText: 'NEVER_STORE' },
    { schemaVersion: 2 },
    { nonce: 'bad' },
    { ciphertext: 'a'.repeat(5488) },
    { context: { ...context, keyBase64: 'NEVER_STORE' } },
  ])
    expect(() => read({ ...e, ...extra }, context)).toThrow();
  const missing = { ...e };
  delete missing.nonce;
  expect(() => read(missing, context)).toThrow();
});
it('closed intent refuses extra data, activation, foreign scope or a changed integrity limit before encryption', async () => {
  for (const extra of [
    { privateText: 'NEVER_STORE' },
    { action: 'activateBookRestore' },
    { ownerId: 'other' },
    { limit: 15 },
    { operationId: '' },
    { expectedCheckpoint: -1 },
  ])
    await expect(seal(context, grant, { ...intent, ...extra }, guard)).rejects.toThrow();
});
it('guard invalidation before or after WebCrypto never returns a pending request or envelope', async () => {
  const e = await seal(context, grant, intent, guard);
  for (const operation of [
    (g) => seal(context, grant, intent, g),
    (g) => open(context, grant, e, g),
  ]) {
    await expect(
      operation(() => {
        throw Error('Inactive');
      }),
    ).rejects.toThrow('Inactive');
    let calls = 0;
    await expect(
      operation(() => {
        if (++calls === 2) throw Error('Inactive');
      }),
    ).rejects.toThrow('Inactive');
  }
});
it('whole-envelope equality includes cipher bytes and structural intent equality ignores property order', async () => {
  const e = await seal(context, grant, intent, guard);
  expect(sameEnvelope(e, structuredClone(e), context)).toBe(true);
  expect(sameEnvelope(null, null, context)).toBe(true);
  expect(sameEnvelope(null, e, context)).toBe(false);
  const reversed = Object.fromEntries(Object.entries(intent).reverse());
  expect(sameIntent(intent, reversed, context)).toBe(true);
  expect(sameIntent(intent, { ...intent, operationId: 'other-operation-0001' }, context)).toBe(
    false,
  );
});

it('authenticated but malformed plaintext never exposes its contents through a JSON parser error', async () => {
  const e = await seal(context, grant, intent, guard),
    aad = new TextEncoder().encode(
      JSON.stringify([
        'writer-book-restore-preparation',
        1,
        context.ownerId,
        context.restoreId,
        context.jobToken,
        context.bookId,
        context.reviewHash,
        context.keyId,
        e.stamp,
      ]),
    ),
    plaintext = new TextEncoder().encode('{"private":"PRIVATE_TEST_LITERAL'),
    encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: Buffer.from(e.nonce, 'base64'), additionalData: aad, tagLength: 128 },
      grant.key,
      plaintext,
    ),
    changed = { ...e, ciphertext: Buffer.from(encrypted).toString('base64') };
  try {
    await open(context, grant, changed, guard);
    expect.fail('Expected malformed JSON refusal');
  } catch (error) {
    expect(error.message).not.toContain('PRIVATE_TEST_LITERAL');
    expect(error.message).toContain('confirmar');
  }
});
