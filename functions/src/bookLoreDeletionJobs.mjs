import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { editReservationPaths } from './bookLoreEditReservationContracts.mjs';
import { loadEditReservation } from './bookLoreEditReservationStore.mjs';
import { createBookLoreEditReservationCleanup } from './bookLoreEditReservationCleanup.mjs';
import { fieldUploadPaths } from './bookLoreFieldUploadContracts.mjs';
import { loadFieldUpload } from './bookLoreFieldUploadStore.mjs';
import { createBookLoreFieldUploadCleanup } from './bookLoreFieldUploadCleanup.mjs';
import { inspectionPaths } from './bookLoreSourceInspectionContracts.mjs';
import { loadSourceInspection } from './bookLoreSourceInspectionStore.mjs';
import { createBookLoreSourceInspectionService } from './bookLoreSourceInspection.mjs';
import {
  assertDeletionOpening,
  deletionConflict as conflict,
  deletionScopeCheck,
} from './bookLoreDeletionStore.mjs';
export const deletionJobQueries = (db, uid, bookId) => [
  db.collection('users/' + uid + '/bookLoreEdits').where('context.intent.bookId', '==', bookId),
  db.collection('users/' + uid + '/bookLoreFieldUploads').where('context.bookId', '==', bookId),
  db
    .collection('users/' + uid + '/bookLoreSourceInspections')
    .where('context.bookId', '==', bookId),
];
export async function advanceDeletionJob(tx, l, next) {
  assertDeletionOpening(tx, l);
  const index = ['edits', 'fields', 'inspections'].indexOf(next.phase);
  if (index < 0) conflict();
  let query = deletionJobQueries(l.c.db, l.c.uid, l.c.bookId)[index].orderBy('__name__').limit(1);
  if (next.cursor) query = query.startAfter(next.cursor);
  const document = (await tx.get(query)).docs[0];
  if (!document) {
    next.phase = ['fields', 'inspections', 'heads'][index];
    next.cursor = null;
    return;
  }
  deletionScopeCheck(l, document);
  const startHash = document.data().startHash,
    operationId = digest(['book-lore-delete-child', l.token, l.state.revision]),
    request = { operationId };
  let loaded, result;
  if (index === 0) {
    const c = editReservationPaths(l.c.db, l.c.uid, document.id);
    loaded = await loadEditReservation(tx, c, { startHash });
    if (!loaded || loaded.job.kind !== 'reservation') conflict();
    if (!bornEqual({ createTime: loaded.job.context.bookBirth }, l.root)) conflict();
    if (['adopted', 'cancelled'].includes(loaded.job.phase)) {
      next.cursor = document.id;
      return;
    }
    const api = createBookLoreEditReservationCleanup({ db: l.c.db, transaction: tx }),
      r = { ...request, editId: document.id, startHash, jobToken: loaded.token };
    result =
      loaded.job.phase === 'cancelling'
        ? await api.advanceBookLoreEditReservationCleanup(l.c.uid, {
            ...r,
            expectedRevision: loaded.job.revision,
          })
        : await api.cancelBookLoreEditReservation(l.c.uid, r);
    if (result.progress.blockedReason) conflict();
  } else if (index === 1) {
    const c = fieldUploadPaths(l.c.db, l.c.uid, document.id);
    loaded = await loadFieldUpload(tx, c, { startHash });
    if (
      !loaded ||
      loaded.job.kind !== 'upload' ||
      !bornEqual({ createTime: loaded.job.context.bookBirth }, l.root)
    )
      conflict();
    if (loaded.job.phase === 'cancelled') {
      next.cursor = document.id;
      return;
    }
    if (loaded.job.phase === 'reserved') {
      const marker = loaded.job.reservation,
        parent = await loadEditReservation(
          tx,
          editReservationPaths(l.c.db, l.c.uid, marker.editId),
          { startHash: marker.startHash, jobToken: marker.editToken },
        );
      if (
        !parent ||
        parent.job.phase !== 'adopted' ||
        parent.job.context.intent.bookId !== l.c.bookId ||
        !bornEqual({ createTime: parent.job.context.bookBirth }, l.root)
      )
        conflict();
      next.cursor = document.id;
      return;
    }
    const api = createBookLoreFieldUploadCleanup({ db: l.c.db, transaction: tx }),
      r = { ...request, uploadId: document.id, startHash, jobToken: loaded.token };
    result =
      loaded.job.phase === 'cancelling'
        ? await api.advanceBookLoreFieldCleanup(l.c.uid, {
            ...r,
            expectedRevision: loaded.job.revision,
          })
        : await api.cancelBookLoreFieldUpload(l.c.uid, r);
  } else {
    const c = inspectionPaths(l.c.db, l.c.uid, document.id);
    loaded = await loadSourceInspection(tx, c, { startHash });
    if (
      !loaded ||
      loaded.job.kind !== 'inspection' ||
      !bornEqual({ createTime: loaded.job.context.bookBirth }, l.root)
    )
      conflict();
    if (loaded.job.phase === 'cancelled') {
      next.cursor = document.id;
      return;
    }
    result = await createBookLoreSourceInspectionService({
      db: l.c.db,
      transaction: tx,
    }).cancelBookLoreSourceInspection(l.c.uid, {
      ...request,
      inspectionId: document.id,
      startHash,
      jobToken: loaded.token,
    });
  }
  next.coordinatedUnits++;
  if (result.progress.phase === 'cancelled') next.cursor = document.id;
}
