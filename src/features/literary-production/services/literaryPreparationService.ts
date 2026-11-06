import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import type { LiteraryWritingSnapshot } from './literaryWritingService';
import type { LiteraryGate } from '../../../../functions/src/literaryGateProtocol.mjs';
import type { LiteraryWritingManifest } from '../../../../functions/src/literaryWritingProtocol.mjs';
export {
  LITERARY_GATE_CRITERIA,
  LITERARY_GATE_OPTIONAL_CRITERIA,
} from '../../../../functions/src/literaryGateProtocol.mjs';
export type {
  LiteraryGate,
  LiteraryGateCriterion,
} from '../../../../functions/src/literaryGateProtocol.mjs';
export interface PreparationContext {
  snapshot: LiteraryWritingSnapshot;
  documents: Array<{ id: string; label: string; text: string; revision: number }>;
  criteria: Record<string, string>;
}
export interface PreparationGateState {
  schemaVersion: 1;
  chapterId: string;
  revision: number;
  updatedAt: number;
  stateToken: string;
  manifest: LiteraryWritingManifest;
  gate: LiteraryGate;
  ready: boolean;
  authorAccepted: boolean;
  assessment: 'author';
  current: boolean;
  recordedReady: boolean;
  recordedAuthorAccepted: boolean;
}
export interface SavePreparationGate {
  target: { kind: 'book'; id: string };
  chapterId: string;
  planIds: string[];
  stateToken: string;
  gate: LiteraryGate;
  expectedRevision: number;
  operationId: string;
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const getLiteraryPreparationContext = (
  bookId: string,
  chapterId: string,
  planIds: string[],
) =>
  call<PreparationContext>('getLiteraryPreparationContext', {
    target: { kind: 'book', id: bookId },
    chapterId,
    planIds,
  });
export const getLiteraryPreparationGate = (bookId: string, chapterId: string, revision?: number) =>
  call<PreparationGateState | null>('getLiteraryPreparationGate', {
    target: { kind: 'book', id: bookId },
    chapterId,
    ...(revision === undefined ? {} : { revision }),
  });
export const saveLiteraryPreparationGate = (input: SavePreparationGate, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'gate', input.chapterId, input, () =>
    call<{ chapterId: string; revision: number; updatedAt: number }>(
      'saveLiteraryPreparationGate',
      input,
    ),
  );
export const listLiteraryPreparationGateVersions = (
  bookId: string,
  chapterId: string,
  beforeRevision: number | null = null,
) =>
  call<{
    items: Array<{ chapterId: string; revision: number; updatedAt: number }>;
    nextBeforeRevision: number | null;
  }>('listLiteraryPreparationGateVersions', {
    target: { kind: 'book', id: bookId },
    chapterId,
    beforeRevision,
    limit: 20,
  });
