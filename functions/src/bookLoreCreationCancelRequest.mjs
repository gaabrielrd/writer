import { born, bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest } from './workProgressContracts.mjs';
import { creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { deletionAtMost } from './bookLoreDeletionStore.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
export const creationCancelPaths = (c) => ({
  request: c.db.doc(c.path + '/cancelRequests/current'),
  proof: c.db.doc(c.path + '/cancelRequestProofs/current'),
  state: c.db.doc(c.path + '/cleanup/current'),
});
const refs = (c, n) => ({
  event: c.db.doc(c.path + '/cleanupEvents/' + String(n).padStart(16, '0')),
  proof: c.db.doc(c.path + '/cleanupProofs/' + String(n).padStart(16, '0')),
});
function state(v) {
  closed(v, [
    'schemaVersion',
    'revision',
    'phase',
    'cursor',
    'coordinatedUnits',
    'completedUploads',
    'lastOperationId',
  ]);
  if (
    v.schemaVersion !== 1 ||
    !['uploads', 'leases', 'jobs', 'finish', 'complete'].includes(v.phase)
  )
    conflict();
  for (const k of ['revision', 'coordinatedUnits', 'completedUploads']) integer(v[k]);
  for (const k of ['cursor', 'lastOperationId']) if (v[k] !== null) bookContentId(v[k]);
  return v;
}
async function readEvent(tx, l, x, revision) {
  const at = refs(l.c, revision),
    s = await tx.get(at.event),
    p = await tx.get(at.proof);
  if (
    !immutable(s) ||
    !immutable(p) ||
    !bornEqual(s, p) ||
    !deletionAtMost(born(x.snapshot), born(s)) ||
    !deletionAtMost(born(s), born({ createTime: x.stateSnapshot.updateTime }))
  )
    conflict();
  const r = s.data(),
    v = p.data();
  closed(r, [
    'schemaVersion',
    'token',
    'revision',
    'stateHash',
    'receiptHash',
    'operationId',
    'requestHash',
  ]);
  closed(v, ['schemaVersion', 'eventHash']);
  if (
    r.schemaVersion !== 1 ||
    v.schemaVersion !== 1 ||
    r.revision !== revision ||
    r.token !== (revision === 0 ? null : x.token) ||
    v.eventHash !== digest(r)
  )
    conflict();
  if (revision === 0) {
    if (
      !bornEqual(s, x.snapshot) ||
      r.receiptHash !== null ||
      r.operationId !== null ||
      r.requestHash !== null
    )
      conflict();
  } else {
    bookContentId(r.operationId);
    restoreHash(r.receiptHash);
    restoreHash(r.requestHash);
  }
  return { snapshot: s, record: r };
}
export async function loadCreationCancelRequest(tx, l) {
  const at = creationCancelPaths(l.c),
    snapshot = await tx.get(at.request),
    proof = await tx.get(at.proof),
    stateSnapshot = await tx.get(at.state);
  if (!snapshot.exists && !proof.exists && !stateSnapshot.exists) {
    const old = refs(l.c, 0);
    if ((await tx.get(old.event)).exists || (await tx.get(old.proof)).exists) conflict();
    return null;
  }
  if (
    !immutable(snapshot) ||
    !immutable(proof) ||
    !bornEqual(snapshot, proof) ||
    !stateSnapshot.exists ||
    !bornEqual(snapshot, stateSnapshot) ||
    l.context.kind !== 'reservation' ||
    !deletionAtMost(born(l.snapshot), born(snapshot))
  )
    conflict();
  const r = snapshot.data(),
    p = proof.data();
  closed(r, [
    'schemaVersion',
    'ownerId',
    'creationId',
    'startHash',
    'jobToken',
    'operationId',
    'requestHash',
    'contextHash',
  ]);
  closed(p, ['schemaVersion', 'requestHash']);
  if (
    r.schemaVersion !== 1 ||
    p.schemaVersion !== 1 ||
    r.ownerId !== l.c.uid ||
    r.creationId !== l.c.intent.creationId ||
    r.startHash !== l.context.startHash ||
    r.jobToken !== l.token ||
    r.contextHash !== digest(l.context) ||
    p.requestHash !== digest(r)
  )
    conflict();
  bookContentId(r.operationId);
  restoreHash(r.requestHash);
  const x = {
      snapshot,
      request: r,
      stateSnapshot,
      state: state(stateSnapshot.data()),
      token: digest({
        domain: 'book-lore-creation-cancel-request',
        parentToken: l.token,
        birth: born(snapshot),
        request: r,
      }),
    },
    e = await readEvent(tx, l, x, x.state.revision);
  if (
    e.record.stateHash !== digest(x.state) ||
    e.record.operationId !== x.state.lastOperationId ||
    !bornEqual(e.snapshot, { createTime: stateSnapshot.updateTime })
  )
    conflict();
  if (l.cancellation) {
    if (
      x.state.phase !== 'complete' ||
      !bornEqual(l.cancellationSnapshot, { createTime: stateSnapshot.updateTime })
    )
      conflict();
  } else if (x.state.phase === 'complete') conflict();
  return x;
}
export async function prepareCreationCancelRequest(tx, l, r) {
  const at = creationCancelPaths(l.c),
    event = refs(l.c, 0);
  if (
    (
      await Promise.all([
        tx.get(at.request),
        tx.get(at.proof),
        tx.get(at.state),
        tx.get(event.event),
        tx.get(event.proof),
      ])
    ).some((s) => s.exists)
  )
    conflict();
  const request = {
      schemaVersion: 1,
      ownerId: l.c.uid,
      creationId: l.c.intent.creationId,
      startHash: l.context.startHash,
      jobToken: l.token,
      operationId: r.operationId,
      requestHash: digest(r),
      contextHash: digest(l.context),
    },
    value = state({
      schemaVersion: 1,
      revision: 0,
      phase: 'uploads',
      cursor: null,
      coordinatedUnits: 0,
      completedUploads: 0,
      lastOperationId: null,
    }),
    e = {
      schemaVersion: 1,
      token: null,
      revision: 0,
      stateHash: digest(value),
      receiptHash: null,
      operationId: null,
      requestHash: null,
    };
  return {
    state: value,
    request,
    commit() {
      tx.create(at.request, request);
      tx.create(at.proof, { schemaVersion: 1, requestHash: digest(request) });
      tx.create(at.state, value);
      tx.create(event.event, e);
      tx.create(event.proof, { schemaVersion: 1, eventHash: digest(e) });
    },
  };
}
export async function replayCreationCleanup(tx, l, r) {
  const x = l.cancelRequest,
    receipt = await tx.get(l.c.db.doc(l.c.path + '/cleanupOperations/' + r.operationId));
  if (!receipt.exists) return null;
  if (!x || !immutable(receipt)) conflict();
  const v = receipt.data();
  closed(v, ['schemaVersion', 'token', 'requestHash', 'revision', 'stateHash', 'progress']);
  integer(v.revision, 1);
  if (
    v.schemaVersion !== 1 ||
    v.token !== x.token ||
    v.requestHash !== digest(r) ||
    v.revision > x.state.revision
  )
    conflict();
  const e = await readEvent(tx, l, x, v.revision);
  if (
    !bornEqual(e.snapshot, receipt) ||
    e.record.receiptHash !== digest(v) ||
    e.record.stateHash !== v.stateHash ||
    e.record.operationId !== r.operationId ||
    e.record.requestHash !== v.requestHash
  )
    conflict();
  return v.progress;
}
export async function reserveCreationCleanupCommit(tx, l, r) {
  const x = l.cancelRequest,
    revision = x.state.revision + 1,
    at = refs(l.c, revision),
    receipt = l.c.db.doc(l.c.path + '/cleanupOperations/' + r.operationId);
  integer(revision, 1);
  if (
    (await Promise.all([tx.get(at.event), tx.get(at.proof), tx.get(receipt)])).some((s) => s.exists)
  )
    conflict();
  return (patch, progress) => {
    const value = state({ ...patch, revision, lastOperationId: r.operationId }),
      v = {
        schemaVersion: 1,
        token: x.token,
        requestHash: digest(r),
        revision,
        stateHash: digest(value),
        progress,
      },
      e = {
        schemaVersion: 1,
        token: x.token,
        revision,
        stateHash: digest(value),
        receiptHash: digest(v),
        operationId: r.operationId,
        requestHash: v.requestHash,
      };
    return {
      commit() {
        tx.update(creationCancelPaths(l.c).state, value);
        tx.create(receipt, v);
        tx.create(at.event, e);
        tx.create(at.proof, { schemaVersion: 1, eventHash: digest(e) });
      },
    };
  };
}
