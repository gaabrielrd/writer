import { assertAnalysisChildUnit } from './loreAnalysisApplicationChildBindings.mjs';
import { createBookLoreEditAdoptionService } from './bookLoreEditAdoption.mjs';
import { createBookLoreEditCompilationService } from './bookLoreEditCompilation.mjs';
import { born, date } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  editReservationIntent,
  editReservationStartHash,
  editReservationPaths,
  editReservationRequest,
  editReservationView,
  editReservationConflict as conflict,
  editReservationTarget,
  editUploadRef,
  editSlotId,
  assertIntentReservation,
} from './bookLoreEditReservationContracts.mjs';
import {
  loadEditReservation,
  editReservationSource,
  replayEditReservation,
  commitEditReservation,
  expectedEditGeneration,
  reservedEditMarker,
} from './bookLoreEditReservationStore.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { prepareInventoryInitialization } from './bookLoreResourceInventoryStore.mjs';
import { fieldUploadPaths } from './bookLoreFieldUploadContracts.mjs';
import { openSealedBookLoreFieldUpload } from './bookLoreFieldUploadProofs.mjs';
import { commitFieldOperation } from './bookLoreFieldUploadStore.mjs';
import { createBookLoreEditReservationCleanup } from './bookLoreEditReservationCleanup.mjs';
import { prepareCreationAttemptBinding } from './bookLoreCreationAttempts.mjs';
export function createBookLoreEditReservationService({
  db,
  now = () => Date.now(),
  transaction = null,
}) {
  const transact = (fn) => (transaction ? fn(transaction) : db.runTransaction(fn));
  const service = {
    async startBookLoreEditReservation(uid, input) {
      const intent = editReservationIntent(uid, input),
        startHash = editReservationStartHash(intent),
        c = editReservationPaths(db, uid, intent.editId);
      const result = await transact(async (tx) => {
        const old = await loadEditReservation(tx, c, { startHash });
        if (old) return editReservationView(old);
        assertAnalysisChildUnit(tx, db, uid, 'edit', intent.editId);
        const { sourceContext } = await editReservationSource(tx, c, intent),
          orphans = await tx.get(
            db
              .collection(c.path + '/slots')
              .limit(1)
              .select(),
          );
        if (orphans.docs.length) conflict();
        const binding = intent.creation
          ? await prepareCreationAttemptBinding(tx, c, sourceContext, startHash)
          : null;
        binding?.commit();
        tx.create(c.ref, {
          schemaVersion: 1,
          kind: 'reservation',
          ownerId: uid,
          editId: c.id,
          startHash,
          context: sourceContext,
          phase: 'initializing',
          revision: 0,
          reservedCount: 0,
          releasedCount: 0,
          cleanupSlot: null,
          cleanupCursor: null,
          blockedReason: null,
          generationId: null,
          generationOperationId: null,
          cancelOperationId: null,
          lastOperationId: null,
          createdAt: date(now),
        });
        return null;
      });
      return transaction
        ? result
        : (result ?? service.getBookLoreEditReservation(uid, { editId: c.id, startHash }));
    },
    async getBookLoreEditReservation(uid, input) {
      const r = editReservationRequest(uid, input),
        c = editReservationPaths(db, uid, r.editId);
      return transact(async (tx) => {
        const loaded = await loadEditReservation(tx, c, r);
        return loaded ? editReservationView(loaded) : null;
      });
    },
    async initializeBookLoreEditGeneration(uid, input) {
      const r = editReservationRequest(uid, input, [], true, true),
        c = editReservationPaths(db, uid, r.editId);
      return transact(async (tx) => {
        const loaded = await loadEditReservation(tx, c, r);
        if (!loaded || loaded.job.kind === 'fence') conflict();
        const replay = await replayEditReservation(
          tx,
          loaded,
          'initializeBookLoreEditGeneration',
          r,
        );
        if (replay) return replay;
        assertAnalysisChildUnit(tx, db, uid, 'edit', c.id);
        if (loaded.job.phase !== 'initializing' || loaded.job.revision !== r.expectedRevision)
          conflict();
        await editReservationSource(tx, c, loaded.job.context.intent, loaded.job.context);
        const context = expectedEditGeneration(loaded),
          scope = inventoryScope(db, uid, context.bookId),
          plan = await prepareInventoryInitialization(tx, scope, context);
        plan.commit();
        return commitEditReservation(tx, loaded, 'initializeBookLoreEditGeneration', r, {
          phase: 'preparing',
          generationId: context.generationId,
          generationOperationId: r.operationId,
        });
      });
    },
    async reserveBookLoreEditUpload(uid, input) {
      const r = editReservationRequest(uid, input, ['target', 'upload'], true, true);
      r.target = editReservationTarget(r.target);
      r.upload = editUploadRef(r.upload);
      const c = editReservationPaths(db, uid, r.editId);
      return transact(async (tx) => {
        const loaded = await loadEditReservation(tx, c, r);
        if (!loaded || loaded.job.kind === 'fence') conflict();
        const replay = await replayEditReservation(tx, loaded, 'reserveBookLoreEditUpload', r);
        if (replay) return replay;
        assertAnalysisChildUnit(tx, db, uid, 'edit', c.id);
        const j = loaded.job,
          intent = j.context.intent;
        if (j.phase !== 'preparing' || j.revision !== r.expectedRevision || j.compilation)
          conflict();
        assertIntentReservation(intent, r.target, r.upload);
        await editReservationSource(tx, c, intent, j.context);
        const uploadContext = fieldUploadPaths(db, uid, r.upload.uploadId),
          opening = await openSealedBookLoreFieldUpload(tx, uploadContext, r.upload),
          field = opening.loaded;
        if (
          field.job.materialization ||
          (intent.creation &&
            (digest(field.job.context.creation) !== digest(intent.creation) ||
              digest(field.job.context.creationBirth) !== digest(j.context.creationBirth))) ||
          field.job.context.bookId !== intent.bookId ||
          field.job.context.loreId !== intent.loreId ||
          field.job.context.sourceToken !== intent.sourceToken ||
          digest(opening.target) !== digest(r.target) ||
          digest(field.job.context.bookBirth) !== digest(j.context.bookBirth)
        )
          conflict();
        const slotId = editSlotId(r.target),
          ref = db.doc(c.path + '/slots/' + slotId),
          old = await tx.get(ref);
        if (old.exists) conflict();
        const slot = {
            schemaVersion: 1,
            ownerId: uid,
            editId: c.id,
            editToken: loaded.token,
            slotId,
            target: r.target,
            upload: r.upload,
            pointer: opening.pointer,
            operationId: r.operationId,
          },
          marker = reservedEditMarker(loaded, slot),
          generation = loaded.generation,
          plan = await prepareInventoryInitialization(tx, inventoryScope(db, uid, intent.bookId), {
            schemaVersion: 1,
            kind: 'body',
            ownerId: uid,
            bookId: intent.bookId,
            bookBirth: j.context.bookBirth,
            loreId: intent.loreId,
            bodyId: opening.pointer.manifest.bodyId,
            pointer: opening.pointer,
            selector:
              r.target.field === 'relations'
                ? { section: 'relations', page: r.target.page }
                : { section: 'field', field: r.target.field, page: 0 },
            initialGeneration: {
              generationId: generation.at.id,
              birth: born(generation.snapshot),
              token: generation.token,
            },
          }),
          fieldRequest = {
            ...r.upload,
            operationId: digest(['reserve-lore-edit-upload', loaded.token, r.operationId, slotId]),
            expectedRevision: field.job.revision,
            editToken: loaded.token,
            parentOperationId: r.operationId,
            slotId,
          };
        plan.commit();
        tx.create(ref, slot);
        commitFieldOperation(tx, field, 'reserveBookLoreEditUpload', fieldRequest, {
          phase: 'reserved',
          reservation: marker,
        });
        return commitEditReservation(tx, loaded, 'reserveBookLoreEditUpload', r, {
          reservedCount: j.reservedCount + 1,
        });
      });
    },
    ...createBookLoreEditReservationCleanup({ db, transaction }),
    ...createBookLoreEditCompilationService({ db, now, transaction }),
    ...(!transaction ? createBookLoreEditAdoptionService({ db, now }) : {}),
  };
  return service;
}
