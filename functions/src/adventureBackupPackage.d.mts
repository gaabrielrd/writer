import type {
  AdventureBackupRecord,
  AdventureBackupByteSource,
  AdventureBackupReadSeal,
} from './adventureBackupContainer.mjs';
export const ADVENTURE_PACKAGE_FORMAT: 'writer-adventure-archive';
export const ADVENTURE_PACKAGE_VERSION: 1;
export type AdventurePackageSection =
  'structure' | 'resources' | 'lore' | 'personas' | 'universe' | 'history' | 'drafts' | 'images';
export const ADVENTURE_PACKAGE_SECTIONS: readonly AdventurePackageSection[];
export interface AdventurePackageCount {
  records: number;
  payloadBytes: number;
}
export type AdventurePackageCounts = Record<AdventurePackageSection, AdventurePackageCount>;
export interface AdventurePackageManifest {
  format: 'writer-adventure-archive';
  version: 1;
  containerVersion: 1;
  projectKind: 'adventure';
  adventureId: string;
  sections: readonly AdventurePackageSection[];
}
export interface AdventurePackageReport {
  validation: 'envelope-only';
  manifest: AdventurePackageManifest;
  sections: AdventurePackageCounts;
  seal: AdventureBackupReadSeal;
}
export type AdventurePackageEvent =
  | { type: 'manifest'; manifest: AdventurePackageManifest }
  | { type: 'record'; section: AdventurePackageSection; record: AdventureBackupRecord };
export function adventurePackageSection(kind: string): AdventurePackageSection | null;
export function createAdventurePackageCounts(): AdventurePackageCounts;
export function countAdventurePackageRecord(
  counts: AdventurePackageCounts,
  section: AdventurePackageSection,
  record: AdventureBackupRecord,
): void;
export function adventurePackageHeader(adventureId: string): AdventureBackupRecord;
export function adventurePackageEnd(
  adventureId: string,
  counts: AdventurePackageCounts,
): AdventureBackupRecord;
export function readAdventureBackupPackage(
  source: AdventureBackupByteSource,
  options?: { signal?: AbortSignal },
): AsyncGenerator<AdventurePackageEvent, AdventurePackageReport | undefined, void>;
export function inspectAdventureBackupPackage(
  source: AdventureBackupByteSource,
  options?: { signal?: AbortSignal },
): Promise<AdventurePackageReport>;

export interface AdventurePackageCursor {
  schemaVersion: 1;
  container: import('./adventureBackupContainer.mjs').AdventureBackupCursor | null;
  manifest: AdventurePackageManifest | null;
  counts: AdventurePackageCounts;
  sectionIndex: number;
  ended: boolean;
  done: boolean;
}
export function readAdventurePackageStep(
  source: AdventureBackupByteSource,
  cursor?: AdventurePackageCursor | null,
  options?: { signal?: AbortSignal },
): Promise<{
  cursor: AdventurePackageCursor;
  event?: AdventurePackageEvent | { type: 'footer' };
  span?: { offset: number; length: number };
  report?: AdventurePackageReport;
}>;
