import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import {
  beginLiteraryOperation,
  rememberLiterarySequenceOperation,
  finishLiteraryOperation,
  listLiteraryPendingOperations,
  LITERARY_SEQUENCE_METHODS,
  type LiteraryPendingOperation,
  type LiterarySequenceMethod,
} from './literaryRecoveryStorage';
import type {
  WorkflowFrame,
  WorkflowLimits,
  WorkflowAuthorizedPhase,
  LiteraryWorkflow,
} from './literaryWorkflowService';

type Target = { kind: 'book'; id: string };
export type SequenceState = 'active' | 'done' | 'stale' | 'canceled';
export interface SequenceChapter {
  id: string;
  title: string;
  order: number;
  actId: string | null;
  actOrder: number | null;
}
export interface SequenceScope {
  originToken: string;
  bookTitle: string;
  chapters: SequenceChapter[];
  collaboration: LiteraryWorkflow['collaboration'];
}
export interface LiterarySequence {
  jobId: string;
  bookTitle: string;
  originToken: string;
  chapters: SequenceChapter[];
  registrationState: 'registering' | 'active' | 'canceled';
  revision: number;
  state: SequenceState;
  paused: boolean;
  index: number;
  currentWorkflowId: string | null;
  completed: { index: number; workflowId: string }[];
  stop: string | null;
  busyStep: string | null;
  limits: WorkflowLimits;
  authorizedPhases: WorkflowAuthorizedPhase[];
  continueBetweenChapters: boolean;
  collaboration: LiteraryWorkflow['collaboration'];
  applications: number;
  credits: number;
  steps: number;
  createdAt: number;
  completedAt: number | null;
}
export interface SequenceFrame {
  job: LiterarySequence;
  workflow?: WorkflowFrame;
  waitingForResult?: boolean;
}
export interface SequenceListItem {
  jobId: string;
  registrationState: LiterarySequence['registrationState'];
  state: SequenceState;
  paused: boolean;
  revision: number;
  index: number;
  chapterCount: number;
  createdAt: number;
  completedAt: number | null;
}
export interface StartLiterarySequence {
  target: Target;
  jobId: string;
  chapterIds: string[];
  expectedScopeToken: string;
  instruction: string;
  generation?: unknown;
  limits: WorkflowLimits;
  authorizedPhases: WorkflowAuthorizedPhase[];
  continueBetweenChapters: boolean;
}
export interface AdvanceLiterarySequence {
  target: Target;
  jobId: string;
  operationId: string;
  expectedRevision: number;
  expectedOriginToken: string;
  actIntegrationId?: string | null;
  admissionInspectionId?: string | null;
  previousWorkflowId?: string | null;
}
export type SequenceAction =
  'pause' | 'resume' | 'cancel' | 'authorizeNext' | 'confirmRegistration';
export interface ControlLiterarySequence extends Omit<
  AdvanceLiterarySequence,
  'actIntegrationId' | 'admissionInspectionId' | 'previousWorkflowId'
> {
  action: SequenceAction;
  limits?: WorkflowLimits;
  authorizedPhases?: WorkflowAuthorizedPhase[];
}
export type SequenceOperation =
  | { state: 'unconfirmed' }
  | {
      state: 'running' | 'confirmed' | 'superseded';
      method: LiterarySequenceMethod;
      id: string;
      revision: number;
      updatedAt: number;
      requestHash: string | null;
      result?: {
        disposition: 'advanced' | 'stopped' | 'completedUnit' | 'controlled' | 'waiting';
        index: number;
        currentWorkflowId: string | null;
        state: SequenceState;
        paused: boolean;
        stop: string | null;
      };
    };
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const getLiterarySequenceScope = (bookId: string, chapterIds: string[]) =>
  call<SequenceScope>('getLiterarySequenceScope', {
    target: { kind: 'book', id: bookId },
    chapterIds: [...chapterIds],
  });
export const getLiterarySequence = (bookId: string, jobId: string) =>
  call<SequenceFrame>('getLiterarySequence', { target: { kind: 'book', id: bookId }, jobId });
export const listLiterarySequences = (bookId: string, afterId: string | null = null) =>
  call<{ items: SequenceListItem[]; nextAfterId: string | null }>('listLiterarySequences', {
    target: { kind: 'book', id: bookId },
    afterId,
    limit: 25,
  });
export const getLiterarySequenceOperation = (bookId: string, jobId: string, operationId: string) =>
  call<SequenceOperation>('getLiterarySequenceOperation', {
    target: { kind: 'book', id: bookId },
    jobId,
    operationId,
  });

/** Match the original command, not the current state or revision of the parent. */
export function verifyLiterarySequenceOperation(
  entry: LiteraryPendingOperation,
  result: SequenceOperation,
) {
  if (
    entry.kind !== 'sequence' ||
    !entry.method ||
    !LITERARY_SEQUENCE_METHODS.includes(entry.method)
  )
    throw new Error('Preserve a identificação do método original da sequência.');
  if (result.state === 'unconfirmed') return result;
  const expectedRevision =
    entry.expectedRevision +
    (entry.method === 'advanceLiterarySequence' && result.state !== 'confirmed' ? 0 : 1);
  if (
    !['running', 'confirmed', 'superseded'].includes(result.state) ||
    result.requestHash !== entry.wireHash ||
    result.id !== entry.id ||
    result.method !== entry.method ||
    result.revision !== expectedRevision ||
    (result.state === 'running' && result.method !== 'advanceLiterarySequence')
  )
    throw new Error(
      'A confirmação não corresponde ao pedido original da sequência. Preserve a pendência.',
    );
  return result;
}
async function confirm(entry: LiteraryPendingOperation) {
  const result = verifyLiterarySequenceOperation(
    entry,
    await getLiterarySequenceOperation(entry.bookId, entry.id, entry.operationId),
  );
  if (result.state === 'confirmed' || result.state === 'superseded') finishLiteraryOperation(entry);
}
async function sendSequence<T extends { target: Target; jobId: string }>(
  method: LiterarySequenceMethod,
  input: T,
  actorId: string,
  operationId: string,
  expectedRevision: number,
) {
  // Freeze before the first await; edits while hashing cannot alter the producer request.
  const wire = structuredClone(input);
  const entry = await beginLiteraryOperation(
    actorId,
    wire.target.id,
    'sequence',
    wire.jobId,
    { ...wire, operationId, expectedRevision },
    method,
  );
  const frame = await call<SequenceFrame>(method, { ...wire, requestHash: entry.wireHash });
  // A returned frame may precede the provider result. Only the native outcome closes debt.
  await confirm(entry);
  return frame;
}
export const startLiterarySequence = (input: StartLiterarySequence, actorId: string) =>
  sendSequence('startLiterarySequence', input, actorId, input.jobId, 0);
export const advanceLiterarySequence = (input: AdvanceLiterarySequence, actorId: string) =>
  sendSequence(
    'advanceLiterarySequence',
    input,
    actorId,
    input.operationId,
    input.expectedRevision,
  );
export const setLiterarySequenceControl = (input: ControlLiterarySequence, actorId: string) =>
  sendSequence(
    'setLiterarySequenceControl',
    input,
    actorId,
    input.operationId,
    input.expectedRevision,
  );

/** Explicit retry of the registered server action; neither lookup nor opening a panel calls it. */
export async function resumeLiterarySequenceOperation(
  inputEntry: LiteraryPendingOperation,
  actorId: string,
  stillCurrent: () => boolean = () => true,
) {
  const entry = structuredClone(inputEntry);
  if (
    entry.actorId !== actorId ||
    entry.kind !== 'sequence' ||
    entry.method !== 'advanceLiterarySequence'
  )
    throw new Error('Retome o avanço somente na conta e no pedido originais.');
  const saved = listLiteraryPendingOperations(actorId, entry.bookId).find(
    (value) => value.operationId === entry.operationId,
  );
  if (!saved || JSON.stringify(saved) !== JSON.stringify(entry))
    throw new Error('O acompanhamento local mudou. Consulte a pendência original.');
  const outcome = verifyLiterarySequenceOperation(
    entry,
    await getLiterarySequenceOperation(entry.bookId, entry.id, entry.operationId),
  );
  if (!stillCurrent()) throw new Error('A sessão mudou. Consulte o pedido na conta original.');
  if (outcome.state === 'unconfirmed')
    throw new Error('O avanço original ainda não foi confirmado.');
  if (outcome.state === 'running') {
    const frame = await call<SequenceFrame>('resumeLiterarySequenceOperation', {
      target: { kind: 'book', id: entry.bookId },
      jobId: entry.id,
      operationId: entry.operationId,
    });
    await confirm(entry);
    return frame;
  }
  finishLiteraryOperation(entry);
  return getLiterarySequence(entry.bookId, entry.id);
}

/** Recovery on another device records the authorized receipt hash, never a reconstructed producer wire. */
export async function recoverLiterarySequenceStep(
  bookId: string,
  jobId: string,
  operationId: string,
  actorId: string,
  stillCurrent: () => boolean = () => true,
) {
  const existing = listLiteraryPendingOperations(actorId, bookId).find(
    (entry) => entry.operationId === operationId,
  );
  if (existing) {
    if (existing.id !== jobId || existing.kind !== 'sequence' || existing.actorId !== actorId)
      throw new Error('O acompanhamento pertence a outra sequência. Preserve a pendência.');
    return resumeLiterarySequenceOperation(existing, actorId, stillCurrent);
  }
  const outcome = await getLiterarySequenceOperation(bookId, jobId, operationId);
  if (!stillCurrent()) throw new Error('A sessão mudou. Consulte o pedido na conta original.');
  if (
    outcome.state === 'unconfirmed' ||
    outcome.method !== 'advanceLiterarySequence' ||
    outcome.id !== jobId ||
    !outcome.requestHash ||
    !/^[a-f0-9]{64}$/.test(outcome.requestHash) ||
    !Number.isSafeInteger(outcome.revision) ||
    outcome.revision < 1
  )
    throw new Error('A referência original não está disponível para esta retomada.');
  if (outcome.state !== 'running') return getLiterarySequence(bookId, jobId);
  const entry: LiteraryPendingOperation = {
    version: 1,
    actorId,
    bookId,
    operationId,
    kind: 'sequence',
    id: jobId,
    expectedRevision: outcome.revision,
    wireHash: outcome.requestHash,
    method: 'advanceLiterarySequence',
  };
  rememberLiterarySequenceOperation(entry);
  return resumeLiterarySequenceOperation(entry, actorId, stillCurrent);
}
