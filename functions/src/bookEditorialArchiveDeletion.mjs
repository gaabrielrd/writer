import { sceneId, sceneLimit, sceneFail } from './sceneContracts.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS } from './bookEditorialStorage.mjs';
const ordered = Object.freeze([
  BOOK_EDITORIAL_HISTORY_COLLECTIONS.parts,
  BOOK_EDITORIAL_HISTORY_COLLECTIONS.bodies,
  BOOK_EDITORIAL_HISTORY_COLLECTIONS.records,
  BOOK_EDITORIAL_HISTORY_COLLECTIONS.reviews,
  BOOK_EDITORIAL_HISTORY_COLLECTIONS.resolutions,
  BOOK_EDITORIAL_HISTORY_COLLECTIONS.operations,
  BOOK_EDITORIAL_HISTORY_COLLECTIONS.withdrawals,
]);
/** Native read plan only. Caller commits removals with the deletion checkpoint/receipt. */
export async function prepareBookEditorialArchiveDeletion(tx, { db, uid, bookId, limit = 50 }) {
  sceneId(bookId);
  sceneLimit(limit);
  if (typeof uid !== 'string' || !uid) sceneFail('unauthenticated', 'Entre para excluir o livro.');
  const [root, published] = await Promise.all([
    tx.get(db.doc('books/' + bookId)),
    tx.get(db.doc('publicBooks/' + bookId)),
  ]);
  if (!root.exists || root.data().authorId !== uid)
    sceneFail('permission-denied', 'Livro indisponível.');
  if (root.data().deleting !== true || published.exists)
    sceneFail('failed-precondition', 'Revogue a publicação e inicie a exclusão antes da limpeza.');
  for (const collection of ordered) {
    const page = await tx.get(
      db
        .collection('books/' + bookId + '/' + collection)
        .orderBy('__name__')
        .select()
        .limit(limit),
    );
    if (page.docs.length)
      return { complete: false, collection, remove: page.docs.map((row) => row.ref) };
  }
  return { complete: true, collection: null, remove: [] };
}
export async function hasBookEditorialArchiveResources(tx, options) {
  return !(await prepareBookEditorialArchiveDeletion(tx, { ...options, limit: 1 })).complete;
}
