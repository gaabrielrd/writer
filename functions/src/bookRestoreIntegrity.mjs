import { VALIDATION_COLLECTIONS } from './bookRestoreValidationCleanup.mjs';
import { createSHA256 } from 'hash-wasm';
import { assertBookRestoreArtifactsEmpty } from './bookRestoreArtifacts.mjs';
import { digest } from './sceneContracts.mjs';
import {
  restoreFail as fail,
  inconsistent,
  invalid,
  authorize,
  mutationInput,
  integer,
  sum,
  chunkId,
  chunkChain,
  requestHash,
  BOOK_RESTORE_SEED,
} from './bookRestoreUploadContracts.mjs';
import { restoreChunkProof, checkRestoreProof } from './bookRestoreIntegrityRead.mjs';
const ALGORITHM = 'sha256/hash-wasm@4.12.0';
const stateRef = (db, loaded) => db.doc(loaded.ref.path + '/integrityState/current');
const proofRef = (db, loaded, index) =>
  db.doc(loaded.ref.path + '/integrityProofs/' + chunkId(index));
function stateContext(value, loaded) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== loaded.job.ownerId ||
    value.restoreId !== loaded.job.restoreId ||
    value.jobToken !== loaded.view.jobToken
  )
    inconsistent();
}
function restoreState(value, loaded, hasher) {
  stateContext(value, loaded);
  const job = loaded.job;
  if (
    value.algorithm !== ALGORITHM ||
    value.checkpoint !== job.checkpoint ||
    value.checkedChunks !== job.checkedChunks ||
    value.checkedBytes !== job.checkedBytes ||
    value.chainHash !== job.checkedChainHash ||
    digest(value) !== job.integrityStateHash ||
    typeof value.hashState !== 'string' ||
    value.hashState.length > 4096
  )
    inconsistent();
  const bytes = Buffer.from(value.hashState, 'base64');
  if (bytes.toString('base64') !== value.hashState || bytes.length !== hasher.save().length)
    inconsistent();
  try {
    hasher.load(bytes);
  } catch {
    inconsistent();
  }
}
export function createBookRestoreIntegrityService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  return {
    async advanceBookRestoreIntegrity(uid, input) {
      authorize(uid);
      const request = { ...mutationInput(input, ['limit']), limit: integer(input.limit, 1) };
      if (request.limit > 16) invalid();
      const fingerprint = requestHash('advanceBookRestoreIntegrity', request),
        hasher = await createSHA256();
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          job = loaded.job;
        const op = await tx.get(
          db.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId),
        );
        if (op.exists)
          return confirmed(loaded, readOp(op, uid, job.restoreId, fingerprint, loaded));
        if (!['uploaded', 'checking'].includes(job.state))
          fail('failed-precondition', 'state-conflict');
        if (job.checkpoint !== request.expectedCheckpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        const from = job.checkedChunks ?? 0,
          end = Math.min(job.uploadedChunks, from + request.limit);
        const stored = await tx.get(stateRef(db, loaded));
        hasher.init();
        if (job.state === 'checking') restoreState(stored.data(), loaded, hasher);
        else if (stored.exists || job.cleanupVersion !== 1) inconsistent();
        const items = [];
        for (let index = from; index < end; index++) {
          const [chunk, proof] = await Promise.all([
            tx.get(db.doc(loaded.ref.path + '/chunks/' + chunkId(index))),
            tx.get(proofRef(db, loaded, index)),
          ]);
          if (proof.exists) inconsistent();
          items.push(restoreChunkProof(chunk, loaded, index));
        }
        if (end === job.uploadedChunks) {
          const after = await tx.get(
            db
              .collection(loaded.ref.path + '/chunks')
              .select('index')
              .orderBy('__name__')
              .startAfter(chunkId(end - 1))
              .limit(1),
          );
          if (after.docs.length) inconsistent();
        }
        let checkedBytes = job.checkedBytes ?? 0,
          chainHash = job.checkedChainHash ?? BOOK_RESTORE_SEED;
        for (const item of items) {
          hasher.update(item.bytes);
          checkedBytes = sum(checkedBytes, item.bytes.length);
          chainHash = chunkChain(
            chainHash,
            item.proof.index,
            item.proof.chunkHash,
            item.bytes.length,
          );
        }
        const complete = end === job.uploadedChunks;
        let failure = null,
          integrityDigest = null;
        if (complete) {
          integrityDigest = hasher.digest();
          if (checkedBytes !== job.source.byteLength) inconsistent();
          failure =
            chainHash !== job.uploadedChainHash
              ? 'upload-chain-mismatch'
              : integrityDigest !== job.source.sha256
                ? 'file-hash-mismatch'
                : null;
        }
        const snapshot = complete
          ? null
          : {
              schemaVersion: 1,
              ownerId: uid,
              restoreId: job.restoreId,
              jobToken: loaded.view.jobToken,
              algorithm: ALGORITHM,
              checkpoint: sum(job.checkpoint, 1),
              checkedChunks: end,
              checkedBytes,
              chainHash,
              hashState: Buffer.from(hasher.save()).toString('base64'),
            };
        const record = next(job, request, {
          cleanupVersion: 2,
          integrityVersion: 1,
          checkedChunks: end,
          checkedBytes,
          checkedChainHash: chainHash,
          integrityStateHash: snapshot ? digest(snapshot) : null,
          integrityDigest,
          integrityFailure: failure,
          cleanupPhase: 'chunks',
          state: complete ? (failure ? 'rejected' : 'bytes-verified') : 'checking',
        });
        for (const item of items) tx.create(proofRef(db, loaded, item.proof.index), item.proof);
        if (snapshot) {
          if (stored.exists) tx.update(stateRef(db, loaded), snapshot);
          else tx.create(stateRef(db, loaded), snapshot);
        } else tx.delete(stateRef(db, loaded));
        tx.update(loaded.ref, record);
        const receipt = writeOp(
          tx,
          uid,
          job.restoreId,
          'advanceBookRestoreIntegrity',
          request,
          record,
          loaded.view.jobToken,
        );
        return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, receipt);
      });
    },
  };
}
/** Common proof/state cleanup for v2-v5; the job commits deletes and its receipt. */
export async function prepareBookRestoreIntegrityCleanup(tx, db, loaded, limit) {
  const job = loaded.job;
  if (![2, 3, 4, 5].includes(job.cleanupVersion) || !['proofs', 'state'].includes(job.cleanupPhase))
    inconsistent();
  if (job.cleanupPhase === 'proofs') {
    const page = await tx.get(
      db
        .collection(loaded.ref.path + '/integrityProofs')
        .select(
          'schemaVersion',
          'ownerId',
          'restoreId',
          'jobToken',
          'index',
          'byteLength',
          'chunkHash',
          'chunkToken',
        )
        .orderBy('__name__')
        .limit(limit + 1),
    );
    const removed = page.docs.slice(0, limit);
    for (const item of removed) {
      const value = checkRestoreProof(item.data(), loaded, item.data()?.index);
      if (item.id !== chunkId(value.index)) inconsistent();
    }
    return {
      remove: removed.map((item) => item.ref),
      patch: { cleanupPhase: page.docs.length <= limit ? 'state' : 'proofs', state: 'cancelling' },
    };
  }
  const [chunks, proofs, states, key] = await Promise.all([
    tx.get(
      db
        .collection(loaded.ref.path + '/chunks')
        .select('index')
        .limit(1),
    ),
    tx.get(
      db
        .collection(loaded.ref.path + '/integrityProofs')
        .select('index')
        .limit(1),
    ),
    tx.get(
      db
        .collection(loaded.ref.path + '/integrityState')
        .select('schemaVersion', 'ownerId', 'restoreId', 'jobToken')
        .limit(2),
    ),
    tx.get(db.doc('users/' + job.ownerId + '/bookRestoreRecoveryKeys/' + job.restoreId)),
  ]);
  if (chunks.docs.length || proofs.docs.length || key.exists || states.docs.length > 1)
    inconsistent();
  if (job.cleanupVersion >= 3) {
    for (const name of VALIDATION_COLLECTIONS) {
      const page = await tx.get(
        db
          .collection(loaded.ref.path + '/' + name)
          .select('schemaVersion')
          .limit(1),
      );
      if (page.docs.length) inconsistent();
    }
  }
  if (job.cleanupVersion >= 4) await assertBookRestoreArtifactsEmpty(tx, db, loaded);
  for (const item of states.docs) {
    if (item.id !== 'current') inconsistent();
    stateContext(item.data(), loaded);
  }
  return {
    remove: states.docs.map((item) => item.ref),
    patch: { state: 'cancelled', cleanupPhase: 'done', integrityStateHash: null },
  };
}
