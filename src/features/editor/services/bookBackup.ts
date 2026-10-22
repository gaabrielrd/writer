import {
  streamWorkHistoryBackup,
  verifyWorkHistoryBackupStream,
} from '@/features/manuscript-history';
import {
  streamBookBackup,
  saveBookBackup,
  type BookBackupOptions,
  type BookBackupSink,
} from '@/features/book-portability';
export type EditorBookBackupOptions = Omit<BookBackupOptions, 'history'>;
const history = { stream: streamWorkHistoryBackup, verify: verifyWorkHistoryBackupStream };
/** Composition root: portability receives history only through its public feature contract. */
export function streamEditorBookBackup(bookId: string, options: EditorBookBackupOptions = {}) {
  return streamBookBackup(bookId, { ...options, history });
}
export function saveEditorBookBackup(
  bookId: string,
  options: EditorBookBackupOptions,
  destination: BookBackupSink | PromiseLike<BookBackupSink>,
) {
  return saveBookBackup(bookId, { ...options, history }, destination);
}
