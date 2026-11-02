import {
  authorize,
  born,
  bornEqual,
  closed,
  integer,
  restoreHash,
} from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  recoveryId,
  recoveryPaths,
  recoveryRequest,
  immutableRecovery,
  recoveryConflict as conflict,
} from './bookLoreWriteRecoveryContracts.mjs';
import { loadBookLoreWriteRecovery } from './bookLoreWriteRecoveryStore.mjs';
import {
  readRecoveryKeyInventory,
  recoveryKeyInventoryRef,
} from './bookLoreWriteRecoveryInventory.mjs';
const atMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
const domainError = (e) =>
  ['invalid-argument', 'failed-precondition', 'unauthenticated'].includes(e?.code);
const validDate = (value) => {
  const time =
    typeof value === 'number'
      ? value
      : typeof value?.toMillis === 'function'
        ? value.toMillis()
        : NaN;
  return Number.isFinite(time) && time >= 0 && Number.isFinite(new Date(time).getTime());
};
function markerToken(uid, l, marker) {
  return digest({
    domain: 'writer-historical-lore-key-deletion',
    uid,
    writeId: l.c.id,
    requestHash: l.value.requestHash,
    jobToken: l.token,
    bookId: l.value.intent.bookId,
    bookBirth: l.value.bookBirth,
    markerBirth: born(marker),
    markerUpdate: born({ createTime: marker.updateTime }),
  });
}
/** All evidence is read in one native transaction; no AES material or source text. */
async function inspect(tx, c, request) {
  const l = await loadBookLoreWriteRecovery(tx, c, request);
  if (!l) conflict();
  const key = await readWorkMetadata(tx, c.key, ['schemaVersion']),
    bookId = l.value.intent?.bookId ?? null;
  let inventory = null;
  if (bookId)
    inventory = l.closed
      ? await tx.get(recoveryKeyInventoryRef(c, bookId))
      : await readRecoveryKeyInventory(tx, l);
  if (
    key.exists &&
    (!immutableRecovery(key) || !bornEqual(key, l.root) || key.data().schemaVersion !== 1)
  )
    conflict();
  const result = {
    l,
    key,
    inventory,
    view: { writeId: c.id, bookId, keyPresent: key.exists, status: 'needs-review' },
  };
  if (l.closed) {
    if (key.exists || inventory?.exists) conflict();
    result.view.status = 'already-revoked';
    return result;
  }
  const book = await readWorkMetadata(tx, c.db.doc('books/' + bookId), []);
  if (book.exists) {
    result.view.status = 'book-present';
    return result;
  }
  const marker = await tx.get(c.db.doc('deletedBooks/' + bookId));
  if (!marker.exists) {
    result.view.reason = 'missing-deletion-marker';
    return result;
  }
  try {
    closed(marker.data(), ['deletedAt']);
  } catch (e) {
    if (!domainError(e)) throw e;
    result.view.reason = 'unsupported-deletion-marker';
    return result;
  }
  if (
    !validDate(marker.data().deletedAt) ||
    !atMost(born(l.root), born({ createTime: marker.updateTime }))
  ) {
    result.view.reason = 'invalid-deletion-marker';
    return result;
  }
  const deletionToken = markerToken(c.uid, l, marker);
  result.view.status = 'eligible';
  result.view.control = {
    writeId: c.id,
    requestHash: l.value.requestHash,
    jobToken: l.token,
    deletionToken,
  };
  return result;
}
/** Internal administration only. No callable or automatic production execution. */
export function createBookLoreRecoveryAuditService({ db }) {
  return {
    async auditBookLoreRecoveryKeys(uid, input = {}) {
      authorize(uid);
      closed(input, [], ['after', 'limit']);
      const limit = integer(input.limit ?? 25, 1),
        after = input.after ?? null;
      if (limit > 50) conflict();
      if (after !== null) recoveryId(after);
      let query = db
        .collection('users/' + uid + '/bookLoreWriteRecoveries')
        .orderBy('__name__')
        .select('requestHash')
        .limit(limit);
      if (after !== null) query = query.startAfter(after);
      const page = await db.runTransaction((tx) => tx.get(query)),
        items = [];
      for (const doc of page.docs) {
        try {
          const c = recoveryPaths(db, uid, doc.id);
          items.push(
            await db.runTransaction(
              async (tx) => (await inspect(tx, c, { requestHash: doc.data().requestHash })).view,
            ),
          );
        } catch (e) {
          if (!domainError(e)) throw e;
          items.push({
            writeId: doc.id,
            bookId: null,
            status: 'needs-review',
            reason: 'inconsistent-control',
          });
        }
      }
      return {
        schemaVersion: 1,
        uid,
        items,
        next: page.docs.length === limit ? page.docs.at(-1).id : null,
      };
    },
    async revokeAuditedBookLoreRecovery(uid, input) {
      closed(input, ['writeId', 'requestHash', 'jobToken', 'deletionToken']);
      const deletionToken = restoreHash(input.deletionToken),
        r = recoveryRequest(
          uid,
          { writeId: input.writeId, requestHash: input.requestHash, jobToken: input.jobToken },
          true,
        ),
        c = recoveryPaths(db, uid, r.writeId);
      return db.runTransaction(async (tx) => {
        const { l, key, inventory, view } = await inspect(tx, c, r);
        if (view.status === 'already-revoked')
          return { writeId: c.id, status: 'already-revoked', removed: 0 };
        if (view.status !== 'eligible' || view.control.deletionToken !== deletionToken) conflict();
        const terminal = { schemaVersion: 1, jobToken: l.token };
        tx.create(c.closed, terminal);
        tx.create(c.closedProof, { schemaVersion: 1, hash: digest(terminal) });
        if (key.exists) tx.delete(c.key);
        if (inventory?.exists) tx.delete(inventory.ref);
        return {
          writeId: c.id,
          status: 'revoked',
          removed: Number(key.exists) + Number(inventory?.exists ?? false),
        };
      });
    },
  };
}
