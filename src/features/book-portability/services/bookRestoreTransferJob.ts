import type { BookRestorePreparationProgress } from '../model/bookRestorePreparation';
import type {
  BookRestoreSourceDescriptor,
  BookRestoreStartIntent,
} from '../model/bookRestoreTransfer';
import {
  readBookRestoreStartIntent,
  bookRestoreStartFingerprint,
  bookRestoreMetadataHash,
} from './bookRestoreTransferContracts';
import {
  readBookRestorePreparationProgress,
  restorePreparationCheck as check,
} from './bookRestorePreparationContracts';
export type BookRestoreTransferJob = BookRestorePreparationProgress & {
  source: BookRestoreSourceDescriptor;
  reviewHash: string;
  keyId: string;
  recoveryReady: boolean;
  uploadedChunks: number;
  uploadedBytes: number;
  cleanedChunks: number;
  createdAt: number;
  updatedAt: number;
};
export type BookRestoreStartOutcome =
  | { kind: 'confirmed'; progress: BookRestoreTransferJob }
  | { kind: 'cancelled'; restoreId: string; bookId: string };
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export const expectedBookRestoreTarget = (intent: BookRestoreStartIntent) =>
  'restore-' +
  bookRestoreMetadataHash({
    schemaVersion: 1,
    uid: intent.ownerId,
    restoreId: intent.operationId,
    startFingerprint: bookRestoreStartFingerprint(intent),
  });
export function readBookRestoreTransferJob(
  raw: unknown,
  ownerId: string,
  expected: { restoreId?: string; jobToken?: string } = {},
): BookRestoreTransferJob {
  check(
    object(raw) &&
      raw.schemaVersion === 1 &&
      raw.ownerId === ownerId &&
      hash(raw.jobToken) &&
      hash(raw.keyId) &&
      typeof raw.recoveryReady === 'boolean',
  );
  const intent = readBookRestoreStartIntent(
      {
        schemaVersion: 1,
        ownerId,
        operationId: raw.restoreId,
        source: raw.source,
        reviewHash: raw.reviewHash,
      },
      ownerId,
    ),
    bookId = expectedBookRestoreTarget(intent),
    p = readBookRestorePreparationProgress(raw, {
      ownerId,
      restoreId: intent.operationId,
      bookId,
      jobToken: raw.jobToken,
    });
  check(
    (expected.restoreId === undefined || p.restoreId === expected.restoreId) &&
      (expected.jobToken === undefined || p.jobToken === expected.jobToken),
  );
  check(
    integer(raw.uploadedChunks) &&
      integer(raw.uploadedBytes) &&
      integer(raw.cleanedChunks) &&
      integer(raw.createdAt) &&
      integer(raw.updatedAt) &&
      raw.updatedAt >= raw.createdAt &&
      Number.isFinite(new Date(raw.createdAt).getTime()) &&
      Number.isFinite(new Date(raw.updatedAt).getTime()),
  );
  const total = Math.ceil(intent.source.byteLength / 65536);
  check(
    raw.uploadedChunks <= total &&
      raw.uploadedBytes <= intent.source.byteLength &&
      raw.cleanedChunks <= raw.uploadedChunks &&
      p.checkpoint >= raw.uploadedChunks &&
      raw.uploadedBytes === Math.min(intent.source.byteLength, raw.uploadedChunks * 65536),
  );
  if (p.state === 'uploading')
    check(raw.uploadedChunks < total && p.checkpoint === raw.uploadedChunks);
  else if (p.state !== 'cancelling' && p.state !== 'cancelled')
    check(raw.uploadedChunks === total && raw.uploadedBytes === intent.source.byteLength);
  if (p.state === 'uploaded') check(p.checkpoint === raw.uploadedChunks);
  if (p.preparation) Object.freeze(p.preparation);
  return Object.freeze({
    ...p,
    source: intent.source,
    reviewHash: intent.reviewHash,
    keyId: raw.keyId,
    recoveryReady: raw.recoveryReady,
    uploadedChunks: raw.uploadedChunks,
    uploadedBytes: raw.uploadedBytes,
    cleanedChunks: raw.cleanedChunks,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  });
}
export function readBookRestoreStartOutcome(
  raw: unknown,
  expected: BookRestoreStartIntent,
): BookRestoreStartOutcome {
  const intent = readBookRestoreStartIntent(expected, expected.ownerId),
    bookId = expectedBookRestoreTarget(intent);
  check(object(raw) && raw.schemaVersion === 1);
  if (raw.kind === 'cancelled') {
    check(
      raw.ownerId === intent.ownerId &&
        raw.restoreId === intent.operationId &&
        raw.bookId === bookId,
    );
    return { kind: 'cancelled', restoreId: intent.operationId, bookId };
  }
  check(raw.kind === 'confirmed' && object(raw.receipt));
  const r = raw.receipt;
  check(
    r.schemaVersion === 1 &&
      r.operationId === intent.operationId &&
      r.action === 'startBookRestore' &&
      r.expectedCheckpoint === null &&
      r.checkpoint === 0 &&
      r.state === 'uploading' &&
      r.sequence === null &&
      r.uploadedChunks === 0 &&
      r.uploadedBytes === 0 &&
      r.cleanedChunks === 0,
  );
  const progress = readBookRestoreTransferJob(raw.progress, intent.ownerId, {
    restoreId: intent.operationId,
  });
  check(
    progress.reviewHash === intent.reviewHash &&
      JSON.stringify(progress.source) === JSON.stringify(intent.source),
  );
  return { kind: 'confirmed', progress };
}

export function readBookRestoreTransferPage(
  raw: unknown,
  ownerId: string,
  limit = 25,
): { items: BookRestoreTransferJob[]; nextCursor: string | null } {
  check(
    Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= 50 &&
      object(raw) &&
      raw.schemaVersion === 1 &&
      Array.isArray(raw.items) &&
      raw.items.length <= limit &&
      (raw.nextCursor === null ||
        (typeof raw.nextCursor === 'string' &&
          raw.nextCursor.length <= 4096 &&
          /^[A-Za-z0-9_-]+$/.test(raw.nextCursor))),
  );
  const items = raw.items.map((item) => readBookRestoreTransferJob(item, ownerId));
  check(new Set(items.map((item) => item.restoreId)).size === items.length);
  return { items, nextCursor: raw.nextCursor };
}
