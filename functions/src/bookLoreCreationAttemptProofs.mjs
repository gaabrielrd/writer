import { born, bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { creationConflict as conflict } from './bookLoreCreationContracts.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
export const creationAttemptRefs = (c, id) => ({
  binding: c.db.doc(c.path + '/attempts/' + id),
  proof: c.db.doc(c.path + '/attemptProofs/' + id),
});
export function creationAttemptValue(l, context, startHash) {
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
/** Non-recursive proof against an already validated native creator record. */
export async function verifyCreationAttemptForParent(tx, edit, l) {
  const context = edit.job.context,
    intent = context.intent,
    ref = intent.creation;
  if (
    !l ||
    edit.c.uid !== l.c.uid ||
    intent.bookId !== l.c.intent.bookId ||
    ref.creationId !== l.c.intent.creationId ||
    ref.jobToken !== l.token ||
    l.context.startHash !== ref.startHash ||
    intent.sourceToken !== l.token ||
    intent.loreId !== l.c.loreId ||
    !bornEqual(l.snapshot, { createTime: context.creationBirth }) ||
    !bornEqual({ createTime: l.context.bookBirth }, { createTime: context.bookBirth })
  )
    conflict();
  const at = creationAttemptRefs(l.c, edit.c.id),
    binding = await tx.get(at.binding),
    proof = await tx.get(at.proof);
  if (
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
  const v = creationAttemptValue(l, context, edit.job.startHash);
  if (
    digest(binding.data()) !== digest(v) ||
    proof.data().schemaVersion !== 1 ||
    proof.data().bindingHash !== digest(v)
  )
    conflict();
  return { parent: l, binding, proof, birth: born(binding) };
}
