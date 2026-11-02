import { createHash } from 'node:crypto';
import { createSHA256 } from 'hash-wasm';
import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
  chunkId,
} from './bookRestoreUploadContracts.mjs';
import { BOOK_COVER_PNG_SIGNATURE, validateBookBackupCover } from './bookBackupCover.mjs';
import { BOOK_RESTORE_HISTORY_HASH } from './bookRestoreHistoryContracts.mjs';
import { validateBookRestoreCover } from './bookRestoreCoverContracts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import {
  prepareBookRestoreArtifacts,
  assertBookRestoreCoverNamespacesEmpty,
} from './bookRestoreArtifacts.mjs';
const action = 'advanceBookRestoreCover';
export function createBookRestoreCoverService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  function available(loaded, request) {
    if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    if (loaded.job.preparation?.phase !== 'cover')
      fail('failed-precondition', 'cover-phase-conflict');
  }
  return {
    async advanceBookRestoreCover(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      async function resolved(tx, loaded) {
        const op = await tx.get(opRef(uid, request.operationId));
        return op.exists
          ? confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded))
          : null;
      }
      const initial = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return { result };
        available(loaded, request);
        return { loaded };
      });
      if (initial.result) return initial.result;
      const cursor = structuredClone(initial.loaded.job.preparation);
      if (cursor.schemaVersion === 8) {
        cursor.schemaVersion = 9;
        cursor.cover = {
          schemaVersion: 1,
          startIndex: cursor.itemIndex,
          kind: 'none',
          imageId: null,
          parts: 0,
          bytes: 0,
          pending: null,
          state: 'preparing',
        };
      }
      let item, unit;
      const writes = [];
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        item = await reader.readMappedItem(cursor.itemIndex);
        if (item.record.kind !== 'book-cover' || item.record.id !== initial.loaded.job.bookId)
          inconsistent();
        const cover = validateBookBackupCover(item.value.cover),
          state = cursor.cover;
        state.kind = cover.kind;
        if (cover.kind === 'library') {
          if (state.imageId !== null && state.imageId !== cover.imageId) inconsistent();
          state.imageId = cover.imageId;
          unit = await item.readRawPart({
            part: state.parts,
            cursor: state.pending?.cursor ?? null,
          });
          if (
            unit.part === 0 &&
            Buffer.from(unit.bytes.subarray(0, 8)).toString('hex') !== BOOK_COVER_PNG_SIGNATURE
          )
            inconsistent();
          const hasher = await createSHA256();
          if (state.pending) {
            const saved = Buffer.from(state.pending.hashState, 'base64');
            if (
              saved.length !== hasher.save().length ||
              saved.toString('base64') !== state.pending.hashState
            )
              inconsistent();
            try {
              hasher.load(saved);
            } catch {
              inconsistent();
            }
          }
          hasher.update(unit.bytes);
          const bytes = sum(state.bytes, unit.bytes.length),
            parts = sum(state.parts, 1);
          if (bytes > cover.byteLength) inconsistent();
          if (unit.done && (bytes !== cover.byteLength || hasher.digest() !== cover.contentHash))
            inconsistent();
          writes.push({
            kind: 'cover-chunk',
            id: chunkId(unit.part),
            value: {
              schemaVersion: 1,
              imageId: cover.imageId,
              index: unit.part,
              byteLength: unit.bytes.length,
              contentHash: createHash('sha256').update(unit.bytes).digest('hex'),
              bytes: Buffer.from(unit.bytes),
            },
          });
          state.parts = parts;
          state.bytes = bytes;
          state.pending = unit.done
            ? null
            : {
                id: cover.imageId,
                part: parts,
                bytes,
                chunkCount: parts,
                algorithm: BOOK_RESTORE_HISTORY_HASH,
                hashState: Buffer.from(hasher.save()).toString('base64'),
                cursor: unit.cursor,
              };
          if (unit.done) state.state = 'prepared';
        } else state.state = 'prepared';
        if (state.state === 'prepared') {
          writes.push({
            kind: 'cover-definition',
            id: 'current',
            value: { schemaVersion: 1, cover },
          });
          cursor.itemIndex = sum(cursor.itemIndex, 1);
          cursor.phase = 'cover-finalize';
        }
        validateBookRestoreCover(state);
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
        available(loaded, request);
        await item.verify(tx);
        if (unit) await unit.verify(tx);
        if (loaded.job.cleanupVersion < 12)
          await assertBookRestoreCoverNamespacesEmpty(tx, db, loaded);
        const preparation = structuredClone(cursor),
          artifacts = await prepareBookRestoreArtifacts(
            tx,
            db,
            loaded,
            request.operationId,
            writes,
            12,
          );
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        const record = next(loaded.job, request, { cleanupVersion: 12, preparation });
        artifacts.commit();
        tx.update(loaded.ref, record);
        const receipt = writeOp(
          tx,
          uid,
          request.restoreId,
          action,
          request,
          record,
          loaded.view.jobToken,
        );
        return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, receipt);
      });
    },
  };
}
