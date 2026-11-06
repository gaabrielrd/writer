import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
import { getFirebaseApp } from '@/shared/lib';
import type {
  LiteraryPlanPage,
  LiteraryPlanState,
  LiteraryReferenceKind,
  LiteraryReferencePage,
  SaveLiteraryPlan,
} from '../model/planning';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const listLiteraryPlans = (bookId: string, afterId: string | null = null) =>
  call<LiteraryPlanPage>('listLiteraryPlans', {
    target: { kind: 'book', id: bookId },
    afterId,
    limit: 25,
  });
export const getLiteraryPlan = (bookId: string, id: string) =>
  call<LiteraryPlanState>('getLiteraryPlan', { target: { kind: 'book', id: bookId }, id });
export const saveLiteraryPlan = (input: SaveLiteraryPlan, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'plan', input.id, input, () =>
    call<{ id: string; revision: number; updatedAt: number }>('saveLiteraryPlan', input),
  );
export const listLiteraryPlanVersions = (
  bookId: string,
  id: string,
  beforeRevision: number | null = null,
) =>
  call<{
    items: Array<{ id: string; revision: number; updatedAt: number }>;
    nextBeforeRevision: number | null;
  }>('listLiteraryPlanVersions', {
    target: { kind: 'book', id: bookId },
    id,
    beforeRevision,
    limit: 25,
  });
export const getLiteraryPlanVersion = (bookId: string, id: string, revision: number) =>
  call<LiteraryPlanState>('getLiteraryPlanVersion', {
    target: { kind: 'book', id: bookId },
    id,
    revision,
  });
export const listLiteraryReferences = (
  bookId: string,
  kind: LiteraryReferenceKind,
  afterId: string | null = null,
  purpose: 'source' | 'subject' = 'source',
  volume?: { bookId: string; kind: 'act' | 'chapter' | 'scene' | 'arc' | 'event' },
) =>
  call<LiteraryReferencePage>('listLiteraryReferences', {
    target: { kind: 'book', id: bookId },
    kind,
    purpose,
    ...(volume ? { sourceBookId: volume.bookId, unitKind: volume.kind } : {}),
    afterId,
    limit: 25,
  });

export interface LiteraryVolumeBookPage {
  items: Array<{ id: string; title: string }>;
  nextAfterId: string | null;
}
export const listLiteraryVolumeBooks = (bookId: string, afterId: string | null = null) =>
  call<LiteraryVolumeBookPage>('listLiteraryVolumeBooks', {
    target: { kind: 'book', id: bookId },
    afterId,
    limit: 25,
  });
