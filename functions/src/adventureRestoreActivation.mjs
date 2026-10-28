import {
  authorize,
  mutationInput,
  restoreHash,
  requestHash,
  restoreFail,
  parseJob,
  restoreDate,
} from './adventureRestoreContracts.mjs';
import {
  adventureActivationItems,
  prepareAdventureActivationReview,
  verifyAdventureActivationSeal,
} from './adventureRestoreActivationReview.mjs';
import {
  adventureRestorePersonaBatchRef,
  adventurePersonaBatchEffect,
} from './adventureRestorePersonaLibraryBatch.mjs';
const ACTIVATE = 'activateAdventureRestore',
  RETIRE = 'retireAdventureRestoreActivation';
export function createAdventureRestoreActivationService(store) {
  const requestFor = (input) => ({
    ...mutationInput(input, ['reviewToken']),
    reviewToken: restoreHash(input.reviewToken),
  });
  async function resolved(tx, loaded, request) {
    const op = await tx.get(store.refs.op(loaded.uid, request.operationId));
    return op.exists
      ? store.confirm(loaded, store.operation(op, loaded, requestHash(ACTIVATE, request)))
      : null;
  }
  function checkpoint(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      loaded.job.checkpoint !== request.expectedCheckpoint
    )
      restoreFail('failed-precondition', 'state-conflict');
  }
  return {
    async retireAdventureRestoreActivation(uid, input) {
      authorize(uid);
      const request = Object.freeze(requestFor(input));
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          replay = await resolved(tx, loaded, request);
        if (replay) return replay;
        checkpoint(loaded, request);
        await verifyAdventureActivationSeal(store, tx, loaded);
        const staging = { ...loaded.job.staging, auditSealOperationId: request.operationId },
          record = store.next(loaded, request, RETIRE, { staging }, ACTIVATE);
        return store.commit(tx, loaded, request, RETIRE, record, [], null, ACTIVATE);
      });
    },
    async activateAdventureRestore(uid, input) {
      authorize(uid);
      const request = Object.freeze(requestFor(input));
      const initial = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          replay = await resolved(tx, loaded, request);
        if (replay) return replay;
        checkpoint(loaded, request);
        await verifyAdventureActivationSeal(store, tx, loaded);
        return null;
      });
      if (initial) return initial;
      let items;
      try {
        items = await adventureActivationItems(store, uid, request);
      } catch (error) {
        let replay;
        try {
          replay = await store.db.runTransaction(async (tx) =>
            resolved(tx, await store.load(tx, uid, request.restoreId, request.jobToken), request),
          );
        } catch {
          /* Preserve the source failure. */
        }
        if (replay) return replay;
        throw error;
      }
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          replay = await resolved(tx, loaded, request);
        if (replay) return replay;
        checkpoint(loaded, request);
        const reviewed = await prepareAdventureActivationReview(store, tx, loaded, items);
        if (reviewed.result.reviewToken !== request.reviewToken)
          restoreFail('failed-precondition', 'activation-review-changed');
        const record = store.next(loaded, request, ACTIVATE);
        record.state = 'activated';
        record.activation = {
          schemaVersion: 1,
          operationId: request.operationId,
          requestHash: requestHash(ACTIVATE, request),
          reviewToken: request.reviewToken,
          sourceCheckpoint: request.expectedCheckpoint,
          activatedAt: record.updatedAt,
          mediaState: loaded.job.staging.imageAssets ? 'pending' : 'none',
        };
        const checked = parseJob(record, uid, loaded.id),
          root = {
            ...reviewed.root.data.value,
            ownerId: uid,
            universeId: reviewed.universe.universeId,
            updatedAt: restoreDate(() => record.updatedAt, reviewed.root.data.value.updatedAt),
            restoreOrigin: {
              schemaVersion: 1,
              restoreId: loaded.id,
              jobToken: loaded.view.jobToken,
              activationOperationId: request.operationId,
            },
          },
          control = { ...reviewed.control.data, countReady: true },
          batch = {
            ...reviewed.batch.value,
            state: 'active',
            lastOperationId: request.operationId,
          };
        const effects = [
          store.effect('root', loaded.job.adventureId, root),
          adventurePersonaBatchEffect(store, loaded, batch),
        ];
        reviewed.universe.commit();
        tx.set(store.refs.root(loaded.job.adventureId), root);
        tx.update(reviewed.control.targetRef, control);
        tx.set(adventureRestorePersonaBatchRef(store, loaded), batch);
        return store.commit(tx, loaded, request, ACTIVATE, checked, effects);
      });
    },
  };
}
