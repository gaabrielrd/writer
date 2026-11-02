import { born, bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { deletionAtMost, validateLoreDeletionState } from './bookLoreDeletionStore.mjs';
import {
  removalConflict as conflict,
  removalIntent,
  removalStartHash,
  removalToken,
  removalView,
  removalTombstonePath,
} from './bookLoreRemovalContracts.mjs';
const openings = new WeakMap();
export const isRemovalOpening = (tx, l) => openings.get(l) === tx;
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const stamp = (v) => {
  closed(v, ['seconds', 'nanoseconds']);
  born({ createTime: v });
};
const refs = (c, n) => ({
  event: c.db.doc(c.path + '/events/' + String(n).padStart(16, '0')),
  proof: c.db.doc(c.path + '/proofs/' + String(n).padStart(16, '0')),
});
function validateRecord(v) {
  closed(v, ['schemaVersion', 'cleanup', 'handoff', 'lastOperationId']);
  if (v.schemaVersion !== 1) conflict();
  validateLoreDeletionState(v.cleanup);
  if (v.lastOperationId !== null) bookContentId(v.lastOperationId);
  if (v.handoff !== null) {
    closed(v.handoff, ['operationId', 'token', 'cutoff']);
    bookContentId(v.handoff.operationId);
    restoreHash(v.handoff.token);
    stamp(v.handoff.cutoff);
    if (v.cleanup.complete) conflict();
  }
  return v;
}
export const removalTombstone = (context) => ({
  schemaVersion: 1,
  ownerId: context.ownerId,
  bookId: context.intent.bookId,
  loreId: context.intent.loreId,
  removalId: context.intent.removalId,
  startHash: context.startHash,
  contextHash: digest(context),
});
async function event(tx, l, revision) {
  integer(revision);
  const at = refs(l.c, revision),
    s = await tx.get(at.event),
    p = await tx.get(at.proof);
  if (
    !immutable(s) ||
    !immutable(p) ||
    !bornEqual(s, p) ||
    !deletionAtMost(born(l.snapshot), born(s)) ||
    !deletionAtMost(born(s), born({ createTime: l.stateSnapshot.updateTime }))
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
    r.token !== (revision === 0 ? null : l.token) ||
    v.eventHash !== digest(r)
  )
    conflict();
  if (revision === 0) {
    if (
      !bornEqual(s, l.snapshot) ||
      r.receiptHash !== null ||
      r.operationId !== null ||
      r.requestHash !== null
    )
      conflict();
  } else {
    restoreHash(r.receiptHash);
    restoreHash(r.requestHash);
    bookContentId(r.operationId);
  }
  return { snapshot: s, record: r };
}
export async function loadBookLoreRemoval(tx, c, r) {
  const snapshot = await tx.get(c.ref);
  if (!snapshot.exists) return null;
  const context = snapshot.data();
  closed(context, [
    'schemaVersion',
    'ownerId',
    'intent',
    'startHash',
    'bookBirth',
    'sourceBirth',
    'sourceUpdate',
    'inspectionBirth',
    'metadataHash',
    'privacy',
    'timestamp',
    'localLoreVersion',
    'publicationPrivacyVersion',
    'revoked',
  ]);
  const intent = removalIntent(c.uid, context.intent);
  if (
    !immutable(snapshot) ||
    context.schemaVersion !== 1 ||
    context.ownerId !== c.uid ||
    intent.removalId !== c.id ||
    context.startHash !== removalStartHash(intent) ||
    r.startHash !== context.startHash
  )
    conflict();
  for (const k of ['bookBirth', 'sourceBirth', 'sourceUpdate', 'inspectionBirth'])
    stamp(context[k]);
  restoreHash(context.metadataHash);
  closed(context.privacy, ['present', 'value']);
  if (
    typeof context.privacy.present !== 'boolean' ||
    (context.privacy.present
      ? typeof context.privacy.value !== 'boolean'
      : context.privacy.value !== null) ||
    typeof context.revoked !== 'boolean' ||
    context.revoked !== (context.privacy.present && context.privacy.value === true)
  )
    conflict();
  for (const k of ['timestamp', 'localLoreVersion', 'publicationPrivacyVersion'])
    integer(context[k]);
  const stateSnapshot = await tx.get(c.stateRef),
    tombstone = await tx.get(c.db.doc(removalTombstonePath(intent.bookId, intent.loreId)));
  if (
    !stateSnapshot.exists ||
    !bornEqual(stateSnapshot, snapshot) ||
    !immutable(tombstone) ||
    !bornEqual(tombstone, snapshot) ||
    digest(tombstone.data()) !== digest(removalTombstone(context))
  )
    conflict();
  const record = validateRecord(stateSnapshot.data()),
    token = removalToken(c, snapshot, context),
    l = {
      c: { ...c, bookId: intent.bookId, loreId: intent.loreId },
      snapshot,
      context,
      stateSnapshot,
      record,
      state: record.cleanup,
      token,
      cutoff: born(snapshot),
    };
  if (r.jobToken !== undefined && r.jobToken !== token) conflict();
  const last = await event(tx, l, l.state.revision);
  if (
    last.record.stateHash !== digest(record) ||
    !bornEqual(last.snapshot, { createTime: stateSnapshot.updateTime }) ||
    last.record.operationId !== record.lastOperationId
  )
    conflict();
  return l;
}
export async function openBookLoreRemovalCleanup(tx, l) {
  if (l.record.handoff || l.state.complete) conflict();
  const root = await readWorkMetadata(tx, l.c.db.doc('books/' + l.c.bookId), [
      'authorId',
      'deleting',
    ]),
    head = await readWorkMetadata(
      tx,
      l.c.db.doc('books/' + l.c.bookId + '/lore/' + l.c.loreId),
      [],
    );
  if (
    !root.exists ||
    root.data().authorId !== l.c.uid ||
    !bornEqual(root, { createTime: l.context.bookBirth }) ||
    (Object.hasOwn(root.data(), 'deleting') && root.data().deleting !== false) ||
    head.exists
  )
    conflict();
  l.root = root;
  openings.set(l, tx);
  return l;
}
export async function initializeBookLoreRemoval(tx, c, context) {
  const at = refs(c, 0),
    stateRef = c.stateRef,
    tombstoneRef = c.db.doc(removalTombstonePath(context.intent.bookId, context.intent.loreId)),
    existing = await Promise.all([
      tx.get(stateRef),
      tx.get(at.event),
      tx.get(at.proof),
      tx.get(tombstoneRef),
    ]);
  if (existing.some((s) => s.exists)) conflict();
  const record = {
      schemaVersion: 1,
      cleanup: {
        schemaVersion: 1,
        revision: 0,
        phase: 'edits',
        cursor: null,
        body: null,
        processed: 1,
        coordinatedUnits: 0,
        complete: false,
      },
      handoff: null,
      lastOperationId: null,
    },
    e = {
      schemaVersion: 1,
      token: null,
      revision: 0,
      stateHash: digest(record),
      receiptHash: null,
      operationId: null,
      requestHash: null,
    };
  validateRecord(record);
  return {
    commit() {
      tx.create(c.ref, context);
      tx.create(stateRef, record);
      tx.create(tombstoneRef, removalTombstone(context));
      tx.create(at.event, e);
      tx.create(at.proof, { schemaVersion: 1, eventHash: digest(e) });
    },
  };
}
export async function replayBookLoreRemoval(tx, l, method, r) {
  const receipt = await tx.get(l.c.db.doc(l.c.path + '/operations/' + r.operationId));
  if (!receipt.exists) return null;
  if (!immutable(receipt)) conflict();
  const v = receipt.data();
  closed(v, [
    'schemaVersion',
    'token',
    'method',
    'requestHash',
    'revision',
    'stateHash',
    'progress',
  ]);
  integer(v.revision, 1);
  if (
    v.revision > l.state.revision ||
    v.schemaVersion !== 1 ||
    v.token !== l.token ||
    v.method !== method ||
    v.requestHash !== digest(r)
  )
    conflict();
  const e = await event(tx, l, v.revision);
  if (
    !bornEqual(e.snapshot, receipt) ||
    e.record.receiptHash !== digest(v) ||
    e.record.operationId !== r.operationId ||
    e.record.requestHash !== v.requestHash ||
    e.record.stateHash !== v.stateHash
  )
    conflict();
  return { receipt: v.progress, progress: removalView(l) };
}
export async function reserveRemovalCommit(tx, l, method, r) {
  const revision = l.state.revision + 1,
    at = refs(l.c, revision),
    receipt = l.c.db.doc(l.c.path + '/operations/' + r.operationId);
  integer(revision, 1);
  if (
    (await tx.get(at.event)).exists ||
    (await tx.get(at.proof)).exists ||
    (await tx.get(receipt)).exists
  )
    conflict();
  return (cleanup, handoff = l.record.handoff) => {
    const record = validateRecord({
        schemaVersion: 1,
        cleanup: { ...cleanup, revision },
        handoff,
        lastOperationId: r.operationId,
      }),
      view = removalView({ ...l, state: record.cleanup, record }),
      v = {
        schemaVersion: 1,
        token: l.token,
        method,
        requestHash: digest(r),
        revision,
        stateHash: digest(record),
        progress: view,
      },
      e = {
        schemaVersion: 1,
        token: l.token,
        revision,
        stateHash: digest(record),
        receiptHash: digest(v),
        operationId: r.operationId,
        requestHash: v.requestHash,
      };
    return {
      receipt: view,
      progress: view,
      commit() {
        tx.update(l.c.stateRef, record);
        tx.create(receipt, v);
        tx.create(at.event, e);
        tx.create(at.proof, { schemaVersion: 1, eventHash: digest(e) });
      },
    };
  };
}
/** Historical completion of a native handoff; never opens cleanup or authorizes source bytes. */
export async function removalProgress(tx, l) {
  const view = removalView(l);
  if (!l.record.handoff) return view;
  const h = l.record.handoff,
    context = await tx.get(l.c.db.doc('users/' + l.c.uid + '/bookLoreDeletions/' + l.c.bookId));
  if (!immutable(context) || !bornEqual(context, { createTime: h.cutoff })) conflict();
  const v = context.data();
  if (
    v.ownerId !== l.c.uid ||
    v.bookId !== l.c.bookId ||
    v.operationId !== h.operationId ||
    !bornEqual({ createTime: v.bookBirth }, { createTime: l.context.bookBirth }) ||
    digest({
      domain: 'book-lore-deletion',
      uid: l.c.uid,
      bookId: l.c.bookId,
      operationId: h.operationId,
      birth: born(context),
      context: v,
    }) !== h.token
  )
    conflict();
  const root = await readWorkMetadata(tx, l.c.db.doc('books/' + l.c.bookId), []),
    scene = await tx.get(l.c.db.doc('users/' + l.c.uid + '/sceneOperations/' + h.operationId));
  if (
    !scene.exists ||
    !bornEqual(scene, { createTime: v.sceneBirth ?? born(context) }) ||
    scene.data().kind !== 'delete-book' ||
    scene.data().input?.target?.id !== l.c.bookId ||
    scene.data().input?.target?.kind !== 'book' ||
    scene.data().input?.operationId !== h.operationId
  )
    conflict();
  if (root.exists && !bornEqual(root, { createTime: l.context.bookBirth })) conflict();
  return { ...view, complete: !root.exists && scene.data().complete === true };
}
