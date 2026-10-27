import { readWorkMetadata } from './workProgressContracts.mjs';
import { inconsistent, sum } from './adventureRestoreContracts.mjs';
import {
  readAdventureStageArtifact,
  checkAdventureStageChildren,
} from './adventureRestoreArtifacts.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import { adventureStageArtifactId, adventureStageTarget } from './adventureRestoreArtifacts.mjs';
/** Check source-derived head namespaces before discarding the validation index, including heads never created. */
export async function checkAdventureStageSourceIndex(store, tx, loaded, snapshot) {
  if (loaded.job.validation?.phase !== 'verified') return;
  const key = snapshot.data()?.key;
  if (
    !Array.isArray(key) ||
    key.length !== 4 ||
    key[0] !== 'resource' ||
    !['scene', 'block'].includes(key[1]) ||
    key[2] !== ''
  )
    return;
  const mapper = createAdventureRestoreRemapper({
      schemaVersion: 1,
      jobToken: loaded.view.jobToken,
      sourceAdventureId: loaded.job.validation.summary.sourceAdventureId,
      adventureId: loaded.job.adventureId,
    }),
    address = {
      scope: 'adventure',
      path: [key[1] === 'scene' ? 'scenes' : 'sceneBlocks', mapper.identity(key[1], key[3])],
    },
    head = await readWorkMetadata(tx, adventureStageTarget(store, loaded, address), [
      'schemaVersion',
      'ownerId',
    ]),
    journal = await tx.get(
      store.db.doc(loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address)),
    );
  if (head.exists || journal.exists) await readAdventureStageArtifact(store, tx, loaded, journal);
  await checkAdventureStageChildren(store, tx, loaded, address, true);
}
export async function prepareAdventureStagingCleanup(store, tx, loaded, name, page) {
  const staging = loaded.job.staging;
  if (name === 'preparedRoot') {
    // Journaled definitions have already been deleted; never adopt an unjournaled definition.
    if (page.docs.length) inconsistent();
    return { cleaned: 0, expected: 0, patch: {}, commit() {} };
  }
  if (name !== 'stagingArtifacts' || (page.docs.length && !staging)) inconsistent();
  const plans = [];
  for (const snapshot of page.docs) {
    const entry = await readAdventureStageArtifact(store, tx, loaded, snapshot);
    await checkAdventureStageChildren(store, tx, loaded, entry.address, true);
    plans.push({ target: entry.targetRef, journal: snapshot.ref });
  }
  const cleaned = staging?.cleanedArtifacts ?? 0,
    expected = staging?.artifactCount ?? 0;
  return {
    cleaned,
    expected,
    patch: staging
      ? { staging: { ...staging, cleanedArtifacts: sum(cleaned, page.docs.length) } }
      : {},
    commit() {
      for (const p of plans) {
        tx.delete(p.target);
        tx.delete(p.journal);
      }
    },
  };
}
