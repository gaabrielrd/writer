import { authorize, closed, restoreId, restoreHash, inconsistent, invalid, restoreFail as fail } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { readBookEditorialHistoryOrigin } from './bookEditorialHistoryOrigin.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as names } from './bookEditorialStorage.mjs';
import { editorialHistoryLimit, editorialRestoreReviewId, validateEditorialRestoreReview } from './bookEditorialHistoryContracts.mjs';
import { assertEditorialImmutableBefore } from './bookEditorialHistoryOrigin.mjs';
import { readEditorialReviewResolution, reviewAcknowledgementView } from './bookEditorialRestoreReviewStore.mjs';
function cursor(value, bookId, token) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  let parsed; try { parsed = JSON.parse(Buffer.from(value, 'base64url').toString()); } catch { invalid(); }
  closed(parsed, ['version', 'bookId', 'token', 'after']);
  if (parsed.version !== 1 || parsed.bookId !== bookId || parsed.token !== token ||
    Buffer.from(JSON.stringify(parsed)).toString('base64url') !== value) fail('failed-precondition', 'editorial-review-page-changed');
  return editorialRestoreReviewId(parsed.after);
}
export function createBookEditorialRestoreReviewCatalog({ db, load, readOp }) {
  return { async listBookEditorialRestoreReviews(uid, input) {
    authorize(uid); closed(input, ['bookId', 'after', 'limit']);
    const bookId = restoreId(input.bookId), limit = editorialHistoryLimit(input.limit);
    return db.runTransaction(async tx => {
      const root = await readWorkMetadata(tx, db.doc('books/' + bookId), ['authorId', 'deleting', 'restoreOrigin']);
      if (!root.exists || root.data().authorId !== uid || root.data().deleting) fail('not-found', 'editorial-history-unavailable');
      const origin = root.data().restoreOrigin;
      if (!origin) { if (input.after !== null) invalid(); return { schemaVersion: 1, bookId, availability: 'none', items: [], next: null }; }
      closed(origin, ['schemaVersion', 'restoreId', 'jobToken', 'activationOperationId']);
      restoreId(origin.restoreId); restoreHash(origin.jobToken);
      const loaded = await load(tx, uid, origin.restoreId, origin.jobToken);
      if (loaded.job.bookId !== bookId || loaded.job.state !== 'activated') inconsistent();
      if (loaded.job.cleanupVersion !== 15) {
        if (input.after !== null) invalid(); return { schemaVersion: 1, bookId, availability: 'none', items: [], next: null };
      }
      const proof = await readBookEditorialHistoryOrigin(tx, { db, load, readOp }, uid, bookId);
      const token = digest({ context: proof.contextToken, revision: proof.root.data().literaryRevision ?? 0, kind: 'review-catalog-v1' });
      const after = cursor(input.after, bookId, token);
      let query = db.collection('books/' + bookId + '/' + names.reviews).orderBy('__name__').limit(limit);
      if (after !== null) query = query.startAfter(after);
      const page = await tx.get(query), items = [];
      for (const snapshot of page.docs) {
        assertEditorialImmutableBefore(snapshot, proof.seal);
        const value = validateEditorialRestoreReview(snapshot.data(), snapshot.id);
        const resolution = await readEditorialReviewResolution(tx, db, proof, { snapshot, value }, snapshot.id);
        const head = value.kind === 'contract' ? null : await readWorkMetadata(tx,
          db.doc('books/' + bookId + '/literaryPlans/' + snapshot.id), ['plan.title']);
        items.push({ id: snapshot.id, kind: value.kind,
          title: value.kind === 'contract' ? 'Contrato editorial' : head?.data()?.plan?.title ?? 'Plano removido',
          reviewState: resolution ? 'acknowledged' : 'required', acknowledgement: resolution ? reviewAcknowledgementView(resolution.value) : null });
      }
      const next = page.docs.length === limit ? Buffer.from(JSON.stringify({ version: 1, bookId, token,
        after: page.docs.at(-1).id })).toString('base64url') : null;
      return { schemaVersion: 1, bookId, availability: 'available', items, next };
    });
  } };
}
