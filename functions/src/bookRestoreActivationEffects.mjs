import { digest } from './sceneContracts.mjs';
import { inconsistent } from './bookRestoreUploadContracts.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { projectPersonaRestoreBatch } from './personaAvailabilityContracts.mjs';
/** Bounded effects. The caller must authenticate the final review in this transaction. */
export async function prepareBookRestoreActivationEffects(
  tx,
  db,
  loaded,
  metadata,
  decision,
  request,
  record,
) {
  const p = loaded.job.preparation,
    uid = loaded.job.ownerId,
    bookId = loaded.job.bookId,
    timestamp = record.updatedAt,
    original = metadata.value.book,
    restoreOrigin = {
      schemaVersion: 1,
      restoreId: loaded.job.restoreId,
      jobToken: loaded.view.jobToken,
      activationOperationId: request.operationId,
    };
  if (p.personas.bindings.book === 1) {
    const binding = await readBookRestoreArtifact(
        tx,
        db,
        loaded,
        'persona-binding',
        digest(['book', bookId]),
      ),
      personaId = binding.value.personaId,
      definition = await readBookRestoreArtifact(tx, db, loaded, 'persona-definition', personaId),
      profile = await readBookRestoreArtifact(tx, db, loaded, 'persona-library-profile', personaId),
      { restoreOrigin: profileOrigin, ...profileData } = profile.value;
    if (
      binding.value.scope !== 'book' ||
      binding.value.ownerId !== bookId ||
      personaId !== original.personaId ||
      binding.value.profileHash !== definition.value.profileHash ||
      digest(definition.value.profile) !== binding.value.profileHash ||
      profile.value.id !== personaId ||
      digest(profileData) !== digest(definition.value.profile) ||
      digest(profileOrigin) !==
        digest({
          schemaVersion: 1,
          bookId,
          restoreId: loaded.job.restoreId,
          jobToken: loaded.view.jobToken,
        })
    )
      inconsistent();
  } else if (p.personas.bindings.book !== 0) inconsistent();
  const root = {
      id: bookId,
      authorId: uid,
      title: original.title,
      ...Object.fromEntries(
        ['genre', 'synopsis', 'personaId']
          .filter((k) => Object.hasOwn(original, k))
          .map((k) => [k, original[k]]),
      ),
      status: 'draft',
      deleting: false,
      publicationPrivacyVersion: 0,
      hasSceneResources: true,
      sceneRevision: 0,
      hasNarrativeResources: true,
      narrativeRevision: 0,
      hasProgressResources: true,
      hasLoreResources: true,
      localLoreVersion: 0,
      historyRevision: 0,
      editorialState: decision.control.value.editorialState,
      wordCount: p.wordCount,
      universeId: decision.universe.universeId,
      coverImageId: decision.cover.kind === 'library' ? decision.cover.imageId : null,
      coverUrl: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      restoreOrigin,
    },
    control = { ...decision.control.value, countReady: true, phase: 'done', cursor: null },
    batch = projectPersonaRestoreBatch({
      ...decision.batch.value,
      state: 'active',
      lastOperationId: request.operationId,
    });
  let image = null;
  if (decision.cover.kind === 'library') {
    const cover = decision.cover,
      ref = db.doc('users/' + uid + '/imageLibrary/' + cover.imageId),
      useRef = db.doc(ref.path + '/uses/' + bookId),
      [existing, uses] = await Promise.all([
        tx.get(ref),
        tx.get(
          db
            .collection(ref.path + '/uses')
            .select()
            .limit(1),
        ),
      ]);
    if (existing.exists || uses.docs.length) inconsistent();
    image = {
      ref,
      useRef,
      value: {
        id: cover.imageId,
        name: cover.name ?? decision.result.summary.titlePreview,
        url: null,
        path: 'book-covers/' + uid + '/' + cover.imageId + '.png',
        state: 'preparing',
        useCount: 1,
        createdAt: cover.createdAt ?? timestamp,
        updatedAt: cover.updatedAt ?? timestamp,
        restoreOrigin: { ...restoreOrigin, bookId },
        restoreStorage: {
          schemaVersion: 1,
          contentHash: cover.contentHash,
          byteLength: cover.byteLength,
          proof: decision.storageProof,
        },
      },
    };
  }
  return {
    root,
    commit() {
      tx.create(db.doc('books/' + bookId), root);
      tx.update(decision.control.ref, control);
      tx.update(decision.batch.snapshot.ref, batch);
      if (image) {
        tx.create(image.ref, image.value);
        tx.create(image.useRef, { bookId });
      }
      tx.delete(db.doc('deletedBooks/' + bookId));
    },
  };
}
