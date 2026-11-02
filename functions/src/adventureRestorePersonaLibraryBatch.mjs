import { inconsistent, digest, nativeToken } from './adventureRestoreContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { readPersonaRestoreBatchProof } from './personaAvailability.mjs';
import { adventurePersonaLibraryPhase } from './adventureRestorePersonaLibraryMeta.mjs';

export const adventureRestorePersonaOrigin = (loaded) => ({
  schemaVersion: 2,
  target: { kind: 'adventure', id: loaded.job.adventureId },
  restoreId: loaded.id,
  jobToken: loaded.view.jobToken,
});
export const adventureRestorePersonaBatchRef = (store, loaded) =>
  store.db.doc('users/' + loaded.uid + '/aiPersonaRestoreBatches/' + loaded.job.adventureId);
const profiles = (store, loaded) =>
  store.db
    .collection('users/' + loaded.uid + '/aiPersonas')
    .where('restoreOrigin.target.id', '==', loaded.job.adventureId)
    .select()
    .limit(1);
const profileJournals = (store, loaded) =>
  store.db
    .collection(loaded.ref.path + '/stagingArtifacts')
    .where('address.scope', '==', 'persona')
    .select()
    .limit(1);
export function adventurePersonaBatchEffect(store, loaded, value) {
  return store.effect('persona-library-batch', loaded.job.adventureId, value);
}
export async function assertAdventurePersonaLibraryEmpty(store, tx, loaded) {
  const [batch, rows, journals] = await Promise.all([
    readWorkMetadata(tx, adventureRestorePersonaBatchRef(store, loaded), []),
    tx.get(profiles(store, loaded)),
    tx.get(profileJournals(store, loaded)),
  ]);
  if (batch.exists || rows.docs.length || journals.docs.length) inconsistent();
}
export async function readAdventureRestorePersonaBatch(store, tx, loaded, state) {
  if (!adventurePersonaLibraryPhase(loaded.job.staging ?? {})) inconsistent();
  const proof = await readPersonaRestoreBatchProof(
    tx,
    store.db,
    loaded.uid,
    adventureRestorePersonaOrigin(loaded),
    state,
  );
  if (
    !proof ||
    proof.value.profileCount !== loaded.job.staging.personaLibraryInstalled ||
    (state === 'cancelled') !== loaded.job.staging.personaLibraryRevoked
  )
    inconsistent();
  const full = await tx.get(adventureRestorePersonaBatchRef(store, loaded));
  if (
    nativeToken(full) !== nativeToken(proof.snapshot) ||
    digest(full.data()) !== digest(proof.value)
  )
    inconsistent();
  const first = await tx.get(proof.first.ref),
    last = first.id === proof.last.id ? first : await tx.get(proof.last.ref),
    created = store.operation(first, loaded),
    updated = store.operation(last, loaded),
    owns = (snapshot) =>
      snapshot
        .data()
        .effects.some(
          (e) => e.collection === 'persona-library-batch' && e.id === loaded.job.adventureId,
        );
  if (
    !owns(first) ||
    !owns(last) ||
    created.action !== 'advanceAdventureRestorePersonaLibrary' ||
    updated.checkpoint > loaded.job.checkpoint ||
    !last
      .data()
      .effects.some(
        (e) =>
          e.collection === 'persona-library-batch' &&
          e.id === loaded.job.adventureId &&
          e.hash === digest(proof.value),
      )
  )
    inconsistent();
  return { ...proof, snapshot: full };
}
export async function prepareAdventurePersonaLibraryRevocation(store, tx, loaded, request) {
  if (
    !adventurePersonaLibraryPhase(loaded.job.staging ?? {}) ||
    loaded.job.staging.personaLibraryRevoked
  )
    return null;
  if (loaded.job.state !== 'cancelling') inconsistent();
  const { value } = await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing'),
    batch = { ...value, state: 'cancelled', lastOperationId: request.operationId };
  return {
    batch,
    staging: { ...loaded.job.staging, personaLibraryRevoked: true },
    effects: [adventurePersonaBatchEffect(store, loaded, batch)],
    commit() {
      tx.set(adventureRestorePersonaBatchRef(store, loaded), batch);
    },
  };
}
export async function assertAdventurePersonaLibraryClean(store, tx, loaded) {
  if (!adventurePersonaLibraryPhase(loaded.job.staging ?? {}))
    return assertAdventurePersonaLibraryEmpty(store, tx, loaded);
  await readAdventureRestorePersonaBatch(store, tx, loaded, 'cancelled');
  const [rows, journals] = await Promise.all([
    tx.get(profiles(store, loaded)),
    tx.get(profileJournals(store, loaded)),
  ]);
  if (rows.docs.length || journals.docs.length) inconsistent();
}
