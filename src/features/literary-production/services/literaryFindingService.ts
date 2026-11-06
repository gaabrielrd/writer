import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
export type FindingAction = 'investigate' | 'correct' | 'retain' | 'defer';
export interface FindingSource {
  jobId: string;
  requestId: string;
  index: number;
  severity?: 'blocking' | 'warning' | 'suggestion';
}
export interface FindingTarget {
  kind:
    | 'chapter'
    | 'scene'
    | 'act'
    | 'arc'
    | 'event'
    | 'localLore'
    | 'globalLore'
    | 'plan'
    | 'contract'
    | 'architecture';
  id: string;
  scopeId: string | null;
}
export interface FindingTargetState {
  target: FindingTarget;
  label: string | null;
  identityToken: string;
  versionToken: string;
  contentHash: string;
  revision: number;
  proofKind: 'text' | 'editorial' | 'reference' | 'architecture';
}
export interface FindingDecision {
  id: string;
  revision: number;
  source: FindingSource;
  action: FindingAction;
  rationale: string;
  target: FindingTarget | null;
  baseline: FindingTargetState | null;
  state: 'planned' | 'retained' | 'deferred' | 'investigating' | 'correctionConfirmed';
  createdAt: number;
  updatedAt: number;
  effectiveRetention: boolean;
  confirmationCurrent: boolean;
  targetUnavailable?: boolean;
  originalSourceCurrent: boolean;
  currentTarget: FindingTargetState | null;
  historical?: boolean;
  sourceScope?: { level: 'act' | 'book'; actId: string | null; audit?: 'architecture' } | null;
  correction: {
    successorJobId: string;
    versionId: string | null;
    proofKind: 'text' | 'editorial' | 'reference' | 'architecture';
    note: string;
    confirmedAt: number;
  } | null;
}
export interface SaveFindingDecision {
  target: { kind: 'book'; id: string };
  jobId: string;
  requestId: string;
  findingIndex: number;
  operationId: string;
  expectedRevision: number;
  action: FindingAction;
  rationale: string;
  targetResource: FindingTarget | null;
}
export interface ConfirmFindingCorrection {
  target: { kind: 'book'; id: string };
  id: string;
  operationId: string;
  expectedRevision: number;
  successorJobId: string;
  note: string;
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method, {
      timeout: 120000,
    })(input)
  ).data;
}
export const getLiteraryFindingContext = (
  bookId: string,
  source: FindingSource,
  afterArchitectureIndex?: number,
) =>
  call<{
    id: string;
    source: FindingSource;
    options: Array<{ target: FindingTarget; label: string }>;
    nextAfterArchitectureIndex?: number | null;
    architectureAudit?: boolean;
  }>('getLiteraryFindingContext', {
    target: { kind: 'book', id: bookId },
    jobId: source.jobId,
    requestId: source.requestId,
    findingIndex: source.index,
    ...(afterArchitectureIndex === undefined ? {} : { afterArchitectureIndex }),
  });
export const getLiteraryFindingDecision = (bookId: string, id: string) =>
  call<FindingDecision | { id: string; state: 'unrecorded' }>('getLiteraryFindingDecision', {
    target: { kind: 'book', id: bookId },
    id,
  });
export const saveLiteraryFindingDecision = (input: SaveFindingDecision, actorId: string) => {
  // The book scope and correction destination have separate fields on the wire.
  const wire = {
    target: input.target,
    jobId: input.jobId,
    requestId: input.requestId,
    findingIndex: input.findingIndex,
    operationId: input.operationId,
    expectedRevision: input.expectedRevision,
    action: input.action,
    rationale: input.rationale,
    correctionTarget: input.targetResource,
  };
  return withLiteraryRecovery(actorId, input.target.id, 'finding', input.jobId, wire, () =>
    call<{ id: string; revision: number; updatedAt: number }>('saveLiteraryFindingDecision', wire),
  );
};
export const confirmLiteraryFindingCorrection = (
  input: ConfirmFindingCorrection,
  actorId: string,
) =>
  withLiteraryRecovery(actorId, input.target.id, 'finding', input.id, input, () =>
    call<{ id: string; revision: number; updatedAt: number }>(
      'confirmLiteraryFindingCorrection',
      input,
    ),
  );
export const listLiteraryFindingDecisions = (
  bookId: string,
  jobId: string,
  afterId: string | null = null,
) =>
  call<{
    items: Array<
      Pick<
        FindingDecision,
        'id' | 'revision' | 'source' | 'action' | 'state' | 'rationale' | 'updatedAt'
      >
    >;
    nextAfterId: string | null;
  }>('listLiteraryFindingDecisions', { target: { kind: 'book', id: bookId }, jobId, afterId });
export const listLiteraryFindingDecisionVersions = (
  bookId: string,
  id: string,
  beforeRevision: number | null = null,
) =>
  call<{
    items: Array<Pick<FindingDecision, 'id' | 'revision' | 'action' | 'state' | 'updatedAt'>>;
    nextBeforeRevision: number | null;
  }>('listLiteraryFindingDecisionVersions', {
    target: { kind: 'book', id: bookId },
    id,
    beforeRevision,
  });
export const getLiteraryFindingDecisionVersion = (bookId: string, id: string, revision: number) =>
  call<FindingDecision>('getLiteraryFindingDecisionVersion', {
    target: { kind: 'book', id: bookId },
    id,
    revision,
  });
export function findingRequestRejected(cause: unknown) {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    [
      'functions/invalid-argument',
      'functions/failed-precondition',
      'functions/not-found',
      'functions/permission-denied',
      'functions/unauthenticated',
      'functions/resource-exhausted',
    ].includes(String(cause.code))
  );
}
