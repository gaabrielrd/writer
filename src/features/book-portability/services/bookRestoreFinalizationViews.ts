import type { BookRestoreIdentity } from '../model/bookRestorePreparation';
import {
  readBookRestoreIdentity,
  restorePreparationCheck as check,
  restorePreparationOperationId,
  restorePreparationId,
} from './bookRestorePreparationContracts';
export const restoreViewObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const closed = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  restoreViewObject(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
export const restoreViewCount = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0;
const date = (v: unknown): v is number =>
  restoreViewCount(v) && Number.isFinite(new Date(v).getTime());
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const counts = ['acts', 'chapters', 'words', 'lore', 'scenes', 'versions', 'profiles'] as const;
export type BookRestoreActivationReview = {
  schemaVersion: 1;
  bookId: string;
  checkpoint: number;
  reviewToken: string;
  summary: {
    titlePreview: string;
    titleTruncated: boolean;
    visibility: 'private';
    counts: Record<(typeof counts)[number], number>;
    universe: {
      originKind: 'none' | 'reference' | 'unavailable';
      observed: 'none' | 'available' | 'unavailable';
      universeId: string | null;
    };
    cover: { kind: 'none' | 'library' | 'legacy-unavailable' };
    draft: { outcome: 'none' | 'saved' | 'version' };
  };
};
export function readBookRestoreActivationReview(
  raw: unknown,
  expected: BookRestoreIdentity,
): BookRestoreActivationReview {
  const identity = readBookRestoreIdentity(expected);
  check(
    closed(raw, ['schemaVersion', 'bookId', 'checkpoint', 'summary', 'reviewToken']) &&
      raw.schemaVersion === 1 &&
      raw.bookId === identity.bookId &&
      restoreViewCount(raw.checkpoint) &&
      raw.checkpoint < Number.MAX_SAFE_INTEGER &&
      hash(raw.reviewToken) &&
      closed(raw.summary, [
        'titlePreview',
        'titleTruncated',
        'visibility',
        'counts',
        'universe',
        'cover',
        'draft',
      ]),
  );
  const s = raw.summary;
  check(
    typeof s.titlePreview === 'string' &&
      s.titlePreview.length <= 300 &&
      typeof s.titleTruncated === 'boolean' &&
      s.visibility === 'private' &&
      closed(s.counts, [...counts]) &&
      Object.values(s.counts).every(restoreViewCount) &&
      closed(s.universe, ['originKind', 'observed', 'universeId']) &&
      closed(s.cover, ['kind']) &&
      closed(s.draft, ['outcome']),
  );
  const u = s.universe;
  check(
    ['none', 'reference', 'unavailable'].includes(u.originKind as string) &&
      ['none', 'available', 'unavailable'].includes(u.observed as string) &&
      (u.originKind === 'none') === (u.observed === 'none') &&
      (u.observed === 'available'
        ? u.originKind === 'reference' &&
          typeof u.universeId === 'string' &&
          u.universeId.length > 0 &&
          u.universeId.length <= 1500
        : u.universeId === null) &&
      ['none', 'library', 'legacy-unavailable'].includes(s.cover.kind as string) &&
      ['none', 'saved', 'version'].includes(s.draft.outcome as string),
  );
  return Object.freeze({
    schemaVersion: 1,
    bookId: identity.bookId,
    checkpoint: raw.checkpoint,
    reviewToken: raw.reviewToken,
    summary: Object.freeze({
      titlePreview: s.titlePreview,
      titleTruncated: s.titleTruncated,
      visibility: 'private',
      counts: Object.freeze({ ...s.counts }) as BookRestoreActivationReview['summary']['counts'],
      universe: Object.freeze({ ...u }) as BookRestoreActivationReview['summary']['universe'],
      cover: Object.freeze({ ...s.cover }) as BookRestoreActivationReview['summary']['cover'],
      draft: Object.freeze({ ...s.draft }) as BookRestoreActivationReview['summary']['draft'],
    }),
  });
}
export type BookRestoreMediaStatus = {
  state: 'pending' | 'ready' | 'none' | 'unavailable';
  imageState: 'preparing' | 'available' | 'unavailable' | 'none';
  imageAvailable: boolean;
  completedAt: number | null;
};
export function readBookRestoreMediaStatus(raw: unknown): BookRestoreMediaStatus {
  check(
    restoreViewObject(raw) &&
      raw.schemaVersion === 1 &&
      closed(raw.media, ['state', 'imageId', 'imageAvailable', 'imageState', 'completedAt']),
  );
  const m = raw.media;
  check(
    ['pending', 'ready', 'none', 'unavailable'].includes(m.state as string) &&
      ['preparing', 'available', 'unavailable', 'none'].includes(m.imageState as string) &&
      typeof m.imageAvailable === 'boolean' &&
      m.imageAvailable === (m.imageState === 'available') &&
      (m.imageId === null || restorePreparationId(m.imageId)) &&
      (m.state === 'pending' ? m.completedAt === null : date(m.completedAt)) &&
      (m.imageAvailable ? m.state === 'ready' : true) &&
      (m.state === 'none' ? m.imageId === null && m.imageState === 'none' : true),
  );
  if (m.state === 'pending') check(raw.receipt === null);
  else {
    check(
      closed(raw.receipt, ['operationId', 'action', 'state', 'completedAt']) &&
        restorePreparationOperationId(raw.receipt.operationId) &&
        raw.receipt.action === 'finalizeBookRestoreMedia' &&
        raw.receipt.state === m.state &&
        raw.receipt.completedAt === m.completedAt,
    );
  }
  return Object.freeze({
    state: m.state,
    imageState: m.imageState,
    imageAvailable: m.imageAvailable,
    completedAt: m.completedAt,
  }) as BookRestoreMediaStatus;
}
export const BOOK_RESTORE_ARCHIVE_PHASES = Object.freeze([
  'not-started',
  'waiting-for-media',
  'artifacts',
  'operations',
  'validation-index',
  'validation-items',
  'validation-state',
  'verify',
  'done',
] as const);
export type BookRestoreArchiveStatus = {
  phase: (typeof BOOK_RESTORE_ARCHIVE_PHASES)[number];
  revision: number;
  scannedOperations: number;
  completedAt: number | null;
  removed: Record<
    'journals' | 'privateArtifacts' | 'chunks' | 'bytes' | 'proofs' | 'index' | 'items' | 'states',
    number
  >;
};
const removed = [
  'journals',
  'privateArtifacts',
  'chunks',
  'bytes',
  'proofs',
  'index',
  'items',
  'states',
] as const;
export function readBookRestoreArchiveStatus(
  value: unknown,
  expected: BookRestoreIdentity,
): BookRestoreArchiveStatus {
  const identity = readBookRestoreIdentity(expected);
  check(
    restoreViewObject(value) &&
      BOOK_RESTORE_ARCHIVE_PHASES.includes(value.phase as BookRestoreArchiveStatus['phase']) &&
      restoreViewCount(value.revision) &&
      restoreViewCount(value.scannedOperations) &&
      closed(value.removed, [...removed]) &&
      Object.values(value.removed).every(restoreViewCount) &&
      (value.phase === 'done' ? date(value.completedAt) : value.completedAt === null),
  );
  if (['not-started', 'waiting-for-media'].includes(value.phase as string))
    check(
      value.revision === 0 &&
        value.scannedOperations === 0 &&
        Object.values(value.removed).every((v) => v === 0),
    );
  else {
    check(
      value.schemaVersion === 1 &&
        value.ownerId === identity.ownerId &&
        value.restoreId === identity.restoreId &&
        value.jobToken === identity.jobToken &&
        value.revision >= 1 &&
        restorePreparationOperationId(value.firstOperationId) &&
        restorePreparationOperationId(value.lastOperationId) &&
        restorePreparationOperationId(value.activationOperationId) &&
        restorePreparationOperationId(value.mediaOperationId) &&
        hash(value.contextToken) &&
        hash(value.mediaToken),
    );
  }
  return Object.freeze({
    phase: value.phase,
    revision: value.revision,
    scannedOperations: value.scannedOperations,
    completedAt: value.completedAt,
    removed: Object.freeze({ ...value.removed }),
  }) as BookRestoreArchiveStatus;
}
