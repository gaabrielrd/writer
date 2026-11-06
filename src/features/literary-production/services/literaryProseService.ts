import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import type {
  LiteraryProseMode,
  LiteraryProseOutput,
} from '../../../../functions/src/literaryProseProtocol.mjs';
export type {
  LiteraryProseMode,
  LiteraryProseOutput,
} from '../../../../functions/src/literaryProseProtocol.mjs';
export interface ProseCoverage {
  scope: 'scene-segment';
  wholeChapter: false;
  wholeBook: false;
  sourceToken: string;
  sourceCharacters: number;
  segment: number;
  segmentCount: number;
  start: number;
  end: number;
  coreStart: number;
  coreEnd: number;
  completeScene: boolean;
  previousSceneIncluded: boolean;
}
import type { LiteraryCollaborationBinding } from '../../../../functions/src/literaryCollaborationProtocol.mjs';
export interface ProseResponse {
  collaboration?: LiteraryCollaborationBinding;
  requestId: string;
  state:
    'unconfirmed' | 'running' | 'done' | 'applied' | 'stale' | 'revoked' | 'canceled' | 'error';
  current?: boolean;
  historical?: boolean;
  chapterId?: string;
  sceneId?: string;
  mode?: LiteraryProseMode;
  instruction?: string;
  generation?: unknown;
  coverage?: ProseCoverage;
  sourceRevision?: number;
  applyCost?: number;
  applicable?: boolean;
  hasBlockingFindings?: boolean;
  documents?: Array<{ id: string; label: string; text: string; revision: number | null }>;
  sceneTitle?: string;
  sourceText?: string;
  result?: LiteraryProseOutput | null;
  message?: string;
}
export interface ProseSourceInfo {
  collaboration?: LiteraryCollaborationBinding;
  sceneId: string;
  chapterId: string;
  title: string;
  sourceToken: string;
  characters: number;
  empty: boolean;
  segments: Array<{
    index: number;
    start: number;
    end: number;
    coreStart: number;
    coreEnd: number;
  }>;
}
export interface StartLiteraryProse {
  target: { kind: 'book'; id: string };
  requestId: string;
  chapterId: string;
  sceneId: string;
  mode: LiteraryProseMode;
  segment: number;
  instruction: string;
  generation?: unknown;
  expectedSourceToken: string;
  planIds?: string[];
}
export interface ApplyLiteraryProse {
  target: { kind: 'book'; id: string };
  requestId: string;
  operationId: string;
  expectedRevision: number;
}
export interface ProseApplication {
  requestId: string;
  operationId: string;
  fingerprint: string;
  sceneId: string;
  chapterId: string;
  revision: number;
  contentHash: string;
  chargedCredits: number;
  credits: number;
  previousVersionId: string;
  appliedAt: number;
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const getLiteraryProseSourceInfo = (bookId: string, chapterId: string, sceneId: string) =>
  call<ProseSourceInfo>('getLiteraryProseSourceInfo', {
    target: { kind: 'book', id: bookId },
    chapterId,
    sceneId,
  });
export const startLiteraryProse = (input: StartLiteraryProse, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'prose',
    input.requestId,
    { ...input, operationId: input.requestId, expectedRevision: 0 },
    () => call<ProseResponse>('startLiteraryProse', input),
  );
export const getLiteraryProse = (bookId: string, requestId: string) =>
  call<ProseResponse>('getLiteraryProse', { target: { kind: 'book', id: bookId }, requestId });
export const cancelLiteraryProse = (bookId: string, requestId: string) =>
  call<ProseResponse>('cancelLiteraryProse', { target: { kind: 'book', id: bookId }, requestId });
export const recoverLiteraryProse = (input: StartLiteraryProse, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'prose',
    input.requestId,
    { ...input, operationId: input.requestId, expectedRevision: 0 },
    async () => {
      const result = await getLiteraryProse(input.target.id, input.requestId);
      if (result.state === 'unconfirmed')
        throw new Error('O pedido ainda não tem confirmação. Consulte novamente sem reenviar.');
      return result;
    },
  );
export const cancelPendingLiteraryProse = (input: StartLiteraryProse, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'prose',
    input.requestId,
    { ...input, operationId: input.requestId, expectedRevision: 0 },
    () => cancelLiteraryProse(input.target.id, input.requestId),
  );
export const listLiteraryProse = (
  bookId: string,
  chapterId: string,
  afterId: string | null = null,
) =>
  call<{
    items: Array<
      Pick<ProseResponse, 'requestId' | 'mode' | 'sceneId' | 'state' | 'coverage'> & {
        createdAt: number;
      }
    >;
    nextAfterId: string | null;
  }>('listLiteraryProse', { target: { kind: 'book', id: bookId }, chapterId, afterId });
export const applyLiteraryProse = (input: ApplyLiteraryProse, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'proseApply', input.requestId, input, () =>
    call<ProseApplication>('applyLiteraryProse', {
      target: input.target,
      requestId: input.requestId,
      operationId: input.operationId,
    }),
  );
export const getLiteraryProseApplication = (bookId: string, operationId: string) =>
  call<{ state: 'unconfirmed' } | { state: 'confirmed'; receipt: ProseApplication }>(
    'getLiteraryProseApplication',
    {
      target: { kind: 'book', id: bookId },
      operationId,
    },
  );
