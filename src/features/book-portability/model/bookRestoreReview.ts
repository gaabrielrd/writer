import type { BookContentReport } from '../../../../functions/src/bookBackupContent.mjs';
import type { BookLegacyReviewReport } from '../../../../functions/src/bookLegacyReview.mjs';
import type { BookRestoreSourceDescriptor } from './bookRestoreTransfer';
export const BOOK_RESTORE_REVIEW_POLICIES = Object.freeze({
  destination: 'new-private-copy',
  universe: 'relink-original-if-authorized',
  draft: 'saved-text-with-draft-version',
  history: 'all-recorded',
  media: 'embedded-own-bytes',
} as const);
export type BookRestoreLocalReview = {
  schemaVersion: 1;
  source: BookRestoreSourceDescriptor;
  sourceBookId: string;
  totals: BookContentReport['totals'];
  warnings: BookContentReport['warnings'] & { missingPersonas?: number; unknownOverrides?: number };
  legacy: null | {
    availability: BookLegacyReviewReport['source']['availability'];
    legacyWarnings: BookLegacyReviewReport['legacyWarnings'];
    ignoredGlobalEntries: number;
    publicationDiscarded: boolean;
  };
  policies: typeof BOOK_RESTORE_REVIEW_POLICIES;
};
export type InspectedBookRestore = {
  review: BookRestoreLocalReview;
  reviewHash: string;
};
