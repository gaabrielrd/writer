import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import type { VersionSummary, VersionResource } from '@/features/manuscript-history';
export interface LiteraryMilestone {
  jobId: string;
  chapterId: string | null;
  kind: 'firstDraft' | 'revised' | null;
  state: 'planning' | 'capturing' | 'verifying' | 'done' | 'stale' | 'canceled';
  planned: number;
  captured: number;
  verified: number;
  createdAt: number;
  completedAt: number | null;
  wordCount: number;
  note: string;
}
export interface StartLiteraryMilestone {
  target: { kind: 'book'; id: string };
  chapterId: string;
  jobId: string;
  kind: 'firstDraft' | 'revised';
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const startLiteraryMilestone = (input: StartLiteraryMilestone, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'milestone',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => call<LiteraryMilestone>('startLiteraryMilestone', input),
  );
export const getLiteraryMilestone = (bookId: string, jobId: string) =>
  call<LiteraryMilestone | { jobId: string; state: 'unconfirmed' }>('getLiteraryMilestone', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const advanceLiteraryMilestone = (bookId: string, jobId: string) =>
  call<LiteraryMilestone>('advanceLiteraryMilestone', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const cancelLiteraryMilestone = (bookId: string, jobId: string) =>
  call<LiteraryMilestone>('cancelLiteraryMilestone', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const listLiteraryMilestones = (
  bookId: string,
  chapterId: string,
  afterId: string | null = null,
) =>
  call<{ items: LiteraryMilestone[]; nextAfterId: string | null }>('listLiteraryMilestones', {
    target: { kind: 'book', id: bookId },
    chapterId,
    afterId,
  });
export const listLiteraryMilestoneVersions = (
  bookId: string,
  jobId: string,
  afterIndex: number | null = null,
) =>
  call<{
    items: Array<{ index: number; resource: VersionResource; version: VersionSummary | null }>;
    nextAfterIndex: number | null;
  }>('listLiteraryMilestoneVersions', { target: { kind: 'book', id: bookId }, jobId, afterIndex });
