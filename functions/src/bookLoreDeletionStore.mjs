import { resourcePayloadManifest } from './bookResourcePayloadContracts.mjs';
import { born, bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest, readWorkMetadata, workFail } from './workProgressContracts.mjs';
export const deletionConflict = () =>
  workFail(
    'failed-precondition',
    'Não foi possível conferir os recursos de lore desta exclusão.',
    'book-lore-deletion-conflict',
  );
export const deletionAtMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const openings = new WeakMap();
export const isDeletionOpening = (tx, l) => openings.get(l) === tx;
export const assertDeletionOpening = (tx, l) => {
  if (openings.get(l) !== tx) deletionConflict();
};
const stamp = (s) => {
  closed(s, ['seconds', 'nanoseconds']);
  born({ createTime: s });
};
export const deletionPhases = [
  'applications',
  'edits',
  'fields',
  'inspections',
  'removals',
  'creations',
  'heads',
  'generations',
  'segments',
  'bodies',
  'finish',
];
const eventId = (n) => String(n).padStart(16, '0');
function scope(db, uid, bookId, operationId) {
  bookContentId(uid);
  bookContentId(bookId);
  bookContentId(operationId);
  const path = 'users/' + uid + '/bookLoreDeletions/' + bookId;
  return {
    db,
    uid,
    bookId,
    operationId,
    path,
    ref: db.doc(path),
    stateRef: db.doc(path + '/state/current'),
  };
}
const refs = (c, n) => ({
  event: c.db.doc(c.path + '/events/' + eventId(n)),
  proof: c.db.doc(c.path + '/proofs/' + eventId(n)),
});
export function validateLoreDeletionState(v) {
  closed(v, [
    'schemaVersion',
    'revision',
    'phase',
    'cursor',
    'body',
    'processed',
    'coordinatedUnits',
    'complete',
    ...(v?.schemaVersion === 2 ? ['recoveryCursor', 'recoveriesComplete'] : []),
  ]);
  if (
    ![1, 2].includes(v.schemaVersion) ||
    !deletionPhases.includes(v.phase) ||
    typeof v.complete !== 'boolean' ||
    (v.complete && v.phase !== 'finish')
  )
    deletionConflict();
  for (const key of ['revision', 'processed', 'coordinatedUnits']) integer(v[key]);
  if (v.schemaVersion === 2) {
    if (
      typeof v.recoveriesComplete !== 'boolean' ||
      (v.complete && !v.recoveriesComplete) ||
      (v.recoveriesComplete && v.recoveryCursor !== null)
    )
      deletionConflict();
    if (v.recoveryCursor !== null) bookContentId(v.recoveryCursor);
  }
  if (v.cursor !== null) bookContentId(v.cursor);
  if (v.body !== null) {
    closed(v.body, ['bodyId', 'birth', 'manifest', 'resource', 'controlled', 'index']);
    stamp(v.body.birth);
    integer(v.body.index);
    restoreHash(v.body.bodyId);
    const manifest = resourcePayloadManifest(v.body.manifest);
    if (v.body.bodyId !== manifest.bodyId || v.body.index > manifest.chunkCount) deletionConflict();
    if (v.body.controlled !== null) {
      closed(v.body.controlled, ['birth', 'token']);
      stamp(v.body.controlled.birth);
      restoreHash(v.body.controlled.token);
    }
  }
  return v;
}
export async function loadBookLoreDeletion(tx, db, uid, bookId, operationId) {
  const c = scope(db, uid, bookId, operationId),
    root = await readWorkMetadata(tx, db.doc('books/' + bookId), ['authorId', 'deleting']),
    publicRoot = await readWorkMetadata(tx, db.doc('publicBooks/' + bookId), []),
    scene = await tx.get(db.doc('users/' + uid + '/sceneOperations/' + operationId)),
    snapshot = await tx.get(c.ref);
  if (
    !root.exists ||
    root.data().authorId !== uid ||
    root.data().deleting !== true ||
    publicRoot.exists
  )
    deletionConflict();
  if (
    scene.exists &&
    (!deletionAtMost(born(root), born(scene)) ||
      scene.data().kind !== 'delete-book' ||
      scene.data().input?.target?.kind !== 'book' ||
      scene.data().input?.target?.id !== bookId ||
      scene.data().input?.operationId !== operationId)
  )
    deletionConflict();
  if (!snapshot.exists) return { c, root, scene, missing: true };
  const context = snapshot.data();
  closed(context, ['schemaVersion', 'ownerId', 'bookId', 'operationId', 'bookBirth', 'sceneBirth']);
  if (
    !immutable(snapshot) ||
    context.schemaVersion !== 1 ||
    context.ownerId !== uid ||
    context.bookId !== bookId ||
    context.operationId !== operationId ||
    !bornEqual(root, { createTime: context.bookBirth }) ||
    !scene.exists ||
    !bornEqual(scene, { createTime: context.sceneBirth ?? born(snapshot) })
  )
    deletionConflict();
  const stateSnapshot = await tx.get(c.stateRef),
    value = validateLoreDeletionState(stateSnapshot.data()),
    at = refs(c, value.revision),
    event = await tx.get(at.event),
    proof = await tx.get(at.proof),
    token = digest({
      domain: 'book-lore-deletion',
      uid,
      bookId,
      operationId,
      birth: born(snapshot),
      context,
    });
  if (
    !stateSnapshot.exists ||
    !bornEqual(stateSnapshot, snapshot) ||
    !immutable(event) ||
    !immutable(proof) ||
    !bornEqual(event, proof) ||
    !bornEqual(event, { createTime: stateSnapshot.updateTime })
  )
    deletionConflict();
  const r = event.data(),
    p = proof.data();
  closed(r, ['schemaVersion', 'token', 'revision', 'stateHash']);
  closed(p, ['schemaVersion', 'eventHash']);
  if (
    r.schemaVersion !== 1 ||
    p.schemaVersion !== 1 ||
    r.revision !== value.revision ||
    r.token !== (value.revision === 0 ? null : token) ||
    r.stateHash !== digest(value) ||
    p.eventHash !== digest(r) ||
    (value.revision === 0 && !bornEqual(event, snapshot))
  )
    deletionConflict();
  const l = { c, root, scene, snapshot, context, state: value, token, cutoff: born(snapshot) };
  openings.set(l, tx);
  return l;
}
export async function initializeBookLoreDeletion(tx, missing, active) {
  const { c, root, scene } = missing,
    at = refs(c, 0),
    old = await Promise.all([tx.get(c.stateRef), tx.get(at.event), tx.get(at.proof)]);
  if (old.some((s) => s.exists)) deletionConflict();
  const context = {
      schemaVersion: 1,
      ownerId: c.uid,
      bookId: c.bookId,
      operationId: c.operationId,
      bookBirth: born(root),
      sceneBirth: scene.exists ? born(scene) : null,
    },
    value = {
      schemaVersion: 2,
      recoveryCursor: null,
      recoveriesComplete: !active,
      revision: 0,
      phase: active ? 'applications' : 'finish',
      cursor: null,
      body: null,
      processed: 0,
      coordinatedUnits: 0,
      complete: !active,
    },
    event = { schemaVersion: 1, token: null, revision: 0, stateHash: digest(value) };
  return {
    complete: value.complete,
    processed: 0,
    commit() {
      tx.create(c.ref, context);
      tx.create(c.stateRef, value);
      tx.create(at.event, event);
      tx.create(at.proof, { schemaVersion: 1, eventHash: digest(event) });
    },
  };
}
export async function reserveBookLoreDeletionCommit(tx, l) {
  assertDeletionOpening(tx, l);
  const revision = l.state.revision + 1;
  integer(revision, 1);
  const at = refs(l.c, revision);
  if ((await tx.get(at.event)).exists || (await tx.get(at.proof)).exists) deletionConflict();
  return (value) => {
    value = validateLoreDeletionState({ ...value, revision });
    const event = { schemaVersion: 1, token: l.token, revision, stateHash: digest(value) };
    return {
      complete: value.complete,
      processed: value.processed,
      commit() {
        tx.update(l.c.stateRef, value);
        tx.create(at.event, event);
        tx.create(at.proof, { schemaVersion: 1, eventHash: digest(event) });
      },
    };
  };
}
export const deletionNextState = (l) => {
  const next = structuredClone(l.state);
  if (next.schemaVersion === 1)
    Object.assign(next, {
      schemaVersion: 2,
      recoveryCursor: null,
      recoveriesComplete: false,
      complete: false,
    });
  return next;
};
export function deletionScopeCheck(l, snapshot) {
  if (!snapshot.exists || !deletionAtMost(born(snapshot), l.cutoff)) deletionConflict();
}
export async function assertBookLorePayloadsEmpty(tx, db, bookId) {
  for (const name of [
    'bookResourceBodies',
    'bookResourceChunks',
    'bookLoreSegments',
    'lore',
    'bookLoreRecoveryKeys',
  ])
    if (
      (
        await tx.get(
          db
            .collection('books/' + bookId + '/' + name)
            .limit(1)
            .select(),
        )
      ).docs.length
    )
      deletionConflict();
}
