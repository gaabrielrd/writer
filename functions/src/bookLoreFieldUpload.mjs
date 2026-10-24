import { editPreparationRef } from './bookLoreEditReservationContracts.mjs';
import { createSHA256 } from 'hash-wasm';
import { born, date, integer } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldValidation,
  finishBookLoreFieldValidation,
} from './bookLoreFieldValidation.mjs';
import { verifyBookResourcePayloadPart } from './bookResourcePayload.mjs';
import { resourcePayloadBodyPath } from './bookResourcePayloadPaths.mjs';
import {
  FIELD_UPLOAD_ALGORITHM,
  fieldUploadIntent,
  fieldUploadStartHash,
  fieldUploadRequest,
  fieldUploadPaths,
  fieldUploadCAS,
  fieldUploadBytes,
  fieldUploadResource,
  fieldUploadConflict as conflict,
  fieldUploadInvalid,
  hash,
  uploadView,
  uploadAtMost,
} from './bookLoreFieldUploadContracts.mjs';
import {
  loadFieldUpload,
  uploadSource,
  loadFieldState,
  uploadLeaseRef,
  replayFieldOperation,
  commitFieldOperation,
} from './bookLoreFieldUploadStore.mjs';
import {
  prepareUploadArtifact,
  writeUploadArtifact,
  readUploadArtifact,
  uploadSealBarrier,
} from './bookLoreFieldUploadProofs.mjs';
import { createBookLoreFieldUploadCleanup } from './bookLoreFieldUploadCleanup.mjs';
import { prepareCreationUploadBinding } from './bookLoreCreationUploads.mjs';
// A native transaction may be supplied only by an internal parent coordinator.
export function createBookLoreFieldUploadService({
  db,
  now = () => Date.now(),
  transaction = null,
  materialization = null,
}) {
  if (materialization) editPreparationRef(materialization);
  const transact = (fn) => (transaction ? fn(transaction) : db.runTransaction(fn));
  const service = {
    async startBookLoreFieldUpload(uid, input) {
      const intent = fieldUploadIntent(uid, input),
        startHash = fieldUploadStartHash(intent),
        c = fieldUploadPaths(db, uid, intent.uploadId),
        hasher = await createSHA256();
      const result = await transact(async (tx) => {
        const old = await loadFieldUpload(tx, c, { startHash });
        if (old) return uploadView(old);
        const origin = await uploadSource(tx, c, intent, true),
          context = { ...intent, ...origin },
          state = {
            schemaVersion: 1,
            ownerId: uid,
            uploadId: c.uploadId,
            startHash,
            algorithm: FIELD_UPLOAD_ALGORITHM,
            hashState: Buffer.from(hasher.save()).toString('base64'),
            parserState: createBookLoreFieldValidation(
              intent.target.field === 'relations'
                ? { field: 'relations', count: intent.target.count }
                : { field: intent.target.field },
            ),
          },
          job = {
            schemaVersion: 1,
            kind: 'upload',
            inventoryVersion: intent.creation ? 2 : 1,
            ownerId: uid,
            uploadId: c.uploadId,
            startHash,
            context,
            phase: 'uploading',
            revision: 0,
            nextIndex: 0,
            byteLength: 0,
            sealIndex: 0,
            sealed: false,
            artifactCount: 0,
            cleanupIndex: 0,
            cleanedCount: 0,
            stateHash: digest(state),
            createdAt: date(now),
            lastOperationId: null,
            sealBarrierOperationId: null,
            ...(materialization ? { materialization } : {}),
          },
          leaseRef = uploadLeaseRef(c, job);
        const lease = await tx.get(leaseRef),
          body = await readWorkMetadata(
            tx,
            db.doc(resourcePayloadBodyPath(intent.bookId, intent.manifest.bodyId)),
            [],
          ),
          chunks = await tx.get(
            db
              .collection('books/' + intent.bookId + '/bookResourceChunks')
              .where('bodyId', '==', intent.manifest.bodyId)
              .limit(1)
              .select(),
          ),
          orphanState = await tx.get(c.stateRef);
        if (lease.exists || body.exists || chunks.docs.length || orphanState.exists) conflict();
        if (intent.creation && materialization) conflict();
        const binding = intent.creation
          ? await prepareCreationUploadBinding(tx, c, context, startHash)
          : null;
        binding?.commit();
        tx.create(c.ref, job);
        tx.create(c.stateRef, state);
        tx.create(leaseRef, {
          schemaVersion: 1,
          ownerId: uid,
          uploadId: c.uploadId,
          startHash,
          bookId: intent.bookId,
          loreId: intent.loreId,
          bodyId: intent.manifest.bodyId,
          phase: 'uploading',
          revision: 0,
          ...(materialization ? { materialization } : {}),
        });
        return null;
      });
      if (transaction) return result;
      return result ?? service.getBookLoreFieldUpload(uid, { uploadId: c.uploadId, startHash });
    },
    async getBookLoreFieldUpload(uid, input) {
      const r = fieldUploadRequest(uid, input),
        c = fieldUploadPaths(db, uid, r.uploadId);
      return transact(async (tx) => {
        const loaded = await loadFieldUpload(tx, c, r);
        return loaded ? uploadView(loaded) : null;
      });
    },
    async appendBookLoreFieldUpload(uid, input) {
      const r = fieldUploadRequest(
        uid,
        input,
        ['expectedRevision', 'index', 'chunkBase64', 'proof'],
        true,
      );
      fieldUploadCAS(r);
      integer(r.index);
      const bytes = fieldUploadBytes(r.chunkBase64);
      if (!Array.isArray(r.proof) || r.proof.length > 48) fieldUploadInvalid();
      r.proof = r.proof.map(hash);
      const c = fieldUploadPaths(db, uid, r.uploadId),
        hasher = await createSHA256(),
        stateLength = hasher.save().length;
      return transact(async (tx) => {
        const loaded = await loadFieldUpload(tx, c, r);
        if (!loaded || loaded.job.kind === 'fence') conflict();
        const replay = await replayFieldOperation(tx, loaded, 'appendBookLoreFieldUpload', r);
        if (replay) return replay;
        if (
          loaded.job.materialization &&
          (!transaction || digest(loaded.job.materialization) !== digest(materialization))
        )
          conflict();
        const j = loaded.job,
          m = j.context.manifest;
        if (j.phase !== 'uploading' || r.expectedRevision !== j.revision || r.index !== j.nextIndex)
          conflict();
        await uploadSource(tx, c, j.context);
        const state = await loadFieldState(tx, loaded),
          saved = Buffer.from(state.hashState, 'base64');
        if (saved.toString('base64') !== state.hashState || saved.length !== stateLength)
          conflict();
        hasher.load(saved);
        const checked = verifyBookResourcePayloadPart(m, { index: r.index, bytes, proof: r.proof }),
          parserState = advanceBookLoreFieldValidation(state.parserState, checked);
        hasher.update(checked);
        const nextIndex = j.nextIndex + 1,
          byteLength = j.byteLength + checked.length,
          complete = nextIndex === m.chunkCount;
        if (complete) {
          finishBookLoreFieldValidation(parserState);
          if (hasher.digest() !== m.contentHash || byteLength !== m.byteLength) conflict();
        }
        const artifact = await prepareUploadArtifact(tx, loaded, 'chunk', r.index, r.operationId, {
          schemaVersion: 1,
          ownerId: uid,
          bookId: j.context.bookId,
          bodyId: m.bodyId,
          index: r.index,
          bytes: checked,
          proof: r.proof,
        });
        const nextState = complete
          ? null
          : { ...state, hashState: Buffer.from(hasher.save()).toString('base64'), parserState };
        writeUploadArtifact(tx, artifact);
        if (nextState) tx.set(c.stateRef, nextState);
        else tx.delete(c.stateRef);
        return commitFieldOperation(tx, loaded, 'appendBookLoreFieldUpload', r, {
          nextIndex,
          byteLength,
          artifactCount: j.artifactCount + 1,
          stateHash: nextState ? digest(nextState) : null,
          ...(complete ? { phase: 'verifying', sealBarrierOperationId: r.operationId } : {}),
        });
      });
    },
    async advanceBookLoreFieldSeal(uid, input) {
      const r = fieldUploadRequest(uid, input, ['expectedRevision'], true);
      fieldUploadCAS(r);
      const c = fieldUploadPaths(db, uid, r.uploadId);
      return transact(async (tx) => {
        const loaded = await loadFieldUpload(tx, c, r);
        if (!loaded || loaded.job.kind === 'fence') conflict();
        const replay = await replayFieldOperation(tx, loaded, 'advanceBookLoreFieldSeal', r);
        if (replay) return replay;
        if (
          loaded.job.materialization &&
          (!transaction || digest(loaded.job.materialization) !== digest(materialization))
        )
          conflict();
        const j = loaded.job,
          m = j.context.manifest;
        if (j.phase !== 'verifying' || r.expectedRevision !== j.revision) conflict();
        await uploadSource(tx, c, j.context);
        await loadFieldState(tx, loaded);
        const barrier = await uploadSealBarrier(tx, loaded),
          end = Math.min(j.nextIndex, j.sealIndex + 16);
        for (let index = j.sealIndex; index < end; index++) {
          const artifact = await readUploadArtifact(tx, loaded, 'chunk', index);
          if (!uploadAtMost(born(artifact.snapshot), barrier)) conflict();
        }
        let header = null;
        if (end === j.nextIndex)
          header = await prepareUploadArtifact(tx, loaded, 'header', null, r.operationId, {
            ...m,
            ownerId: uid,
            bookId: j.context.bookId,
            resource: fieldUploadResource({ ...j.context, uid }).resource,
            createdAt: j.createdAt,
          });
        if (header) writeUploadArtifact(tx, header);
        return commitFieldOperation(tx, loaded, 'advanceBookLoreFieldSeal', r, {
          sealIndex: end,
          ...(header ? { phase: 'sealed', sealed: true, artifactCount: j.artifactCount + 1 } : {}),
        });
      });
    },
    ...createBookLoreFieldUploadCleanup({ db }),
  };
  return service;
}
