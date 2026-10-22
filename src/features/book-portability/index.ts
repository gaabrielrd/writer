export * from './model/backupContainer';
export { createBookBackupBlobSource } from './services/backupBlobSource';
export {
  captureBookBackupStructure,
  verifyBookBackupStructure,
  BookStructureCaptureError,
} from './services/bookStructureCapture';
export type {
  BookStructureProof,
  BookStructureCaptureOptions,
} from './services/bookStructureCapture';

export { bookHistoryBackupRecords } from './services/bookHistoryBackupRecords';
export {
  captureBookBackupUniverse,
  verifyBookBackupUniverse,
  type BookUniverseProof,
} from './services/bookUniverseCapture';
export {
  captureBookBackupResources,
  verifyBookBackupResources,
} from './services/bookResourceCapture';
export type { BookResourceProof, BookResourceCaptureOptions } from './services/bookResourceCapture';
export {
  captureBookBackupPersonas,
  verifyBookBackupPersonas,
  type BookPersonaProof,
} from './services/bookPersonaCapture';
