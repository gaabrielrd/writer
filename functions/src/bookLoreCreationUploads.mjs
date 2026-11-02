import { bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { creationPaths, creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { loadCreationReservation } from './bookLoreCreationStore.mjs';
import { openCreationUploadSource } from './bookLoreCreationSource.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const refs = (c, id) => ({
  binding: c.db.doc(c.path + '/uploads/' + id),
  proof: c.db.doc(c.path + '/uploadProofs/' + id),
});
function value(l, context, startHash) {
  return {
    schemaVersion: 1,
    ownerId: l.c.uid,
    creationId: l.c.intent.creationId,
    parentToken: l.token,
    uploadId: context.uploadId,
    startHash,
    contextHash: digest(context),
  };
}
export async function prepareCreationUploadBinding(tx, c, context, startHash) {
  const { loaded: l } = await openCreationUploadSource(tx, c, context),
    at = refs(l.c, context.uploadId);
  if ((await tx.get(at.binding)).exists || (await tx.get(at.proof)).exists) conflict();
  const v = value(l, context, startHash);
  return {
    commit() {
      tx.create(at.binding, v);
      tx.create(at.proof, { schemaVersion: 1, bindingHash: digest(v) });
    },
  };
}
/** Historical scope proof for cleanup/get; does not reauthorize writing source bytes. */
export async function verifyCreationUploadBinding(tx, field) {
  const context = field.job.context,
    ref = context.creation,
    c = creationPaths(field.c.db, field.c.uid, {
      bookId: context.bookId,
      creationId: ref.creationId,
    }),
    l = await loadCreationReservation(tx, c, { jobToken: ref.jobToken }),
    at = refs(c, field.c.uploadId),
    binding = await tx.get(at.binding),
    proof = await tx.get(at.proof);
  if (
    !l ||
    l.context.startHash !== ref.startHash ||
    context.sourceToken !== l.token ||
    context.loreId !== c.loreId ||
    !bornEqual(l.snapshot, { createTime: context.creationBirth }) ||
    !bornEqual({ createTime: l.context.bookBirth }, { createTime: context.bookBirth }) ||
    !immutable(binding) ||
    !immutable(proof) ||
    !bornEqual(binding, proof) ||
    !bornEqual(binding, field.snapshot)
  )
    conflict();
  closed(binding.data(), [
    'schemaVersion',
    'ownerId',
    'creationId',
    'parentToken',
    'uploadId',
    'startHash',
    'contextHash',
  ]);
  closed(proof.data(), ['schemaVersion', 'bindingHash']);
  const v = value(l, context, field.job.startHash);
  if (
    digest(binding.data()) !== digest(v) ||
    proof.data().schemaVersion !== 1 ||
    proof.data().bindingHash !== digest(v)
  )
    conflict();
  return { parent: l, binding, proof };
}
