import type {
  BookBackupRecord,
  BookBackupByteSource,
  BookBackupReadSeal,
} from './bookBackupContainer.mjs';
export const BOOK_PACKAGE_FORMAT: 'writer-book-archive';
export const BOOK_PACKAGE_VERSION: 1;
export type BookPackageSection =
  'structure' | 'resources' | 'personas' | 'universe' | 'history' | 'draft' | 'cover';
export const BOOK_PACKAGE_SECTIONS: readonly BookPackageSection[];
export interface BookPackageCount {
  records: number;
  payloadBytes: number;
}
export type BookPackageCounts = Record<BookPackageSection, BookPackageCount>;
export interface BookPackageManifest {
  format: 'writer-book-archive';
  version: 1;
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
export function createBookPackageCounts(): BookPackageCounts;
export function countBookPackageRecord(
  counts: BookPackageCounts,
  section: BookPackageSection,
  record: BookBackupRecord,
): void;
export function bookPackageHeader(bookId: string): BookBackupRecord;
export function bookPackageEnd(bookId: string, counts: BookPackageCounts): BookBackupRecord;
export function readBookBackupPackage(
  source: BookBackupByteSource,
  options?: { signal?: AbortSignal },
): AsyncGenerator<BookPackageEvent, BookPackageReport | undefined, void>;
export function inspectBookBackupPackage(
  source: BookBackupByteSource,
  options?: { signal?: AbortSignal },
): Promise<BookPackageReport>;
