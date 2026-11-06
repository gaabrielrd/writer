import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import type { LiteraryDraftFrame } from './literaryDraftService';
import type { LiteraryReview } from './literaryReviewService';
import type { LiteraryCollaborationMode } from '../model/editorial';
export type WorkflowPhase =
  'preparation' | 'firstVersion' | 'review' | 'revisedVersion' | 'done' | 'stale' | 'canceled';
export type WorkflowAuthorizedPhase = 'firstVersion' | 'review' | 'revisedVersion';
export interface WorkflowLimits {
  maxApplications: number;
  maxCredits: number;
  maxSteps: number;
}
export interface WorkflowPassageInput {
  previousWorkflowId: string;
  actIntegrationId: string | null;
  publicationId?: string;
  inspectionId?: string;
}
export interface WorkflowPassage {
  input: WorkflowPassageInput;
  condition: 'revisedChapter' | 'integratedAct';
  previous: { chapterId: string; title: string; actId: string | null };
}
export interface WorkflowAdmission {
  version: 1;
  policy: { unit: 'chapter' | 'act'; revision: number };
  condition: 'firstUnit' | 'continuedAct' | 'publishedPredecessor';
  inspection: {
    inspectionId: string;
    previous: { id: string } | null;
    chapter: { id: string; actId: string | null };
    publication?: { count: number; scope: { kind: 'chapter' | 'act'; id: string } };
  };
}
export interface WorkflowListItem {
  jobId: string;
  chapterId: string;
  chapterTitle: string;
  actId: string | null;
  phase: WorkflowPhase;
  stop: string | null;
  paused: boolean;
  revision: number;
  createdAt: number;
  completedAt: number | null;
}
export interface LiteraryWorkflow {
  admission?: WorkflowAdmission | null;
  admissionEntered?: boolean | null;
  passage?: WorkflowPassage | null;
  passageEntered?: boolean | null;
  originToken: string;
  bookTitle: string;
  chapterTitle: string;
  registrationState: 'registering' | 'active' | 'canceled';
  jobId: string;
  chapterId: string;
  revision: number;
  phase: WorkflowPhase;
  stop: string | null;
  paused: boolean;
  steps: number;
  limits: WorkflowLimits;
  authorizedPhases: WorkflowAuthorizedPhase[];
  collaboration: {
    version: 1;
    mode: LiteraryCollaborationMode;
    revision: number;
    configured: boolean;
  };
  draftId: string;
  reviewId: string;
  manualMilestoneId: string;
  firstVersionId: string | null;
  priorApplications: number;
  priorCredits: number;
  createdAt: number;
  completedAt: number | null;
  busyStep: string | null;
  errorCode: string | null;
  gate: { revision: number; stateToken: string } | null;
}
export interface WorkflowFrame {
  job: LiteraryWorkflow;
  draft?: LiteraryDraftFrame | null;
  review?: LiteraryReview | null;
  waitingForResult?: boolean;
}
export interface WorkflowScope {
  admission?: WorkflowAdmission | null;
  actId?: string | null;
  passage?: WorkflowPassage | null;
  originToken: string;
  chapterId: string;
  bookTitle: string;
  chapterTitle: string;
  collaboration: LiteraryWorkflow['collaboration'];
}
export interface StartLiteraryWorkflow {
  admissionInspectionId?: string;
  passage?: WorkflowPassageInput;
  expectedScopeToken: string;
  target: { kind: 'book'; id: string };
  jobId: string;
  chapterId: string;
  instruction: string;
  generation?: unknown;
  limits: WorkflowLimits;
  authorizedPhases: WorkflowAuthorizedPhase[];
}
export interface AdvanceLiteraryWorkflow {
  expectedOriginToken: string;
  target: { kind: 'book'; id: string };
  jobId: string;
  operationId: string;
  expectedRevision: number;
}
export type WorkflowAction =
  | 'confirmRegistration'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'startFirstVersion'
  | 'confirmManual'
  | 'acceptFirstVersion'
  | 'acceptReview'
  | 'startRevisedVersion'
  | 'reconcileDraft'
  | 'reconcileReview';
export interface ControlLiteraryWorkflow extends AdvanceLiteraryWorkflow {
  action: WorkflowAction;
  limits?: WorkflowLimits;
  authorizedPhases?: WorkflowAuthorizedPhase[];
  expectedGateToken?: string;
  expectedFirstVersionId?: string;
  expectedReviewSourceToken?: string;
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const getLiteraryWorkflowScope = (
  bookId: string,
  chapterId: string,
  passage?: WorkflowPassageInput,
  admissionInspectionId?: string,
) =>
  call<WorkflowScope>('getLiteraryWorkflowScope', {
    ...(passage ? { passage } : {}),
    ...(admissionInspectionId ? { admissionInspectionId } : {}),
    target: { kind: 'book', id: bookId },
    chapterId,
  });
export const startLiteraryWorkflow = (input: StartLiteraryWorkflow, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'workflow',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => call<WorkflowFrame>('startLiteraryWorkflow', input),
  );
export const getLiteraryWorkflow = (bookId: string, jobId: string) =>
  call<WorkflowFrame>('getLiteraryWorkflow', { target: { kind: 'book', id: bookId }, jobId });
export const advanceLiteraryWorkflow = (input: AdvanceLiteraryWorkflow, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'workflow', input.jobId, input, () =>
    call<WorkflowFrame>('advanceLiteraryWorkflow', input),
  );
export const setLiteraryWorkflowControl = (input: ControlLiteraryWorkflow, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'workflow', input.jobId, input, () =>
    call<WorkflowFrame>('setLiteraryWorkflowControl', input),
  );
export const listLiteraryWorkflows = (
  bookId: string,
  chapterId: string | null,
  afterId: string | null = null,
) =>
  call<{
    items: WorkflowListItem[];
    nextAfterId: string | null;
  }>('listLiteraryWorkflows', {
    target: { kind: 'book', id: bookId },
    chapterId,
    afterId,
    limit: 25,
  });
