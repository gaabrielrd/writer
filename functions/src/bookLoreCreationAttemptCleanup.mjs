import { born, bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { creationConflict as conflict } from './bookLoreCreationContracts.mjs';
import { deletionAtMost } from './bookLoreDeletionStore.mjs';
import { editReservationPaths } from './bookLoreEditReservationContracts.mjs';
import { loadEditReservation } from './bookLoreEditReservationStore.mjs';
import { createBookLoreEditReservationCleanup } from './bookLoreEditReservationCleanup.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { loadInventoryControl } from './bookLoreResourceInventoryStore.mjs';
const beforeRequest = (l, s) => {
  if (!s.exists || !deletionAtMost(born(s), born(l.cancelRequest.snapshot))) conflict();
};
async function attempt(tx, l, id, startHash) {
  const c = editReservationPaths(l.c.db, l.c.uid, id),
    edit = await loadEditReservation(tx, c, { startHash }),
    context = edit?.job.context,
    intent = context?.intent;
  if (
    !edit ||
    edit.job.kind !== 'reservation' ||
    intent.bookId !== l.c.intent.bookId ||
    intent.loreId !== l.c.loreId ||
    intent.creation?.creationId !== l.c.intent.creationId ||
    intent.creation?.jobToken !== l.token ||
    !bornEqual(l.snapshot, { createTime: context.creationBirth }) ||
    !bornEqual({ createTime: l.context.bookBirth }, { createTime: context.bookBirth }) ||
    edit.job.phase === 'adopted'
  )
    conflict();
  beforeRequest(l, edit.snapshot);
  return edit;
}
export async function advanceCreationAttempt(tx, l, next) {
  let q = l.c.db
    .collection(l.c.path + '/attempts')
    .orderBy('__name__')
    .limit(1);
  if (next.cursor) q = q.startAfter(next.cursor);
  const binding = (await tx.get(q)).docs[0];
  if (!binding) {
    next.phase = 'uploads';
    next.cursor = null;
    return;
  }
  beforeRequest(l, binding);
  const edit = await attempt(tx, l, binding.id, binding.data().startHash);
  if (edit.job.phase === 'cancelled') {
    next.cursor = binding.id;
    return;
  }
  const api = createBookLoreEditReservationCleanup({ db: l.c.db, transaction: tx }),
    r = {
      editId: edit.c.id,
      startHash: edit.job.startHash,
      jobToken: edit.token,
      operationId: digest([
        'creation-attempt-cancel',
        l.cancelRequest.token,
        l.cancelRequest.state.revision,
      ]),
    },
    result =
      edit.job.phase === 'cancelling'
        ? await api.advanceBookLoreEditReservationCleanup(l.c.uid, {
            ...r,
            expectedRevision: edit.job.revision,
          })
        : await api.cancelBookLoreEditReservation(l.c.uid, r);
  if (result.progress.blockedReason) conflict();
  next.coordinatedUnits++;
  if (result.progress.phase === 'cancelled') next.cursor = binding.id;
}
export async function auditCreationAttempts(tx, l, next) {
  const db = l.c.db,
    bookId = l.c.intent.bookId,
    phase = next.phase,
    collection =
      phase === 'edits'
        ? db
            .collection('users/' + l.c.uid + '/bookLoreEdits')
            .where('context.intent.loreId', '==', l.c.loreId)
        : db
            .collection(
              'books/' +
                bookId +
                '/' +
                (phase === 'generations' ? 'bookLoreGenerations' : 'bookResourceInventory'),
            )
            .where('loreId', '==', l.c.loreId);
  let q = collection.orderBy('__name__').limit(1);
  if (next.cursor) q = q.startAfter(next.cursor);
  const s = (await tx.get(q)).docs[0];
  if (!s) {
    next.phase = phase === 'edits' ? 'generations' : phase === 'generations' ? 'bodies' : 'finish';
    next.cursor = null;
    return;
  }
  beforeRequest(l, s);
  if (phase === 'edits') {
    const e = await attempt(tx, l, s.id, s.data().startHash);
    if (e.job.phase !== 'cancelled') conflict();
  } else {
    const scope = inventoryScope(db, l.c.uid, bookId),
      item = await loadInventoryControl(
        tx,
        scope,
        phase === 'generations' ? 'generation' : 'body',
        s.id,
      );
    if (
      !item ||
      !bornEqual(item.snapshot, s) ||
      !bornEqual({ createTime: item.context.bookBirth }, { createTime: l.context.bookBirth })
    )
      conflict();
    const generation =
        phase === 'generations'
          ? item
          : await loadInventoryControl(
              tx,
              scope,
              'generation',
              item.context.initialGeneration.generationId,
            ),
      ref = generation?.context.preparation;
    if (
      !ref ||
      generation.context.schemaVersion !== 2 ||
      generation.state.phase !== 'cancelled' ||
      generation.context.loreId !== l.c.loreId
    )
      conflict();
    const e = await attempt(tx, l, ref.editId, ref.startHash);
    if (
      e.job.phase !== 'cancelled' ||
      !e.generation ||
      digest(e.generation.context) !== digest(generation.context) ||
      e.generation.token !== generation.token
    )
      conflict();
    if (
      phase === 'bodies' &&
      (item.state.phase !== 'collected' ||
        item.context.initialGeneration.token !== generation.token ||
        !bornEqual(generation.snapshot, { createTime: item.context.initialGeneration.birth }))
    )
      conflict();
  }
  next.cursor = s.id;
}
