import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
  chunkId,
  integer,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { validateBookBackupCover } from './bookBackupCover.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import {
  readBookRestoreArtifact,
  prepareBookRestoreArtifacts,
  assertBookRestoreCoverStorageNamespaceEmpty,
} from './bookRestoreArtifacts.mjs';

export function createBookRestoreCoverMaterializationService({
  db,
  assets,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  function requestState(action, uid, input, extras = []) {
    authorize(uid);
    const request = mutationInput(input, extras);
    if (extras.includes('limit')) {
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
  function available(loaded, request, version) {
    if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    if (
      loaded.job.preparation?.phase !== 'cover-finalize' ||
      loaded.job.preparation.schemaVersion !== version
    )
      fail('failed-precondition', 'cover-materialization-phase-conflict');
  }
  const context = (loaded, cover) => ({
    ownerId: loaded.job.ownerId,
    restoreId: loaded.job.restoreId,
    jobToken: loaded.view.jobToken,
    imageId: cover.imageId,
    contentHash: cover.contentHash,
    byteLength: cover.byteLength,
  });
  async function source(uid, request) {
    const reader = await createVerifiedBookRestoreContent({
        db,
        uid,
        id: request.restoreId,
        token: request.jobToken,
        load,
      }),
      loaded = await db.runTransaction((tx) => load(tx, uid, request.restoreId, request.jobToken)),
      item = await reader.readMappedItem(loaded.job.preparation.cover.startIndex);
    if (item.record.kind !== 'book-cover' || item.record.id !== loaded.job.bookId) inconsistent();
    return item;
  }
  async function definition(tx, loaded, item) {
    await item.verify(tx);
    const native = await readBookRestoreArtifact(tx, db, loaded, 'cover-definition', 'current'),
      cover = validateBookBackupCover(item.value.cover);
    if (
      digest(native.value) !== digest({ schemaVersion: 1, cover }) ||
      cover.kind !== loaded.job.preparation.cover.kind ||
      (cover.kind === 'library' && cover.imageId !== loaded.job.preparation.cover.imageId)
    )
      inconsistent();
    return { native, cover };
  }
  function intent(loaded, value) {
    const keys = ['schemaVersion', 'cover', 'state', 'storage', 'fence'];
    if (
      !value ||
      Object.keys(value).length !== keys.length ||
      keys.some((k) => !Object.hasOwn(value, k)) ||
      value.schemaVersion !== 1 ||
      !['reserved', 'prepared', 'fenced'].includes(value.state)
    )
      inconsistent();
    const cover = validateBookBackupCover(value.cover),
      p = loaded.job.preparation;
    if (
      cover.kind !== p.cover.kind ||
      (cover.kind === 'library' && cover.imageId !== p.cover.imageId) ||
      value.state !== p.coverStorage.state ||
      digest(value.storage) !== digest(p.coverStorage.proof) ||
      digest(value.fence) !== digest(p.coverStorage.fence)
    )
      inconsistent();
    return cover;
  }
  function commit(tx, loaded, request, action, record, artifacts) {
    artifacts.commit();
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
    async reserveBookRestoreCover(uid, input) {
      const action = 'reserveBookRestoreCover',
        { request, resolved } = requestState(action, uid, input),
        initial = await db.runTransaction(async (tx) => {
          const loaded = await load(tx, uid, request.restoreId, request.jobToken),
            result = await resolved(tx, loaded);
          if (result) return { result };
          available(loaded, request, 9);
          return { loaded };
        });
      if (initial.result) return initial.result;
      let item;
      try {
        item = await source(uid, request);
      } catch (error) {
        const result = await db.runTransaction(async (tx) =>
          resolved(tx, await load(tx, uid, request.restoreId, request.jobToken)),
        );
        if (result) return result;
        throw error;
      }
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return result;
        available(loaded, request, 9);
        const { cover } = await definition(tx, loaded, item);
        await assertBookRestoreCoverStorageNamespaceEmpty(tx, db, loaded);
        const preparation = structuredClone(loaded.job.preparation);
        preparation.schemaVersion = 10;
        preparation.coverStorage = {
          schemaVersion: 1,
          state: 'reserved',
          proof: null,
          fence: null,
        };
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          [
            {
              kind: 'cover-storage',
              id: 'current',
              value: { schemaVersion: 1, cover, state: 'reserved', storage: null, fence: null },
            },
          ],
          13,
        );
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        const record = next(loaded.job, request, { cleanupVersion: 13, preparation });
        return commit(tx, loaded, request, action, record, artifacts);
      });
    },
    async materializeBookRestoreCover(uid, input) {
      const action = 'materializeBookRestoreCover',
        { request, resolved } = requestState(action, uid, input),
        initial = await db.runTransaction(async (tx) => {
          const loaded = await load(tx, uid, request.restoreId, request.jobToken),
            result = await resolved(tx, loaded);
          if (result) return { result };
          available(loaded, request, 10);
          return { loaded };
        });
      if (initial.result) return initial.result;
      let item,
        observed,
        storage = null;
      const proofs = [];
      try {
        item = await source(uid, request);
        observed = await db.runTransaction(async (tx) => {
          const loaded = await load(tx, uid, request.restoreId, request.jobToken);
          available(loaded, request, 10);
          const { native, cover } = await definition(tx, loaded, item),
            prepared = await readBookRestoreArtifact(tx, db, loaded, 'cover-storage', 'current');
          intent(loaded, prepared.value);
          if (digest(prepared.value.cover) !== digest(cover)) inconsistent();
          return {
            cover,
            value: prepared.value,
            context: cover.kind === 'library' ? context(loaded, cover) : null,
            proofs: [native.verify, prepared.verify],
          };
        });
        proofs.push(...observed.proofs);
        if (observed.cover.kind === 'library') {
          if (!assets) fail('failed-precondition', 'cover-storage-unavailable');
          const pieces = [],
            hash = createHash('sha256');
          let total = 0;
          for (let index = 0; index < observed.cover.chunkCount; index++) {
            const body = await db.runTransaction(async (tx) => {
                const loaded = await load(tx, uid, request.restoreId, request.jobToken);
                available(loaded, request, 10);
                return readBookRestoreArtifact(tx, db, loaded, 'cover-chunk', chunkId(index));
              }),
              v = body.value,
              bytes = Buffer.from(v.bytes ?? []);
            if (
              Object.keys(v).length !== 6 ||
              v.schemaVersion !== 1 ||
              v.imageId !== observed.cover.imageId ||
              v.index !== index ||
              v.byteLength !== bytes.length ||
              bytes.length !== Math.min(65536, observed.cover.byteLength - total) ||
              createHash('sha256').update(bytes).digest('hex') !== v.contentHash
            )
              inconsistent();
            pieces.push(bytes);
            total = sum(total, bytes.length);
            hash.update(bytes);
            proofs.push(body.verify);
          }
          if (
            total !== observed.cover.byteLength ||
            hash.digest('hex') !== observed.cover.contentHash
          )
            inconsistent();
          const bytes = Buffer.concat(pieces, total);
          pieces.length = 0;
          const image = sharp(bytes, {
              failOn: 'warning',
              limitInputPixels: false,
              sequentialRead: true,
              animated: true,
            }),
            metadata = await image.metadata();
          if (
            metadata.format !== 'png' ||
            ![metadata.width, metadata.height].every((v) => Number.isSafeInteger(v) && v > 0)
          )
            fail('failed-precondition', 'invalid-cover-image');
          await image.stats();
          const duplicate = await db.runTransaction(async (tx) => {
            const loaded = await load(tx, uid, request.restoreId, request.jobToken),
              result = await resolved(tx, loaded);
            if (result) return result;
            available(loaded, request, 10);
            await item.verify(tx);
            for (const verify of proofs) await verify(tx);
            return null;
          });
          if (duplicate) return duplicate;
          storage = await assets.stage(observed.context, bytes);
          await assets.verify(observed.context, storage);
        }
      } catch (error) {
        const result = await db.runTransaction(async (tx) =>
          resolved(tx, await load(tx, uid, request.restoreId, request.jobToken)),
        );
        if (result) return result;
        throw error;
      }
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return result;
        available(loaded, request, 10);
        await item.verify(tx);
        for (const verify of proofs) await verify(tx);
        const preparation = structuredClone(loaded.job.preparation);
        preparation.coverStorage = {
          schemaVersion: 1,
          state: 'prepared',
          proof: storage,
          fence: null,
        };
        preparation.phase = 'personas-integrate';
        const artifacts = await prepareBookRestoreArtifacts(tx, db, loaded, request.operationId, [
          {
            kind: 'cover-storage',
            id: 'current',
            replace: true,
            value: { ...observed.value, state: 'prepared', storage },
          },
        ]);
        if (artifacts.created !== 0) inconsistent();
        const record = next(loaded.job, request, { preparation });
        return commit(tx, loaded, request, action, record, artifacts);
      });
    },
    async cleanupCoverStorage(uid, input) {
      const action = 'advanceBookRestoreCleanup',
        { request, resolved } = requestState(action, uid, input, ['limit']);
      function cancelling(loaded) {
        if (loaded.job.state !== 'cancelling' || loaded.job.cleanupPhase !== 'cover-storage')
          fail('failed-precondition', 'state-conflict');
        if (loaded.job.checkpoint !== request.expectedCheckpoint)
          fail('failed-precondition', 'checkpoint-conflict');
      }
      const initial = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return { result };
        cancelling(loaded);
        const native = await readBookRestoreArtifact(tx, db, loaded, 'cover-storage', 'current'),
          cover = intent(loaded, native.value);
        return { loaded, native, cover };
      });
      if (initial.result) return initial.result;
      let fence;
      try {
        if (initial.cover.kind === 'library') {
          if (!assets) fail('failed-precondition', 'cover-storage-unavailable');
          fence = await assets.fence(
            context(initial.loaded, initial.cover),
            initial.native.value.storage,
          );
        } else fence = { kind: 'none' };
      } catch (error) {
        const result = await db.runTransaction(async (tx) =>
          resolved(tx, await load(tx, uid, request.restoreId, request.jobToken)),
        );
        if (result) return result;
        throw error;
      }
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return result;
        cancelling(loaded);
        await initial.native.verify(tx);
        const preparation = structuredClone(loaded.job.preparation);
        preparation.coverStorage.fence = fence;
        const artifacts = await prepareBookRestoreArtifacts(tx, db, loaded, request.operationId, [
          {
            kind: 'cover-storage',
            id: 'current',
            replace: true,
            value: { ...initial.native.value, state: 'fenced', fence },
          },
        ]);
        if (artifacts.created !== 0) inconsistent();
        const record = next(loaded.job, request, {
          preparation,
          cleanupPhase: 'resource-children',
        });
        return commit(tx, loaded, request, action, record, artifacts);
      });
    },
  };
}
