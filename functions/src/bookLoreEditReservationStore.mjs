import { born, bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { loreFieldPointer } from './bookLoreGenerationContracts.mjs';
import { inspectionPaths } from './bookLoreSourceInspectionContracts.mjs';
import { openBookLoreSourceInspection } from './bookLoreSourceInspectionStore.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { loadInventoryControl } from './bookLoreResourceInventoryStore.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
  editReservationToken,
  editReservationView,
  editReservationConflict as conflict,
  editStamp,
  editGenerationId,
  editSlotId,
  editUploadRef,
  editReservationTarget,
  assertIntentReservation,
} from './bookLoreEditReservationContracts.mjs';
import { compilationState } from './bookLoreEditCompilationContracts.mjs';
const openings = new WeakMap();
export const assertEditReservationOpening = (tx, l) => {
  if (openings.get(l) !== tx) conflict();
};
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const update = (s) => born({ createTime: s.updateTime });
const atMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
export async function editReservationSource(tx, c, intent, context = null) {
  const p = inspectionPaths(c.db, c.uid, intent.inspection.inspectionId),
    result = await openBookLoreSourceInspection(tx, p, intent.inspection),
    original = result.loaded.job.context,
    opened = result.source.opened;
  if (
    original.bookId !== intent.bookId ||
    original.loreId !== intent.loreId ||
    original.sourceToken !== intent.sourceToken
  )
    conflict();
  const sourceContext = {
    intent,
    bookBirth: born(result.source.book.snapshot),
    sourceBirth: born(opened.snapshot),
    sourceUpdate: update(opened.snapshot),
    sourceMode: opened.mode,
    sourceStorageHash:
      opened.mode === 'payload' ? digest(opened.storage) : opened.manifest.contentHash,
    inspectionBirth: born(result.loaded.snapshot),
    metadataHash: digest(result.metadata),
  };
  if (context && digest(context) !== digest(sourceContext)) conflict();
  return { sourceContext, inspection: result };
}
export async function editReservationPair(tx, loaded, id) {
  const c = loaded.c;
  bookContentId(id);
  const receipt = await tx.get(c.db.doc(c.path + '/operations/' + id)),
    anchor = await tx.get(c.db.doc(c.path + '/operationProofs/' + id));
  if (!receipt.exists && !anchor.exists) return null;
  if (
    !immutable(receipt) ||
    !immutable(anchor) ||
    !bornEqual(receipt, anchor) ||
    !atMost(born(loaded.snapshot), born(receipt)) ||
    !atMost(born(receipt), update(loaded.snapshot))
  )
    conflict();
  const r = receipt.data(),
    a = anchor.data();
  closed(r, [
    'schemaVersion',
    'ownerId',
    'editId',
    'editToken',
    'startHash',
    'operationId',
    'method',
    'requestHash',
    'revision',
    'jobHash',
    'progress',
  ]);
  closed(a, [
    'schemaVersion',
    'ownerId',
    'editId',
    'editToken',
    'startHash',
    'operationId',
    'receiptHash',
  ]);
  for (const [key, value] of Object.entries({
    schemaVersion: 1,
    ownerId: c.uid,
    editId: c.id,
    editToken: loaded.token,
    startHash: loaded.job.startHash,
    operationId: id,
  }))
    if (r[key] !== value || a[key] !== value) conflict();
  closed(
    r.progress,
    [
      'editId',
      'startHash',
      'jobToken',
      'phase',
      'revision',
      'reservedCount',
      'releasedCount',
      'blockedReason',
    ],
    ['compilation'],
  );
  integer(r.revision, 1);
  if (
    a.receiptHash !== digest(r) ||
    r.revision > loaded.job.revision ||
    r.progress.revision !== r.revision ||
    r.progress.jobToken !== loaded.token
  )
    conflict();
  return { snapshot: receipt, record: r };
}
export const expectedEditGeneration = (loaded) => {
  const { c, job: j } = loaded,
    ctx = j.context,
    intent = ctx.intent;
  return {
    schemaVersion: 1,
    kind: 'generation',
    ownerId: c.uid,
    bookId: intent.bookId,
    bookBirth: ctx.bookBirth,
    loreId: intent.loreId,
    generationId: editGenerationId(loaded.token),
    sourceBirth: ctx.sourceBirth,
    sourceUpdate: ctx.sourceUpdate,
    storageHash: ctx.sourceStorageHash,
    preparation: {
      editId: c.id,
      editToken: loaded.token,
      editBirth: born(loaded.snapshot),
      startHash: j.startHash,
      sourceToken: intent.sourceToken,
    },
  };
};
export async function loadEditReservation(tx, c, r) {
  const snapshot = await tx.get(c.ref);
  if (!snapshot.exists) return null;
  const j = snapshot.data();
  if (
    j.schemaVersion !== 1 ||
    j.ownerId !== c.uid ||
    j.editId !== c.id ||
    j.startHash !== r.startHash
  )
    conflict();
  if (j.kind === 'fence') {
    closed(j, ['schemaVersion', 'kind', 'ownerId', 'editId', 'startHash', 'phase']);
    if (!immutable(snapshot) || j.phase !== 'cancelled' || r.jobToken !== undefined) conflict();
    return { c, snapshot, job: j, token: null, generation: null };
  }
  closed(
    j,
    [
      'schemaVersion',
      'kind',
      'ownerId',
      'editId',
      'startHash',
      'context',
      'phase',
      'revision',
      'reservedCount',
      'releasedCount',
      'cleanupSlot',
      'cleanupCursor',
      'blockedReason',
      'generationId',
      'generationOperationId',
      'cancelOperationId',
      'lastOperationId',
      'createdAt',
    ],
    ['compilation'],
  );
  if (Object.hasOwn(j, 'compilation')) {
    compilationState(j.compilation);
    if (j.generationId === null) conflict();
  }
  closed(j.context, [
    'intent',
    'bookBirth',
    'sourceBirth',
    'sourceUpdate',
    'sourceMode',
    'sourceStorageHash',
    'inspectionBirth',
    'metadataHash',
  ]);
  const intent = editReservationIntent(c.uid, j.context.intent);
  if (
    j.kind !== 'reservation' ||
    intent.editId !== c.id ||
    editReservationStartHash(intent) !== j.startHash ||
    !['initializing', 'preparing', 'cancelling', 'cancelled'].includes(j.phase) ||
    !['inline', 'payload'].includes(j.context.sourceMode)
  )
    conflict();
  for (const key of ['bookBirth', 'sourceBirth', 'sourceUpdate', 'inspectionBirth'])
    editStamp(j.context[key]);
  restoreHash(j.context.sourceStorageHash);
  restoreHash(j.context.metadataHash);
  for (const key of ['revision', 'reservedCount', 'releasedCount', 'createdAt']) integer(j[key]);
  if (!Number.isFinite(new Date(j.createdAt).getTime()) || j.releasedCount > j.reservedCount)
    conflict();
  for (const key of ['cleanupSlot', 'cleanupCursor']) if (j[key] !== null) restoreHash(j[key]);
  if (
    j.blockedReason !== null &&
    (![
      'active-head',
      'active-generation',
      'lease',
      'book-absent',
      'book-deleting',
      'unmanaged',
    ].includes(j.blockedReason) ||
      j.phase !== 'cancelling')
  )
    conflict();
  if (
    ['initializing', 'preparing'].includes(j.phase) &&
    (j.releasedCount !== 0 ||
      j.cleanupSlot !== null ||
      j.cleanupCursor !== null ||
      j.cancelOperationId !== null)
  )
    conflict();
  if (j.phase === 'cancelled' && (j.cleanupSlot !== null || j.releasedCount !== j.reservedCount))
    conflict();
  const loaded = {
    c,
    snapshot,
    job: j,
    token: editReservationToken(c, snapshot, j),
    generation: null,
  };
  if (r.jobToken !== undefined && r.jobToken !== loaded.token) conflict();
  if (j.revision === 0) {
    if (!immutable(snapshot) || j.lastOperationId !== null || j.phase !== 'initializing')
      conflict();
  } else {
    const proof = await editReservationPair(tx, loaded, j.lastOperationId);
    if (
      !proof ||
      proof.record.revision !== j.revision ||
      proof.record.jobHash !== digest(j) ||
      !bornEqual(proof.snapshot, { createTime: snapshot.updateTime }) ||
      digest(proof.record.progress) !== digest(editReservationView(loaded))
    )
      conflict();
  }
  if (j.generationId === null) {
    if (
      !['initializing', 'cancelled'].includes(j.phase) ||
      j.generationOperationId !== null ||
      j.reservedCount !== 0
    )
      conflict();
  } else {
    if (
      j.generationId !== editGenerationId(loaded.token) ||
      typeof j.generationOperationId !== 'string' ||
      j.phase === 'initializing'
    )
      conflict();
    const init = await editReservationPair(tx, loaded, j.generationOperationId),
      scope = inventoryScope(c.db, c.uid, intent.bookId),
      generation = await loadInventoryControl(tx, scope, 'generation', j.generationId);
    if (
      !init ||
      init.record.method !== 'initializeBookLoreEditGeneration' ||
      init.record.revision !== 1 ||
      !generation ||
      !bornEqual(generation.snapshot, init.snapshot) ||
      digest(generation.context) !== digest(expectedEditGeneration(loaded))
    )
      conflict();
    if (
      j.phase === 'preparing'
        ? generation.state.phase !== 'preparing'
        : generation.state.phase !== 'cancelled'
    )
      conflict();
    loaded.generation = generation;
  }
  if (['cancelling', 'cancelled'].includes(j.phase)) {
    const cancel = await editReservationPair(tx, loaded, j.cancelOperationId);
    if (
      !cancel ||
      cancel.record.method !== 'cancelBookLoreEditReservation' ||
      cancel.record.progress.phase !== (j.generationId === null ? 'cancelled' : 'cancelling') ||
      (loaded.generation &&
        !bornEqual(cancel.snapshot, { createTime: loaded.generation.stateSnapshot.updateTime }))
    )
      conflict();
  }
  openings.set(loaded, tx);
  return loaded;
}
export async function replayEditReservation(tx, loaded, method, r) {
  const proof = await editReservationPair(tx, loaded, r.operationId);
  if (!proof) return null;
  if (proof.record.method !== method || proof.record.requestHash !== digest(r)) conflict();
  return { receipt: proof.record.progress, progress: editReservationView(loaded) };
}
export function commitEditReservation(tx, loaded, method, r, patch) {
  const { c, job: j } = loaded,
    next = { ...j, ...patch, revision: j.revision + 1, lastOperationId: r.operationId };
  integer(next.revision, 1);
  integer(next.reservedCount);
  integer(next.releasedCount);
  if (next.releasedCount > next.reservedCount) conflict();
  const progress = editReservationView({ ...loaded, job: next }),
    record = {
      schemaVersion: 1,
      ownerId: c.uid,
      editId: c.id,
      editToken: loaded.token,
      startHash: j.startHash,
      operationId: r.operationId,
      method,
      requestHash: digest(r),
      revision: next.revision,
      jobHash: digest(next),
      progress,
    };
  tx.update(c.ref, next);
  tx.create(c.db.doc(c.path + '/operations/' + r.operationId), record);
  tx.create(c.db.doc(c.path + '/operationProofs/' + r.operationId), {
    schemaVersion: 1,
    ownerId: c.uid,
    editId: c.id,
    editToken: loaded.token,
    startHash: j.startHash,
    operationId: r.operationId,
    receiptHash: digest(record),
  });
  return { receipt: progress, progress };
}
export async function readEditReservationSlot(tx, loaded, idOrSnapshot) {
  const { c, job: j } = loaded,
    snapshot =
      typeof idOrSnapshot === 'string'
        ? await tx.get(c.db.doc(c.path + '/slots/' + idOrSnapshot))
        : idOrSnapshot,
    slot = snapshot.data();
  if (!immutable(snapshot)) conflict();
  closed(slot, [
    'schemaVersion',
    'ownerId',
    'editId',
    'editToken',
    'slotId',
    'target',
    'upload',
    'pointer',
    'operationId',
  ]);
  const target = editReservationTarget(slot.target),
    upload = editUploadRef(slot.upload);
  if (
    slot.schemaVersion !== 1 ||
    slot.ownerId !== c.uid ||
    slot.editId !== c.id ||
    slot.editToken !== loaded.token ||
    slot.slotId !== editSlotId(target) ||
    snapshot.ref.path !== c.path + '/slots/' + slot.slotId
  )
    conflict();
  assertIntentReservation(j.context.intent, target, upload);
  loreFieldPointer(slot.pointer);
  const claim = await editReservationPair(tx, loaded, slot.operationId);
  if (
    !claim ||
    claim.record.method !== 'reserveBookLoreEditUpload' ||
    !bornEqual(snapshot, claim.snapshot) ||
    claim.record.requestHash !==
      digest({
        editId: c.id,
        startHash: j.startHash,
        jobToken: loaded.token,
        operationId: slot.operationId,
        expectedRevision: claim.record.revision - 1,
        target,
        upload,
      })
  )
    conflict();
  return { snapshot, slot, claim };
}
export const reservedEditMarker = (loaded, slot) => ({
  schemaVersion: 1,
  editId: loaded.c.id,
  editToken: loaded.token,
  editBirth: born(loaded.snapshot),
  startHash: loaded.job.startHash,
  generationId: loaded.generation.at.id,
  generationBirth: born(loaded.generation.snapshot),
  slotId: slot.slotId,
  operationId: slot.operationId,
});
