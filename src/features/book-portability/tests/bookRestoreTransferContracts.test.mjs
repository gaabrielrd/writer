// @vitest-environment node
import { it, expect } from 'vitest';
import {
  readBookRestoreSourceDescriptor,
  readBookRestoreStartIntent,
  bookRestoreStartRequest,
  bookRestoreMetadataHash,
  bookRestoreStartFingerprint,
  bookRestoreChunkOperationId,
} from '../services/bookRestoreTransferContracts.ts';
import { requestHash, startInput } from '../../../../functions/src/bookRestoreUploadContracts.mjs';
import { digest } from '../../../../functions/src/sceneContracts.mjs';
import { validateId } from '../../../../functions/src/generation.mjs';
import {
  restorePreparationOperationId,
  readBookRestoreIdentity,
} from '../services/bookRestorePreparationContracts.ts';
const source = {
    format: 'writer-book-archive',
    version: 1,
    byteLength: 131073,
    sha256: 'a'.repeat(64),
  },
  intent = {
    schemaVersion: 1,
    ownerId: 'author',
    operationId: 'book-restore-start-0001',
    source,
    reviewHash: 'b'.repeat(64),
  },
  identity = {
    ownerId: 'author',
    restoreId: 'restore-operation',
    bookId: 'book',
    jobToken: 'c'.repeat(64),
  };
it('start fingerprint matches the real server canonical contract for current and every legacy format', () => {
  for (const descriptor of [
    source,
    ...[1, 2, 3, 4, 5, 6].map((version) => ({
      ...source,
      format: 'writer-book-backup',
      version,
    })),
  ]) {
    const value = { ...intent, source: descriptor },
      request = bookRestoreStartRequest(value);
    expect(bookRestoreStartFingerprint(value)).toBe(
      requestHash('startBookRestore', startInput(request)),
    );
    expect(Object.keys(request).sort()).toEqual(['operationId', 'source', 'reviewHash'].sort());
  }
});
it('metadata hash matches server sorting, arrays, literal strings and exact Unicode', () => {
  for (const value of [
    { z: { b: 1, a: '🌙\n' }, a: [false, null, 4, { x: '\ufeff  literal ' }] },
    'raw string',
    null,
    0,
    ['🌙', 1],
    { second: 2, first: 1 },
  ])
    expect(bookRestoreMetadataHash(value)).toBe(digest(value));
  expect(() => bookRestoreMetadataHash(undefined)).toThrow();
});
it('a start descriptor is a closed metadata copy with no filename, prose, key or byte payload', () => {
  const input = structuredClone(intent),
    read = readBookRestoreStartIntent(input, 'author');
  input.source.byteLength = 5;
  input.operationId = 'other';
  expect(read.operationId).toBe('book-restore-start-0001');
  expect(read.source.byteLength).toBe(131073);
  expect(Object.isFrozen(read)).toBe(true);
  expect(Object.isFrozen(read.source)).toBe(true);
  for (const extra of [
    { filename: 'private.json' },
    { title: 'PRIVATE_TEST_LITERAL' },
    { keyBase64: 'key' },
    { chunkBase64: 'data' },
    { privateText: 'PRIVATE_TEST_LITERAL' },
    { schemaVersion: 2 },
    { ownerId: 'other' },
    { operationId: '' },
    { reviewHash: 'bad' },
  ])
    expect(() => readBookRestoreStartIntent({ ...intent, ...extra }, 'author')).toThrow();
});
it('invalid source format, version, byte count or extra properties are refused before any command', () => {
  for (const extra of [
    { format: 'other' },
    { version: 2 },
    { byteLength: 0 },
    { byteLength: -1 },
    { byteLength: 1.5 },
    { byteLength: Infinity },
    { byteLength: NaN },
    { sha256: 'bad' },
    { key: 'NEVER_STORE' },
    { bytes: new Uint8Array(3) },
  ])
    expect(() => readBookRestoreSourceDescriptor({ ...source, ...extra })).toThrow();
  for (const version of [0, 7, '6', null])
    expect(() =>
      readBookRestoreSourceDescriptor({
        ...source,
        format: 'writer-book-backup',
        version,
      }),
    ).toThrow();
});
it('chunk operation identity is deterministic, versioned and bound to the complete job scope and original index', () => {
  const id = bookRestoreChunkOperationId(identity, 2);
  expect(id).toMatch(/^chunk-[a-f0-9]{64}$/);
  expect(id).toBe(
    'chunk-' +
      digest({ schemaVersion: 1, domain: 'writer-book-restore-upload', ...identity, index: 2 }),
  );
  expect(bookRestoreChunkOperationId({ ...identity }, 2)).toBe(id);
  for (const extra of [
    { ownerId: 'other' },
    { restoreId: 'other-restore-op-0001' },
    { bookId: 'other' },
    { jobToken: 'd'.repeat(64) },
  ])
    expect(bookRestoreChunkOperationId({ ...identity, ...extra }, 2)).not.toBe(id);
  expect(bookRestoreChunkOperationId(identity, 3)).not.toBe(id);
});
it('chunk identity rejects a malformed scope or impossible index instead of reusing an operation', () => {
  for (const index of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    expect(() => bookRestoreChunkOperationId(identity, index)).toThrow();
  expect(() => bookRestoreChunkOperationId({ ...identity, ownerId: 'a/b' }, 0)).toThrow();
});

it('client request and restore identifiers match the actual server boundaries without restricting account IDs', () => {
  for (const id of [
    'a'.repeat(15),
    'a'.repeat(16),
    'a'.repeat(80),
    'a'.repeat(81),
    '550e8400-e29b-41d4-a716-446655440000',
    'contains_underscore_0001',
    'unicode-🌙-operation-0001',
    'operation/invalid-0001',
    'a'.repeat(16) + '\n',
  ]) {
    let valid = true;
    try {
      validateId(id);
    } catch {
      valid = false;
    }
    expect(restorePreparationOperationId(id)).toBe(valid);
    if (valid)
      expect(readBookRestoreStartIntent({ ...intent, operationId: id }, 'author').operationId).toBe(
        id,
      );
    else
      expect(() => readBookRestoreStartIntent({ ...intent, operationId: id }, 'author')).toThrow();
  }
  expect(readBookRestoreIdentity({ ...identity, ownerId: 'custom_uid' }).ownerId).toBe(
    'custom_uid',
  );
});
