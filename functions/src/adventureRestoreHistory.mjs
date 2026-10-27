import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  sum,
} from './adventureRestoreContracts.mjs';
import { nativeToken } from './adventureRestoreContracts.mjs';
import { validAdventureTextState, historyViewKeys } from './adventureRestoreHistoryMeta.mjs';
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
import {
  projectAdventureRestoreHistory,
  adventureHistoryTextAddress,
} from './adventureRestoreHistoryProjection.mjs';
export function createAdventureRestoreHistoryService(store) {
  const action = 'advanceAdventureRestoreHistory';
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      !['profiles-ready', 'history'].includes(loaded.job.staging?.phase)
    )
      restoreFail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      restoreFail('failed-precondition', 'checkpoint-conflict');
  }
  return {
    async advanceAdventureRestoreHistory(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        fingerprint = requestHash(action, request);
      const initial = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists)
          return { replay: store.confirm(loaded, store.operation(op, loaded, fingerprint)) };
        available(loaded, request);
        let state = null;
        if (loaded.job.staging?.textStateCreated) {
          const artifact = await readAdventureStageArtifact(
            store,
            tx,
            loaded,
            await tx.get(
              store.db.doc(
                loaded.ref.path +
                  '/stagingArtifacts/' +
                  adventureStageArtifactId(adventureHistoryTextAddress),
              ),
            ),
            { withValue: true },
          );
          if (
            !validAdventureTextState(artifact.data) ||
            artifact.data.ownerId !== uid ||
            (loaded.job.staging.historyPending
              ? artifact.data.done || artifact.data.unitIndex !== loaded.job.staging.itemIndex
              : !artifact.data.done || artifact.data.unitIndex >= loaded.job.staging.itemIndex)
          )
            inconsistent();
          state = { value: artifact.data, token: nativeToken(artifact.metadata) };
        }
        return { loaded, state };
      });
      if (initial.replay) return initial.replay;
      const first = initial.loaded.job.staging.phase === 'profiles-ready',
        stage = first
          ? {
              ...initial.loaded.job.staging,
              phase: 'history',
              ...Object.fromEntries(historyViewKeys.map((k) => [k, 0])),
              historyStartIndex: initial.loaded.job.staging.itemIndex,
              historySection: 'universe',
              historyPending: false,
              textStateCreated: false,
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
        plan = await projectAdventureRestoreHistory({
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
        for (const proof of plan.proofs) await proof.verify(tx);
        if (initial.state) {
          const current = await readAdventureStageArtifact(
            store,
            tx,
            loaded,
            await tx.get(
              store.db.doc(
                loaded.ref.path +
                  '/stagingArtifacts/' +
                  adventureStageArtifactId(adventureHistoryTextAddress),
              ),
            ),
            { withValue: true },
          );
          if (nativeToken(current.metadata) !== initial.state.token) inconsistent();
        }
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
          staging = { ...plan.next, artifactCount: sum(stage.artifactCount, artifacts.count) },
          record = store.next(loaded, request, action, { staging });
        artifacts.commit();
        return store.commit(tx, loaded, request, action, record, artifacts.effects);
      });
    },
  };
}
