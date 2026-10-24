import { randomBytes, createHash } from 'node:crypto';
import { born, bornEqual, closed, date, integer } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { readLoreBook, loreEntityToken } from './bookLoreReadContracts.mjs';
import {
  BOOK_LORE_RECOVERY_METHODS,
  recoveryIntent,
  recoveryRequestHash,
  recoveryRequest,
  recoveryPaths,
  immutableRecovery,
  recoveryToken,
  recoveryView,
  recoveryConflict as conflict,
} from './bookLoreWriteRecoveryContracts.mjs';
export { BOOK_LORE_RECOVERY_METHODS };
export function setBookLoreWriteRecoveryHeaders(method, request) {
  if (!BOOK_LORE_RECOVERY_METHODS.includes(method)) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
// Wait for sibling reads to settle before a native transaction rejects.
async function reads(promises) {
  const results = await Promise.allSettled(promises),
    failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map((r) => r.value);
}
const keyHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function readKey(snapshot, l) {
  if (!immutableRecovery(snapshot) || !bornEqual(snapshot, l.root)) conflict();
  const v = snapshot.data();
  closed(v, ['schemaVersion', 'keyBase64']);
  if (
    v.schemaVersion !== 1 ||
    typeof v.keyBase64 !== 'string' ||
    !/^[A-Za-z0-9+/]{43}=$/.test(v.keyBase64)
  )
    conflict();
  const bytes = Buffer.from(v.keyBase64, 'base64');
  if (
    bytes.length !== 32 ||
    bytes.toString('base64') !== v.keyBase64 ||
    keyHash(bytes) !== l.value.keyId
  )
    conflict();
  return v.keyBase64;
}
async function load(tx, c, r) {
  const [root, proof, terminal, terminalProof] = await reads([
    tx.get(c.root),
    tx.get(c.proof),
    tx.get(c.closed),
    tx.get(c.closedProof),
  ]);
  if (!root.exists) {
    if (proof.exists || terminal.exists || terminalProof.exists) conflict();
    return null;
  }
  if (!immutableRecovery(root) || !immutableRecovery(proof) || !bornEqual(root, proof)) conflict();
  const v = root.data(),
    p = proof.data();
  closed(
    v,
    ['schemaVersion', 'ownerId', 'writeId', 'requestHash', 'kind', 'createdAt'],
    ['intent', 'bookBirth', 'sourceBirth', 'keyId'],
  );
  closed(p, ['schemaVersion', 'hash']);
  if (
    v.schemaVersion !== 1 ||
    p.schemaVersion !== 1 ||
    p.hash !== digest(v) ||
    v.ownerId !== c.uid ||
    v.writeId !== c.id ||
    v.requestHash !== r.requestHash ||
    !['recovery', 'fence'].includes(v.kind)
  )
    conflict();
  integer(v.createdAt);
  if (!Number.isFinite(new Date(v.createdAt).getTime())) conflict();
  if (v.kind === 'recovery') {
    const intent = recoveryIntent(c.uid, v.intent);
    if (
      intent.writeId !== c.id ||
      recoveryRequestHash(c.uid, intent) !== v.requestHash ||
      !/^[a-f0-9]{64}$/.test(v.keyId ?? '')
    )
      conflict();
    born({ createTime: v.bookBirth });
    born({ createTime: v.sourceBirth });
  } else if (['intent', 'bookBirth', 'sourceBirth', 'keyId'].some((k) => Object.hasOwn(v, k)))
    conflict();
  const token = recoveryToken(c, root);
  if (r.jobToken !== undefined && r.jobToken !== token) conflict();
  if (terminal.exists !== terminalProof.exists) conflict();
  if (terminal.exists) {
    if (
      v.kind !== 'recovery' ||
      !immutableRecovery(terminal) ||
      !immutableRecovery(terminalProof) ||
      !bornEqual(terminal, terminalProof)
    )
      conflict();
    const t = terminal.data(),
      tp = terminalProof.data();
    closed(t, ['schemaVersion', 'jobToken']);
    closed(tp, ['schemaVersion', 'hash']);
    if (
      t.schemaVersion !== 1 ||
      tp.schemaVersion !== 1 ||
      t.jobToken !== token ||
      tp.hash !== digest(t)
    )
      conflict();
    const a = born(root),
      b = born(terminal);
    if (b.seconds < a.seconds || (b.seconds === a.seconds && b.nanoseconds < a.nanoseconds))
      conflict();
  }
  return { c, root, value: v, token, closed: v.kind === 'fence' || terminal.exists };
}
async function origin(tx, c, intent, pinned = null) {
  const scope = { db: c.db, uid: c.uid, bookId: intent.bookId, path: 'books/' + intent.bookId },
    book = await readLoreBook(tx, scope),
    [source, tombstone, deleted] = await reads([
      readWorkMetadata(tx, c.db.doc(scope.path + '/lore/' + intent.loreId), [
        'deleting',
        'deleted',
      ]),
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
  } else if (loreEntityToken(scope, book, source) !== intent.sourceToken) conflict();
  return { bookBirth: born(book.snapshot), sourceBirth: born(source) };
}
export function createBookLoreWriteRecoveryService({ db, now = () => Date.now() }) {
  const service = {
    async reserveBookLoreEditRecovery(uid, input) {
      const intent = recoveryIntent(uid, input),
        requestHash = recoveryRequestHash(uid, intent),
        c = recoveryPaths(db, uid, intent.writeId);
      const existing = await db.runTransaction(async (tx) => {
        const old = await load(tx, c, { requestHash });
        if (old) return recoveryView(old);
        const key = await tx.get(c.key);
        if (key.exists) conflict();
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
          };
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
        const l = await load(tx, c, r);
        return l ? recoveryView(l) : null;
      });
    },
    async getBookLoreEditRecoveryKey(uid, input) {
      const r = recoveryRequest(uid, input, true),
        c = recoveryPaths(db, uid, r.writeId);
      return db.runTransaction(async (tx) => {
        const l = await load(tx, c, r);
        if (!l || l.closed || l.value.kind !== 'recovery') conflict();
        await origin(tx, c, l.value.intent, l.value);
        const keyBase64 = readKey(await tx.get(c.key), l);
        return { ...recoveryView(l), algorithm: 'AES-GCM', keyBase64 };
      });
    },
    async revokeBookLoreEditRecovery(uid, input) {
      const r = recoveryRequest(uid, input),
        c = recoveryPaths(db, uid, r.writeId);
      const result = await db.runTransaction(async (tx) => {
        const l = await load(tx, c, r);
        if (l?.closed) return recoveryView(l);
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
          if (key.exists) readKey(key, l); // Never delete a recreated or foreign key.
          const terminal = { schemaVersion: 1, jobToken: l.token };
          tx.create(c.closed, terminal);
          tx.create(c.closedProof, { schemaVersion: 1, hash: digest(terminal) });
          if (key.exists) tx.delete(c.key);
        }
        return null;
      });
      return result ?? service.getBookLoreEditRecovery(uid, r);
    },
  };
  return service;
}
