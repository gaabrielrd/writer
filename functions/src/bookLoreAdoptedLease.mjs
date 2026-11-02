import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { fieldUploadPaths } from './bookLoreFieldUploadContracts.mjs';
import { loadFieldUpload } from './bookLoreFieldUploadStore.mjs';
import {
  editReservationPaths,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import {
  loadEditReservation,
  readEditReservationSlot,
  reservedEditMarker,
} from './bookLoreEditReservationStore.mjs';
/** Presence/string phase never releases a lease. Only its original adopted parent can do so logically. */
export async function resolveAdoptedInventoryLease(tx, c, body, lease) {
  const value = lease.data();
  if (value?.schemaVersion !== 1 || !value.reservation || typeof value.uploadId !== 'string')
    return null;
  const field = await loadFieldUpload(tx, fieldUploadPaths(c.db, c.uid, value.uploadId), {
      startHash: value.startHash,
    }),
    marker = field?.job.reservation;
  if (
    !marker ||
    field.job.phase !== 'reserved' ||
    !bornEqual(field.lease, lease) ||
    digest(field.lease.data()) !== digest(value)
  )
    conflict();
  const p = await loadEditReservation(tx, editReservationPaths(c.db, c.uid, marker.editId), {
    startHash: marker.startHash,
    jobToken: marker.editToken,
  });
  if (!p || p.job.phase !== 'adopted') return null;
  const slot = await readEditReservationSlot(tx, p, marker.slotId);
  if (
    digest(marker) !== digest(reservedEditMarker(p, slot.slot)) ||
    slot.slot.upload.jobToken !== field.token ||
    slot.slot.upload.uploadId !== field.c.uploadId ||
    field.job.context.bookId !== c.bookId ||
    field.job.context.loreId !== body.context.loreId ||
    field.job.context.sourceToken !== p.job.context.intent.sourceToken ||
    digest(field.job.context.manifest) !== digest(slot.slot.pointer.manifest) ||
    !bornEqual(body.snapshot, slot.snapshot) ||
    digest(body.context.pointer) !== digest(slot.slot.pointer) ||
    body.context.loreId !== p.job.context.intent.loreId ||
    body.context.bookId !== c.bookId ||
    p.job.context.intent.bookId !== c.bookId ||
    body.context.initialGeneration.generationId !== p.job.generationId ||
    body.context.initialGeneration.token !== p.generation.token ||
    !bornEqual({ createTime: body.context.initialGeneration.birth }, p.generation.snapshot)
  )
    conflict();
  return {
    phase: p.generation.state.phase === 'retired' ? 'retired' : 'adopted',
    parent: p,
    generation: p.generation,
  };
}
