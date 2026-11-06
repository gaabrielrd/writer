import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import {
  withLiteraryRecovery,
  listLiteraryPendingOperations,
  finishLiteraryOperation,
  type LiteraryPendingOperation,
} from './literaryRecoveryStorage';
import { getLiteraryOperation } from './literaryProductionService';
import type { LiteraryPublicationUnit } from '../../../../functions/src/literaryPublicationPolicyProtocol.mjs';
export type PublicationPolicy = LiteraryPublicationUnit;
export interface LiteraryPublication {
  jobId: string;
  progressRevision: number;
  title: string | null;
  authorName: string | null;
  integrationId: string | null;
  policy: PublicationPolicy | null;
  unitId: string | null;
  state:
    | 'planning'
    | 'compiling'
    | 'verifying'
    | 'prepared'
    | 'checkingGuide'
    | 'verified'
    | 'published'
    | 'canceled'
    | 'stale';
  phase: string | null;
  candidates: number;
  verifiedCandidates: number;
  chapterCount: number;
  compiledChapters: number;
  unitCount: number;
  verifiedUnits: number;
  verifiedChapters: number;
  actCount: number;
  wordCount: number;
  removalCount: number;
  removalHash: string | null;
  manifestHash: string | null;
  guideRevision: number;
  guideCount: number;
  verifiedGuideEntries: number;
  guideHash: string | null;
  editionHash: string | null;
  createdAt: number;
  preparedAt: number | null;
  publishedAt: number | null;
  revisionId: string;
  publicationUrl: string | null;
  publicationConfirmed: boolean;
  message: string | null;
}
export interface PublicationChapter {
  chapterId: string;
  index: number;
  title: string;
  actId: string | null;
  compiled: boolean;
  wordCount?: number;
  projectionHash?: string;
}
export interface PublicationRemoval {
  chapterId: string;
  title: string | null;
  previousRevisionId: string;
}
export type GuideCertainty = 'fact' | 'uncertain';
export interface GuideEvidence {
  chapterId: string;
  quote: string;
}
export interface ReaderGuideDraft {
  name: string;
  aliases: string[];
  category: 'character' | 'location' | 'concept' | 'other';
  summary: string;
  certainty: GuideCertainty;
  disambiguation: string;
  revealAfterChapterId: string;
  evidence: GuideEvidence[];
  facts: Array<GuideEvidence & { text: string; certainty: GuideCertainty }>;
  relationships: Array<
    GuideEvidence & { targetId: string; description: string; certainty: GuideCertainty }
  >;
  appearances: Array<GuideEvidence & { kind: 'direct' | 'document' | 'mention' | 'uncertain' }>;
}
export interface GuideEntry {
  id: string;
  revision: number;
  deleted: boolean;
  guide: ReaderGuideDraft | null;
  updatedAt: number | null;
}
export const emptyReaderGuide = (): ReaderGuideDraft => ({
  name: '',
  aliases: [],
  category: 'character',
  summary: '',
  certainty: 'fact',
  disambiguation: '',
  revealAfterChapterId: '',
  evidence: [{ chapterId: '', quote: '' }],
  facts: [],
  relationships: [],
  appearances: [],
});
export interface StartPublication {
  target: { kind: 'book'; id: string };
  jobId: string;
  policy: PublicationPolicy;
  unitId: string | null;
  integrationId: string;
  expectedIntegrationToken: string;
  authorName: string;
  checks: {
    finalTextReviewed: boolean;
    navigationReviewed: boolean;
    publicationAuthorized: boolean;
  };
}
export interface SaveGuideEntry {
  target: { kind: 'book'; id: string };
  jobId: string;
  id: string;
  operationId: string;
  expectedRevision: number;
  expectedManifestHash: string;
  guide: ReaderGuideDraft | null;
}
export interface ConfirmPublication {
  target: { kind: 'book'; id: string };
  jobId: string;
  operationId: string;
  expectedManifestHash: string;
  expectedGuideHash: string;
  expectedRemovalHash: string;
  checks: {
    wholeTextChecked: boolean;
    guideChecked: boolean;
    removalsChecked: boolean;
    authorizePublicRelease: boolean;
  };
}
export interface PublicationConfirmation {
  publicationConfirmed: true;
  bookId: string;
  revisionId: string;
  publishedAt: number;
  publicationUrl: string;
  editionHash: string;
  manifestHash: string;
  guideHash: string;
  removalHash: string;
  chapterCount: number;
  guideCount: number;
  removalCount: number;
  currentPointerMatches: boolean;
}
const target = (id: string) => ({ kind: 'book' as const, id });
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const startLiteraryPublication = (input: StartPublication, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'publication',
    input.jobId,
    { ...input, operationId: input.jobId, expectedRevision: 0 },
    () => call<LiteraryPublication>('startLiteraryPublication', input),
  );
export const getLiteraryPublication = (bookId: string, jobId: string) =>
  call<LiteraryPublication | { jobId: string; state: 'unconfirmed' }>('getLiteraryPublication', {
    target: target(bookId),
    jobId,
  });
export const listLiteraryPublications = (bookId: string, afterId: string | null = null) =>
  call<{ items: LiteraryPublication[]; nextAfterId: string | null }>('listLiteraryPublications', {
    target: target(bookId),
    afterId,
  });
export const advanceLiteraryPublication = (bookId: string, jobId: string) =>
  call<LiteraryPublication>('advanceLiteraryPublication', { target: target(bookId), jobId });
export const cancelLiteraryPublication = (bookId: string, jobId: string) =>
  call<LiteraryPublication>('cancelLiteraryPublication', { target: target(bookId), jobId });
export const listLiteraryPublicationManifest = (
  bookId: string,
  jobId: string,
  afterIndex: number | null = null,
) =>
  call<{ items: PublicationChapter[]; nextAfterIndex: number | null }>(
    'listLiteraryPublicationManifest',
    { target: target(bookId), jobId, afterIndex },
  );
export const listLiteraryPublicationRemovals = (
  bookId: string,
  jobId: string,
  afterId: string | null = null,
) =>
  call<{ items: PublicationRemoval[]; nextAfterId: string | null }>(
    'listLiteraryPublicationRemovals',
    { target: target(bookId), jobId, afterId },
  );
export const getLiteraryPublicationChapter = (bookId: string, jobId: string, chapterId: string) =>
  call<{ chapterId: string; title: string; content: string; text: string; projectionHash: string }>(
    'getLiteraryPublicationChapter',
    { target: target(bookId), jobId, chapterId },
  );
export const listLiteraryPublicationGuide = (
  bookId: string,
  jobId: string,
  afterId: string | null = null,
) =>
  call<{
    items: GuideEntry[];
    guideRevision: number;
    guideCount: number;
    nextAfterId: string | null;
  }>('listLiteraryPublicationGuide', { target: target(bookId), jobId, afterId });
export const getLiteraryPublicationGuideEntry = (bookId: string, jobId: string, id: string) =>
  call<GuideEntry>('getLiteraryPublicationGuideEntry', { target: target(bookId), jobId, id });
export const getLiteraryPublicationGuideVersion = (
  bookId: string,
  jobId: string,
  id: string,
  revision: number,
) =>
  call<GuideEntry>('getLiteraryPublicationGuideVersion', {
    target: target(bookId),
    jobId,
    id,
    revision,
  });
export const saveLiteraryPublicationGuideEntry = (input: SaveGuideEntry, actorId: string) =>
  withLiteraryRecovery(actorId, input.target.id, 'publicationGuide', input.id, input, () =>
    call<GuideEntry>('saveLiteraryPublicationGuideEntry', input),
  );
export const reopenLiteraryPublicationGuide = (bookId: string, jobId: string) =>
  call<LiteraryPublication>('reopenLiteraryPublicationGuide', { target: target(bookId), jobId });
export const startLiteraryPublicationGuideVerification = (
  bookId: string,
  job: LiteraryPublication,
) =>
  call<LiteraryPublication>('startLiteraryPublicationGuideVerification', {
    target: target(bookId),
    jobId: job.jobId,
    expectedGuideRevision: job.guideRevision,
    expectedManifestHash: job.manifestHash,
  });
export const advanceLiteraryPublicationGuide = (bookId: string, jobId: string) =>
  call<LiteraryPublication>('advanceLiteraryPublicationGuide', { target: target(bookId), jobId });
export const confirmLiteraryPublication = (input: ConfirmPublication, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'publicationConfirm',
    input.jobId,
    { ...input, expectedRevision: 0 },
    () => call<PublicationConfirmation>('confirmLiteraryPublication', input),
  );
export const getLiteraryPublicationConfirmation = (
  bookId: string,
  jobId: string,
  operationId: string,
) =>
  call<{ state: 'unconfirmed' } | { state: 'confirmed'; result: PublicationConfirmation }>(
    'getLiteraryPublicationConfirmation',
    { target: target(bookId), jobId, operationId },
  );
export async function resolvePublicationRecovery(
  actorId: string,
  bookId: string,
  operationId: string,
  kind: LiteraryPendingOperation['kind'],
  id: string,
  expectedRevision: number,
) {
  const receipt = await getLiteraryOperation(bookId, operationId);
  if (receipt.state === 'unconfirmed') return null;
  if (receipt.kind !== kind || receipt.id !== id || receipt.revision !== expectedRevision + 1)
    throw new Error('A confirmação não corresponde ao pedido acompanhado.');
  const entry = listLiteraryPendingOperations(actorId, bookId).find(
    (value) => value.operationId === operationId,
  );
  if (entry) {
    if (entry.kind !== kind || entry.id !== id || entry.expectedRevision !== expectedRevision)
      throw new Error('A pendência local tem outra origem.');
    finishLiteraryOperation(entry);
  }
  return receipt;
}
