import { digest } from './sceneContracts.mjs';
import { BookBackupFormatError } from './bookBackupContainer.mjs';
import {
  restoreFail as fail,
  inconsistent,
  authorize,
  mutationInput,
  requestHash,
  sum,
  chunkId,
  bornEqual,
} from './bookRestoreUploadContracts.mjs';
import {
  createVerifiedBookRestoreSource,
  assertRestoreObservation,
  nativeRestoreToken,
  checkRestoreProof,
} from './bookRestoreIntegrityRead.mjs';
import {
  createBookRestoreValidationStore,
  validationContext,
} from './bookRestoreValidationStore.mjs';
import {
  initialBookValidation,
  prepareBookValidationStep,
  completeBookValidation,
  validationSnapshot,
  validationMeta,
  readValidationSnapshot,
  bookValidationVersion,
} from './bookRestoreValidationStep.mjs';
import {
  initialBookLegacyValidation,
  prepareBookLegacyValidationStep,
  completeBookLegacyValidation,
} from './bookRestoreLegacyValidation.mjs';
const refFor = (db, loaded) => db.doc(loaded.ref.path + '/validationState/current');
async function emptyNamespace(tx, db, loaded) {
  for (const name of ['validationIndex', 'validationItems', 'validationState']) {
    const page = await tx.get(
      db
        .collection(loaded.ref.path + '/' + name)
        .select('schemaVersion')
        .limit(1),
    );
    if (page.docs.length) inconsistent();
  }
}
async function stateFor(tx, snapshot, loaded, db) {
  const value = snapshot.data();
  validationContext(value, loaded);
  const birth = await tx.get(
    db.doc(
      'users/' +
        loaded.job.ownerId +
        '/bookRestoreOperations/' +
        loaded.job.validationBirthOperationId,
    ),
  );
  if (
    !birth.exists ||
    birth.data()?.jobToken !== loaded.view.jobToken ||
    birth.data()?.ownerId !== loaded.job.ownerId ||
    birth.data()?.restoreId !== loaded.job.restoreId ||
    birth.data()?.receipt?.action !== 'advanceBookRestoreValidation' ||
    !bornEqual(snapshot, birth)
  )
    inconsistent();

  if (
    value.checkpoint !== loaded.job.checkpoint ||
    digest(value) !== loaded.job.validationStateHash
  )
    inconsistent();
  return readValidationSnapshot(value, loaded);
}
export function createBookRestoreValidationService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const action = 'advanceBookRestoreValidation';
  function available(loaded, request) {
    if (!['bytes-verified', 'validating'].includes(loaded.job.state))
      fail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
  }
  return {
    async advanceBookRestoreValidation(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      const initial = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(
            db.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId),
          );
        if (op.exists)
          return {
            resolved: confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded)),
          };
        available(loaded, request);
        const snapshot = await tx.get(refFor(db, loaded));
        if (loaded.job.state === 'bytes-verified') {
          await emptyNamespace(tx, db, loaded);
          return {
            loaded,
            state:
              bookValidationVersion(loaded.job.source) === 2
                ? initialBookLegacyValidation()
                : initialBookValidation(),
            token: null,
          };
        }
        return {
          loaded,
          state: await stateFor(tx, snapshot, loaded, db),
          token: nativeRestoreToken(snapshot),
        };
      });
      if (initial.resolved) return initial.resolved;
      const loaded = initial.loaded,
        state = initial.state,
        observations = new Map(),
        store = createBookRestoreValidationStore(db, loaded, request.operationId);
      const observe = (values) => {
        for (const value of values) {
          const key = value.proof.index,
            old = observations.get(key);
          if (old && digest(old) !== digest(value)) inconsistent();
          observations.set(key, value);
        }
      };
      const loadAt = async (tx, actor, id, token) => {
        const value = await load(tx, actor, id, token);
        available(value, request);
        return value;
      };
      let rejection = null,
        report = null;
      try {
        if (state.phase === 'recheck') {
          const end = Math.min(loaded.job.checkedChunks, state.recheck + 16);
          for (let index = state.recheck; index < end; index++) {
            const observation = await db.runTransaction(async (tx) => {
              const current = await loadAt(tx, uid, request.restoreId, request.jobToken);
              const proof = await tx.get(
                db.doc(current.ref.path + '/integrityProofs/' + chunkId(index)),
              );
              const value = {
                proof: checkRestoreProof(proof.data(), current, index),
                proofToken: nativeRestoreToken(proof),
              };
              await assertRestoreObservation(tx, db, current, value);
              return value;
            });
            observe([observation]);
          }
          state.recheck = end;
          if (end === loaded.job.checkedChunks) {
            report = state.legacy
              ? completeBookLegacyValidation(state, loaded.job.source.sha256, store.index)
              : completeBookValidation(state, loaded.job.source.sha256, store.index);
            state.phase = 'done';
          }
        } else {
          const source = await createVerifiedBookRestoreSource({
            db,
            uid,
            id: request.restoreId,
            token: request.jobToken,
            load: loadAt,
            allowedStates: ['bytes-verified', 'validating'],
            onRead: observe,
          });
          if (state.legacy && state.phase.startsWith('legacy-'))
            await prepareBookLegacyValidationStep(state, source, store, loaded.job.source);
          else await prepareBookValidationStep(state, source, store);
          if (state.machine?.bookId === loaded.job.bookId)
            throw new BookBackupFormatError(
              'invalid-record',
              'A cópia precisa de identidade própria.',
            );
        }
      } catch (error) {
        if (error instanceof BookBackupFormatError) rejection = error.code;
        else {
          // A twin request may have committed while this read became stale.
          const resolved = await db.runTransaction(async (tx) => {
            const current = await load(tx, uid, request.restoreId, request.jobToken);
            const op = await tx.get(
              db.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId),
            );
            return op.exists
              ? confirmed(current, readOp(op, uid, request.restoreId, fingerprint, current))
              : null;
          });
          if (resolved) return resolved;
          throw error;
        }
      }
      return db.runTransaction(async (tx) => {
        const current = await load(tx, uid, request.restoreId, request.jobToken),
          job = current.job,
          op = await tx.get(
            db.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId),
          );
        if (op.exists)
          return confirmed(current, readOp(op, uid, request.restoreId, fingerprint, current));
        available(current, request);
        const snapshot = await tx.get(refFor(db, current));
        if (job.state === 'bytes-verified') {
          await emptyNamespace(tx, db, current);
          if (initial.token !== null) inconsistent();
        } else {
          await stateFor(tx, snapshot, current, db);
          if (nativeRestoreToken(snapshot) !== initial.token) inconsistent();
        }
        await store.verify(tx);
        for (const value of observations.values())
          await assertRestoreObservation(tx, db, current, value);
        const checkpoint = sum(job.checkpoint, 1),
          prepared = rejection ? null : validationSnapshot(current, state, checkpoint);
        const meta = validationMeta(
          rejection ? { ...state, phase: 'rejected' } : state,
          rejection,
          report ? digest(report) : null,
        );
        const record = next(job, request, {
          cleanupVersion: 3,
          validationVersion: bookValidationVersion(job.source),
          validationBirthOperationId: job.validationBirthOperationId ?? request.operationId,
          validationMeta: meta,
          validationStateHash: prepared?.hash ?? null,
          validationSummary: report
            ? {
                sourceBookId: report.sourceBookId,
                totals: report.totals,
                warnings: report.warnings,
                ...(report.source
                  ? { source: report.source, legacyWarnings: report.legacyWarnings }
                  : {}),
              }
            : null,
          state: rejection ? 'content-rejected' : report ? 'content-verified' : 'validating',
        });
        if (rejection) tx.delete(refFor(db, current));
        else {
          store.commit(tx);
          if (snapshot.exists) tx.update(refFor(db, current), prepared.value);
          else tx.create(refFor(db, current), prepared.value);
        }
        tx.update(current.ref, record);
        const receipt = writeOp(
          tx,
          uid,
          request.restoreId,
          action,
          request,
          record,
          current.view.jobToken,
        );
        return confirmed(
          { ...current, view: { ...current.view, ...pickProgress(record) } },
          receipt,
        );
      });
    },
  };
}
