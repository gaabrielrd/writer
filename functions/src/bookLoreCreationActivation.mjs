import { digest } from './workProgressContracts.mjs';
import { creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { assertCreationOpening } from './bookLoreCreationStore.mjs';
import { assertEditReservationOpening } from './bookLoreEditReservationStore.mjs';
import { creationAdoptionPaths, creationAdoptionRecord } from './bookLoreCreationAdoption.mjs';
/** All reads precede the caller's atomic generation/head/clock/receipt writes. */
export async function prepareCreationActivation(tx, edit, compiled, adoption) {
  assertEditReservationOpening(tx, edit);
  const parent = compiled.source.loaded;
  assertCreationOpening(tx, parent);
  if (
    parent.adoption ||
    parent.cancelRequest ||
    parent.cancellation ||
    edit.job.context.sourceMode !== 'creation' ||
    edit.job.context.intent.creation?.jobToken !== parent.token ||
    edit.job.context.intent.loreId !== parent.c.loreId ||
    adoption.storage.dates.createdAt !== adoption.timestamp
  )
    conflict();
  const at = creationAdoptionPaths(parent.c),
    record = creationAdoptionRecord(parent, edit, adoption);
  if ((await tx.get(at.record)).exists || (await tx.get(at.proof)).exists) conflict();
  return {
    commit() {
      tx.create(at.record, record);
      tx.create(at.proof, { schemaVersion: 1, adoptionHash: digest(record) });
    },
  };
}
