import { createBookLoreCreationReservationService } from '../../src/bookLoreCreation.mjs';
import { creationPaths } from '../../src/bookLoreCreationContracts.mjs';
export function creationFixture(
  db,
  { uid = 'author', bookId = 'book', creationId = 'creation-operation-0001' } = {},
) {
  const intent = { bookId, creationId },
    factory = () => createBookLoreCreationReservationService({ db }),
    c = creationPaths(db, uid, intent);
  return {
    db,
    uid,
    bookId,
    intent,
    c,
    factory,
    start: () => factory().startBookLoreCreationReservation(uid, intent),
    get: () => factory().getBookLoreCreationReservation(uid, intent),
    cancel: (operationId = 'cancel-creation-0001', jobToken = undefined) =>
      factory().cancelBookLoreCreationReservation(uid, {
        ...intent,
        operationId,
        ...(jobToken ? { jobToken } : {}),
      }),
  };
}
export async function seedCreationBook(db, bookId = 'book', uid = 'author', data = {}) {
  await db.runTransaction(async (tx) =>
    tx.create(db.doc('books/' + bookId), {
      authorId: uid,
      deleting: false,
      status: 'draft',
      createdAt: 1000,
      updatedAt: 1001,
      ...data,
    }),
  );
}
