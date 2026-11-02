import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  sum,
} from './adventureRestoreContracts.mjs';
import { adventureIdentityToken } from './adventureLoreContracts.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  prepareAdventureStageArtifacts,
  adventureStageArtifactId,
  readAdventureStageArtifact,
  adventureStageTarget,
} from './adventureRestoreArtifacts.mjs';
import { projectAdventureRestoreProfiles } from './adventureRestoreProfileProjection.mjs';
export function createAdventureRestoreProfilesService(store) {
  const action = 'advanceAdventureRestoreProfiles';
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      !['resources-ready', 'lore', 'personas'].includes(loaded.job.staging?.phase)
    )
      restoreFail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      restoreFail('failed-precondition', 'checkpoint-conflict');
  }
  return {
    async advanceAdventureRestoreProfiles(uid, input) {
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
      const first = initial.loaded.job.staging.phase === 'resources-ready',
        stage = first
          ? {
              ...initial.loaded.job.staging,
              phase: 'lore',
              loreHeads: 0,
              loreBodies: 0,
              personaAdventureBindings: 0,
              personaSceneBindings: 0,
              personaProfiles: 0,
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
        if (stage.itemIndex >= reader.itemCount) inconsistent();
        const unit = await reader.readItem(stage.itemIndex),
          mapper = createAdventureRestoreRemapper({
            schemaVersion: 1,
            jobToken: request.jobToken,
            sourceAdventureId: reader.sourceAdventureId,
            adventureId: reader.adventureId,
          });
        // load proves that the reserved root and job have the same native birth.
        const adventureToken = adventureIdentityToken(
          uid,
          reader.adventureId,
          initial.loaded.snapshot,
        );
        plan = await projectAdventureRestoreProfiles({
          uid,
          adventureId: reader.adventureId,
          adventureToken,
          stage,
          unit,
          mapper,
          reader,
          first,
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
        for (const proof of plan.proofs) await proof.verify(tx);
        for (const address of plan.absent)
          if (
            (
              await readWorkMetadata(tx, adventureStageTarget(store, loaded, address), [
                'schemaVersion',
              ])
            ).exists
          )
            inconsistent();
        for (const check of plan.checks) {
          const entry = await readAdventureStageArtifact(
            store,
            tx,
            loaded,
            await tx.get(
              store.db.doc(
                loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(check.address),
              ),
            ),
            { withValue: true },
          );
          check.verify(entry.data);
        }
        const artifacts = await prepareAdventureStageArtifacts(
            store,
            tx,
            loaded,
            request.operationId,
            plan.writes,
            plan.sourceToken,
          ),
          profileCreated =
            plan.profileAddress !== null &&
            artifacts.effects.some(
              (e) =>
                e.collection === 'stagingArtifacts' &&
                e.id === adventureStageArtifactId(plan.profileAddress),
            ),
          staging = {
            ...plan.next,
            personaProfiles: sum(stage.personaProfiles, Number(profileCreated)),
            artifactCount: sum(stage.artifactCount, artifacts.count),
          },
          record = store.next(loaded, request, action, { staging });
        artifacts.commit();
        return store.commit(tx, loaded, request, action, record, artifacts.effects);
      });
    },
  };
}
