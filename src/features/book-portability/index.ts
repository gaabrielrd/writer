export * from './model/backupContainer';
export { inspectLegacyBookBackup } from './services/inspectLegacyBookBackup';
export type { BookLegacyReviewReport } from '../../../functions/src/bookLegacyReview.mjs';
export { inspectBookBackupContent } from './services/inspectBookBackupContent';
export type { BookContentReport } from '../../../functions/src/bookBackupContent.mjs';
export {
  streamBookBackup,
  type BookBackupOptions,
  type BookBackupHistoryPort,
} from './services/streamBookBackup';
export {
  saveBookBackup,
  createBookBackupFileSink,
  type BookBackupSink,
} from './services/bookBackupSink';
export {
  readBookBackupPackage,
  inspectBookBackupPackage,
  type BookPackageReport,
  type BookPackageEvent,
} from '../../../functions/src/bookBackupPackage.mjs';
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
  bookCoverBackupRecords,
  verifyBookBackupCover,
  type BookCoverProof,
  type BookCoverOptions,
} from './services/bookCoverBackupRecords';
export {
  bookDraftBackupRecords,
  verifyBookBackupDraft,
  type BookDraftInput,
  type BookDraftProof,
  type BookDraftOptions,
} from './services/bookDraftBackupRecords';
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
