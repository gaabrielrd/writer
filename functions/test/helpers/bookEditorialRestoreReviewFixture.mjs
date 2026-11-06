import { readyEditorialHistory, uid } from './bookEditorialHistoryFixture.mjs';
import { createLiteraryPlanningService } from '../../src/literaryPlanning.mjs';
export { uid };
export async function readyRestoreReview(options) {
  const f = await readyEditorialHistory(options);
  const rows = await f.db.runTransaction((tx) =>
    tx.get(
      f.db
        .collection('books/' + f.p.bookId + '/literaryPlans')
        .orderBy('__name__')
        .limit(10),
    ),
  );
  f.planId = rows.docs[0].id;
  f.target = { kind: 'book', id: f.p.bookId };
  return f;
}
export async function reviewRequest(
  f,
  {
    id = f.planId,
    decision = 'keep-current',
    operationId = 'restore-review-0001',
    references,
  } = {},
) {
  const state = await f.factory().getBookEditorialRestoreReview(uid, { bookId: f.p.bookId, id });
  return {
    bookId: f.p.bookId,
    id,
    operationId,
    reviewToken: state.reviewToken,
    decision,
    ...(decision === 'reconcile-references' ? { references: references ?? [] } : {}),
  };
}
export async function selectCurrentAct(f, id = 'own-current-act') {
  const book = f.db.doc('books/' + f.p.bookId),
    snapshot = await book.get();
  const date = Math.max(9000, snapshot.data().updatedAt + 1);
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc(book.path + '/acts/' + id), {
      id,
      name: 'Own current act',
      order: 0,
      createdAt: date,
      updatedAt: date,
    });
    tx.update(book, { updatedAt: date });
  });
  const rows = await createLiteraryPlanningService({ db: f.db }).listLiteraryReferences(uid, {
    target: f.target,
    kind: 'act',
    limit: 50,
    afterId: null,
    purpose: 'source',
    sourceBookId: null,
    unitKind: null,
  });
  return rows.items.find((row) => row.reference.id === id).reference;
}
