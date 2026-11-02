import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  BookRestoreSourceDescriptor,
  BookRestoreStartIntent,
  BookRestoreStartRequest,
} from '../model/bookRestoreTransfer';
import type { BookRestoreIdentity } from '../model/bookRestorePreparation';
import {
  restorePreparationCheck as check,
  restorePreparationId,
  restorePreparationOperationId,
  readBookRestoreIdentity,
} from './bookRestorePreparationContracts';
const object = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function readBookRestoreSourceDescriptor(raw: unknown): BookRestoreSourceDescriptor {
  check(
    object(raw, ['format', 'version', 'byteLength', 'sha256']) &&
      Number.isSafeInteger(raw.byteLength) &&
      (raw.byteLength as number) > 0 &&
      hash(raw.sha256),
  );
  const { format, version } = raw;
  if (format === 'writer-book-archive') check(version === 1);
  else check(format === 'writer-book-backup' && [1, 2, 3, 4, 5, 6].includes(version as number));
  return Object.freeze({
    format,
    version,
    byteLength: raw.byteLength,
    sha256: raw.sha256,
  }) as BookRestoreSourceDescriptor;
}
export function readBookRestoreStartIntent(raw: unknown, ownerId: string): BookRestoreStartIntent {
  check(
    restorePreparationId(ownerId) &&
      object(raw, ['schemaVersion', 'ownerId', 'operationId', 'source', 'reviewHash']) &&
      raw.schemaVersion === 1 &&
      raw.ownerId === ownerId &&
      restorePreparationOperationId(raw.operationId) &&
      hash(raw.reviewHash),
  );
  return Object.freeze({
    schemaVersion: 1,
    ownerId,
    operationId: raw.operationId,
    source: readBookRestoreSourceDescriptor(raw.source),
    reviewHash: raw.reviewHash,
  });
}
export function bookRestoreStartRequest(intent: BookRestoreStartIntent): BookRestoreStartRequest {
  const value = readBookRestoreStartIntent(intent, intent.ownerId);
  return { operationId: value.operationId, source: value.source, reviewHash: value.reviewHash };
}
// Matches the server's versioned canonical metadata digest, without importing Node crypto.
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
        )
      : value;
export function bookRestoreMetadataHash(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(canonical(value));
  check(typeof text === 'string');
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}
export const bookRestoreStartFingerprint = (intent: BookRestoreStartIntent) =>
  bookRestoreMetadataHash({
    schemaVersion: 1,
    action: 'startBookRestore',
    request: bookRestoreStartRequest(intent),
  });
export function bookRestoreChunkOperationId(expected: BookRestoreIdentity, index: number): string {
  const identity = readBookRestoreIdentity(expected);
  check(Number.isSafeInteger(index) && index >= 0 && index < Number.MAX_SAFE_INTEGER);
  return (
    'chunk-' +
    bookRestoreMetadataHash({
      schemaVersion: 1,
      domain: 'writer-book-restore-upload',
      ...identity,
      index,
    })
  );
}
