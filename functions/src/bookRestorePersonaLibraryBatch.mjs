import { inconsistent } from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { readPersonaRestoreBatchProof } from './personaAvailability.mjs';
export const bookRestorePersonaOrigin = (loaded) => ({
  schemaVersion: 1,
  bookId: loaded.job.bookId,
  restoreId: loaded.job.restoreId,
  jobToken: loaded.view.jobToken,
});
export const bookRestorePersonaBatchRef = (db, loaded) =>
  db.doc('users/' + loaded.job.ownerId + '/aiPersonaRestoreBatches/' + loaded.job.bookId);
const rows = (db, loaded) =>
  db
    .collection('users/' + loaded.job.ownerId + '/aiPersonas')
    .where('restoreOrigin.bookId', '==', loaded.job.bookId)
    .select()
    .limit(1);
const journals = (db, loaded) =>
  db
    .collection(loaded.ref.path + '/materializationArtifacts')
    .where('kind', '==', 'persona-library-profile')
    .select()
    .limit(1);
export async function assertBookRestorePersonaLibraryNamespaceEmpty(tx, db, loaded) {
  const [batch, profiles, artifacts] = await Promise.all([
    readWorkMetadata(tx, bookRestorePersonaBatchRef(db, loaded), []),
    tx.get(rows(db, loaded)),
    tx.get(journals(db, loaded)),
  ]);
  if (batch.exists || profiles.docs.length || artifacts.docs.length) inconsistent();
}
export async function readBookRestorePersonaLibraryBatch(tx, db, loaded, state) {
  const proof = await readPersonaRestoreBatchProof(
    tx,
    db,
    loaded.job.ownerId,
    bookRestorePersonaOrigin(loaded),
    state,
  );
  if (
    !proof ||
    proof.value.profileCount !== loaded.job.preparation.personaLibrary.installed ||
    [proof.first, proof.last].some(
      (snapshot) => snapshot.data().receipt.checkpoint > loaded.job.checkpoint,
    )
  )
    inconsistent();
  return proof;
}
export async function assertBookRestorePersonaLibraryClean(tx, db, loaded) {
  await readBookRestorePersonaLibraryBatch(tx, db, loaded, 'cancelled');
  const [profiles, artifacts] = await Promise.all([
    tx.get(rows(db, loaded)),
    tx.get(journals(db, loaded)),
  ]);
  if (profiles.docs.length || artifacts.docs.length) inconsistent();
}
