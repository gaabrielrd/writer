import {
  bornEqual,
  requestHash,
  inconsistent,
  bookRestoreLoreModeBinding,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
/** Historical confirmation only. Never opens the current book or grants access to its data. */
export async function readBookRestoreActivationProof(tx, db, loaded, readOp) {
  const { job, view, snapshot } = loaded,
    a = job.activation,
    reservation = await tx.get(db.doc('bookRestoreReservations/' + job.bookId)),
    receipt = await tx.get(
      db.doc('users/' + job.ownerId + '/bookRestoreOperations/' + a.operationId),
    ),
    value = reservation.data(),
    expected = requestHash('activateBookRestore', {
      restoreId: job.restoreId,
      jobToken: view.jobToken,
      operationId: a.operationId,
      expectedCheckpoint: a.sourceCheckpoint,
      reviewToken: a.reviewToken,
    });
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== job.ownerId ||
    value.restoreId !== job.restoreId ||
    value.bookId !== job.bookId ||
    value.startFingerprint !== job.startFingerprint ||
    value.kind !== 'job' ||
    !bornEqual(reservation, snapshot) ||
    !bornEqual(reservation, { createTime: reservation.updateTime }) ||
    !receipt.exists ||
    !bornEqual(receipt, { createTime: receipt.updateTime }) ||
    !bornEqual(receipt, { createTime: snapshot.updateTime }) ||
    expected !== a.requestHash
  )
    inconsistent();
  bookRestoreLoreModeBinding(job, value);
  const r = readOp(receipt, job.ownerId, job.restoreId, a.requestHash, loaded);
  if (
    r.action !== 'activateBookRestore' ||
    r.state !== 'activated' ||
    r.checkpoint !== job.checkpoint ||
    r.expectedCheckpoint !== a.sourceCheckpoint ||
    digest(r.activation) !== digest(a) ||
    digest(r.preparation) !== digest(job.preparation)
  )
    inconsistent();
  return { receipt, reservation };
}
