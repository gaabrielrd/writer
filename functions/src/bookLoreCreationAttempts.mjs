import { born, bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { creationPaths, creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { loadCreationReservation } from './bookLoreCreationStore.mjs';
import { openCreationUploadSource } from './bookLoreCreationSource.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const refs = (c, id) => ({
  binding: c.db.doc(c.path + '/attempts/' + id),
  proof: c.db.doc(c.path + '/attemptProofs/' + id),
});
function value(l, context, startHash) {
  return {
    schemaVersion: 1,
    ownerId: l.c.uid,
    creationId: l.c.intent.creationId,
    parentToken: l.token,
    editId: context.intent.editId,
    startHash,
    contextHash: digest(context),
  };
}
export async function prepareCreationAttemptBinding(tx, c, context, startHash) {
  const { loaded: l } = await openCreationUploadSource(tx, c, {
      ...context.intent,
      bookBirth: context.bookBirth,
      creationBirth: context.creationBirth,
    }),
    at = refs(l.c, c.id);
  if ((await tx.get(at.binding)).exists || (await tx.get(at.proof)).exists) conflict();
  const v = value(l, context, startHash);
  return {
    commit() {
      tx.create(at.binding, v);
      tx.create(at.proof, { schemaVersion: 1, bindingHash: digest(v) });
    },
  };
}
/** Historical origin only. This does not authorize composing or adopting a generation. */
export async function verifyCreationAttemptBinding(tx, edit) {
  const context = edit.job.context,
    intent = context.intent,
    ref = intent.creation,
    c = creationPaths(edit.c.db, edit.c.uid, { bookId: intent.bookId, creationId: ref.creationId }),
    l = await loadCreationReservation(tx, c, { jobToken: ref.jobToken }),
    at = refs(c, edit.c.id),
    binding = await tx.get(at.binding),
    proof = await tx.get(at.proof);
  if (
    !l ||
    l.context.startHash !== ref.startHash ||
    intent.sourceToken !== l.token ||
    intent.loreId !== c.loreId ||
    !bornEqual(l.snapshot, { createTime: context.creationBirth }) ||
    !bornEqual({ createTime: l.context.bookBirth }, { createTime: context.bookBirth }) ||
    !immutable(binding) ||
    !immutable(proof) ||
    !bornEqual(binding, proof) ||
    !bornEqual(binding, edit.snapshot)
  )
    conflict();
  closed(binding.data(), [
    'schemaVersion',
    'ownerId',
    'creationId',
    'parentToken',
    'editId',
    'startHash',
    'contextHash',
  ]);
  closed(proof.data(), ['schemaVersion', 'bindingHash']);
  const v = value(l, context, edit.job.startHash);
  if (
    digest(binding.data()) !== digest(v) ||
    proof.data().schemaVersion !== 1 ||
    proof.data().bindingHash !== digest(v)
  )
    conflict();
  return { parent: l, binding, proof, birth: born(binding) };
}
