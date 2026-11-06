import type {
  BookBackupRecord,
  BookBackupByteSource,
  BookBackupReadSeal,
} from './bookBackupContainer.mjs';
export const BOOK_PACKAGE_FORMAT: 'writer-book-archive';
export const BOOK_PACKAGE_VERSION: 1;
export const BOOK_PACKAGE_SUPPORTED_VERSIONS: readonly [1, 2];
export type BookPackageVersion = 1 | 2;
export type BookPackageBaseSection =
  'structure' | 'resources' | 'personas' | 'universe' | 'history' | 'draft' | 'cover';
export type BookPackageSection = BookPackageBaseSection | 'editorial';
export const BOOK_PACKAGE_SECTIONS: readonly BookPackageBaseSection[];
export function bookPackageSections(version?: BookPackageVersion): readonly BookPackageSection[];
export interface BookPackageCount {
  records: number;
  payloadBytes: number;
}
export type BookPackageCounts = Record<BookPackageBaseSection, BookPackageCount> & {
  editorial?: BookPackageCount;
};
export interface BookPackageManifest {
  format: 'writer-book-archive';
  version: BookPackageVersion;
  containerVersion: 1;
  projectKind: 'book';
  bookId: string;
  sections: readonly BookPackageSection[];
}
export interface BookPackageReport {
  validation: 'envelope-only';
  manifest: BookPackageManifest;
  sections: BookPackageCounts;
  seal: BookBackupReadSeal;
}
export type BookPackageEvent =
  | { type: 'manifest'; manifest: BookPackageManifest }
  | { type: 'record'; section: BookPackageSection; record: BookBackupRecord };
export function bookPackageSection(kind: string): BookPackageSection | null;
export function createBookPackageCounts(version?: BookPackageVersion): BookPackageCounts;
export function countBookPackageRecord(
  counts: BookPackageCounts,
  section: BookPackageSection,
  record: BookBackupRecord,
  version?: BookPackageVersion,
): void;
export function bookPackageHeader(bookId: string, version?: BookPackageVersion): BookBackupRecord;
export function bookPackageEnd(
  bookId: string,
  counts: BookPackageCounts,
  version?: BookPackageVersion,
): BookBackupRecord;
export function readBookBackupPackage(
  source: BookBackupByteSource,
  options?: { signal?: AbortSignal },
): AsyncGenerator<BookPackageEvent, BookPackageReport | undefined, void>;
export function inspectBookBackupPackage(
  source: BookBackupByteSource,
  options?: { signal?: AbortSignal },
): Promise<BookPackageReport>;

export interface BookPackageCursor {
  schemaVersion: 1;
  container: import('./bookBackupContainer.mjs').BookBackupCursor | null;
  manifest: BookPackageManifest | null;
  counts: BookPackageCounts;
  sectionIndex: number;
  ended: boolean;
  done: boolean;
}
export function readBookPackageStep(
  source: BookBackupByteSource,
  cursor?: BookPackageCursor | null,
  options?: { signal?: AbortSignal },
): Promise<{
  cursor: BookPackageCursor;
  event?: BookPackageEvent | { type: 'footer' };
  span?: { offset: number; length: number };
  report?: BookPackageReport;
}>;
