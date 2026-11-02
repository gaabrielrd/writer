import { born, bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { assertFieldUploadOpening } from './bookLoreFieldUploadStore.mjs';
import {
  editReservationPaths,
  editUploadReservation,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import {
  loadEditReservation,
  readEditReservationSlot,
  reservedEditMarker,
} from './bookLoreEditReservationStore.mjs';
const accesses = new WeakMap();
export async function cancelledEditUploadAccess(tx, field) {
  assertFieldUploadOpening(tx, field);
  const marker = editUploadReservation(field.job.reservation),
    c = editReservationPaths(field.c.db, field.c.uid, marker.editId),
    parent = await loadEditReservation(tx, c, {
      startHash: marker.startHash,
      jobToken: marker.editToken,
    });
  if (
    !parent ||
    !['cancelling', 'cancelled'].includes(parent.job.phase) ||
    parent.generation?.state.phase !== 'cancelled'
  )
    conflict();
  const record = await readEditReservationSlot(tx, parent, marker.slotId),
    slot = record.slot,
    intent = parent.job.context.intent;
  if (
    digest(marker) !== digest(reservedEditMarker(parent, slot)) ||
    digest(slot.upload) !==
      digest({
        uploadId: field.c.uploadId,
        startHash: field.job.startHash,
        jobToken: field.token,
      }) ||
    field.job.context.bookId !== intent.bookId ||
    field.job.context.loreId !== intent.loreId ||
    field.job.context.sourceToken !== intent.sourceToken ||
    digest(field.job.context.target) !== digest(slot.target) ||
    digest(field.job.context.manifest) !== digest(slot.pointer.manifest) ||
    !bornEqual(
      { createTime: field.job.context.bookBirth },
      { createTime: parent.job.context.bookBirth },
    )
  )
    conflict();
  const access = {};
  accesses.set(access, {
    tx,
    uid: field.c.uid,
    bookId: intent.bookId,
    loreId: intent.loreId,
    bodyId: slot.pointer.manifest.bodyId,
    pointerHash: digest(slot.pointer),
    bodyBirth: born(record.snapshot),
    bookBirth: parent.job.context.bookBirth,
    generationId: parent.generation.at.id,
    generationBirth: born(parent.generation.snapshot),
    generationToken: parent.generation.token,
    leaseBirth: born(field.lease),
    leaseUpdate: born({ createTime: field.lease.updateTime }),
    leaseHash: digest(field.lease.data()),
  });
  return access;
}
export function stagedEditUploadProof(tx, access, c, bodyId, body = null) {
  const proof = accesses.get(access);
  if (
    !proof ||
    proof.tx !== tx ||
    proof.uid !== c.uid ||
    proof.bookId !== c.bookId ||
    proof.bodyId !== bodyId
  )
    conflict();
  if (
    body &&
    (!bornEqual(body.snapshot, { createTime: proof.bodyBirth }) ||
      body.context.loreId !== proof.loreId ||
      digest(body.context.pointer) !== proof.pointerHash ||
      !bornEqual({ createTime: body.context.bookBirth }, { createTime: proof.bookBirth }) ||
      body.context.initialGeneration.generationId !== proof.generationId ||
      body.context.initialGeneration.token !== proof.generationToken ||
      !bornEqual(
        { createTime: body.context.initialGeneration.birth },
        { createTime: proof.generationBirth },
      ))
  )
    conflict();
  return proof;
}
