import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  sum,
  nativeToken,
} from './adventureRestoreContracts.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import {
  prepareAdventureStageArtifacts,
  adventureStageArtifactId,
  readAdventureStageArtifact,
} from './adventureRestoreArtifacts.mjs';
import {
  projectAdventureRestoreImages,
  adventureImageStateAddress,
} from './adventureRestoreImageProjection.mjs';
import { validAdventureImageState } from './adventureRestoreImageMeta.mjs';
import { readAdventureRestorePersonaBatch } from './adventureRestorePersonaLibraryBatch.mjs';
export function createAdventureRestoreImagesService(store) {
  const action = 'advanceAdventureRestoreImages';
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      !['persona-library-ready', 'image-bytes'].includes(loaded.job.staging?.phase) ||
      loaded.job.staging.personaLibraryRevoked ||
      loaded.job.checkpoint !== request.expectedCheckpoint
    )
      restoreFail('failed-precondition', 'state-conflict');
  }
  async function artifact(tx, loaded, address) {
    return readAdventureStageArtifact(
      store,
      tx,
      loaded,
      await tx.get(
        store.db.doc(loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address)),
      ),
      { withValue: true },
    );
  }
  return {
    async advanceAdventureRestoreImages(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        fingerprint = requestHash(action, request);
      const initial = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists)
          return { replay: store.confirm(loaded, store.operation(op, loaded, fingerprint)) };
        available(loaded, request);
        await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing');
        let state = null;
        if (loaded.job.staging.imageStateCreated) {
          const saved = await artifact(tx, loaded, adventureImageStateAddress);
          if (
            !validAdventureImageState(saved.data) ||
            saved.data.ownerId !== uid ||
            saved.data.done === loaded.job.staging.imagePending ||
            saved.data.unitIndex > loaded.job.staging.imageIndex
          )
            inconsistent();
          state = { value: saved.data, token: nativeToken(saved.metadata) };
        }
        return { loaded, state };
      });
      if (initial.replay) return initial.replay;
      const first = initial.loaded.job.staging.phase === 'persona-library-ready',
        stage = first
          ? {
              ...initial.loaded.job.staging,
              phase: 'image-bytes',
              imageIndex: initial.loaded.job.staging.itemIndex,
              imageBindings: 0,
              imageAssets: 0,
              imageBytes: 0,
              imageFrames: 0,
              imageUnits: 0,
              imagePending: false,
              imageStateCreated: false,
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
        if (stage.imageIndex >= reader.itemCount) inconsistent();
        const unit = await reader.readItem(stage.imageIndex),
          mapper = createAdventureRestoreRemapper({
            schemaVersion: 1,
            jobToken: request.jobToken,
            sourceAdventureId: reader.sourceAdventureId,
            adventureId: reader.adventureId,
          });
        plan = await projectAdventureRestoreImages({
          loaded: initial.loaded,
          stage,
          unit,
          reader,
          mapper,
          previousState: initial.state?.value ?? null,
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
        await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing');
        for (const proof of plan.proofs) await proof.verify(tx);
        if (initial.state) {
          const current = await artifact(tx, loaded, adventureImageStateAddress);
          if (nativeToken(current.metadata) !== initial.state.token) inconsistent();
        }
        for (const check of plan.checks)
          check.verify((await artifact(tx, loaded, check.address)).data);
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
