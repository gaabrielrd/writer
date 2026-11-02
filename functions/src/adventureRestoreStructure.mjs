import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  restoreDate,
  sum,
} from './adventureRestoreContracts.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import {
  assertAdventureStagingEmpty,
  prepareAdventureStageArtifacts,
} from './adventureRestoreArtifacts.mjs';
import { projectAdventureRestoreStructure } from './adventureRestoreStructureProjection.mjs';
export function createAdventureRestoreStructureService(store) {
  const action = 'advanceAdventureRestoreStructure';
  const available = (loaded, request) => {
    if (
      loaded.job.state !== 'content-verified' ||
      (loaded.job.staging && loaded.job.staging.phase !== 'structure')
    )
      restoreFail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      restoreFail('failed-precondition', 'checkpoint-conflict');
  };
  return {
    async advanceAdventureRestoreStructure(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        fingerprint = requestHash(action, request);
      const begin = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists)
          return { replay: store.confirm(loaded, store.operation(op, loaded, fingerprint)) };
        available(loaded, request);
        if (!loaded.job.staging) await assertAdventureStagingEmpty(store, tx, loaded);
        return { loaded };
      });
      if (begin.replay) return begin.replay;
      const initial = begin.loaded,
        stage = initial.job.staging ?? {
          version: 1,
          phase: 'structure',
          itemIndex: 0,
          resourceStartIndex: null,
          artifactCount: 0,
          cleanedArtifacts: 0,
          parts: 0,
          scenes: 0,
          blocks: 0,
          timestamp: restoreDate(store.now, initial.job.updatedAt),
        };
      let plan;
      try {
        const reader = await createVerifiedAdventureRestoreContent({
          db: store.db,
          uid,
          restoreId: request.restoreId,
          jobToken: request.jobToken,
        });
        if (stage.itemIndex >= reader.itemCount) inconsistent();
        const unit = await reader.readItem(stage.itemIndex),
          mapper = createAdventureRestoreRemapper({
            schemaVersion: 1,
            jobToken: request.jobToken,
            sourceAdventureId: reader.sourceAdventureId,
            adventureId: reader.adventureId,
          });
        plan = await projectAdventureRestoreStructure({
          uid,
          adventureId: reader.adventureId,
          stage,
          unit,
          mapper,
          reader,
        });
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
          /* Keep the original I/O/identity/compatibility failure. */
        }
        if (replay) return replay;
        throw error;
      }
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
        available(loaded, request);
        assertAdventureValidationPin(loaded, initial);
        for (const proof of plan.proofs) await proof.verify(tx);
        if (!loaded.job.staging) await assertAdventureStagingEmpty(store, tx, loaded);
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
