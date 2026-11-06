import type { LiteraryDraftExecution } from '../../../../functions/src/literaryDraftExecution.mjs';
export type { LiteraryDraftExecution } from '../../../../functions/src/literaryDraftExecution.mjs';
import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import type { ProseResponse, ProseApplication } from './literaryProseService';
export interface LiteraryDraft {
  collaboration?:
    | import('../../../../functions/src/literaryCollaborationProtocol.mjs').LiteraryCollaborationBinding
    | null;
  jobId: string;
  chapterId: string | null;
  state:
    | 'planning'
    | 'writing'
    | 'awaitingAcceptance'
    | 'existingText'
    | 'attention'
    | 'preserving'
    | 'done'
    | 'stale'
    | 'canceled';
  units: number;
  accepted: number;
  drafted: number;
  adopted: number;
  pendingRequestId: string | null;
  milestoneJobId: string | null;
  createdAt: number;
  completedAt: number | null;
  execution?: LiteraryDraftExecution;
  controlRevision?: number;
  paused?: boolean;
  chargedCredits?: number;
  executionStop?: 'budget' | 'credits' | 'attention' | null;
  note: string;
}
export interface LiteraryDraftFrame {
  job: LiteraryDraft;
  waitingForResult?: boolean;
  unit?: { index: number; sceneId: string } | null;
  proposal?: ProseResponse | null;
  existing?: { sceneId: string; title: string; content: string; sourceToken: string } | null;
}
export interface StartLiteraryDraft {
  target: { kind: 'book'; id: string };
  jobId: string;
  chapterId: string;
  instruction: string;
  generation?: unknown;
  execution?: LiteraryDraftExecution;
}
export interface AcceptLiteraryDraft {
  target: { kind: 'book'; id: string };
  jobId: string;
  requestId: string;
  operationId: string;
  expectedRevision: number;
}
export interface AdoptLiteraryDraft {
  target: { kind: 'book'; id: string };
  jobId: string;
  unitIndex: number;
  expectedSourceToken: string;
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const startLiteraryDraft = (input: StartLiteraryDraft, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'draft',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => call<LiteraryDraftFrame>('startLiteraryDraft', input),
  );
export const getLiteraryDraft = (bookId: string, jobId: string) =>
  call<LiteraryDraftFrame | { jobId: string; state: 'unconfirmed' }>('getLiteraryDraft', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const advanceLiteraryDraft = (bookId: string, jobId: string) =>
  call<LiteraryDraftFrame>('advanceLiteraryDraft', { target: { kind: 'book', id: bookId }, jobId });
export const cancelLiteraryDraft = (bookId: string, jobId: string) =>
  call<LiteraryDraftFrame>('cancelLiteraryDraft', { target: { kind: 'book', id: bookId }, jobId });
export const cancelPendingLiteraryDraft = (input: StartLiteraryDraft, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'draft',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => cancelLiteraryDraft(input.target.id, input.jobId),
  );
export const acceptLiteraryDraftScene = (input: AcceptLiteraryDraft, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'proseApply', input.requestId, input, () =>
    call<{ frame: LiteraryDraftFrame; application: ProseApplication }>('acceptLiteraryDraftScene', {
      target: input.target,
      jobId: input.jobId,
      requestId: input.requestId,
      operationId: input.operationId,
    }),
  );
export const adoptLiteraryDraftScene = (input: AdoptLiteraryDraft) =>
  call<LiteraryDraftFrame>('adoptLiteraryDraftScene', input);
export const regenerateLiteraryDraftScene = (bookId: string, jobId: string) =>
  call<LiteraryDraftFrame>('regenerateLiteraryDraftScene', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const restartLiteraryDraftPreservation = (bookId: string, jobId: string) =>
  call<LiteraryDraftFrame>('restartLiteraryDraftPreservation', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const listLiteraryDrafts = (
  bookId: string,
  chapterId: string,
  afterId: string | null = null,
) =>
  call<{ items: LiteraryDraft[]; nextAfterId: string | null }>('listLiteraryDrafts', {
    target: { kind: 'book', id: bookId },
    chapterId,
    afterId,
  });

export interface SetLiteraryDraftExecution {
  target: { kind: 'book'; id: string };
  jobId: string;
  operationId: string;
  expectedRevision: number;
  paused: boolean;
  execution?: LiteraryDraftExecution;
}
export const setLiteraryDraftExecution = (input: SetLiteraryDraftExecution, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'draftExecution', input.jobId, input, () =>
    call<LiteraryDraftFrame>('setLiteraryDraftExecution', input),
  );
