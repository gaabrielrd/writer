import { born, bornEqual } from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { creationPaths, creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { loadCreationReservation } from './bookLoreCreationStore.mjs';

/** Only metadata: a creation reservation is the source until its original head exists. */
export async function readCreationRecoveryOrigin(tx, scope, book, intent, pinned) {
  const ref = intent.creation,
    c = creationPaths(scope.db, scope.uid, {
      bookId: intent.bookId,
      creationId: ref.creationId,
    }),
    parent = await loadCreationReservation(tx, c, { jobToken: ref.jobToken });
  if (
    !parent ||
    parent.context.kind !== 'reservation' ||
    parent.context.startHash !== ref.startHash ||
    parent.token !== intent.sourceToken ||
    c.loreId !== intent.loreId ||
    !bornEqual(book.snapshot, { createTime: parent.context.bookBirth })
  )
    conflict();
  const currentBook = await readWorkMetadata(tx, scope.db.doc(scope.path), ['hasLoreResources']);
  if (currentBook.data().hasLoreResources !== true) conflict();
  const head = await readWorkMetadata(tx, scope.db.doc(scope.path + '/lore/' + intent.loreId), [
      'deleting',
      'deleted',
    ]),
    tombstone = await readWorkMetadata(
      tx,
      scope.db.doc(scope.path + '/bookLoreTombstones/' + intent.loreId),
      [],
    ),
    deleted = await readWorkMetadata(tx, scope.db.doc('deletedBooks/' + intent.bookId), []);
  if (tombstone.exists || deleted.exists) conflict();
  if (pinned) {
    if (
      !bornEqual(book.snapshot, { createTime: pinned.bookBirth }) ||
      !bornEqual(parent.snapshot, { createTime: pinned.sourceBirth })
    )
      conflict();
    if (parent.adoption) {
      if (
        !head.exists ||
        !bornEqual(head, parent.adoption.snapshot) ||
        ['deleting', 'deleted'].some(
          (key) => Object.hasOwn(head.data(), key) && head.data()[key] !== false,
        )
      )
        conflict();
    } else if (head.exists) conflict();
    // A cancelled reservation still owns its existing draft, but cannot produce.
  } else if (parent.adoption || parent.cancelRequest || parent.cancellation || head.exists)
    conflict();
  return { bookBirth: born(book.snapshot), sourceBirth: born(parent.snapshot) };
}
