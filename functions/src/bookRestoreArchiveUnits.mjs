import { readBookEditorialArchiveProof } from './bookEditorialHistoryOrigin.mjs';
import { digest } from './sceneContracts.mjs';
import {
  born,
  bornEqual,
  inconsistent,
  restoreHash,
  restoreId,
  chunkId,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  readBookRestoreArtifactJournal,
  readBookRestoreArtifact,
} from './bookRestoreArtifacts.mjs';
import { restoreChunkMetadata, checkRestoreProof } from './bookRestoreIntegrityRead.mjs';
import { validationContext } from './bookRestoreValidationStore.mjs';
import { readBookRestoreValidationState } from './bookRestoreValidation.mjs';
import { BOOK_RESTORE_ARCHIVE_NAMES } from './bookRestoreArchiveContracts.mjs';
const PRIVATE = new Set([
  'persona-definition',
  'persona-binding',
  'draft-definition',
  'cover-definition',
  'cover-chunk',
  'cover-storage',
]);
const atMost = (a, b) => {
  const x = born(a),
    y = born(b);
  return x.seconds < y.seconds || (x.seconds === y.seconds && x.nanoseconds <= y.nanoseconds);
};
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
function page(db, path, after, fields, limit = 8) {
  let query = db
    .collection(path)
    .orderBy('__name__')
    .select(...fields)
    .limit(limit);
  if (after !== null) query = query.startAfter(after);
  return query;
}
export function readOriginalBookRestoreArchiveOperation(snapshot, loaded, readOp) {
  if (!immutable(snapshot) || !atMost(snapshot, { createTime: loaded.snapshot.updateTime }))
    inconsistent();
  const op = readOp(
    snapshot,
    loaded.job.ownerId,
    loaded.job.restoreId,
    restoreHash(snapshot.data().fingerprint),
    loaded,
  );
  return op;
}
export async function prepareBookRestoreArchiveUnit(tx, db, loaded, p, readOp) {
  // This metadata witness survives journal/source cleanup and never authorizes current-book reads.
  if (loaded.job.cleanupVersion === 15) await readBookEditorialArchiveProof(tx, db, loaded, readOp);
  const remove = [],
    root = loaded.ref.path,
    j = loaded.job;
  const move = (phase) => {
    p.phase = phase;
    p.after = null;
  };
  if (p.phase === 'artifacts') {
    const rows = await tx.get(
      page(db, root + '/materializationArtifacts', p.after, [
        'schemaVersion',
        'ownerId',
        'restoreId',
        'jobToken',
        'kind',
        'id',
        'createdByOperationId',
        'lastOperationId',
      ]),
    );
    for (const snapshot of rows.docs) {
      const journal = await readBookRestoreArtifactJournal(tx, db, loaded, snapshot);
      if (PRIVATE.has(journal.value.kind)) {
        const artifact = await readBookRestoreArtifact(
          tx,
          db,
          loaded,
          journal.value.kind,
          journal.value.id,
          { metadataOnly: true },
        );
        if (!artifact.ref.path.startsWith(root + '/')) inconsistent();
        remove.push(artifact.ref);
        p.removed.privateArtifacts = sum(p.removed.privateArtifacts, 1);
      }
      remove.push(journal.journal);
      p.removed.journals = sum(p.removed.journals, 1);
      p.after = snapshot.id;
    }
    if (!rows.docs.length) {
      if (
        p.removed.journals !==
        j.preparation.artifactCount - (j.preparation.retiredArtifacts ?? 0)
      )
        inconsistent();
      move('operations');
    }
  } else if (p.phase === 'operations') {
    let query = db
      .collection('users/' + j.ownerId + '/bookRestoreOperations')
      .where('restoreId', '==', j.restoreId)
      .orderBy('__name__')
      .select('schemaVersion', 'ownerId', 'restoreId', 'jobToken', 'fingerprint', 'receipt')
      .limit(1);
    if (p.after !== null) query = query.startAfter(p.after);
    const rows = await tx.get(query);
    for (const snapshot of rows.docs) {
      const op = readOriginalBookRestoreArchiveOperation(snapshot, loaded, readOp);
      if (op.action === 'appendBookRestoreChunk') {
        const index = op.sequence,
          chunk = await readWorkMetadata(tx, db.doc(root + '/chunks/' + chunkId(index)), [
            'schemaVersion',
            'ownerId',
            'restoreId',
            'jobToken',
            'index',
            'byteLength',
            'chunkHash',
          ]),
          metadata = restoreChunkMetadata(chunk, loaded, index);
        if (
          !immutable(chunk) ||
          !bornEqual(chunk, snapshot) ||
          op.uploadedChunks !== index + 1 ||
          op.uploadedBytes !== Math.min(j.source.byteLength, (index + 1) * 65536)
        )
          inconsistent();
        remove.push(chunk.ref);
        p.removed.chunks = sum(p.removed.chunks, 1);
        p.removed.bytes = sum(p.removed.bytes, metadata.byteLength);
      } else if (op.action === 'advanceBookRestoreIntegrity') {
        const end = op.integrity.checkedChunks;
        let count = 0;
        for (let index = Math.max(0, end - 16); index < end; index++) {
          const proof = await readWorkMetadata(
            tx,
            db.doc(root + '/integrityProofs/' + chunkId(index)),
            [
              'schemaVersion',
              'ownerId',
              'restoreId',
              'jobToken',
              'index',
              'byteLength',
              'chunkHash',
              'chunkToken',
            ],
          );
          if (!proof.exists) continue;
          checkRestoreProof(proof.data(), loaded, index);
          if (!immutable(proof) || !atMost(proof, snapshot)) inconsistent();
          if (bornEqual(proof, snapshot)) {
            remove.push(proof.ref);
            count++;
          }
        }
        if (!count) inconsistent();
        p.removed.proofs = sum(p.removed.proofs, count);
      } else if (
        op.action === 'advanceBookRestoreValidation' &&
        op.checkpoint === j.validationCheckpoint
      ) {
        if (p.validationOperationId !== null && p.validationOperationId !== snapshot.id)
          inconsistent();
        p.validationOperationId = snapshot.id;
      }
      p.scannedOperations = sum(p.scannedOperations, 1);
      p.after = snapshot.id;
    }
    if (!rows.docs.length) {
      if (
        p.scannedOperations !== sum(j.checkpoint, 1) ||
        p.removed.chunks !== j.uploadedChunks ||
        p.removed.bytes !== j.uploadedBytes ||
        p.removed.proofs !== j.checkedChunks ||
        !p.validationOperationId
      )
        inconsistent();
      move('validation-index');
    }
  } else if (['validation-index', 'validation-items'].includes(p.phase)) {
    const name = p.phase === 'validation-index' ? 'validationIndex' : 'validationItems',
      rows = await tx.get(
        page(db, root + '/' + name, p.after, [
          'schemaVersion',
          'ownerId',
          'restoreId',
          'jobToken',
          'key',
          'index',
          'createdByOperationId',
        ]),
      );
    for (const snapshot of rows.docs) {
      const value = snapshot.data();
      validationContext(value, loaded);
      restoreId(value.createdByOperationId);
      const operation = await tx.get(
          db.doc('users/' + j.ownerId + '/bookRestoreOperations/' + value.createdByOperationId),
        ),
        receipt = readOriginalBookRestoreArchiveOperation(operation, loaded, readOp);
      if (
        receipt.action !== 'advanceBookRestoreValidation' ||
        !immutable(snapshot) ||
        !bornEqual(snapshot, operation)
      )
        inconsistent();
      if (name === 'validationIndex') {
        if (
          !Array.isArray(value.key) ||
          value.key.length < 1 ||
          value.key.length > 8 ||
          value.key.some((k) => typeof k !== 'string') ||
          Buffer.byteLength(JSON.stringify(value.key)) > 8192 ||
          snapshot.id !== digest(value.key)
        )
          inconsistent();
        p.removed.index = sum(p.removed.index, 1);
      } else {
        if (
          !Number.isSafeInteger(value.index) ||
          value.index < 0 ||
          value.index >= j.validationMeta.items ||
          snapshot.id !== chunkId(value.index)
        )
          inconsistent();
        p.removed.items = sum(p.removed.items, 1);
      }
      remove.push(snapshot.ref);
      p.after = snapshot.id;
    }
    if (!rows.docs.length) {
      if (name === 'validationItems' && p.removed.items !== j.validationMeta.items) inconsistent();
      move(name === 'validationIndex' ? 'validation-items' : 'validation-state');
    }
  } else if (p.phase === 'validation-state') {
    const state = await tx.get(db.doc(root + '/validationState/current')),
      last = await tx.get(
        db.doc('users/' + j.ownerId + '/bookRestoreOperations/' + p.validationOperationId),
      );
    const receipt = readOriginalBookRestoreArchiveOperation(last, loaded, readOp);
    await readBookRestoreValidationState(tx, state, loaded, db);
    if (
      receipt.action !== 'advanceBookRestoreValidation' ||
      receipt.checkpoint !== j.validationCheckpoint ||
      !bornEqual({ createTime: state.updateTime }, last)
    )
      inconsistent();
    remove.push(state.ref);
    p.removed.states = 1;
    move('verify');
  } else if (p.phase === 'verify') {
    for (const name of BOOK_RESTORE_ARCHIVE_NAMES) {
      const rows = await tx.get(
        db
          .collection(root + '/' + name)
          .select()
          .limit(1),
      );
      if (rows.docs.length) inconsistent();
    }
    const key = await readWorkMetadata(
      tx,
      db.doc('users/' + j.ownerId + '/bookRestoreRecoveryKeys/' + j.restoreId),
      [],
    );
    if (key.exists) inconsistent();
    move('done');
  } else inconsistent();
  return remove;
}
