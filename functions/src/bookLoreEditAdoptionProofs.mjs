import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  editReservationConflict as conflict,
  editReservationPaths,
} from './bookLoreEditReservationContracts.mjs';
import { readInventoryEvent } from './bookLoreResourceInventoryStore.mjs';
import { loadEditReservation, editReservationPair } from './bookLoreEditReservationStore.mjs';
import { editAdoption } from './bookLoreEditAdoptionContracts.mjs';
export async function validateParentAdoption(tx, l) {
  const a = editAdoption(l.job.adoption, l.job.generationId),
    proof = await editReservationPair(tx, l, a.operationId),
    event = await readInventoryEvent(tx, l.generation, a.generationRevision);
  if (
    !proof ||
    proof.record.method !== 'adoptBookLoreEditGeneration' ||
    proof.record.progress.phase !== 'adopted' ||
    !bornEqual(proof.snapshot, event.event) ||
    event.record.operation !== 'adopt-preparation' ||
    event.record.payloadHash !== digest(a) ||
    proof.record.requestHash !==
      digest({
        editId: l.c.id,
        startHash: l.job.startHash,
        jobToken: l.token,
        operationId: a.operationId,
        expectedRevision: proof.record.revision - 1,
      })
  )
    conflict();
  return { proof, event };
}
/** Validate a prepared generation as the current native head, without reopening its obsolete source token. */
export async function assertPreparedGenerationHead(tx, c, generation, head, storage) {
  const prep = generation.context.preparation;
  if (!prep) conflict();
  const p = await loadEditReservation(tx, editReservationPaths(c.db, c.uid, prep.editId), {
    startHash: prep.startHash,
    jobToken: prep.editToken,
  });
  if (
    !p ||
    p.job.phase !== 'adopted' ||
    p.job.generationId !== generation.at.id ||
    generation.state.phase !== 'active' ||
    p.job.context.intent.bookId !== c.bookId ||
    p.job.context.intent.loreId !== head.id ||
    (p.job.context.sourceMode !== 'creation' &&
      !bornEqual(head, { createTime: p.job.context.sourceBirth })) ||
    digest(p.job.adoption.storage) !== digest(storage) ||
    !bornEqual(
      { createTime: p.job.context.bookBirth },
      { createTime: generation.context.bookBirth },
    )
  )
    conflict();
  const original = await validateParentAdoption(tx, p);
  if (
    !bornEqual(original.proof.snapshot, { createTime: head.updateTime }) ||
    (p.job.context.sourceMode === 'creation' && !bornEqual(head, original.proof.snapshot))
  )
    conflict();
  return p;
}
