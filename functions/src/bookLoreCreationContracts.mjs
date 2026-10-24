import { authorize, closed, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
export const creationConflict = () =>
  workFail(
    'failed-precondition',
    'A reserva de criação mudou ou exige reconciliação.',
    'book-lore-creation-conflict',
  );
export function creationIntent(uid, r) {
  authorize(uid);
  closed(r, ['bookId', 'creationId']);
  return { bookId: bookContentId(r.bookId), creationId: bookContentId(r.creationId) };
}
export const creationStartHash = (intent) => digest({ domain: 'book-lore-creation-start', intent });
export const creationLoreId = (uid, intent) =>
  'lore-' + digest({ domain: 'book-lore-creation-id', uid, intent });
export function creationPaths(db, uid, intent) {
  intent = creationIntent(uid, { bookId: intent.bookId, creationId: intent.creationId });
  authorize(uid);
  const path = 'users/' + uid + '/bookLoreCreations/' + intent.creationId,
    loreId = creationLoreId(uid, intent),
    reservationPath = 'books/' + intent.bookId + '/bookLoreReservations/' + loreId;
  return {
    db,
    uid,
    intent,
    loreId,
    path,
    reservationPath,
    ref: db.doc(path),
    reservationRef: db.doc(reservationPath),
    cancelRef: db.doc(path + '/cancellations/current'),
    proofRef: db.doc(path + '/cancelProofs/current'),
  };
}
export function creationRequest(uid, r, cancel = false) {
  closed(r, ['bookId', 'creationId', ...(cancel ? ['operationId'] : [])], ['jobToken']);
  const intent = creationIntent(uid, { bookId: r.bookId, creationId: r.creationId }),
    v = { ...intent };
  if (cancel) v.operationId = bookContentId(r.operationId);
  if (Object.hasOwn(r, 'jobToken')) v.jobToken = restoreHash(r.jobToken);
  return v;
}
export function creationRef(v) {
  closed(v, ['creationId', 'startHash', 'jobToken']);
  return {
    creationId: bookContentId(v.creationId),
    startHash: restoreHash(v.startHash),
    jobToken: restoreHash(v.jobToken),
  };
}
export function creationCleanupRequest(uid, r) {
  closed(r, ['bookId', 'creationId', 'jobToken', 'expectedRevision', 'operationId']);
  const v = creationRequest(
    uid,
    {
      bookId: r.bookId,
      creationId: r.creationId,
      jobToken: r.jobToken,
      operationId: r.operationId,
    },
    true,
  );
  if (!Number.isSafeInteger(r.expectedRevision) || r.expectedRevision < 0) creationConflict();
  return { ...v, expectedRevision: r.expectedRevision };
}
export const creationView = (l) => ({
  schemaVersion: 1,
  creationId: l.c.intent.creationId,
  bookId: l.c.intent.bookId,
  loreId: l.c.loreId,
  startHash: l.context.startHash,
  jobToken: l.context.kind === 'fence' ? null : l.token,
  phase: l.adoption
    ? 'adopted'
    : l.cancellation
      ? 'cancelled'
      : l.cancelRequest
        ? 'cancelling'
        : 'preparing',
  ...(l.adoption
    ? {
        adoption: {
          operationId: l.adoption.record.operationId,
          editId: l.adoption.record.edit.editId,
          generationId: l.adoption.record.generationId,
          timestamp: l.adoption.adoption.timestamp,
          localLoreVersion: l.adoption.adoption.localLoreVersion,
        },
      }
    : {}),
  ...(l.cancelRequest
    ? {
        cleanupRevision: l.cancelRequest.state.revision,
        cleanupPhase: l.cancelRequest.state.phase,
        coordinatedUnits: l.cancelRequest.state.coordinatedUnits,
        completedUploads: l.cancelRequest.state.completedUploads,
      }
    : {}),
  cancellationOperationId: l.cancellation?.operationId ?? null,
});
