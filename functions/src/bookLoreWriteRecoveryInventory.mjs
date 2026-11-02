import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  immutableRecovery,
  recoveryConflict as conflict,
} from './bookLoreWriteRecoveryContracts.mjs';

export const recoveryKeyInventoryRef = (c, bookId) =>
  c.db.doc('books/' + bookId + '/bookLoreRecoveryKeys/' + c.id);
export const recoveryKeyInventoryValue = (c, value) => ({
  schemaVersion: 1,
  ownerId: c.uid,
  writeId: c.id,
  bookId: value.intent.bookId,
  bookBirth: value.bookBirth,
  requestHash: value.requestHash,
  keyId: value.keyId,
});
/** An immutable index of a native key, never its material or a grant. */
export async function readRecoveryKeyInventory(tx, l) {
  const indexed = l.value.keyInventory === 1,
    ref = recoveryKeyInventoryRef(l.c, l.value.intent.bookId),
    snapshot = await tx.get(ref);
  if (!indexed) {
    if (snapshot.exists) conflict();
    return snapshot;
  }
  if (
    !immutableRecovery(snapshot) ||
    !bornEqual(snapshot, l.root) ||
    digest(snapshot.data()) !== digest(recoveryKeyInventoryValue(l.c, l.value))
  )
    conflict();
  return snapshot;
}
