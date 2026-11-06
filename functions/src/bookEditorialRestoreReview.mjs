import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as names } from './bookEditorialStorage.mjs';
import { digest, workScope, workProject, workRevision, workDate } from './workProgressContracts.mjs';
import { authorize, closed, restoreId, restoreHash, invalid, inconsistent, restoreFail as fail } from './bookRestoreUploadContracts.mjs';
import { literaryReference } from './literaryPlanningSchema.mjs';
import { prepareLiteraryPlanSave } from './literaryPlanWrite.mjs';
import { readBookEditorialHistoryOrigin } from './bookEditorialHistoryOrigin.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { editorialBirth } from './bookRestoreEditorialBodyContracts.mjs';
import { editorialRestoreReviewId } from './bookEditorialHistoryContracts.mjs';
import { readBookEditorialRestoreReviewState } from './bookEditorialRestoreReviewRead.mjs';
import { resolutionRef, reviewOperationRef, readOriginalEditorialReview, readEditorialReviewResolution,
  validateEditorialReviewOperation, reviewAcknowledgementView, reviewWithdrawalRef, readEditorialReviewWithdrawal, reviewWithdrawalView } from './bookEditorialRestoreReviewStore.mjs';
function mutation(input) {
  closed(input, ['bookId', 'id', 'operationId', 'reviewToken', 'decision'], ['references']);
  const request = { bookId: restoreId(input.bookId), id: editorialRestoreReviewId(input.id),
    operationId: restoreId(input.operationId), reviewToken: restoreHash(input.reviewToken), decision: input.decision };
  if (!['keep-current', 'reconcile-references'].includes(request.decision)) invalid();
  if (request.decision === 'keep-current') { if (Object.hasOwn(input, 'references')) invalid(); }
  else {
    if (!Array.isArray(input.references) || input.references.length > 12) invalid();
    request.references = input.references.map(literaryReference);
  }
  return request;
}
export function createBookEditorialRestoreReviewService({ db, load, readOp, now = Date.now }) {
  const dependencies = { db, load, readOp };
  async function outcome(tx, proof, snapshot) {
    const op = validateEditorialReviewOperation(snapshot, proof);
    const original = await readOriginalEditorialReview(tx, db, proof, op.id);
    const resolution = await readEditorialReviewResolution(tx, db, proof, original, op.id);
    if (!resolution || resolution.operation.id !== snapshot.id || resolution.receipt.requestHash !== op.requestHash || digest(resolution.receipt) !== digest(op)) inconsistent();
    return op.outcome;
  }
  return {
    async retireBookEditorialRestoreReview(uid, input) {
      authorize(uid); const request = mutation(input);
      const fingerprint = digest({ domain: 'writer-restored-editorial-review-v1', ownerId: uid, ...request });
      return db.runTransaction(async tx => {
        const proof = await readBookEditorialHistoryOrigin(tx, dependencies, uid, request.bookId);
        const applied = await tx.get(reviewOperationRef(db, request.bookId, request.operationId));
        const ref = reviewWithdrawalRef(db, request.bookId, request.operationId), snapshot = await tx.get(ref);
        if (applied.exists && snapshot.exists) inconsistent();
        if (applied.exists) {
          const receipt = validateEditorialReviewOperation(applied, proof);
          if (receipt.requestHash !== fingerprint) fail('invalid-argument', 'editorial-review-operation-mismatch');
          return { schemaVersion: 1, bookId: request.bookId, kind: 'confirmed', receipt: await outcome(tx, proof, applied) };
        }
        if (snapshot.exists) {
          const value = await readEditorialReviewWithdrawal(tx, db, proof, snapshot);
          if (value.requestHash !== fingerprint) fail('invalid-argument', 'editorial-review-operation-mismatch');
          return { schemaVersion: 1, bookId: request.bookId, kind: 'retired', receipt: reviewWithdrawalView(value) };
        }
        const original = await readOriginalEditorialReview(tx, db, proof, request.id);
        const context = workScope(db, uid, { target: { kind: 'book', id: request.bookId } }, []);
        const root = await workProject(tx, context);
        const retiredAt = workDate(now, Math.max(root.updatedAt ?? 0, proof.loaded.job.activation.activatedAt));
        const value = { schemaVersion: 1, ownerId: uid, bookId: request.bookId, id: request.id,
          operationId: request.operationId, requestHash: fingerprint, originToken: proof.contextToken,
          sourceReviewToken: nativeRestoreToken(original.snapshot), retiredAt };
        tx.create(ref, value);
        tx.update(context.ref, { updatedAt: retiredAt, literaryRevision: workRevision((root.literaryRevision ?? 0) + 1) });
        return { schemaVersion: 1, bookId: request.bookId, kind: 'retired', receipt: reviewWithdrawalView(value) };
      });
    },
    async getBookEditorialRestoreReviewOperation(uid, input) {
      authorize(uid); closed(input, ['bookId', 'operationId']);
      const bookId = restoreId(input.bookId), operationId = restoreId(input.operationId);
      return db.runTransaction(async tx => {
        const proof = await readBookEditorialHistoryOrigin(tx, dependencies, uid, bookId);
        const snapshot = await tx.get(reviewOperationRef(db, bookId, operationId));
        const withdrawn = await tx.get(reviewWithdrawalRef(db, bookId, operationId));
        if (snapshot.exists && withdrawn.exists) inconsistent();
        if (withdrawn.exists) return { schemaVersion: 1, bookId, state: 'retired', receipt: reviewWithdrawalView(await readEditorialReviewWithdrawal(tx, db, proof, withdrawn)) };
        if (snapshot.exists) return { schemaVersion: 1, bookId, state: 'confirmed', receipt: await outcome(tx, proof, snapshot) };
        const orphan = await tx.get(db.collection('books/' + bookId + '/' + names.resolutions)
          .where('operationId', '==', operationId).select().limit(1));
        if (orphan.docs.length) inconsistent();
        return { schemaVersion: 1, bookId, state: 'unconfirmed' };
      });
    },
    async reviewBookEditorialRestore(uid, input) {
      authorize(uid); const request = mutation(input);
      const fingerprint = digest({ domain: 'writer-restored-editorial-review-v1', ownerId: uid, ...request });
      return db.runTransaction(async tx => {
        const proof = await readBookEditorialHistoryOrigin(tx, dependencies, uid, request.bookId);
        const opRef = reviewOperationRef(db, request.bookId, request.operationId), old = await tx.get(opRef);
        const withdrawn = await tx.get(reviewWithdrawalRef(db, request.bookId, request.operationId));
        if (old.exists && withdrawn.exists) inconsistent();
        if (withdrawn.exists) {
          const value = await readEditorialReviewWithdrawal(tx, db, proof, withdrawn);
          if (value.requestHash !== fingerprint) fail('invalid-argument', 'editorial-review-operation-mismatch');
          return { schemaVersion: 1, bookId: request.bookId, kind: 'retired', receipt: reviewWithdrawalView(value) };
        }
        if (old.exists) {
          const op = validateEditorialReviewOperation(old, proof);
          if (op.requestHash !== fingerprint) fail('invalid-argument', 'editorial-review-operation-mismatch');
          return { schemaVersion: 1, bookId: request.bookId, kind: 'confirmed', receipt: await outcome(tx, proof, old) };
        }
        const state = await readBookEditorialRestoreReviewState(tx, dependencies, uid, request);
        if (state.resolution) fail('failed-precondition', 'editorial-review-already-acknowledged');
        if (state.view.reviewToken !== request.reviewToken) fail('failed-precondition', 'editorial-review-changed');
        const context = workScope(db, uid, { target: { kind: 'book', id: request.bookId } }, []);
        const root = await workProject(tx, context);
        let prepared = null;
        if (request.decision === 'reconcile-references') {
          if (state.original.value.kind !== 'plan' || !state.current.exists)
            fail('failed-precondition', 'editorial-review-current-plan-required');
          const current = state.current.data();
          prepared = await prepareLiteraryPlanSave(tx, { context, root, current, id: request.id,
            expectedRevision: current.revision, plan: { ...current.plan, references: request.references }, now });
        }
        const final = prepared ? { revision: prepared.value.revision, contentHash: digest(prepared.value.plan) } : state.native;
        const updatedAt = workDate(now, Math.max(root.updatedAt ?? 0, state.current.data()?.updatedAt ?? 0, proof.loaded.job.activation.activatedAt));
        const value = { schemaVersion: 1, ownerId: uid, bookId: request.bookId, id: request.id,
          kind: state.original.value.kind, operationId: request.operationId, requestHash: fingerprint,
          originToken: proof.contextToken, sourceReviewToken: nativeRestoreToken(state.original.snapshot),
          decision: request.decision, revision: 1, acknowledgedAt: updatedAt,
          nativeRevision: final?.revision ?? null, nativeContentHash: final?.contentHash ?? null,
          nativeBirth: state.current.exists ? editorialBirth(state.current) : null, planChanged: prepared?.changed ?? false };
        const result = reviewAcknowledgementView(value);
        const rootPatch = { ...(prepared?.rootPatch ?? {}), updatedAt, hasLiteraryResources: true,
          literaryRevision: workRevision((root.literaryRevision ?? 0) + 1) };
        // All source authorization, CAS and receipt reads precede every write.
        prepared?.commit({ writeRoot: false });
        tx.create(resolutionRef(db, request.bookId, request.id), value);
        tx.create(opRef, { schemaVersion: 1, ownerId: uid, bookId: request.bookId, operationId: request.operationId,
          method: 'reviewBookEditorialRestore', requestHash: fingerprint, id: request.id,
          resolutionHash: digest(value), outcome: result });
        tx.update(context.ref, rootPatch);
        return { schemaVersion: 1, bookId: request.bookId, kind: 'confirmed', receipt: result };
      });
    },
  };
}
