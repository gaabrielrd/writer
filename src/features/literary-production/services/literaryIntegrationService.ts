import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import type {
  IntegrationReading,
  normalizeLiteraryIntegrationSynthesis,
} from '../../../../functions/src/literaryIntegrationProtocol.mjs';
import type { ChatGenerationRequest } from '../../../../functions/src/chatGeneration.mjs';
export interface LiteraryIntegration {
  jobId: string;
  audit?: 'architecture';
  architecture?: {
    families: string[];
    sources: number;
    readSources: number;
    segments: number;
    verifiedSources: number;
    inventoryComplete: boolean;
    complete: boolean;
    referenceBodiesRead: false;
  };
  level: 'act' | 'book' | null;
  actId: string | null;
  state:
    | 'planning'
    | 'reading'
    | 'synthesizing'
    | 'verifying'
    | 'done'
    | 'attention'
    | 'stale'
    | 'canceled';
  chapters: number;
  contextChapters: number;
  units: number;
  readUnits: number;
  segments: number;
  boundaries: number;
  expectedBoundaries: number;
  analyses: number;
  blocking: number;
  warnings: number;
  suggestions: number;
  retainedBlocking?: number;
  unresolvedBlocking?: number;
  sourceToken: string | null;
  pendingRequestId: string | null;
  finalRequestId: string | null;
  authorAccepted: boolean;
  recheckOperationId?: string | null;
  lastRecheckId?: string | null;
  canRecheck?: boolean;
  reusedAnalyses?: number;
  createdAt: number;
  completedAt: number | null;
  message: string | null;
  waitingForResult?: boolean;
  requestState?: string;
  currentUnknown?: boolean;
  coverage: {
    scope: 'act' | 'book' | null;
    wholeAct: boolean;
    wholeBook: boolean;
    verifiedUnits: number;
    verifiedAnalyses: number;
  };
}
export interface StartLiteraryIntegration {
  audit?: 'architecture';
  target: { kind: 'book'; id: string };
  jobId: string;
  level: 'act' | 'book';
  actId: string | null;
  instruction: string;
  planIds?: string[];
  generation?: unknown;
}
export type IntegrationResult =
  | {
      requestId: string;
      state: 'done';
      jobId: string;
      kind: 'reading' | 'boundary' | 'synthesis' | 'architecture';
      result: IntegrationReading | ReturnType<typeof normalizeLiteraryIntegrationSynthesis>;
      reusedFrom?: string | null;
      evidenceIds: string[];
      sources: Array<{
        id: string;
        label: string;
        offsetBase: number;
        format?: 'canonical-json';
        architectureSource?: { kind: string; id: string; arcId: string | null };
      }>;
    }
  | { requestId: string; state: 'running' | 'error' | 'canceled' | 'stale' | 'unconfirmed' };
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method, {
      timeout: 120000,
    })(input)
  ).data;
}
export const startLiteraryIntegration = (input: StartLiteraryIntegration, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'integration',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => call<LiteraryIntegration>('startLiteraryIntegration', input),
  );
export const getLiteraryIntegrationSetup = (bookId: string, jobId: string) =>
  call<{
    audit?: 'architecture';
    level: 'act' | 'book';
    actId: string | null;
    instruction: string;
    planIds?: string[];
    generation: ChatGenerationRequest;
  }>('getLiteraryIntegrationSetup', { target: { kind: 'book', id: bookId }, jobId });
export const getLiteraryIntegration = (bookId: string, jobId: string) =>
  call<LiteraryIntegration | { jobId: string; state: 'unconfirmed' }>('getLiteraryIntegration', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const advanceLiteraryIntegration = (bookId: string, jobId: string) =>
  call<LiteraryIntegration>('advanceLiteraryIntegration', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const cancelLiteraryIntegration = (bookId: string, jobId: string) =>
  call<LiteraryIntegration>('cancelLiteraryIntegration', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const cancelPendingLiteraryIntegration = (
  input: StartLiteraryIntegration,
  actorId: string,
) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'integration',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => cancelLiteraryIntegration(input.target.id, input.jobId),
  );
export const cancelPendingLiteraryIntegrationAnalysis = (bookId: string, jobId: string) =>
  call<LiteraryIntegration>('cancelPendingLiteraryIntegrationAnalysis', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const retryLiteraryIntegrationAnalysis = (bookId: string, jobId: string) =>
  call<LiteraryIntegration>('retryLiteraryIntegrationAnalysis', {
    target: { kind: 'book', id: bookId },
    jobId,
  });
export const acceptLiteraryIntegration = (
  bookId: string,
  jobId: string,
  expectedSourceToken: string,
) =>
  call<LiteraryIntegration>('acceptLiteraryIntegration', {
    target: { kind: 'book', id: bookId },
    jobId,
    expectedSourceToken,
  });
export const listLiteraryIntegrations = (bookId: string, afterId: string | null = null) =>
  call<{ items: LiteraryIntegration[]; nextAfterId: string | null }>('listLiteraryIntegrations', {
    target: { kind: 'book', id: bookId },
    afterId,
  });
export const listLiteraryIntegrationResults = (
  bookId: string,
  jobId: string,
  afterIndex: number | null = null,
) =>
  call<{
    items: Array<{
      index: number;
      requestId: string;
      kind: 'reading' | 'boundary' | 'synthesis' | 'architecture';
    }>;
    nextAfterIndex: number | null;
  }>('listLiteraryIntegrationResults', { target: { kind: 'book', id: bookId }, jobId, afterIndex });
export const getLiteraryIntegrationResult = (bookId: string, jobId: string, requestId: string) =>
  call<IntegrationResult>('getLiteraryIntegrationResult', {
    target: { kind: 'book', id: bookId },
    jobId,
    requestId,
  });

export interface ArchitectureLocator {
  kind: string;
  id: string;
  arcId: string | null;
}
export interface ArchitectureInventoryPage {
  items: Array<{
    index: number;
    source: ArchitectureLocator;
    read: boolean;
    available: boolean;
    label: string | null;
  }>;
  nextAfterIndex: number | null;
  inventoryComplete: boolean;
  state: LiteraryIntegration['state'];
}
export type ArchitectureSourcePreview =
  | {
      state: 'ready';
      index: number;
      segment: number;
      segmentCount: number;
      source: {
        id: string;
        label: string;
        locator: ArchitectureLocator;
        format: 'canonical-json';
        text: string;
        offsetBase: number;
      };
      editorial: {
        instruction: string;
        documents: Array<{ id: string; label: string; text: string }>;
      };
      scope: { manuscriptRead: false; wholeArchitecture: false };
    }
  | { state: 'stale' | 'canceled' };
export const listLiteraryArchitectureInventory = (
  bookId: string,
  jobId: string,
  afterIndex: number | null = null,
) =>
  call<ArchitectureInventoryPage>('listLiteraryArchitectureInventory', {
    target: { kind: 'book', id: bookId },
    jobId,
    afterIndex,
  });
export const previewLiteraryArchitectureSource = (
  bookId: string,
  jobId: string,
  index: number,
  segment = 0,
) =>
  call<ArchitectureSourcePreview>('previewLiteraryArchitectureSource', {
    target: { kind: 'book', id: bookId },
    jobId,
    index,
    segment,
  });
