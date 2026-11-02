import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { creationPaths, creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { loadCreationReservation } from './bookLoreCreationStore.mjs';
/** A reserved ID is readable only with the head's original native activation birth. */
export async function assertCreationHead(tx, scope, reservation, head) {
  const v = reservation.data();
  if (v.intent?.bookId !== scope.bookId || v.ownerId !== scope.uid) conflict();
  const c = creationPaths(scope.db, scope.uid, v.intent);
  if (reservation.ref.path !== c.reservationRef.path || head.id !== c.loreId) conflict();
  const parent = await loadCreationReservation(tx, c),
    root = await readWorkMetadata(tx, scope.db.doc(scope.path), ['authorId', 'deleting']);
  if (
    !parent?.adoption ||
    !bornEqual(head, parent.adoption.snapshot) ||
    !root.exists ||
    root.data().authorId !== scope.uid ||
    (Object.hasOwn(root.data(), 'deleting') && root.data().deleting !== false) ||
    !bornEqual(root, { createTime: parent.context.bookBirth }) ||
    !Object.hasOwn(head.data(), 'payloadStorage') ||
    head.data().createdAt !== parent.adoption.adoption.timestamp
  )
    conflict();
  return parent.adoption;
}
