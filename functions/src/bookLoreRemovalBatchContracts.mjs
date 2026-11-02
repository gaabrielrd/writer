import {
  authorize,
  born,
  bornEqual,
  closed,
  date,
  integer,
  restoreHash,
} from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  removalIntent,
  removalStartHash,
  removalPaths,
  removalConflict as conflict,
} from './bookLoreRemovalContracts.mjs';
import { loadBookLoreRemoval, removalProgress } from './bookLoreRemovalStore.mjs';

export function removalBatchIntent(uid, input) {
  authorize(uid);
  closed(input, ['batchId', 'requests']);
  const batchId = bookContentId(input.batchId);
  if (!Array.isArray(input.requests) || input.requests.length < 1 || input.requests.length > 50)
    conflict();
  const requests = input.requests.map((r) => removalIntent(uid, r));
  if (
    new Set(requests.map((r) => r.removalId)).size !== requests.length ||
    new Set(requests.map((r) => r.loreId)).size !== requests.length ||
    requests.some((r) => r.bookId !== requests[0].bookId)
  )
    conflict();
  return { batchId, requests };
}
export const removalBatchHash = (uid, intent) =>
  digest({
    domain: 'writer-book-lore-removal-batch',
    schemaVersion: 1,
    uid,
    ...intent,
  });
export function removalBatchRequest(uid, input) {
  authorize(uid);
  closed(input, ['leaderRemovalId', 'batchId', 'intentHash'], ['jobToken']);
  return {
    leaderRemovalId: bookContentId(input.leaderRemovalId),
    batchId: bookContentId(input.batchId),
    intentHash: restoreHash(input.intentHash),
    ...(Object.hasOwn(input, 'jobToken') ? { jobToken: restoreHash(input.jobToken) } : {}),
  };
}
export function removalBatchPaths(db, uid, leaderRemovalId, batchId) {
  authorize(uid);
  bookContentId(leaderRemovalId);
  bookContentId(batchId);
  const leader = removalPaths(db, uid, leaderRemovalId),
    path = leader.path;
  return {
    db,
    uid,
    leader,
    batchId,
    record: db.doc(path + '/removalBatches/' + batchId),
    proof: db.doc(path + '/removalBatchProofs/' + batchId),
  };
}
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
async function settle(reads) {
  const all = await Promise.allSettled(reads);
  const failed = all.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  return all.map((r) => r.value);
}
/** A native aggregate proof, never a reconstruction from individual successes. */
export const removalBatchToken = (snapshot, record) =>
  digest({
    domain: 'writer-book-lore-removal-batch-job',
    schemaVersion: 1,
    uid: record.ownerId,
    batchId: record.batchId,
    intentHash: record.intentHash,
    bookBirth: record.bookBirth,
    birth: born(snapshot),
  });
export async function readRemovalBatch(tx, c, expectedHash, expectedToken) {
  const [snapshot, proof] = await Promise.all([tx.get(c.record), tx.get(c.proof)]);
  if (!snapshot.exists && !proof.exists) {
    // A missing aggregate proof with an existing leader is ambiguous, not absence.
    if ((await readWorkMetadata(tx, c.leader.ref, [])).exists) conflict();
    return null;
  }
  if (!immutable(snapshot) || !immutable(proof) || !bornEqual(snapshot, proof)) conflict();
  const v = snapshot.data(),
    p = proof.data();
  closed(v, [
    'schemaVersion',
    'ownerId',
    'batchId',
    'intentHash',
    'requests',
    'bookId',
    'bookBirth',
    'timestamp',
    'localLoreVersion',
    'publicationPrivacyVersion',
    'revoked',
    'contextHashes',
  ]);
  closed(p, ['schemaVersion', 'recordHash']);
  const intent = removalBatchIntent(c.uid, { batchId: v.batchId, requests: v.requests });
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== c.uid ||
    intent.batchId !== c.batchId ||
    intent.requests[0].removalId !== c.leader.id ||
    v.bookId !== intent.requests[0].bookId ||
    v.intentHash !== expectedHash ||
    v.intentHash !== removalBatchHash(c.uid, intent) ||
    p.schemaVersion !== 1 ||
    p.recordHash !== digest(v) ||
    typeof v.revoked !== 'boolean' ||
    !Array.isArray(v.contextHashes) ||
    v.contextHashes.length !== intent.requests.length
  )
    conflict();
  closed(v.bookBirth, ['seconds', 'nanoseconds']);
  born({ createTime: v.bookBirth });
  date(() => v.timestamp);
  integer(v.localLoreVersion);
  integer(v.publicationPrivacyVersion);
  for (const h of v.contextHashes) restoreHash(h);
  const token = removalBatchToken(snapshot, v);
  if (expectedToken !== undefined && token !== expectedToken) conflict();
  const loaded = await settle(
    intent.requests.map(async (request, index) => {
      const l = await loadBookLoreRemoval(tx, removalPaths(c.db, c.uid, request.removalId), {
        startHash: removalStartHash(request),
      });
      if (
        !l ||
        !bornEqual(l.snapshot, snapshot) ||
        digest(l.context) !== v.contextHashes[index] ||
        digest(l.context.intent) !== digest(request) ||
        l.context.intent.bookId !== v.bookId ||
        !bornEqual({ createTime: l.context.bookBirth }, { createTime: v.bookBirth }) ||
        l.context.timestamp !== v.timestamp ||
        l.context.localLoreVersion !== v.localLoreVersion ||
        l.context.publicationPrivacyVersion !== v.publicationPrivacyVersion
      )
        conflict();
      return l;
    }),
  );
  if (loaded.some((l) => l.context.revoked) !== v.revoked) conflict();
  return { snapshot, record: v, loaded, token };
}
export async function removalBatchProgress(tx, batch) {
  const items = await settle(batch.loaded.map((l) => removalProgress(tx, l)));
  const v = batch.record;
  return {
    batchId: v.batchId,
    intentHash: v.intentHash,
    jobToken: batch.token,
    bookId: v.bookId,
    timestamp: v.timestamp,
    localLoreVersion: v.localLoreVersion,
    publicationPrivacyVersion: v.publicationPrivacyVersion,
    revoked: v.revoked,
    removed: true,
    complete: items.every((i) => i.complete),
    items,
  };
}
export function prepareRemovalBatchReceipt(tx, c, intent, candidates, frame, contexts) {
  const record = {
    schemaVersion: 1,
    ownerId: c.uid,
    ...intent,
    intentHash: removalBatchHash(c.uid, intent),
    bookId: intent.requests[0].bookId,
    bookBirth: born(candidates[0].root),
    ...frame,
    contextHashes: contexts.map((context) => digest(context)),
  };
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > 900000) conflict();
  return {
    commit() {
      tx.create(c.record, record);
      tx.create(c.proof, { schemaVersion: 1, recordHash: digest(record) });
    },
  };
}
