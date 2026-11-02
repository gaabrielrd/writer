import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  integer,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { projectBookBackupPersona } from './bookBackupPersonas.mjs';
import { projectPersonaRestoreBatch } from './personaAvailabilityContracts.mjs';
import { readBookRestoreArtifact, prepareBookRestoreArtifacts } from './bookRestoreArtifacts.mjs';
import {
  bookRestorePersonaOrigin,
  bookRestorePersonaBatchRef,
  assertBookRestorePersonaLibraryNamespaceEmpty,
  readBookRestorePersonaLibraryBatch,
} from './bookRestorePersonaLibraryBatch.mjs';
export function createBookRestorePersonaLibraryService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  function operation(uid, input, action, cleanup = false) {
    authorize(uid);
    const request = mutationInput(input, cleanup ? ['limit'] : []);
    if (cleanup) {
      request.limit = integer(input.limit, 1);
      if (request.limit > 50) fail('invalid-argument', 'invalid-input');
    }
    const fingerprint = requestHash(action, request);
    return {
      request,
      async resolved(tx, loaded) {
        const op = await tx.get(opRef(uid, request.operationId));
        return op.exists
          ? confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded))
          : null;
      },
    };
  }
  function available(loaded, request, cleanup = false) {
    if (loaded.job.state !== (cleanup ? 'cancelling' : 'content-verified'))
      fail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    if (
      cleanup
        ? loaded.job.cleanupPhase !== 'persona-library'
        : loaded.job.preparation?.phase !== 'personas-integrate'
    )
      fail('failed-precondition', 'persona-library-phase-conflict');
  }
  function commit(tx, loaded, request, action, record, batch, artifacts) {
    if (loaded.job.cleanupVersion < 14) tx.create(bookRestorePersonaBatchRef(db, loaded), batch);
    else tx.set(bookRestorePersonaBatchRef(db, loaded), batch);
    artifacts?.commit();
    tx.update(loaded.ref, record);
    const receipt = writeOp(
      tx,
      loaded.job.ownerId,
      request.restoreId,
      action,
      request,
      record,
      loaded.view.jobToken,
    );
    return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, receipt);
  }
  return {
    async advanceBookRestorePersonaLibrary(uid, input) {
      const action = 'advanceBookRestorePersonaLibrary',
        { request, resolved } = operation(uid, input, action);
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return result;
        available(loaded, request);
        const preparation = structuredClone(loaded.job.preparation),
          first = loaded.job.cleanupVersion < 14;
        let batch;
        if (first) {
          await assertBookRestorePersonaLibraryNamespaceEmpty(tx, db, loaded);
          preparation.schemaVersion = 11;
          preparation.personaLibrary = {
            schemaVersion: 1,
            installed: 0,
            after: null,
            revoked: false,
          };
          batch = {
            ...bookRestorePersonaOrigin(loaded),
            ownerId: uid,
            state: 'preparing',
            profileCount: 0,
            createdByOperationId: request.operationId,
            lastOperationId: request.operationId,
          };
        } else
          batch = (await readBookRestorePersonaLibraryBatch(tx, db, loaded, 'preparing')).value;
        const state = preparation.personaLibrary,
          expected = loaded.job.validationSummary.totals.profiles;
        let query = db
          .collection(loaded.ref.path + '/preparedPersonas')
          .select()
          .orderBy('__name__')
          .limit(1);
        if (state.after !== null) query = query.startAfter(state.after);
        const page = await tx.get(query),
          writes = [];
        if (page.docs.length) {
          if (state.installed >= expected) inconsistent();
          const id = page.docs[0].id,
            definition = await readBookRestoreArtifact(tx, db, loaded, 'persona-definition', id),
            profile = projectBookBackupPersona(definition.value.profile),
            profileHash = digest(profile);
          if (
            profile.id !== id ||
            digest(definition.value) !== digest({ schemaVersion: 1, profileHash, profile })
          )
            inconsistent();
          writes.push({
            kind: 'persona-library-profile',
            id,
            value: { ...profile, restoreOrigin: bookRestorePersonaOrigin(loaded) },
          });
          state.installed = sum(state.installed, 1);
          state.after = id;
        } else {
          if (state.installed !== expected) inconsistent();
          preparation.phase = 'resources-finalize';
        }
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          14,
        );
        if (artifacts.created !== writes.length) inconsistent();
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        batch = { ...batch, profileCount: state.installed, lastOperationId: request.operationId };
        projectPersonaRestoreBatch(batch);
        const record = next(loaded.job, request, { cleanupVersion: 14, preparation });
        return commit(tx, loaded, request, action, record, batch, artifacts);
      });
    },
    async cleanupPersonaLibrary(uid, input) {
      const action = 'advanceBookRestoreCleanup',
        { request, resolved } = operation(uid, input, action, true);
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return result;
        available(loaded, request, true);
        const { value } = await readBookRestorePersonaLibraryBatch(tx, db, loaded, 'preparing'),
          preparation = structuredClone(loaded.job.preparation);
        preparation.personaLibrary.revoked = true;
        const batch = { ...value, state: 'cancelled', lastOperationId: request.operationId };
        projectPersonaRestoreBatch(batch);
        const record = next(loaded.job, request, { preparation, cleanupPhase: 'cover-storage' });
        return commit(tx, loaded, request, action, record, batch, null);
      });
    },
  };
}
