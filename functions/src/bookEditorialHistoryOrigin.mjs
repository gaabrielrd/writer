import { BOOK_RESTORE_EDITORIAL_AUDIT_LAYOUT } from './bookRestoreAuditInventory.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  authorize,
  closed,
  restoreId,
  restoreHash,
  bornEqual,
  inconsistent,
  bookRestoreArtifactBalance,
  restoreFail as fail,
} from './bookRestoreUploadContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { readBookRestoreActivationProof } from './bookRestoreActivationProof.mjs';
import {
  validateEditorialMaterialization,
  editorialArtifactCount,
} from './bookRestoreEditorialBodyContracts.mjs';

export function editorialNativeAtMost(first, second) {
  const a = first?.createTime,
    b = second?.createTime;
  if (
    ![a, b].every(
      (stamp) =>
        Number.isSafeInteger(stamp?.seconds) &&
        Number.isSafeInteger(stamp?.nanoseconds) &&
        stamp.nanoseconds >= 0 &&
        stamp.nanoseconds < 1e9,
    )
  )
    inconsistent();
  return a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
}
export function assertEditorialImmutableBefore(snapshot, cutoff) {
  if (
    !snapshot?.exists ||
    !bornEqual(snapshot, { createTime: snapshot.updateTime }) ||
    !editorialNativeAtMost(snapshot, cutoff)
  )
    inconsistent();
}

/** Historical witness only, intentionally usable after source journals are removed.
 * The current book authorization is a separate mandatory step for content readers.
 */
export async function readBookEditorialArchiveProof(tx, db, loaded, readOp) {
  const j = loaded.job,
    certificate = j.activation?.editorial;
  if (
    j.state !== 'activated' ||
    j.cleanupVersion !== 15 ||
    j.source.format !== 'writer-book-archive' ||
    j.source.version !== 2 ||
    !certificate
  )
    fail('failed-precondition', 'editorial-history-unavailable');
  const activation = await readBookRestoreActivationProof(tx, db, loaded, readOp);
  const control = await tx.get(db.doc(loaded.ref.path + '/preparedEditorial/current'));
  if (!control.exists) inconsistent();
  const value = validateEditorialMaterialization(control.data()),
    census = value.census;
  if (
    value.phase !== 'materialized' ||
    value.heads?.phase !== 'prepared' ||
    census?.phase !== 'done' ||
    value.itemCount !== j.validationMeta.items ||
    census.family !== BOOK_RESTORE_EDITORIAL_AUDIT_LAYOUT.length ||
    value.sourceSha256 !== j.source.sha256 ||
    value.sourceBookId !== j.validationSummary.sourceBookId ||
    value.baseArtifacts + j.preparation.editorialAddedArtifacts !== j.preparation.artifactCount ||
    editorialArtifactCount(value) !== j.preparation.artifactCount ||
    census.checkedArtifacts !== bookRestoreArtifactBalance(j.preparation) ||
    census.checkedPhysical !== census.checkedArtifacts ||
    census.contextToken !== certificate.contextToken ||
    nativeRestoreToken(control) !== certificate.controlToken
  )
    inconsistent();
  const seal = await tx.get(
    db.doc('users/' + j.ownerId + '/bookRestoreOperations/' + census.sealOperationId),
  );
  assertEditorialImmutableBefore(seal, activation.receipt);
  const receipt = readOp(
    seal,
    j.ownerId,
    j.restoreId,
    restoreHash(seal.data().fingerprint),
    loaded,
  );
  if (
    nativeRestoreToken(seal) !== certificate.sealToken ||
    !bornEqual({ createTime: control.updateTime }, seal) ||
    !['advanceBookRestoreEditorialAudit', 'retireBookRestoreActivation'].includes(receipt.action) ||
    receipt.state !== 'content-verified' ||
    receipt.checkpoint !== j.activation.sourceCheckpoint ||
    digest(receipt.preparation) !== digest(j.preparation)
  )
    inconsistent();
  return { control, value, seal, activation };
}

/** Current native root, not a historical restore receipt, authorizes access. */
export async function readBookEditorialHistoryOrigin(tx, { db, load, readOp }, uid, bookId) {
  authorize(uid);
  restoreId(bookId);
  const root = await readWorkMetadata(tx, db.doc('books/' + bookId), [
    'authorId',
    'deleting',
    'hasLiteraryResources',
    'restoreOrigin',
    'literaryRevision',
  ]);
  const value = root.data();
  if (
    !root.exists ||
    value.authorId !== uid ||
    value.deleting ||
    value.hasLiteraryResources !== true
  )
    fail('not-found', 'editorial-history-unavailable');
  const origin = value.restoreOrigin;
  if (!origin) fail('not-found', 'editorial-history-unavailable');
  closed(origin, ['schemaVersion', 'restoreId', 'jobToken', 'activationOperationId']);
  if (origin.schemaVersion !== 1) inconsistent();
  restoreId(origin.restoreId);
  restoreHash(origin.jobToken);
  restoreId(origin.activationOperationId);
  const loaded = await load(tx, uid, origin.restoreId, origin.jobToken);
  if (
    loaded.job.bookId !== bookId ||
    loaded.job.activation?.operationId !== origin.activationOperationId
  )
    inconsistent();
  const proof = await readBookEditorialArchiveProof(tx, db, loaded, readOp);
  if (!bornEqual(root, proof.activation.receipt)) inconsistent();
  return {
    ...proof,
    root,
    loaded,
    contextToken: digest({
      domain: 'writer-book-editorial-history-origin-v1',
      ownerId: uid,
      bookId,
      rootBirth: { seconds: root.createTime.seconds, nanoseconds: root.createTime.nanoseconds },
      jobToken: loaded.view.jobToken,
      activation: nativeRestoreToken(proof.activation.receipt),
      control: nativeRestoreToken(proof.control),
      seal: nativeRestoreToken(proof.seal),
    }),
  };
}
