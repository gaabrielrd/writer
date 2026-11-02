// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  createBookRestoreBootstrapRecord as create,
  readBookRestoreBootstrapRecord as read,
  readStoredBookRestoreStart,
  compareStoredBookRestoreStart,
  listStoredBookRestoreStarts,
} from '../services/bookRestoreBootstrapStore.ts';
const intent = {
  schemaVersion: 1,
  ownerId: 'author',
  operationId: 'bootstrap-start-0001',
  source: { format: 'writer-book-archive', version: 1, byteLength: 65537, sha256: 'a'.repeat(64) },
  reviewHash: 'b'.repeat(64),
};
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('indexedDB', undefined);
});
afterEach(() => vi.unstubAllGlobals());
it('bootstrap captures only immutable metadata before a server recovery key exists', () => {
  const input = structuredClone(intent),
    record = create(input);
  expect(record).toMatchObject({ schemaVersion: 1, intent });
  expect(Object.keys(record).sort()).toEqual(['schemaVersion', 'stamp', 'intent'].sort());
  expect(record.stamp).toMatch(/^[a-f0-9-]{36}$/);
  expect(Object.isFrozen(record)).toBe(true);
  expect(Object.isFrozen(record.intent.source)).toBe(true);
  input.source.byteLength = 1;
  expect(record.intent.source.byteLength).toBe(65537);
  for (const field of ['filename', 'title', 'privateText', 'keyBase64', 'jobToken', 'chunkBase64'])
    expect(JSON.stringify(record)).not.toContain('"' + field + '"');
});
it('fresh bootstrap metadata receives a distinct stamp without changing the original request', () => {
  const a = create(intent),
    b = create(intent);
  expect(a.stamp).not.toBe(b.stamp);
  expect(a.intent).toEqual(b.intent);
});
it('owner and native operation key are checked before adopting a stored bootstrap record', () => {
  const record = create(intent);
  expect(() => read(record, 'other', intent.operationId)).toThrow();
  expect(() => read(record, 'author', 'other-operation-0001')).toThrow();
  expect(read(record, 'author', intent.operationId)).toEqual(record);
});
it('closed bootstrap refuses private fields, malformed stamp/schema or substituted source metadata', () => {
  const record = create(intent);
  for (const extra of [
    { schemaVersion: 2 },
    { stamp: 'bad' },
    { privateText: 'NEVER_STORE' },
    { intent: { ...intent, filename: 'PRIVATE_FILE.json' } },
    { intent: { ...intent, keyBase64: 'NEVER_STORE' } },
    { intent: { ...intent, source: { ...intent.source, chunkBase64: 'NEVER_STORE' } } },
  ])
    expect(() => read({ ...record, ...extra }, 'author', intent.operationId)).toThrow();
});
it('unsupported durable storage refuses read, list and CAS with no RPC or memory fallback', async () => {
  const record = create(intent);
  await expect(
    readStoredBookRestoreStart('author', intent.operationId, () => {}),
  ).rejects.toThrow();
  await expect(
    compareStoredBookRestoreStart('author', intent.operationId, null, record, () => {}),
  ).rejects.toThrow();
  await expect(listStoredBookRestoreStarts('author', () => {})).rejects.toThrow();
});
it('invalid account, operation, cursor and pagination limit cannot open storage', async () => {
  for (const [owner, operation] of [
    ['a/b', intent.operationId],
    ['author', 'short'],
  ])
    await expect(readStoredBookRestoreStart(owner, operation, () => {})).rejects.toThrow();
  for (const options of [{ cursor: 'short' }, { limit: 0 }, { limit: 51 }, { limit: 1.5 }])
    await expect(listStoredBookRestoreStarts('author', () => {}, options)).rejects.toThrow();
});
it('CAS validates both full records and refuses another operation or secret fields before storage', async () => {
  const record = create(intent);
  await expect(
    compareStoredBookRestoreStart(
      'author',
      intent.operationId,
      null,
      { ...record, intent: { ...intent, operationId: 'other-operation-0001' } },
      () => {},
    ),
  ).rejects.toThrow();
  await expect(
    compareStoredBookRestoreStart(
      'author',
      intent.operationId,
      { ...record, key: 'NEVER_STORE' },
      null,
      () => {},
    ),
  ).rejects.toThrow();
});
