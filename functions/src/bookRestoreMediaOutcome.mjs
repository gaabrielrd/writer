import { digest } from './sceneContracts.mjs';
import { born, bornEqual, closed, inconsistent, invalid } from './bookRestoreUploadContracts.mjs';
import {
  validateBookRestoreMediaOutcome,
  bookRestoreMediaFingerprint,
  mediaOrigin,
} from './bookRestoreMediaContracts.mjs';
export const bookRestoreMediaOpRef = (db, uid, id) =>
  db.doc('users/' + uid + '/bookRestoreMediaOperations/' + id);
export function validateBookRestoreMediaOp(snapshot, loaded, request) {
  const value = snapshot.data();
  closed(value, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'operationId',
    'action',
    'requestHash',
    'outcomeHash',
  ]);
  if (
    value.ownerId !== loaded.job.ownerId ||
    value.restoreId !== request.restoreId ||
    value.jobToken !== request.jobToken ||
    value.operationId !== request.operationId ||
    value.requestHash !== bookRestoreMediaFingerprint(loaded.job.ownerId, request)
  )
    invalid('operation-mismatch');
  if (
    value.schemaVersion !== 1 ||
    value.action !== 'finalizeBookRestoreMedia' ||
    !bornEqual(snapshot, { createTime: snapshot.updateTime })
  )
    inconsistent();
  return value;
}
export async function readBookRestoreMediaOutcome(tx, db, loaded) {
  const ref = db.doc(loaded.ref.path + '/activationMedia/current'),
    snapshot = await tx.get(ref);
  if (!snapshot.exists) return null;
  const value = validateBookRestoreMediaOutcome(snapshot.data(), loaded),
    op = await tx.get(bookRestoreMediaOpRef(db, loaded.job.ownerId, value.operationId));
  if (
    !op.exists ||
    !bornEqual(snapshot, { createTime: snapshot.updateTime }) ||
    !bornEqual(snapshot, op)
  )
    inconsistent();
  const record = validateBookRestoreMediaOp(op, loaded, {
      restoreId: loaded.job.restoreId,
      jobToken: loaded.view.jobToken,
      operationId: value.operationId,
    }),
    created = born(snapshot),
    activation = born({ createTime: loaded.snapshot.updateTime });
  if (
    record.outcomeHash !== digest(value) ||
    created.seconds < activation.seconds ||
    (created.seconds === activation.seconds && created.nanoseconds <= activation.nanoseconds)
  )
    inconsistent();
  return { ref, snapshot, value, op };
}
const imageRef = (db, l) =>
  db.doc('users/' + l.job.ownerId + '/imageLibrary/' + l.job.preparation.cover.imageId);
export async function bookRestoreMediaView(tx, db, loaded, outcome) {
  const library = loaded.job.preparation.cover.kind === 'library';
  let imageAvailable = false,
    imageState = library ? 'unavailable' : 'none';
  if (library) {
    const image = await tx.get(imageRef(db, loaded)),
      value = image.data();
    const original =
      image.exists &&
      value.id === loaded.job.preparation.cover.imageId &&
      bornEqual(image, { createTime: loaded.snapshot.updateTime }) &&
      digest(value.restoreOrigin ?? null) === digest(mediaOrigin(loaded)) &&
      value.path ===
        'book-covers/' + loaded.job.ownerId + '/' + loaded.job.preparation.cover.imageId + '.png' &&
      digest(value.restoreStorage?.proof ?? null) ===
        digest(loaded.job.preparation.coverStorage.proof);
    if (original && value.state === 'preparing' && !outcome) imageState = 'preparing';
    imageAvailable = Boolean(
      original &&
      outcome &&
      value.state === 'active' &&
      typeof value.url === 'string' &&
      digest(value.restoreStorage?.proof ?? null) === digest(outcome.value.sourceProof) &&
      digest(value.restoreStorage?.publishedProof ?? null) === digest(outcome.value.storageProof) &&
      digest(value.url) === outcome.value.urlHash,
    );
    if (imageAvailable) imageState = 'available';
  }
  return {
    state: outcome?.value.state ?? 'pending',
    imageId: library ? loaded.job.preparation.cover.imageId : null,
    imageAvailable,
    imageState,
    completedAt: outcome?.value.completedAt ?? null,
  };
}
export const bookRestoreMediaReceipt = (outcome) => ({
  operationId: outcome.value.operationId,
  action: 'finalizeBookRestoreMedia',
  state: outcome.value.state,
  completedAt: outcome.value.completedAt,
});
