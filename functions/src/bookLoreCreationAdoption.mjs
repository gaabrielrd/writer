import { born, bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { verifyCreationAttemptForParent } from './bookLoreCreationAttemptProofs.mjs';
import {
  editReservationPaths,
  editReservationIntent,
  editReservationStartHash,
  editReservationToken,
  editReservationView,
  expectedEditGeneration,
} from './bookLoreEditReservationContracts.mjs';
import { editReservationPair } from './bookLoreEditOperationProofs.mjs';
import { editAdoption } from './bookLoreEditAdoptionContracts.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { loadInventoryControl, readInventoryEvent } from './bookLoreResourceInventoryStore.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
export const creationAdoptionPaths = (c) => ({
  record: c.db.doc(c.path + '/adoptions/current'),
  proof: c.db.doc(c.path + '/adoptionProofs/current'),
});
export function creationAdoptionRecord(parent, edit, adoption) {
  return {
    schemaVersion: 1,
    ownerId: parent.c.uid,
    creationId: parent.c.intent.creationId,
    jobToken: parent.token,
    contextHash: digest(parent.context),
    edit: { editId: edit.c.id, startHash: edit.job.startHash, jobToken: edit.token },
    generationId: edit.job.generationId,
    generationToken: edit.generation.token,
    generationBirth: born(edit.generation.snapshot),
    operationId: adoption.operationId,
    adoptionHash: digest(adoption),
  };
}
/** Immutable historical proof only. Never opens the current book/head or any prose. */
export async function loadCreationAdoption(tx, parent) {
  const at = creationAdoptionPaths(parent.c),
    snapshot = await tx.get(at.record),
    proof = await tx.get(at.proof);
  if (!snapshot.exists && !proof.exists) return null;
  if (
    !immutable(snapshot) ||
    !immutable(proof) ||
    !bornEqual(snapshot, proof) ||
    parent.context.kind !== 'reservation' ||
    parent.cancellation ||
    parent.cancelRequest
  )
    conflict();
  const r = snapshot.data(),
    p = proof.data();
  closed(r, [
    'schemaVersion',
    'ownerId',
    'creationId',
    'jobToken',
    'contextHash',
    'edit',
    'generationId',
    'generationToken',
    'generationBirth',
    'operationId',
    'adoptionHash',
  ]);
  closed(p, ['schemaVersion', 'adoptionHash']);
  closed(r.edit, ['editId', 'startHash', 'jobToken']);
  const c = editReservationPaths(parent.c.db, parent.c.uid, r.edit.editId),
    original = await tx.get(c.ref),
    j = original.data();
  restoreHash(r.edit.startHash);
  restoreHash(r.edit.jobToken);
  if (
    !original.exists ||
    j.schemaVersion !== 1 ||
    j.kind !== 'reservation' ||
    j.phase !== 'adopted' ||
    j.ownerId !== c.uid ||
    j.editId !== c.id ||
    j.startHash !== r.edit.startHash ||
    j.lastOperationId !== r.operationId ||
    j.compilation?.phase !== 'ready'
  )
    conflict();
  integer(j.revision, 1);
  const intent = editReservationIntent(c.uid, j.context.intent);
  if (
    !intent.creation ||
    intent.editId !== c.id ||
    editReservationStartHash(intent) !== j.startHash ||
    j.context.sourceMode !== 'creation'
  )
    conflict();
  closed(j.context, ['intent', 'bookBirth', 'creationBirth', 'sourceMode', 'metadataHash']);
  restoreHash(j.context.metadataHash);
  const edit = { c, snapshot: original, job: j, token: editReservationToken(c, original, j) };
  if (edit.token !== r.edit.jobToken) conflict();
  await verifyCreationAttemptForParent(tx, edit, parent);
  const generation = await loadInventoryControl(
    tx,
    inventoryScope(c.db, c.uid, intent.bookId),
    'generation',
    j.generationId,
  );
  if (
    !generation ||
    !['active', 'retired'].includes(generation.state.phase) ||
    digest(generation.context) !== digest(expectedEditGeneration(edit))
  )
    conflict();
  edit.generation = generation;
  const adoption = editAdoption(j.adoption, j.generationId),
    receipt = await editReservationPair(tx, edit, adoption.operationId),
    event = await readInventoryEvent(tx, generation, 1);
  if (
    !receipt ||
    receipt.record.method !== 'adoptBookLoreEditGeneration' ||
    receipt.record.revision !== j.revision ||
    receipt.record.jobHash !== digest(j) ||
    digest(receipt.record.progress) !== digest(editReservationView(edit)) ||
    !bornEqual(snapshot, receipt.snapshot) ||
    !bornEqual(snapshot, { createTime: original.updateTime }) ||
    !bornEqual(snapshot, event.event) ||
    event.record.operation !== 'adopt-preparation' ||
    event.record.payloadHash !== digest(adoption) ||
    receipt.record.requestHash !==
      digest({
        editId: c.id,
        startHash: j.startHash,
        jobToken: edit.token,
        operationId: adoption.operationId,
        expectedRevision: j.revision - 1,
      }) ||
    adoption.storage.base !== null ||
    !adoption.storage.fields.name ||
    !adoption.storage.fields.category ||
    adoption.storage.dates.createdAt !== adoption.timestamp ||
    adoption.privacy.before.present ||
    adoption.privacy.before.value !== null ||
    digest(r) !== digest(creationAdoptionRecord(parent, edit, adoption)) ||
    p.schemaVersion !== 1 ||
    p.adoptionHash !== digest(r)
  )
    conflict();
  return { snapshot, record: r, edit, generation, adoption };
}
