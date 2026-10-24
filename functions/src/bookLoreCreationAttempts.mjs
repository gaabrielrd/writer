import { digest } from './workProgressContracts.mjs';
import { creationPaths, creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { loadCreationReservation } from './bookLoreCreationStore.mjs';
import { openCreationUploadSource } from './bookLoreCreationSource.mjs';
import {
  creationAttemptRefs,
  creationAttemptValue,
  verifyCreationAttemptForParent,
} from './bookLoreCreationAttemptProofs.mjs';
export async function prepareCreationAttemptBinding(tx, c, context, startHash) {
  const { loaded: l } = await openCreationUploadSource(tx, c, {
      ...context.intent,
      bookBirth: context.bookBirth,
      creationBirth: context.creationBirth,
    }),
    at = creationAttemptRefs(l.c, c.id);
  if ((await tx.get(at.binding)).exists || (await tx.get(at.proof)).exists) conflict();
  const v = creationAttemptValue(l, context, startHash);
  return {
    commit() {
      tx.create(at.binding, v);
      tx.create(at.proof, { schemaVersion: 1, bindingHash: digest(v) });
    },
  };
}
/** Historical origin only. This does not authorize composing or adopting a generation. */
export async function verifyCreationAttemptBinding(tx, edit) {
  const intent = edit.job.context.intent,
    ref = intent.creation,
    c = creationPaths(edit.c.db, edit.c.uid, { bookId: intent.bookId, creationId: ref.creationId }),
    l = await loadCreationReservation(tx, c, { jobToken: ref.jobToken });
  return verifyCreationAttemptForParent(tx, edit, l);
}
