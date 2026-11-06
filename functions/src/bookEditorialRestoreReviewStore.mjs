import { digest } from './workProgressContracts.mjs';
import { closed, restoreId, restoreHash, integer, bornEqual, inconsistent, restoreFail as fail } from './bookRestoreUploadContracts.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as names } from './bookEditorialStorage.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { editorialNativeAtMost, assertEditorialImmutableBefore } from './bookEditorialHistoryOrigin.mjs';
import { validateEditorialRestoreReview, editorialRestoreReviewId } from './bookEditorialHistoryContracts.mjs';
export const resolutionRef = (db, bookId, id) => db.doc('books/' + bookId + '/' + names.resolutions + '/' + id);
export const reviewOperationRef = (db, bookId, operationId) => db.doc('books/' + bookId + '/' + names.operations + '/' + operationId);
export function reviewAcknowledgementView(value) {
  return { id: value.id, kind: value.kind, operationId: value.operationId, decision: value.decision,
    nativeRevision: value.nativeRevision, nativeContentHash: value.nativeContentHash,
    acknowledgedAt: value.acknowledgedAt, planChanged: value.planChanged };
}
export async function readOriginalEditorialReview(tx, db, proof, id) {
  editorialRestoreReviewId(id);
  const snapshot = await tx.get(db.doc('books/' + proof.loaded.job.bookId + '/' + names.reviews + '/' + id));
  if (!snapshot.exists) fail('not-found', 'editorial-review-unavailable');
  assertEditorialImmutableBefore(snapshot, proof.seal);
  const value = validateEditorialRestoreReview(snapshot.data(), id);
  return { snapshot, value };
}
export function validateEditorialReviewOperation(snapshot, proof) {
  if (!snapshot.exists || !bornEqual(snapshot, { createTime: snapshot.updateTime }) ||
    !editorialNativeAtMost(proof.activation.receipt, snapshot)) inconsistent();
  const value = snapshot.data();
  closed(value, ['schemaVersion', 'ownerId', 'bookId', 'operationId', 'method', 'requestHash', 'id', 'resolutionHash', 'outcome']);
  restoreId(value.operationId); editorialRestoreReviewId(value.id);
  restoreHash(value.requestHash); restoreHash(value.resolutionHash);
  if (value.schemaVersion !== 1 || value.ownerId !== proof.loaded.job.ownerId ||
    value.bookId !== proof.loaded.job.bookId || value.operationId !== snapshot.id ||
    value.method !== 'reviewBookEditorialRestore') inconsistent();
  return value;
}
export async function readEditorialReviewResolution(tx, db, proof, original, id) {
  const snapshot = await tx.get(resolutionRef(db, proof.loaded.job.bookId, id));
  if (!snapshot.exists) {
    const orphan = await tx.get(db.collection('books/' + proof.loaded.job.bookId + '/' + names.operations)
      .where('id', '==', id).select().limit(1));
    if (orphan.docs.length) inconsistent();
    return null;
  }
  if (!bornEqual(snapshot, { createTime: snapshot.updateTime }) ||
    !editorialNativeAtMost(proof.activation.receipt, snapshot)) inconsistent();
  const value = snapshot.data();
  closed(value, ['schemaVersion', 'ownerId', 'bookId', 'id', 'kind', 'operationId', 'requestHash', 'originToken',
    'sourceReviewToken', 'decision', 'revision', 'acknowledgedAt', 'nativeRevision', 'nativeContentHash', 'nativeBirth', 'planChanged']);
  restoreId(value.operationId); restoreHash(value.requestHash); restoreHash(value.originToken); restoreHash(value.sourceReviewToken);
  if (value.schemaVersion !== 1 || value.ownerId !== proof.loaded.job.ownerId || value.bookId !== proof.loaded.job.bookId ||
    value.id !== id || snapshot.id !== id || value.kind !== original.value.kind || value.revision !== 1 ||
    value.originToken !== proof.contextToken || value.sourceReviewToken !== nativeRestoreToken(original.snapshot) ||
    !['keep-current', 'reconcile-references'].includes(value.decision) || typeof value.planChanged !== 'boolean' ||
    (value.decision === 'reconcile-references' && value.kind !== 'plan') ||
    (value.planChanged && value.decision !== 'reconcile-references')) inconsistent();
  integer(value.acknowledgedAt);
  if (!Number.isFinite(new Date(value.acknowledgedAt).getTime()) ||
    value.acknowledgedAt < proof.loaded.job.activation.activatedAt) inconsistent();
  if (value.nativeRevision === null) {
    if (value.nativeContentHash !== null || value.nativeBirth !== null || value.planChanged) inconsistent();
  } else { integer(value.nativeRevision, 1); restoreHash(value.nativeContentHash); restoreHash(value.nativeBirth); }
  const operation = await tx.get(reviewOperationRef(db, value.bookId, value.operationId));
  const receipt = validateEditorialReviewOperation(operation, proof);
  if (!bornEqual(snapshot, operation) || receipt.id !== id || receipt.requestHash !== value.requestHash ||
    receipt.resolutionHash !== digest(value) || digest(receipt.outcome) !== digest(reviewAcknowledgementView(value))) inconsistent();
  return { snapshot, value, operation, receipt };
}

export const reviewWithdrawalRef = (db, bookId, operationId) => db.doc('books/' + bookId + '/' + names.withdrawals + '/' + operationId);
export function reviewWithdrawalView(value) {
  return { id: value.id, operationId: value.operationId, retiredAt: value.retiredAt };
}
export async function readEditorialReviewWithdrawal(tx, db, proof, snapshot) {
  if (!snapshot.exists) return null;
  if (!bornEqual(snapshot, { createTime: snapshot.updateTime }) ||
    !editorialNativeAtMost(proof.activation.receipt, snapshot)) inconsistent();
  const value = snapshot.data();
  closed(value, ['schemaVersion', 'ownerId', 'bookId', 'id', 'operationId', 'requestHash', 'originToken', 'sourceReviewToken', 'retiredAt']);
  restoreId(value.operationId); editorialRestoreReviewId(value.id); restoreHash(value.requestHash);
  restoreHash(value.originToken); restoreHash(value.sourceReviewToken); integer(value.retiredAt);
  if (value.schemaVersion !== 1 || value.ownerId !== proof.loaded.job.ownerId || value.bookId !== proof.loaded.job.bookId ||
    value.operationId !== snapshot.id || value.originToken !== proof.contextToken ||
    !Number.isFinite(new Date(value.retiredAt).getTime()) || value.retiredAt < proof.loaded.job.activation.activatedAt) inconsistent();
  const original = await readOriginalEditorialReview(tx, db, proof, value.id);
  if (value.sourceReviewToken !== nativeRestoreToken(original.snapshot)) inconsistent();
  return value;
}
