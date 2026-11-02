import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  sum,
} from './adventureRestoreContracts.mjs';
import { adventureCoreCounts } from './adventureArchiveCore.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import { prepareAdventureStageArtifacts } from './adventureRestoreArtifacts.mjs';
import { projectAdventureRestoreResource } from './adventureRestoreResourceProjection.mjs';
export function createAdventureRestoreResourcesService(store) {
  const action = 'advanceAdventureRestoreResources';
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      !['structure-ready', 'resources'].includes(loaded.job.staging?.phase)
    )
      restoreFail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      restoreFail('failed-precondition', 'checkpoint-conflict');
  }
  return {
    async advanceAdventureRestoreResources(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        fingerprint = requestHash(action, request);
      const initial = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists)
          return { replay: store.confirm(loaded, store.operation(op, loaded, fingerprint)) };
        available(loaded, request);
        return { loaded };
      });
      if (initial.replay) return initial.replay;
      const first = initial.loaded.job.staging.phase === 'structure-ready',
        stage = first
          ? {
              ...initial.loaded.job.staging,
              phase: 'resources',
              resourceIndex: initial.loaded.job.staging.resourceStartIndex,
              resourcesProcessed: 0,
              resourceCounts: adventureCoreCounts('resources'),
              checklistTotal: 0,
              checklistCompleted: 0,
            }
          : initial.loaded.job.staging;
      let plan;
      try {
        const reader = await createVerifiedAdventureRestoreContent({
          db: store.db,
          uid,
          restoreId: request.restoreId,
          jobToken: request.jobToken,
        });
        if (stage.resourceIndex >= stage.itemIndex || stage.resourceIndex >= reader.itemCount)
          inconsistent();
        const unit = await reader.readItem(stage.resourceIndex),
          mapper = createAdventureRestoreRemapper({
            schemaVersion: 1,
            jobToken: request.jobToken,
            sourceAdventureId: reader.sourceAdventureId,
            adventureId: reader.adventureId,
          });
        plan = await projectAdventureRestoreResource({ uid, stage, unit, mapper, reader, first });
      } catch (error) {
        let replay = null;
        try {
          replay = await store.db.runTransaction(async (tx) => {
            const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
              op = await tx.get(store.refs.op(uid, request.operationId));
            return op.exists
              ? store.confirm(loaded, store.operation(op, loaded, fingerprint))
              : null;
          });
        } catch {
          /* Preserve the original preparation failure. */
        }
        if (replay) return replay;
        throw error;
      }
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
        available(loaded, request);
        assertAdventureValidationPin(loaded, initial.loaded);
        for (const proof of plan.proofs) await proof.verify(tx);
        const artifacts = await prepareAdventureStageArtifacts(
            store,
            tx,
            loaded,
            request.operationId,
            plan.writes,
            plan.sourceToken,
          ),
          staging = { ...plan.next, artifactCount: sum(stage.artifactCount, artifacts.count) },
          record = store.next(loaded, request, action, { staging });
        artifacts.commit();
        return store.commit(tx, loaded, request, action, record, artifacts.effects);
      });
    },
  };
}
