import { digest } from './sceneContracts.mjs';
import {
  authorize,
  closed,
  restoreId,
  restoreHash,
  integer,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
export const BOOK_RESTORE_ARCHIVE_NAMES = Object.freeze([
  'materializationArtifacts',
  'preparedPersonas',
  'personaBindings',
  'preparedDrafts',
  'preparedCovers',
  'preparedCoverChunks',
  'preparedCoverStorage',
  'chunks',
  'integrityProofs',
  'validationIndex',
  'validationItems',
  'validationState',
  'integrityState',
]);
export const BOOK_RESTORE_ARCHIVE_PHASES = Object.freeze([
  'artifacts',
  'operations',
  'validation-index',
  'validation-items',
  'validation-state',
  'verify',
  'done',
]);
export const BOOK_RESTORE_ARCHIVE_COUNTERS = Object.freeze([
  'journals',
  'privateArtifacts',
  'chunks',
  'bytes',
  'proofs',
  'index',
  'items',
  'states',
]);
export function bookRestoreArchiveRequest(uid, input, advance = false) {
  authorize(uid);
  closed(input, ['restoreId', 'jobToken', ...(advance ? ['operationId', 'expectedRevision'] : [])]);
  return {
    restoreId: restoreId(input.restoreId),
    jobToken: restoreHash(input.jobToken),
    ...(advance
      ? {
          operationId: restoreId(input.operationId),
          expectedRevision: integer(input.expectedRevision),
        }
      : {}),
  };
}
export const bookRestoreArchiveFingerprint = (uid, r) =>
  digest({ schemaVersion: 1, action: 'advanceBookRestoreArchiveCleanup', ownerId: uid, ...r });
export function bookRestoreArchiveContext(loaded, media) {
  return {
    schemaVersion: 1,
    ownerId: loaded.job.ownerId,
    restoreId: loaded.job.restoreId,
    jobToken: loaded.view.jobToken,
    activationOperationId: loaded.job.activation.operationId,
    mediaOperationId: media.value.operationId,
    mediaToken: nativeRestoreToken(media.snapshot),
    contextToken: digest({
      domain: 'book-restore-archive-cleanup-v1',
      jobToken: loaded.view.jobToken,
      bookId: loaded.job.bookId,
      activation: loaded.job.activation,
      media: nativeRestoreToken(media.snapshot),
      layout: BOOK_RESTORE_ARCHIVE_NAMES,
    }),
  };
}
export function validateBookRestoreArchiveProgress(value, loaded, media) {
  const expected = bookRestoreArchiveContext(loaded, media);
  closed(value, [
    ...Object.keys(expected),
    'revision',
    'phase',
    'after',
    'removed',
    'scannedOperations',
    'validationOperationId',
    'firstOperationId',
    'lastOperationId',
    'completedAt',
  ]);
  if (Object.entries(expected).some(([k, v]) => value[k] !== v)) inconsistent();
  integer(value.revision, 1);
  integer(value.scannedOperations);
  if (!BOOK_RESTORE_ARCHIVE_PHASES.includes(value.phase)) inconsistent();
  restoreId(value.firstOperationId);
  restoreId(value.lastOperationId);
  if (value.validationOperationId !== null) restoreId(value.validationOperationId);
  if (value.after !== null) {
    if (
      typeof value.after !== 'string' ||
      value.after.length > 128 ||
      value.after.includes('/') ||
      value.after.includes('\\')
    )
      inconsistent();
    if (value.phase === 'operations') restoreId(value.after);
    else if (value.phase === 'validation-items') {
      if (!/^[0-9]{15}$/.test(value.after)) inconsistent();
    } else if (
      !['artifacts', 'validation-index'].includes(value.phase) ||
      !/^[a-f0-9]{64}$/.test(value.after)
    )
      inconsistent();
  }
  closed(value.removed, BOOK_RESTORE_ARCHIVE_COUNTERS);
  Object.values(value.removed).forEach((v) => integer(v));
  const r = value.removed,
    j = loaded.job;
  if (
    r.journals > j.preparation.artifactCount - (j.preparation.retiredArtifacts ?? 0) ||
    r.privateArtifacts > r.journals ||
    r.chunks > j.uploadedChunks ||
    r.bytes > j.uploadedBytes ||
    r.proofs > j.checkedChunks ||
    r.items > j.validationMeta.items ||
    r.states > 1 ||
    value.scannedOperations > sum(j.checkpoint, 1)
  )
    inconsistent();
  if (BOOK_RESTORE_ARCHIVE_PHASES.indexOf(value.phase) > 1 && !value.validationOperationId)
    inconsistent();
  if (value.phase === 'done') {
    integer(value.completedAt);
    if (
      value.completedAt < j.activation.activatedAt ||
      !Number.isFinite(new Date(value.completedAt).getTime())
    )
      inconsistent();
  } else if (value.completedAt !== null) inconsistent();
  return value;
}
