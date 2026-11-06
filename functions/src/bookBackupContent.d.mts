import type { BookBackupByteSource } from './bookBackupContainer.mjs';
import type { BookPackageReport } from './bookBackupPackage.mjs';
export interface BookValidationIndex {
  add(this: void, key: readonly string[], value: Record<string, unknown>): Promise<void>;
  get(this: void, key: readonly string[]): Promise<Record<string, unknown> | undefined>;
}
export interface BookValidationHash {
  create(this: void): { update(bytes: Uint8Array): void; digest(): string; destroy(): void };
}
export interface BookContentReport {
  validation: 'content-only';
  version: 1;
  envelope: BookPackageReport;
  totals: {
    acts: number;
    chapters: number;
    resources: Record<string, number>;
    owners: Record<string, number>;
    bindings: Record<string, number>;
    profiles: number;
    versions: number;
    historyBytes: number;
    historyChunks: number;
    draftBytes: number;
    coverBytes: number;
    editorialArtifacts?: number;
    editorialLinks?: number;
  };
  warnings: {
    missingDates: number;
    danglingLocalReferences: number;
    externalReferences: number;
    orphanGroups: number;
    legacyCover: boolean;
    editorialUnavailable?: number;
    editorialExternal?: number;
    editorialUnverifiedVersions?: number;
    missingPersonas?: number;
    unknownOverrides?: number;
  };
}
export function validateBookBackupContent(
  source: BookBackupByteSource,
  options: { index: BookValidationIndex; hash: BookValidationHash; signal?: AbortSignal },
): Promise<BookContentReport>;
