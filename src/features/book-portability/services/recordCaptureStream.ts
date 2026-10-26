import type { BookBackupRecord } from '../model/backupContainer';
import { asyncRecordStream } from '@/shared/streams';
/** Compatibility wrapper over the neutral one-slot bridge. */
export function recordCaptureStream<T>(
  produce: (write: (record: BookBackupRecord) => Promise<void>, signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; check: () => void },
): AsyncGenerator<BookBackupRecord, T | undefined, void> {
  return asyncRecordStream<BookBackupRecord, T>(produce, options);
}
