import type { BookBackupByteSource } from './bookBackupContainer.mjs';
import type {
  BookContentReport,
  BookValidationHash,
  BookValidationIndex,
} from './bookBackupContent.mjs';
export interface BookLegacyReviewReport {
  validation: 'legacy-content-only';
  source: {
    format: 'writer-book-backup';
    version: 1 | 2 | 3 | 4 | 5 | 6;
    size: number;
    fingerprint: string;
    bookId: string;
    universeCandidate: { id: string; incarnation: 'not-recorded' } | null;
    availability: {
      history: 'not-recorded';
      progress: 'not-recorded';
      draft: 'not-separable';
      cover: 'not-recorded' | 'url-only' | 'none-declared';
      inactiveRanks: 'not-recorded' | 'not-applicable';
    };
    ignoredGlobalEntries: number;
    publicationDiscarded: boolean;
  };
  totals: BookContentReport['totals'];
  warnings: BookContentReport['warnings'] & { missingPersonas: number; unknownOverrides: number };
  legacyWarnings: {
    resolvedLabelsIgnored: number;
    unusedProfiles: number;
    renderedAssemblies: number;
    derivedRankBuffers: number;
  };
}
export function inspectBookLegacyContent(
  source: BookBackupByteSource,
  options: { index: BookValidationIndex; hash: BookValidationHash; signal?: AbortSignal },
): Promise<BookLegacyReviewReport>;
