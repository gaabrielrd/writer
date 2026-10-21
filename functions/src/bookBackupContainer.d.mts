export type BookBackupErrorCode =
  | 'invalid-format'
  | 'unsupported-version'
  | 'invalid-record'
  | 'limit-exceeded'
  | 'integrity-mismatch'
  | 'incomplete-archive';
export class BookBackupFormatError extends Error {
  constructor(code: BookBackupErrorCode, message: string);
  readonly code: BookBackupErrorCode;
}
export interface BookBackupRecord {
  kind: string;
  id: string;
  part: number;
  payload: Uint8Array;
}
export interface BookBackupByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}
export interface BookBackupSeal {
  records: number;
  payloadBytes: number;
  chainHash: string;
}
export interface BookBackupReadSeal extends BookBackupSeal {
  archiveBytes: number;
}
export const BOOK_BACKUP_LIMITS: Readonly<{
  maxMetadataBytes: 16384;
  maxPayloadBytes: 262144;
  maxRecords: 4294967295;
}>;
export function encodeBookBackup(
  records: Iterable<BookBackupRecord> | AsyncIterable<BookBackupRecord>,
  options?: { signal?: AbortSignal },
): AsyncGenerator<Uint8Array, BookBackupSeal>;
export function decodeBookBackup(
  source: BookBackupByteSource,
  options?: { signal?: AbortSignal },
): AsyncGenerator<BookBackupRecord, BookBackupReadSeal>;
