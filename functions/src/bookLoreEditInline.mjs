import { born, bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { prepareBookResourcePayload } from './bookResourcePayload.mjs';
import { createBookLoreFieldUploadService } from './bookLoreFieldUpload.mjs';
import {
  fieldUploadPaths,
  fieldUploadIntent,
  fieldUploadStartHash,
  fieldUploadOperationId,
} from './bookLoreFieldUploadContracts.mjs';
import {
  loadFieldUpload,
  loadFieldState,
  commitFieldOperation,
} from './bookLoreFieldUploadStore.mjs';
import { openSealedBookLoreFieldUpload } from './bookLoreFieldUploadProofs.mjs';
import { advanceBookLoreFieldCleanupInTransaction } from './bookLoreFieldUploadCleanup.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { prepareInventoryInitialization } from './bookLoreResourceInventoryStore.mjs';
import {
  editSlotId,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import {
  assertEditReservationOpening,
  editReservationPair,
  commitEditReservation,
  reservedEditMarker,
} from './bookLoreEditReservationStore.mjs';
export const inlineUploadId = (l, target) => digest(['materialized-lore-edit', l.token, target]);
export const inlineMarker = (l) => ({
  editId: l.c.id,
  editToken: l.token,
  editBirth: born(l.snapshot),
  startHash: l.job.startHash,
  sourceToken: l.job.context.intent.sourceToken,
});
export async function readInlineChild(tx, l, work) {
  assertEditReservationOpening(tx, l);
  if (
    l.job.context.sourceMode !== 'inline' ||
    !l.job.compilation ||
    work.uploadId !== inlineUploadId(l, work.target)
  )
    conflict();
  const c = fieldUploadPaths(l.c.db, l.c.uid, work.uploadId),
    field = await loadFieldUpload(tx, c, { startHash: work.startHash }),
    start = await editReservationPair(tx, l, work.operationId),
    intent = l.job.context.intent;
  if (
    !field ||
    field.job.kind === 'fence' ||
    !start ||
    start.record.method !== 'advanceBookLoreEditCompilation' ||
    !bornEqual(field.snapshot, start.snapshot) ||
    digest(field.job.materialization) !== digest(inlineMarker(l)) ||
    field.job.context.bookId !== intent.bookId ||
    field.job.context.loreId !== intent.loreId ||
    field.job.context.sourceToken !== intent.sourceToken ||
    digest(field.job.context.target) !== digest(work.target) ||
    field.job.createdAt !== l.job.compilation.timestamp ||
    !bornEqual({ createTime: field.job.context.bookBirth }, { createTime: l.job.context.bookBirth })
  )
    conflict();
  return field;
}
export async function verifyMaterializedSlot(tx, l, slot) {
  closed(slot.materialized, ['startOperationId']);
  const target = slot.target,
    intent = l.job.context.intent,
    c = l.job.compilation;
  if (
    !c ||
    l.job.context.sourceMode !== 'inline' ||
    (target.field === 'relations'
      ? !c.relations.present ||
        target.page >= c.relations.pages ||
        target.count !== Math.min(64, c.relations.count - target.page * 64)
      : Object.hasOwn(intent.fields, target.field))
  )
    conflict();
  const field = await readInlineChild(tx, l, {
    target,
    uploadId: slot.upload.uploadId,
    startHash: slot.upload.startHash,
    operationId: slot.materialized.startOperationId,
  });
  if (
    field.token !== slot.upload.jobToken ||
    digest(field.job.context.manifest) !== digest(slot.pointer.manifest)
  )
    conflict();
  return field;
}
export async function advanceInlineMaterialization(tx, l, r, s, target, value) {
  assertEditReservationOpening(tx, l);
  if (l.job.phase !== 'preparing' || l.job.context.sourceMode !== 'inline') conflict();
  const uid = l.c.uid,
    intent = l.job.context.intent,
    uploadId = inlineUploadId(l, target),
    prepared = prepareBookResourcePayload({
      uid,
      bookId: intent.bookId,
      resource: { kind: 'lore', parentId: null, id: intent.loreId },
      operationId: fieldUploadOperationId(uid, intent.bookId, intent.loreId, uploadId, target),
      timestamp: s.timestamp,
      value,
    }),
    fieldIntent = fieldUploadIntent(uid, {
      bookId: intent.bookId,
      loreId: intent.loreId,
      uploadId,
      sourceToken: intent.sourceToken,
      target,
      manifest: prepared.manifest,
    }),
    startHash = fieldUploadStartHash(fieldIntent),
    api = createBookLoreFieldUploadService({
      db: l.c.db,
      transaction: tx,
      now: () => s.timestamp,
      materialization: inlineMarker(l),
    }),
    finish = (patch) =>
      commitEditReservation(tx, l, 'advanceBookLoreEditCompilation', r, {
        compilation: s,
        ...patch,
      });
  if (!s.inlineWork) {
    const old = await loadFieldUpload(tx, fieldUploadPaths(l.c.db, uid, uploadId), { startHash });
    if (old) conflict();
    await api.startBookLoreFieldUpload(uid, fieldIntent);
    s.inlineWork = { target, uploadId, startHash, operationId: r.operationId };
    return finish();
  }
  const work = s.inlineWork;
  if (
    digest(work.target) !== digest(target) ||
    work.uploadId !== uploadId ||
    work.startHash !== startHash
  )
    conflict();
  const field = await readInlineChild(tx, l, work),
    j = field.job,
    request = {
      uploadId,
      startHash,
      jobToken: field.token,
      operationId: digest(['inline-child', l.token, r.operationId]),
      expectedRevision: j.revision,
    };
  if (digest(j.context.manifest) !== digest(prepared.manifest)) conflict();
  if (j.phase === 'uploading') {
    const part = prepared.part(j.nextIndex);
    await api.appendBookLoreFieldUpload(uid, {
      ...request,
      index: j.nextIndex,
      chunkBase64: part.bytes.toString('base64'),
      proof: part.proof,
    });
    return finish();
  }
  if (j.phase === 'verifying') {
    await api.advanceBookLoreFieldSeal(uid, request);
    return finish();
  }
  if (j.phase !== 'sealed') conflict();
  const ref = { uploadId, startHash, jobToken: field.token },
    opening = await openSealedBookLoreFieldUpload(tx, field.c, ref),
    slotId = editSlotId(target),
    slotRef = l.c.db.doc(l.c.path + '/slots/' + slotId),
    existing = await tx.get(slotRef);
  if (existing.exists) conflict();
  const slot = {
      schemaVersion: 1,
      ownerId: uid,
      editId: l.c.id,
      editToken: l.token,
      slotId,
      target,
      upload: ref,
      pointer: opening.pointer,
      operationId: r.operationId,
      materialized: { startOperationId: work.operationId },
    },
    generation = l.generation,
    plan = await prepareInventoryInitialization(tx, inventoryScope(l.c.db, uid, intent.bookId), {
      schemaVersion: 1,
      kind: 'body',
      ownerId: uid,
      bookId: intent.bookId,
      bookBirth: l.job.context.bookBirth,
      loreId: intent.loreId,
      bodyId: opening.pointer.manifest.bodyId,
      pointer: opening.pointer,
      selector:
        target.field === 'relations'
          ? { section: 'relations', page: target.page }
          : { section: 'field', field: target.field, page: 0 },
      initialGeneration: {
        generationId: generation.at.id,
        birth: born(generation.snapshot),
        token: generation.token,
      },
    });
  plan.commit();
  tx.create(slotRef, slot);
  commitFieldOperation(
    tx,
    opening.loaded,
    'reserveBookLoreEditUpload',
    {
      ...ref,
      operationId: digest(['reserve-inline', l.token, r.operationId]),
      expectedRevision: j.revision,
      editToken: l.token,
      parentOperationId: r.operationId,
      slotId,
    },
    { phase: 'reserved', reservation: reservedEditMarker(l, slot) },
  );
  s.inlineWork = null;
  return finish({ reservedCount: l.job.reservedCount + 1 });
}
export async function cleanupInlineMaterialization(tx, l, r) {
  const work = l.job.compilation?.inlineWork;
  if (!work) return null;
  const field = await readInlineChild(tx, l, work),
    j = field.job,
    request = {
      uploadId: field.c.uploadId,
      startHash: j.startHash,
      jobToken: field.token,
      operationId: digest(['cleanup-inline-child', l.token, r.operationId]),
      expectedRevision: j.revision,
    };
  if (j.reservation || j.phase === 'reserved') conflict();
  let complete = j.phase === 'cancelled';
  if (!['cancelling', 'cancelled'].includes(j.phase)) {
    const state = await loadFieldState(tx, field);
    if (state) tx.delete(field.c.stateRef);
    commitFieldOperation(tx, field, 'cancelBookLoreFieldUpload', request, {
      phase: 'cancelling',
      stateHash: null,
    });
  } else if (!complete) {
    const result = await advanceBookLoreFieldCleanupInTransaction(tx, field, request);
    complete = result.progress.phase === 'cancelled';
  }
  return {
    compilation: { ...l.job.compilation, inlineWork: complete ? null : work },
    blockedReason: null,
  };
}
