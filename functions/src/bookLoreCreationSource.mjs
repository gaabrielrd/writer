import { assertAnalysisSourceChild } from './loreAnalysisApplicationChildBindings.mjs';
import { born, bornEqual } from './bookRestoreUploadContracts.mjs';
import { creationPaths, creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { openCreationReservation } from './bookLoreCreationStore.mjs';
export async function openCreationUploadSource(tx, c, context) {
  const ref = context.creation,
    at = creationPaths(c.db, c.uid, { bookId: context.bookId, creationId: ref.creationId }),
    l = await openCreationReservation(tx, at, { jobToken: ref.jobToken });
  await assertAnalysisSourceChild(
    tx,
    c,
    'creation',
    ref.creationId,
    c.uploadId ? 'field' : 'edit',
    c.uploadId ?? c.id,
  );
  if (
    l.context.startHash !== ref.startHash ||
    context.sourceToken !== l.token ||
    context.loreId !== at.loreId ||
    (context.bookBirth && !bornEqual(l.root, { createTime: context.bookBirth })) ||
    (context.creationBirth && !bornEqual(l.snapshot, { createTime: context.creationBirth }))
  )
    conflict();
  return { loaded: l, origin: { bookBirth: born(l.root), creationBirth: born(l.snapshot) } };
}
