import {
  authorize,
  mutationInput,
  restoreHash,
  requestHash,
  inconsistent,
  restoreFail as fail,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import { prepareBookRestoreActivationReview } from './bookRestoreActivationReview.mjs';
import { prepareBookRestoreUniverseLink } from './bookRestoreUniverse.mjs';
import { prepareBookRestoreActivationEffects } from './bookRestoreActivationEffects.mjs';
const action = 'activateBookRestore';
export function createBookRestoreActivationService({
  db,
  assets,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
  keyContext,
}) {
  return {
    async activateBookRestore(uid, input) {
      authorize(uid);
      const request = {
          ...mutationInput(input, ['reviewToken']),
          reviewToken: restoreHash(input.reviewToken),
        },
        fingerprint = requestHash(action, request),
        opRef = db.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId);
      async function resolved(tx, loaded) {
        const op = await tx.get(opRef);
        return op.exists
          ? confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded))
          : null;
      }
      function available(loaded) {
        if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
        if (loaded.job.checkpoint !== request.expectedCheckpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        if (
          loaded.job.preparation?.schemaVersion !== 13 ||
          loaded.job.preparation.phase !== 'activation-ready'
        )
          fail('failed-precondition', 'activation-phase-conflict');
      }
      const initial = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          answer = await resolved(tx, loaded);
        if (answer) return { answer };
        available(loaded);
        return { loaded };
      });
      if (initial.answer) return initial.answer;
      try {
        const reader = await createVerifiedBookRestoreContent({
            db,
            uid,
            id: request.restoreId,
            token: request.jobToken,
            load,
          }),
          p = initial.loaded.job.preparation,
          items = {
            metadata: await reader.readMappedItem(0),
            universe: await reader.readMappedItem(p.universe.itemIndex),
            cover: await reader.readMappedItem(p.cover.startIndex),
          };
        async function decision(tx, loaded) {
          available(loaded);
          const result = await prepareBookRestoreActivationReview(tx, db, loaded, items, readOp);
          if (result.result.reviewToken !== request.reviewToken)
            fail('failed-precondition', 'activation-review-changed');
          return result;
        }
        const before = await db.runTransaction(async (tx) =>
          decision(tx, await load(tx, uid, request.restoreId, request.jobToken)),
        );
        if (before.storageContext) {
          if (typeof assets?.verify !== 'function')
            fail('failed-precondition', 'cover-storage-unavailable');
          if (
            digest(await assets.verify(before.storageContext, before.storageProof)) !==
            digest(before.storageProof)
          )
            inconsistent();
        }
        return await db.runTransaction(async (tx) => {
          const loaded = await load(tx, uid, request.restoreId, request.jobToken),
            answer = await resolved(tx, loaded);
          if (answer) return answer;
          const reviewed = await decision(tx, loaded),
            record = next(loaded.job, request, { state: 'activated', recoveryReady: false });
          record.activation = {
            schemaVersion: 1,
            operationId: request.operationId,
            requestHash: fingerprint,
            reviewToken: request.reviewToken,
            sourceCheckpoint: request.expectedCheckpoint,
            activatedAt: record.updatedAt,
            mediaState: reviewed.cover.kind === 'library' ? 'pending' : 'none',
          };
          const universe = await prepareBookRestoreUniverseLink(
            tx,
            db,
            loaded,
            items.universe,
            () => record.updatedAt,
          );
          if (
            universe.observed !== reviewed.universe.observed ||
            universe.universeId !== reviewed.universe.universeId
          )
            fail('failed-precondition', 'activation-review-changed');
          const effects = await prepareBookRestoreActivationEffects(
              tx,
              db,
              loaded,
              items.metadata,
              reviewed,
              request,
              record,
            ),
            keyRef = db.doc('users/' + uid + '/bookRestoreRecoveryKeys/' + request.restoreId),
            key = await tx.get(keyRef);
          if (key.exists) keyContext(key.data(), loaded);
          effects.commit();
          universe.commit();
          tx.delete(keyRef);
          tx.update(loaded.ref, record);
          const receipt = writeOp(
            tx,
            uid,
            request.restoreId,
            action,
            request,
            record,
            loaded.view.jobToken,
          );
          return confirmed(
            { ...loaded, view: { ...loaded.view, ...pickProgress(record) } },
            receipt,
          );
        });
      } catch (error) {
        const answer = await db.runTransaction(async (tx) =>
          resolved(tx, await load(tx, uid, request.restoreId, request.jobToken)),
        );
        if (answer) return answer;
        throw error;
      }
    },
  };
}
