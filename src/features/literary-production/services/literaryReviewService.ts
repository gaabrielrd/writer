import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import type { ProseCoverage } from './literaryProseService';
export interface LiteraryReview {
  paused?: boolean;
  jobId: string;
  chapterId: string | null;
  sourceToken: string | null;
  state: 'planning' | 'reviewing' | 'attention' | 'done' | 'stale' | 'canceled';
  units: number;
  completedUnits: number;
  analyses: number;
  blocking: number;
  warnings: number;
  suggestions: number;
  pendingRequestId: string | null;
  createdAt: number;
  completedAt: number | null;
  authorAccepted: boolean;
  waitingForResult?: boolean;
  requestState?: string;
  revisedMilestoneId?: string | null;
  preservationState?: 'unrecorded' | 'capturing' | 'attention' | 'done';
  preservationCurrent?: boolean;
  preservedAt?: number | null;
  preservationProgress?: { planned: number; captured: number; verified: number } | null;
  coverage: {
    scope: 'chapter-scenes';
    wholeChapter: boolean;
    wholeBook: false;
    layers: string[];
    units: number;
    completedUnits: number;
  };
}
export interface StartLiteraryReview {
  target: { kind: 'book'; id: string };
  jobId: string;
  chapterId: string;
  instruction: string;
  generation?: unknown;
  planIds?: string[];
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const startLiteraryReview = (input: StartLiteraryReview, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'review',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => call<LiteraryReview>('startLiteraryReview', input),
  );
export const getLiteraryReview = (bookId: string, jobId: string) =>
  call<LiteraryReview | { jobId: string; state: 'unconfirmed' }>('getLiteraryReview', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const advanceLiteraryReview = (bookId: string, jobId: string) =>
  call<LiteraryReview>('advanceLiteraryReview', { target: { kind: 'book', id: bookId }, jobId });
export const cancelLiteraryReview = (bookId: string, jobId: string) =>
  call<LiteraryReview>('cancelLiteraryReview', { target: { kind: 'book', id: bookId }, jobId });
export const cancelPendingLiteraryReview = (input: StartLiteraryReview, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'review',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => cancelLiteraryReview(input.target.id, input.jobId),
  );
export const cancelPendingLiteraryReviewAnalysis = (bookId: string, jobId: string) =>
  call<LiteraryReview>('cancelPendingLiteraryReviewAnalysis', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const retryLiteraryReviewAnalysis = (bookId: string, jobId: string) =>
  call<LiteraryReview>('retryLiteraryReviewAnalysis', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const acceptLiteraryReview = (bookId: string, jobId: string, expectedSourceToken: string) =>
  call<LiteraryReview>('acceptLiteraryReview', {
    target: { kind: 'book', id: bookId },
    jobId,
    expectedSourceToken,
  });
export const advanceLiteraryReviewedVersion = (
  bookId: string,
  jobId: string,
  expectedSourceToken: string,
  restart = false,
) =>
  call<LiteraryReview>('advanceLiteraryReviewedVersion', {
    target: { kind: 'book', id: bookId },
    jobId,
    expectedSourceToken,
    restart,
  });
export const listLiteraryReviews = (
  bookId: string,
  chapterId: string,
  afterId: string | null = null,
) =>
  call<{ items: LiteraryReview[]; nextAfterId: string | null }>('listLiteraryReviews', {
    target: { kind: 'book', id: bookId },
    chapterId,
    afterId,
  });
export const listLiteraryReviewAnalyses = (
  bookId: string,
  jobId: string,
  afterId: string | null = null,
) =>
  call<{
    items: Array<{
      id: string;
      jobId: string;
      requestId: string;
      unitIndex: number;
      layer: string;
      segment: number;
      coverage: ProseCoverage;
    }>;
    nextAfterId: string | null;
    state?: LiteraryReview['state'];
  }>('listLiteraryReviewAnalyses', { target: { kind: 'book', id: bookId }, jobId, afterId });
