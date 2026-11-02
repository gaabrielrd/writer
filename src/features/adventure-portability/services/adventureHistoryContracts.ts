import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  closed,
  validHash,
  validCount,
  matches,
  type AdventureInventorySource,
  type AdventureInventoryItem,
} from './adventureInventoryContracts';
import type { AdventureHistoryTextManifest } from '../../../../functions/src/adventureArchiveHistory.mjs';
export type AdventureHistoryMethod =
  | 'getAdventureBackupSource'
  | 'listAdventureBackupHistory'
  | 'readAdventureBackupHistory'
  | 'readAdventureBackupHistoryText';
export interface AdventureHistoryApi {
  call(method: AdventureHistoryMethod, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export interface AdventureHistoryOptions {
  guard: () => void;
  signal?: AbortSignal;
  source?: AdventureInventorySource;
}
export interface AdventureHistoryProof {
  readonly validation: 'history-data-only';
  readonly source: AdventureInventorySource;
  readonly versions: number;
  readonly nativeRecords: number;
  readonly textBytes: number;
  readonly digest: string;
}
export class AdventureHistoryError extends Error {
  readonly code = 'adventure-backup-invalid-history';
  constructor() {
    super('Não foi possível conferir o histórico completo da aventura. Faça um novo backup.');
    this.name = 'AdventureHistoryError';
  }
}
export function historyInvalid(): never {
  throw new AdventureHistoryError();
}
const encoder = new TextEncoder();
export function historyTextPart(
  value: unknown,
  anchor: AdventureInventorySource,
  version: AdventureInventoryItem,
  ordinal: number,
  first?: AdventureHistoryTextManifest,
) {
  if (
    !closed(value, [
      'schemaVersion',
      'adventureId',
      'sourceToken',
      'kind',
      'parentId',
      'parentToken',
      'id',
      'itemToken',
      'ordinal',
      'manifest',
      'chunkHash',
      'chunkBase64',
    ]) ||
    !matches(value, anchor) ||
    value.kind !== 'version-chunk' ||
    value.parentId !== version.id ||
    value.parentToken !== version.itemToken ||
    value.ordinal !== ordinal ||
    !validHash(value.itemToken) ||
    !validHash(value.chunkHash) ||
    value.id !==
      bytesToHex(
        sha256(encoder.encode(JSON.stringify({ index: ordinal, versionId: version.id }))),
      ) ||
    !closed(value.manifest, ['byteLength', 'chunkCount', 'contentHash'])
  )
    historyInvalid();
  const m = value.manifest;
  if (
    !validCount(m.byteLength) ||
    !validCount(m.chunkCount) ||
    m.chunkCount < 1 ||
    m.chunkCount > Math.max(1, Math.ceil(m.byteLength / 65533)) ||
    !validHash(m.contentHash) ||
    ordinal >= m.chunkCount ||
    (first &&
      (m.byteLength !== first.byteLength ||
        m.chunkCount !== first.chunkCount ||
        m.contentHash !== first.contentHash)) ||
    typeof value.chunkBase64 !== 'string' ||
    value.chunkBase64.length > 87384 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.chunkBase64)
  )
    historyInvalid();
  const binary = atob(value.chunkBase64);
  if (btoa(binary) !== value.chunkBase64) historyInvalid();
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (
    bytes.length > 65536 ||
    bytes.length > m.byteLength ||
    bytesToHex(sha256(bytes)) !== value.chunkHash
  )
    historyInvalid();
  return {
    bytes,
    manifest: Object.freeze({
      byteLength: m.byteLength,
      chunkCount: m.chunkCount,
      contentHash: m.contentHash,
    }),
  };
}
