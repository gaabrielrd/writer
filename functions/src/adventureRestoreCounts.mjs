import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  sum,
  digest,
} from './adventureRestoreContracts.mjs';
import { ADVENTURE_COUNT_PHASES } from './adventureRestoreCountMeta.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
import { prepareAdventureStageArtifacts } from './adventureRestoreArtifacts.mjs';
import { readAdventureRestorePersonaBatch } from './adventureRestorePersonaLibraryBatch.mjs';
import { projectAdventureRestoreStructure } from './adventureRestoreStructureProjection.mjs';
import { projectAdventureRestoreResource } from './adventureRestoreResourceProjection.mjs';
import { createAdventureRestoreCountEffects } from './adventureRestoreCountEffects.mjs';
export function createAdventureRestoreCountsService(store) {
  const action = 'advanceAdventureRestoreCounts',
    effects = createAdventureRestoreCountEffects(store);
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      !['image-storage-ready', ...ADVENTURE_COUNT_PHASES.slice(0, -1)].includes(
        loaded.job.staging?.phase,
      ) ||
      loaded.job.staging.personaLibraryRevoked ||
      loaded.job.checkpoint !== request.expectedCheckpoint
    )
      restoreFail('failed-precondition', 'state-conflict');
  }
  async function resolved(tx, loaded, request) {
    const op = await tx.get(store.refs.op(loaded.uid, request.operationId));
    return op.exists
      ? store.confirm(loaded, store.operation(op, loaded, requestHash(action, request)))
      : null;
  }
  return {
    async advanceAdventureRestoreCounts(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        initial = await store.db.runTransaction(async (tx) => {
          const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
            replay = await resolved(tx, loaded, request);
          if (replay) return { replay };
          available(loaded, request);
          await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing');
          return { loaded };
        });
      if (initial.replay) return initial.replay;
      const first = initial.loaded.job.staging.phase === 'image-storage-ready',
        stage = first
          ? {
              ...initial.loaded.job.staging,
              phase: 'counts-blocks',
              countIndex: initial.loaded.job.staging.resourceStartIndex,
              countBlocks: 0,
              countScenes: 0,
              countLinks: 0,
              countWordCount: 0,
            }
          : structuredClone(initial.loaded.job.staging);
      let plan;
      try {
        const reader = await createVerifiedAdventureRestoreContent({
            db: store.db,
            uid,
            restoreId: request.restoreId,
            jobToken: request.jobToken,
          }),
          unit = await reader.readItem(stage.countIndex),
          mapper = createAdventureRestoreRemapper({
            schemaVersion: 1,
            jobToken: request.jobToken,
            sourceAdventureId: reader.sourceAdventureId,
            adventureId: reader.adventureId,
          }),
          value = (await mapper.mapJSON(unit.record, unit.value)).value;
        plan = { unit, value, expected: null, proofs: [unit] };
        if (
          unit.record.kind === 'adventure-resource' &&
          ((stage.phase === 'counts-blocks' && value.kind === 'block') ||
            (stage.phase === 'counts-scenes' && value.kind === 'scene'))
        ) {
          plan.expected = await projectAdventureRestoreStructure({
            uid,
            adventureId: reader.adventureId,
            stage,
            unit,
            mapper,
            reader,
          });
        } else if (
          unit.record.kind === 'adventure-resource' &&
          ((stage.phase === 'counts-scenes' &&
            ['arc', 'event', 'milestone'].includes(value.kind)) ||
            (stage.phase === 'counts-links' && value.kind === 'narrative-link'))
        ) {
          plan.expected = await projectAdventureRestoreResource({
            uid,
            stage,
            unit,
            mapper,
            reader,
          });
        }
        if (plan.expected) plan.proofs = plan.expected.proofs;
      } catch (error) {
        let replay;
        try {
          replay = await store.db.runTransaction(async (tx) => {
            const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
            return resolved(tx, loaded, request);
          });
        } catch {
          /* Preserve the original source failure. */
        }
        if (replay) return replay;
        throw error;
      }
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          replay = await resolved(tx, loaded, request);
        if (replay) return replay;
        available(loaded, request);
        assertAdventureValidationPin(loaded, initial.loaded);
        await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing');
        for (const proof of plan.proofs) await proof.verify(tx);
        const next = structuredClone(stage);
        let writes = [];
        if (plan.unit.record.kind === 'adventure-resources') {
          if (
            next.countIndex + 1 !== next.resourceIndex ||
            digest(plan.unit.value.counts) !== digest(next.resourceCounts)
          )
            inconsistent();
          const position = ADVENTURE_COUNT_PHASES.indexOf(next.phase);
          if (
            (position === 0 && next.countBlocks !== next.blocks) ||
            (position === 1 && next.countScenes !== next.scenes) ||
            (position === 2 && next.countLinks !== next.resourceCounts['narrative-link'])
          )
            inconsistent();
          next.phase = ADVENTURE_COUNT_PHASES[position + 1];
          next.countIndex =
            next.phase === 'counts-ready' ? next.resourceIndex : next.resourceStartIndex;
          if (next.phase === 'counts-ready') writes = await effects.finish(tx, loaded, next);
        } else {
          if (
            plan.unit.record.kind !== 'adventure-resource' ||
            next.countIndex >= next.resourceIndex - 1
          )
            inconsistent();
          if (plan.expected) {
            const method =
              next.phase === 'counts-blocks'
                ? 'block'
                : next.phase === 'counts-links'
                  ? 'link'
                  : plan.value.kind === 'scene'
                    ? 'scene'
                    : 'sequence';
            writes = await effects[method](tx, loaded, plan, next);
          }
          next.countIndex++;
        }
        const artifacts = await prepareAdventureStageArtifacts(
            store,
            tx,
            loaded,
            request.operationId,
            writes,
            digest(plan.proofs.map((p) => p.sourceToken)),
          ),
          staging = { ...next, artifactCount: sum(next.artifactCount, artifacts.count) },
          record = store.next(loaded, request, action, { staging });
        artifacts.commit();
        return store.commit(tx, loaded, request, action, record, artifacts.effects);
      });
    },
  };
}
