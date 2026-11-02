import { createTemporaryValidationIndex } from '@/shared/validation';
import type { BookValidationIndex } from '../../../../functions/src/bookBackupContent.mjs';
/** Keeps the original namespace and public book contract. */
export function createBookValidationIndex(
  signal?: AbortSignal,
): Promise<BookValidationIndex & { dispose(): Promise<void> }> {
  return createTemporaryValidationIndex('writer-book-validation-v1', signal);
}
