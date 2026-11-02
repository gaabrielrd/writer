import { createScenesService } from '../../src/scenes.mjs';
export function bookLoreDeletionFixture(
  db,
  { uid = 'author', bookId = 'book', operationId = 'delete-book-lore-0001' } = {},
) {
  const factory = () => createScenesService({ db, now: () => 3000 }),
    request = { target: { kind: 'book', id: bookId }, operationId, limit: 16 };
  return {
    db,
    uid,
    bookId,
    operationId,
    deletionFactory: factory,
    request,
    path: 'users/' + uid + '/bookLoreDeletions/' + bookId,
    step: () => factory().deleteSceneBook(uid, request),
  };
}
export async function markBookDeleting(f) {
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc('books/' + f.bookId), { deleting: true, status: 'draft' });
    tx.delete(f.db.doc('publicBooks/' + f.bookId));
  });
}
export async function finishBookLoreDeletion(f) {
  let p;
  for (let i = 0; i < 10000; i++) {
    p = await f.step();
    if (p.complete) return p;
  }
  throw Error('Book deletion did not finish');
}
