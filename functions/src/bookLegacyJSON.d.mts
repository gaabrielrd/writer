import type { BookBackupByteSource } from './bookBackupContainer.mjs';
import type { BookValidationHash } from './bookBackupContent.mjs';
export interface BookLegacyJSONSpan {
  path: readonly (string | number)[];
  start: number;
  end: number;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
}
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
