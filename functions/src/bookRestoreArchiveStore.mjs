import { digest } from './sceneContracts.mjs';
import { bornEqual, closed, inconsistent, invalid } from './bookRestoreUploadContracts.mjs';
import {
  validateBookRestoreArchiveProgress,
  bookRestoreArchiveFingerprint,
  BOOK_RESTORE_ARCHIVE_COUNTERS,
  BOOK_RESTORE_ARCHIVE_PHASES,
} from './bookRestoreArchiveContracts.mjs';
export const bookRestoreArchiveOpRef = (db, uid, id) =>
  db.doc('users/' + uid + '/bookRestoreArchiveOperations/' + id);
export function readBookRestoreArchiveOp(snapshot, loaded, media, request = null) {
  const value = snapshot.data();
  closed(value, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'operationId',
    'action',
    'requestHash',
    'progress',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== loaded.job.ownerId ||
    value.restoreId !== loaded.job.restoreId ||
    value.jobToken !== loaded.view.jobToken ||
    value.operationId !== snapshot.id ||
    value.action !== 'advanceBookRestoreArchiveCleanup' ||
    !bornEqual(snapshot, { createTime: snapshot.updateTime })
  )
    inconsistent();
  const progress = validateBookRestoreArchiveProgress(value.progress, loaded, media),
    original = {
      restoreId: value.restoreId,
      jobToken: value.jobToken,
      operationId: value.operationId,
      expectedRevision: progress.revision - 1,
    };
  if (
    progress.lastOperationId !== value.operationId ||
    value.requestHash !== bookRestoreArchiveFingerprint(value.ownerId, original)
  )
    inconsistent();
  if (request && value.requestHash !== bookRestoreArchiveFingerprint(value.ownerId, request))
    invalid('operation-mismatch');
  return value;
}
export async function readBookRestoreArchiveControl(tx, db, loaded, media) {
  const ref = db.doc(loaded.ref.path + '/archiveCleanup/current'),
    snapshot = await tx.get(ref);
  if (!snapshot.exists) return { ref, snapshot, value: null };
  if (!media) inconsistent();
  const value = validateBookRestoreArchiveProgress(snapshot.data(), loaded, media),
    first = await tx.get(bookRestoreArchiveOpRef(db, loaded.job.ownerId, value.firstOperationId)),
    last =
      value.lastOperationId === value.firstOperationId
        ? first
        : await tx.get(bookRestoreArchiveOpRef(db, loaded.job.ownerId, value.lastOperationId));
  if (
    !first.exists ||
    !last.exists ||
    !bornEqual(snapshot, first) ||
    !bornEqual({ createTime: snapshot.updateTime }, last)
  )
    inconsistent();
  const a = readBookRestoreArchiveOp(first, loaded, media),
    b = readBookRestoreArchiveOp(last, loaded, media);
  if (
    a.progress.revision !== 1 ||
    a.progress.firstOperationId !== value.firstOperationId ||
    digest(b.progress) !== digest(value)
  )
    inconsistent();
  return { ref, snapshot, value };
}
export function assertBookRestoreArchiveHistory(old, current) {
  if (
    old.firstOperationId !== current.firstOperationId ||
    old.contextToken !== current.contextToken ||
    old.revision > current.revision ||
    old.scannedOperations > current.scannedOperations ||
    BOOK_RESTORE_ARCHIVE_PHASES.indexOf(old.phase) >
      BOOK_RESTORE_ARCHIVE_PHASES.indexOf(current.phase) ||
    BOOK_RESTORE_ARCHIVE_COUNTERS.some((k) => old.removed[k] > current.removed[k]) ||
    (old.validationOperationId !== null &&
      old.validationOperationId !== current.validationOperationId) ||
    (old.completedAt !== null && old.completedAt !== current.completedAt)
  )
    inconsistent();
}
export const bookRestoreArchiveView = (control, media) =>
  control.value
    ? structuredClone(control.value)
    : {
        revision: 0,
        phase: media ? 'not-started' : 'waiting-for-media',
        after: null,
        removed: Object.fromEntries(BOOK_RESTORE_ARCHIVE_COUNTERS.map((k) => [k, 0])),
        scannedOperations: 0,
        completedAt: null,
      };
