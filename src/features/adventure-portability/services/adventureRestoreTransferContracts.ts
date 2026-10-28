import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  recoveryCheck as check,
  recoveryObject as object,
  recoveryOwner,
  recoveryOperationId as id,
  recoveryHash as hash,
  readAdventureRestoreRecoveryRequest,
  type AdventureRestoreRecoveryIdentity,
} from './adventureRestoreRecoveryContracts';

export const ADVENTURE_UPLOAD_CHUNK_BYTES = 65536;
export type AdventureRestoreSourceDescriptor = Readonly<{
  format: 'writer-adventure-archive';
  version: 1;
  byteLength: number;
  sha256: string;
}>;
export type AdventureRestoreStartRequest = Readonly<{
  operationId: string;
  source: AdventureRestoreSourceDescriptor;
  reviewHash: string;
}>;
export type AdventureRestoreStartIntent = AdventureRestoreStartRequest &
  Readonly<{ schemaVersion: 1; ownerId: string }>;
export type AdventureRestoreChunkRequest = Readonly<{
  restoreId: string;
  jobToken: string;
  operationId: string;
  expectedCheckpoint: number;
  index: number;
  chunkHash: string;
  chunkBase64: string;
}>;
export function readAdventureRestoreSourceDescriptor(
  raw: unknown,
): AdventureRestoreSourceDescriptor {
  check(
    object(raw, ['format', 'version', 'byteLength', 'sha256']) &&
      raw.format === 'writer-adventure-archive' &&
      raw.version === 1 &&
      typeof raw.byteLength === 'number' &&
      Number.isSafeInteger(raw.byteLength) &&
      raw.byteLength >= 16 &&
      Math.ceil(raw.byteLength / ADVENTURE_UPLOAD_CHUNK_BYTES) <= 0xffffffff &&
      hash(raw.sha256),
  );
  return Object.freeze({
    format: 'writer-adventure-archive',
    version: 1,
    byteLength: raw.byteLength,
    sha256: raw.sha256,
  });
}
export function readAdventureRestoreStartIntent(
  raw: unknown,
  ownerId: string,
): AdventureRestoreStartIntent {
  check(
    recoveryOwner(ownerId) &&
      object(raw, ['schemaVersion', 'ownerId', 'operationId', 'source', 'reviewHash']) &&
      raw.schemaVersion === 1 &&
      raw.ownerId === ownerId &&
      id(raw.operationId) &&
      hash(raw.reviewHash),
  );
  return Object.freeze({
    schemaVersion: 1,
    ownerId,
    operationId: raw.operationId,
    source: readAdventureRestoreSourceDescriptor(raw.source),
    reviewHash: raw.reviewHash,
  });
}
export function adventureRestoreStartRequest(
  intent: AdventureRestoreStartIntent,
): AdventureRestoreStartRequest {
  const value = readAdventureRestoreStartIntent(intent, intent.ownerId);
  return Object.freeze({
    operationId: value.operationId,
    source: value.source,
    reviewHash: value.reviewHash,
  });
}
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
export function adventureRestoreMetadataHash(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(canonical(value));
  check(typeof text === 'string');
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}
export const adventureRestoreStartFingerprint = (intent: AdventureRestoreStartIntent) =>
  adventureRestoreMetadataHash({
    domain: 'writer-adventure-restore-v1',
    action: 'startAdventureRestore',
    request: adventureRestoreStartRequest(intent),
  });
export const expectedAdventureRestoreTarget = (intent: AdventureRestoreStartIntent) => {
  const v = readAdventureRestoreStartIntent(intent, intent.ownerId);
  return (
    'restore-a-' +
    adventureRestoreMetadataHash([
      'writer-adventure-restore-v1',
      v.ownerId,
      v.operationId,
      adventureRestoreStartFingerprint(v),
    ])
  );
};
export function adventureRestoreChunkOperationId(
  expected: AdventureRestoreRecoveryIdentity,
  index: number,
): string {
  const c = readAdventureRestoreRecoveryRequest(expected);
  check(Number.isSafeInteger(index) && index >= 0 && index < 0xffffffff);
  return (
    'chunk-a-' +
    adventureRestoreMetadataHash({
      schemaVersion: 1,
      domain: 'writer-adventure-restore-upload',
      ownerId: c.ownerId,
      restoreId: c.restoreId,
      adventureId: c.adventureId,
      jobToken: c.jobToken,
      reviewHash: c.reviewHash,
      index,
    })
  );
}
export function readAdventureRestoreChunkRequest(raw: unknown): AdventureRestoreChunkRequest {
  check(
    object(raw, [
      'restoreId',
      'jobToken',
      'operationId',
      'expectedCheckpoint',
      'index',
      'chunkHash',
      'chunkBase64',
    ]) &&
      id(raw.restoreId) &&
      hash(raw.jobToken) &&
      id(raw.operationId) &&
      typeof raw.index === 'number' &&
      Number.isSafeInteger(raw.index) &&
      raw.index >= 0 &&
      raw.index < 0xffffffff &&
      raw.expectedCheckpoint === raw.index &&
      hash(raw.chunkHash) &&
      typeof raw.chunkBase64 === 'string' &&
      raw.chunkBase64.length <= 4 * Math.ceil(65536 / 3) &&
      raw.chunkBase64.length > 0 &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.chunkBase64),
  );
  const encoded = raw.chunkBase64,
    decoded = atob(encoded),
    bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  try {
    check(
      bytes.length > 0 &&
        bytes.length <= 65536 &&
        btoa(decoded) === encoded &&
        bytesToHex(sha256(bytes)) === raw.chunkHash,
    );
    return Object.freeze({
      restoreId: raw.restoreId,
      jobToken: raw.jobToken,
      operationId: raw.operationId,
      expectedCheckpoint: raw.index,
      index: raw.index,
      chunkHash: raw.chunkHash,
      chunkBase64: encoded,
    });
  } finally {
    bytes.fill(0);
  }
}
