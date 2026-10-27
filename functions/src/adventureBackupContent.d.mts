import type { AdventureBackupByteSource } from './adventureBackupContainer.mjs';
import type { AdventurePackageReport } from './adventureBackupPackage.mjs';
import type { AdventureContentHash } from './adventureContentHash.mjs';
export interface AdventureValidationIndex {
  add(key: readonly string[], value: Record<string, unknown>): Promise<void>;
  get(key: readonly string[]): Promise<Record<string, unknown> | undefined>;
}
export interface AdventureContentReport {
  validation: 'content-only';
  version: 1;
  envelope: AdventurePackageReport;
  totals: {
    parts: number;
    resources: Record<
      import('./adventureBackupResourceDefinitions.mjs').AdventureResourceKind,
      number
    >;
    lore: Record<'lore' | 'lore-body', number>;
    personas: Record<'adventure' | 'scene', number>;
    versions: number;
    nativeHistoryRecords: number;
    historyBytes: number;
    drafts: number;
    draftBytes: number;
    imageBindings: number;
    imageAssets: number;
    imageBytes: number;
  };
  warnings: {
    missingDates: number;
    danglingLocalReferences: number;
    externalReferences: number;
    orphanGroups: number;
    unknownOverrides: number;
    historicalOnlyResources: number;
  };
}
export function validateAdventureBackupContent(
  source: AdventureBackupByteSource,
  options: { index: AdventureValidationIndex; hash: AdventureContentHash; signal?: AbortSignal },
): Promise<AdventureContentReport>;
