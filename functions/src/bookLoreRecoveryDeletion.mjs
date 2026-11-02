import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { recoveryPaths, immutableRecovery } from './bookLoreWriteRecoveryContracts.mjs';
import { loadBookLoreWriteRecovery } from './bookLoreWriteRecoveryStore.mjs';
import {
  recoveryKeyInventoryRef,
  readRecoveryKeyInventory,
} from './bookLoreWriteRecoveryInventory.mjs';
import {
  assertDeletionOpening,
  deletionScopeCheck,
  deletionConflict as conflict,
} from './bookLoreDeletionStore.mjs';

export const recoveryBookQuery = (db, uid, bookId) =>
  db.collection('users/' + uid + '/bookLoreWriteRecoveries').where('intent.bookId', '==', bookId);

/** One original control per transaction; never reads AES bytes or reauthorizes source text. */
export async function prepareBookLoreRecoveryDeletion(tx, l, next) {
  assertDeletionOpening(tx, l);
  let query = recoveryBookQuery(l.c.db, l.c.uid, l.c.bookId).orderBy('__name__').limit(1);
  if (next.recoveryCursor !== null) query = query.startAfter(next.recoveryCursor);
  const document = (await tx.get(query)).docs[0];
  if (!document) {
    next.recoveriesComplete = true;
    next.recoveryCursor = null;
    return { remove: [], commit() {} };
  }
  deletionScopeCheck(l, document);
  const c = recoveryPaths(l.c.db, l.c.uid, document.id),
    loaded = await loadBookLoreWriteRecovery(tx, c, { requestHash: document.data().requestHash });
  if (
    !loaded ||
    loaded.value.kind !== 'recovery' ||
    loaded.value.intent.bookId !== l.c.bookId ||
    !bornEqual(l.root, { createTime: loaded.value.bookBirth })
  )
    conflict();
  const key = await readWorkMetadata(tx, c.key, ['schemaVersion']),
    inventory = loaded.closed
      ? await tx.get(recoveryKeyInventoryRef(c, l.c.bookId))
      : await readRecoveryKeyInventory(tx, loaded);
  if (
    key.exists &&
    (!immutableRecovery(key) || !bornEqual(key, loaded.root) || key.data().schemaVersion !== 1)
  )
    conflict();
  if (loaded.closed && (key.exists || inventory.exists)) conflict();
  next.recoveryCursor = document.id;
  next.coordinatedUnits++;
  const remove = [key, inventory].filter((s) => s.exists).map((s) => s.ref),
    terminal = { schemaVersion: 1, jobToken: loaded.token };
  return {
    remove,
    commit() {
      if (!loaded.closed) {
        tx.create(c.closed, terminal);
        tx.create(c.closedProof, { schemaVersion: 1, hash: digest(terminal) });
      }
    },
  };
}
