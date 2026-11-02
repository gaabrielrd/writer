import { authorize, bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  editReservationRequest,
  editReservationPaths,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import { editReservationPair } from './bookLoreEditOperationProofs.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
export function adoptionBatchScope(db, uid, input) {
  authorize(uid);
  closed(input, ['batchId', 'requests']);
  const batchId = bookContentId(input.batchId);
  if (!Array.isArray(input.requests) || input.requests.length < 1 || input.requests.length > 50)
    conflict();
  const requests = input.requests.map((r) => editReservationRequest(uid, r, [], true, true));
  if (new Set(requests.map((r) => r.editId)).size !== requests.length) conflict();
  const leader = editReservationPaths(db, uid, requests[0].editId),
    request = { batchId, requests };
  return {
    db,
    uid,
    request,
    intentHash: digest({ domain: 'writer-lore-adoption-batch', uid, ...request }),
    record: db.doc(leader.path + '/adoptionBatches/' + batchId),
    proof: db.doc(leader.path + '/adoptionBatchProofs/' + batchId),
  };
}
function batchRecord(scope, candidates, frame, progress) {
  const context = candidates[0].l.job.context;
  return {
    schemaVersion: 1,
    ownerId: scope.uid,
    batchId: scope.request.batchId,
    intentHash: scope.intentHash,
    bookId: context.intent.bookId,
    bookBirth: context.bookBirth,
    ...frame,
    items: scope.request.requests.map((request, index) => ({ request, progress: progress[index] })),
  };
}
function batchResult(record) {
  return {
    batchId: record.batchId,
    phase: 'adopted',
    timestamp: record.timestamp,
    localLoreVersion: record.localLoreVersion,
    publicationPrivacyVersion: record.publicationPrivacyVersion,
    revoked: record.revoked,
    items: record.items.map((item) => item.progress),
  };
}
export async function readAdoptionBatch(tx, scope) {
  const [record, proof] = await Promise.all([tx.get(scope.record), tx.get(scope.proof)]);
  if (!record.exists && !proof.exists) return null;
  if (!immutable(record) || !immutable(proof) || !bornEqual(record, proof)) conflict();
  const value = record.data(),
    anchor = proof.data();
  closed(anchor, ['schemaVersion', 'batchHash']);
  if (anchor.schemaVersion !== 1 || anchor.batchHash !== digest(value)) conflict();
  return { snapshot: record, record: value };
}
export async function replayAdoptionBatch(tx, scope, previous, candidates) {
  if (candidates.some((c) => !c.replay || c.l.job.phase !== 'adopted')) conflict();
  const first = candidates[0].l.job.adoption,
    frame = {
      timestamp: first.timestamp,
      localLoreVersion: first.localLoreVersion,
      publicationPrivacyVersion: first.publicationPrivacyVersion,
      revoked: candidates.some((c) => c.l.job.adoption.revoked),
    };
  for (const { l, r } of candidates) {
    const a = l.job.adoption,
      original = await editReservationPair(tx, l, r.operationId);
    if (
      a.timestamp !== frame.timestamp ||
      a.localLoreVersion !== frame.localLoreVersion ||
      a.publicationPrivacyVersion !== frame.publicationPrivacyVersion ||
      !original ||
      !bornEqual(original.snapshot, previous.snapshot)
    )
      conflict();
  }
  const expected = batchRecord(
    scope,
    candidates,
    frame,
    candidates.map((c) => c.replay.receipt),
  );
  if (digest(expected) !== digest(previous.record)) conflict();
  return batchResult(expected);
}
export function prepareAdoptionBatchReceipt(tx, scope, candidates, frame, plans) {
  const record = batchRecord(
      scope,
      candidates,
      frame,
      plans.map((p) => p.result.receipt),
    ),
    result = batchResult(record);
  // Keep the aggregate metadata document below Firestore's 1 MiB document limit.
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > 900000) conflict();
  return {
    result,
    commit() {
      tx.create(scope.record, record);
      tx.create(scope.proof, { schemaVersion: 1, batchHash: digest(record) });
      return result;
    },
  };
}
