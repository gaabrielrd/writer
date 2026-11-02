import { cleanupInlineMaterialization } from './bookLoreEditInline.mjs';
import { cleanupEditCompilation } from './bookLoreEditCompilationCleanup.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  editReservationRequest,
  editReservationPaths,
  editReservationView,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import {
  loadEditReservation,
  replayEditReservation,
  commitEditReservation,
  readEditReservationSlot,
  reservedEditMarker,
} from './bookLoreEditReservationStore.mjs';
import { prepareInventoryChange } from './bookLoreResourceInventoryStore.mjs';
import { fieldUploadPaths } from './bookLoreFieldUploadContracts.mjs';
import {
  loadFieldUpload,
  commitFieldOperation,
  loadFieldState,
} from './bookLoreFieldUploadStore.mjs';
import { advanceBookLoreFieldCleanupInTransaction } from './bookLoreFieldUploadCleanup.mjs';
async function slotField(tx, loaded, record) {
  const slot = record.slot,
    c = fieldUploadPaths(loaded.c.db, loaded.c.uid, slot.upload.uploadId),
    field = await loadFieldUpload(tx, c, slot.upload);
  if (
    !field ||
    field.job.kind === 'fence' ||
    digest(field.job.reservation) !== digest(reservedEditMarker(loaded, slot)) ||
    digest(field.job.context.manifest) !== digest(slot.pointer.manifest)
  )
    conflict();
  return field;
}
export function createBookLoreEditReservationCleanup({ db, transaction = null }) {
  const transact = (fn) => (transaction ? fn(transaction) : db.runTransaction(fn));
  return {
    async cancelBookLoreEditReservation(uid, input) {
      const r = editReservationRequest(uid, input, [], true),
        c = editReservationPaths(db, uid, r.editId);
      return transact(async (tx) => {
        const loaded = await loadEditReservation(tx, c, r);
        if (!loaded) {
          if (r.jobToken !== undefined) conflict();
          if (
            (
              await tx.get(
                db
                  .collection(c.path + '/slots')
                  .limit(1)
                  .select(),
              )
            ).docs.length
          )
            conflict();
          const job = {
            schemaVersion: 1,
            kind: 'fence',
            ownerId: uid,
            editId: c.id,
            startHash: r.startHash,
            phase: 'cancelled',
          };
          tx.create(c.ref, job);
          return { receipt: null, progress: editReservationView({ c, job }) };
        }
        if (loaded.job.kind === 'fence')
          return { receipt: null, progress: editReservationView(loaded) };
        const replay = await replayEditReservation(tx, loaded, 'cancelBookLoreEditReservation', r);
        if (replay) return replay;
        const j = loaded.job;
        if (j.phase === 'adopted') conflict();
        if (['cancelling', 'cancelled'].includes(j.phase))
          return { receipt: null, progress: editReservationView(loaded) };
        if (j.generationId === null) {
          if (
            (
              await tx.get(
                db
                  .collection(c.path + '/slots')
                  .limit(1)
                  .select(),
              )
            ).docs.length
          )
            conflict();
          return commitEditReservation(tx, loaded, 'cancelBookLoreEditReservation', r, {
            phase: 'cancelled',
            cancelOperationId: r.operationId,
            blockedReason: null,
          });
        }
        const plan = await prepareInventoryChange(tx, loaded.generation, 'cancel-preparation', {
          phase: 'cancelled',
        });
        plan.commit();
        return commitEditReservation(tx, loaded, 'cancelBookLoreEditReservation', r, {
          phase: 'cancelling',
          cancelOperationId: r.operationId,
          blockedReason: null,
        });
      });
    },
    async advanceBookLoreEditReservationCleanup(uid, input) {
      const r = editReservationRequest(uid, input, [], true, true),
        c = editReservationPaths(db, uid, r.editId);
      return transact(async (tx) => {
        const loaded = await loadEditReservation(tx, c, r);
        if (!loaded || loaded.job.kind === 'fence') conflict();
        const replay = await replayEditReservation(
          tx,
          loaded,
          'advanceBookLoreEditReservationCleanup',
          r,
        );
        if (replay) return replay;
        const j = loaded.job;
        if (j.phase === 'cancelled')
          return { receipt: null, progress: editReservationView(loaded) };
        if (j.phase !== 'cancelling' || r.expectedRevision !== j.revision) conflict();
        const inline = await cleanupInlineMaterialization(tx, loaded, r);
        if (inline)
          return commitEditReservation(
            tx,
            loaded,
            'advanceBookLoreEditReservationCleanup',
            r,
            inline,
          );
        if (j.cleanupSlot === null) {
          let query = db
            .collection(c.path + '/slots')
            .orderBy('__name__')
            .limit(1);
          if (j.cleanupCursor !== null) query = query.startAfter(j.cleanupCursor);
          const next = (await tx.get(query)).docs[0];
          if (!next) {
            if (j.releasedCount !== j.reservedCount) conflict();
            const compiled = await cleanupEditCompilation(tx, loaded);
            return commitEditReservation(tx, loaded, 'advanceBookLoreEditReservationCleanup', r, {
              phase: compiled.complete ? 'cancelled' : 'cancelling',
              blockedReason: null,
              ...compiled.patch,
            });
          }
          const record = await readEditReservationSlot(tx, loaded, next),
            field = await slotField(tx, loaded, record);
          await loadFieldState(tx, field);
          if (field.job.phase === 'reserved') {
            commitFieldOperation(
              tx,
              field,
              'cancelReservedBookLoreEditUpload',
              {
                ...record.slot.upload,
                operationId: digest([
                  'cancel-edit-slot',
                  loaded.token,
                  r.operationId,
                  record.slot.slotId,
                ]),
                expectedRevision: field.job.revision,
                editToken: loaded.token,
                parentOperationId: r.operationId,
              },
              { phase: 'cancelling', stateHash: null },
            );
          } else if (!['cancelling', 'cancelled'].includes(field.job.phase)) conflict();
          return commitEditReservation(tx, loaded, 'advanceBookLoreEditReservationCleanup', r, {
            cleanupSlot: record.slot.slotId,
            blockedReason: null,
          });
        }
        const record = await readEditReservationSlot(tx, loaded, j.cleanupSlot),
          field = await slotField(tx, loaded, record),
          result = await advanceBookLoreFieldCleanupInTransaction(tx, field, {
            ...record.slot.upload,
            operationId: digest([
              'cleanup-edit-slot',
              loaded.token,
              r.operationId,
              record.slot.slotId,
            ]),
            expectedRevision: field.job.revision,
          });
        return commitEditReservation(tx, loaded, 'advanceBookLoreEditReservationCleanup', r, {
          blockedReason: result.blocked ?? null,
          ...(result.progress.phase === 'cancelled'
            ? {
                cleanupSlot: null,
                cleanupCursor: record.slot.slotId,
                releasedCount: j.releasedCount + 1,
              }
            : {}),
        });
      });
    },
  };
}
