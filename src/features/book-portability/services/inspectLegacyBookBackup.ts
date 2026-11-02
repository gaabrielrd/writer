import {
  inspectBookLegacyContent,
  type BookLegacyReviewReport,
} from '../../../../functions/src/bookLegacyReview.mjs';
import type { BookBackupByteSource } from '../model/backupContainer';
import { runBookValidation } from './bookValidationRunner';
/** Legacy provenance and unavailable data stay explicit; this never creates a new backup seal. */
export function inspectLegacyBookBackup(
  source: BookBackupByteSource,
  options: { signal?: AbortSignal } = {},
): Promise<BookLegacyReviewReport> {
  return runBookValidation(source, options, inspectBookLegacyContent);
}
