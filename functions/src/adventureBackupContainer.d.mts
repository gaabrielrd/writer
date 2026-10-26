export type AdventureBackupErrorCode =
  | 'invalid-format'
  | 'unsupported-version'
  | 'invalid-record'
  | 'limit-exceeded'
  | 'integrity-mismatch'
  | 'incomplete-archive';
export class AdventureBackupFormatError extends Error {
  constructor(code: AdventureBackupErrorCode, message: string);
  readonly code: AdventureBackupErrorCode;
}
export interface AdventureBackupRecord {
  kind: string;
  id: string;
  part: number;
  payload: Uint8Array;
}
export interface AdventureBackupByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}
export interface AdventureBackupSeal {
  records: number;
  payloadBytes: number;
  chainHash: string;
}
export interface AdventureBackupReadSeal extends AdventureBackupSeal {
  archiveBytes: number;
}
export const ADVENTURE_BACKUP_LIMITS: Readonly<{
  maxMetadataBytes: 16384;
  maxPayloadBytes: 262144;
  maxRecords: 4294967295;
}>;
export function encodeAdventureBackup(
  records: Iterable<AdventureBackupRecord> | AsyncIterable<AdventureBackupRecord>,
  options?: { signal?: AbortSignal },
): AsyncGenerator<Uint8Array, AdventureBackupSeal>;
export function decodeAdventureBackup(
  source: AdventureBackupByteSource,
  options?: { signal?: AbortSignal },
): AsyncGenerator<AdventureBackupRecord, AdventureBackupReadSeal>;

export interface AdventureBackupCursor {
  schemaVersion: 1;
  size: number;
  offset: number;
  records: number;
  payloadBytes: number;
  previous: string;
  done: boolean;
}
export function readAdventureBackupFrame(
  source: AdventureBackupByteSource,
  cursor?: AdventureBackupCursor | null,
  options?: { signal?: AbortSignal },
): Promise<{
  cursor: AdventureBackupCursor;
  record?: AdventureBackupRecord;
  span?: { offset: number; length: number };
  seal?: AdventureBackupReadSeal;
}>;

/** Layout metadata only; the caller must authenticate its source and validated item. */
export function readAdventureBackupIndexedPart(
  source: AdventureBackupByteSource,
  start: AdventureBackupCursor,
  item: {
    record: Pick<AdventureBackupRecord, 'kind' | 'id' | 'part'>;
    byteLength: number;
    chunkCount: number;
  },
  index: number,
  options?: { signal?: AbortSignal },
): Promise<{ bytes: Uint8Array; cursor: AdventureBackupCursor }>;
