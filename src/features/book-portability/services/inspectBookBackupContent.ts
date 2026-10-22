import {
  validateBookBackupContent,
  type BookContentReport,
} from '../../../../functions/src/bookBackupContent.mjs';
import type { BookBackupByteSource } from '../model/backupContainer';
import { runBookValidation } from './bookValidationRunner';
/** Reads inert data locally. A positive report never authorizes server restoration. */
export function inspectBookBackupContent(
  source: BookBackupByteSource,
  options: { signal?: AbortSignal } = {},
): Promise<BookContentReport> {
  return runBookValidation(source, options, validateBookBackupContent);
}
