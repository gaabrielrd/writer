import {
  keyHash,
  readRecoveryKey,
  loadBookLoreWriteRecovery,
  settledRecoveryReads as reads,
} from './bookLoreWriteRecoveryStore.mjs';
import {
  recoveryKeyInventoryRef,
  recoveryKeyInventoryValue,
  readRecoveryKeyInventory,
} from './bookLoreWriteRecoveryInventory.mjs';
import { randomBytes } from 'node:crypto';
import { born, bornEqual, date } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { readLoreBook, matchesLoreEntityToken } from './bookLoreReadContracts.mjs';
import { readCreationRecoveryOrigin } from './bookLoreWriteRecoveryCreation.mjs';
import {
  BOOK_LORE_RECOVERY_METHODS,
  recoveryIntent,
  recoveryRequestHash,
  recoveryRequest,
  recoveryPaths,
  recoveryView,
  recoveryConflict as conflict,
} from './bookLoreWriteRecoveryContracts.mjs';
export { BOOK_LORE_RECOVERY_METHODS };
export function setBookLoreWriteRecoveryHeaders(method, request) {
  if (!BOOK_LORE_RECOVERY_METHODS.includes(method)) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
async function origin(tx, c, intent, pinned = null) {
  const scope = { db: c.db, uid: c.uid, bookId: intent.bookId, path: 'books/' + intent.bookId },
    book = await readLoreBook(tx, scope);
  if (intent.creation) return readCreationRecoveryOrigin(tx, scope, book, intent, pinned);
  const [source, tombstone, deleted] = await reads([
    readWorkMetadata(tx, c.db.doc(scope.path + '/lore/' + intent.loreId), ['deleting', 'deleted']),
    readWorkMetadata(tx, c.db.doc(scope.path + '/bookLoreTombstones/' + intent.loreId), []),
    readWorkMetadata(tx, c.db.doc('deletedBooks/' + intent.bookId), []),
  ]);
  if (
    !source.exists ||
    tombstone.exists ||
    deleted.exists ||
    ['deleting', 'deleted'].some(
      (k) => Object.hasOwn(source.data(), k) && source.data()[k] !== false,
    )
  )
    conflict();
  if (pinned) {
    if (
      !bornEqual(book.snapshot, { createTime: pinned.bookBirth }) ||
      !bornEqual(source, { createTime: pinned.sourceBirth })
    )
      conflict();
  } else if (!matchesLoreEntityToken(scope, book, source, intent.sourceToken)) conflict();
  return { bookBirth: born(book.snapshot), sourceBirth: born(source) };
}
export function createBookLoreWriteRecoveryService({ db, now = () => Date.now() }) {
  const service = {
    async reserveBookLoreEditRecovery(uid, input) {
      const intent = recoveryIntent(uid, input),
        requestHash = recoveryRequestHash(uid, intent),
        c = recoveryPaths(db, uid, intent.writeId);
      const existing = await db.runTransaction(async (tx) => {
        const old = await loadBookLoreWriteRecovery(tx, c, { requestHash });
        if (old) return recoveryView(old);
        const key = await tx.get(c.key);
        if (key.exists) conflict();
        const inventory = recoveryKeyInventoryRef(c, intent.bookId);
        if ((await tx.get(inventory)).exists) conflict();
        const pins = await origin(tx, c, intent),
          bytes = randomBytes(32),
          value = {
            schemaVersion: 1,
            ownerId: uid,
            writeId: c.id,
            requestHash,
            kind: 'recovery',
            createdAt: date(now),
            intent,
            ...pins,
            keyId: keyHash(bytes),
            keyInventory: 1,
          };
        tx.create(inventory, recoveryKeyInventoryValue(c, value));
        tx.create(c.root, value);
        tx.create(c.proof, { schemaVersion: 1, hash: digest(value) });
        tx.create(c.key, { schemaVersion: 1, keyBase64: bytes.toString('base64') });
        return null;
      });
      return existing ?? service.getBookLoreEditRecovery(uid, { writeId: c.id, requestHash });
    },
    async getBookLoreEditRecovery(uid, input) {
      const r = recoveryRequest(uid, input),
        c = recoveryPaths(db, uid, r.writeId);
      return db.runTransaction(async (tx) => {
        const l = await loadBookLoreWriteRecovery(tx, c, r);
        return l ? recoveryView(l) : null;
      });
    },
    async getBookLoreEditRecoveryKey(uid, input) {
      const r = recoveryRequest(uid, input, true),
        c = recoveryPaths(db, uid, r.writeId);
      return db.runTransaction(async (tx) => {
        const l = await loadBookLoreWriteRecovery(tx, c, r);
        if (!l || l.closed || l.value.kind !== 'recovery') conflict();
        await origin(tx, c, l.value.intent, l.value);
        await readRecoveryKeyInventory(tx, l);
        const keyBase64 = readRecoveryKey(await tx.get(c.key), l);
        return { ...recoveryView(l), algorithm: 'AES-GCM', keyBase64 };
      });
    },
    async revokeBookLoreEditRecovery(uid, input) {
      const r = recoveryRequest(uid, input),
        c = recoveryPaths(db, uid, r.writeId);
      const result = await db.runTransaction(async (tx) => {
        const l = await loadBookLoreWriteRecovery(tx, c, r);
        if (l?.closed) return recoveryView(l);
        const inventory = l ? await readRecoveryKeyInventory(tx, l) : null;
        const key = await tx.get(c.key);
        if (!l) {
          if (key.exists || r.jobToken !== undefined) conflict();
          const fence = {
            schemaVersion: 1,
            ownerId: uid,
            writeId: c.id,
            requestHash: r.requestHash,
            kind: 'fence',
            createdAt: date(now),
          };
          tx.create(c.root, fence);
          tx.create(c.proof, { schemaVersion: 1, hash: digest(fence) });
        } else {
          if (key.exists) readRecoveryKey(key, l); // Never delete a recreated or foreign key.
          const terminal = { schemaVersion: 1, jobToken: l.token };
          tx.create(c.closed, terminal);
          tx.create(c.closedProof, { schemaVersion: 1, hash: digest(terminal) });
          if (key.exists) tx.delete(c.key);
          if (inventory?.exists) tx.delete(inventory.ref);
        }
        return null;
      });
      return result ?? service.getBookLoreEditRecovery(uid, r);
    },
  };
  return service;
}
