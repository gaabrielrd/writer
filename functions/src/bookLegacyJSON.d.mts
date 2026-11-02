import type { BookBackupByteSource } from './bookBackupContainer.mjs';
import type { BookValidationHash } from './bookBackupContent.mjs';
export interface BookLegacyJSONSpan {
  path: readonly (string | number)[];
  start: number;
  end: number;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
}
export const BOOK_LEGACY_JSON_CURSOR_BYTES: number;
/** Private continuation only; callers must authenticate storage separately. */
export interface BookLegacyJSONCursor {
  readonly schemaVersion: 1;
  readonly size: number;
  readonly offset: number;
  readonly done: boolean;
  readonly prefix: 'start' | 'bom1' | 'bom2' | 'body';
  readonly utf8: Readonly<{ need: number; lower: number; upper: number }>;
  readonly root: 'value' | 'end';
  readonly frames: readonly Readonly<Record<string, unknown>>[];
  readonly token: Readonly<Record<string, unknown>> | null;
}
export function readBookLegacyJSONStep(
  source: BookBackupByteSource,
  cursor?: BookLegacyJSONCursor | null,
  options?: { signal?: AbortSignal; maxBytes?: number; maxValues?: number },
): Promise<{ cursor: BookLegacyJSONCursor; values: BookLegacyJSONSpan[]; bytes: Uint8Array }>;
export function scanBookLegacyJSON(
  source: BookBackupByteSource,
  options: {
    hash: BookValidationHash;
    signal?: AbortSignal;
    onValue: (span: BookLegacyJSONSpan) => Promise<void> | void;
  },
): Promise<{ size: number; fingerprint: string }>;
export function readBookLegacyJSONSpan(
  source: BookBackupByteSource,
  span: Pick<BookLegacyJSONSpan, 'start' | 'end'>,
  options?: { signal?: AbortSignal },
): Promise<unknown>;
