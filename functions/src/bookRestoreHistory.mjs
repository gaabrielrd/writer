import { createSHA256 } from 'hash-wasm';
import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest, assertSceneEnvelope } from './sceneContracts.mjs';
import { splitHistoryContent } from './workHistoryContracts.mjs';
import {
  BOOK_RESTORE_HISTORY_HASH,
  validateBookRestoreHistory,
} from './bookRestoreHistoryContracts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import {
  prepareBookRestoreArtifacts,
  assertBookRestoreHistoryNamespacesEmpty,
} from './bookRestoreArtifacts.mjs';
const action = 'advanceBookRestoreHistory';
export function createBookRestoreHistoryService({
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
    if (loaded.job.preparation?.phase !== 'history')
      fail('failed-precondition', 'history-phase-conflict');
  }
  return {
    async advanceBookRestoreHistory(uid, input) {
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
      if (cursor.schemaVersion === 6) {
        cursor.schemaVersion = 7;
        cursor.history = {
          schemaVersion: 1,
          startIndex: cursor.itemIndex,
          versions: 0,
          byteLength: 0,
          sourceChunks: 0,
          bodyCount: 0,
          pending: null,
        };
      }
      let item,
        unit,
        writes = [];
      const history = cursor.history;
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        item = await reader.readMappedItem(cursor.itemIndex);
        if (item.record.kind === 'work-version') {
          const value = item.value,
            pending = history.pending,
            part = pending?.part ?? 0;
          if (
            value.id !== item.record.id ||
            value.target.kind !== 'book' ||
            value.target.id !== initial.loaded.job.bookId ||
            (pending && pending.id !== value.id) ||
            typeof item.readRawPart !== 'function'
          )
            inconsistent();
          unit = await item.readRawPart({ part, cursor: pending?.cursor ?? null });
          const hasher = await createSHA256();
          if (pending) {
            const saved = Buffer.from(pending.hashState, 'base64');
            if (
              saved.length !== hasher.save().length ||
              saved.toString('base64') !== pending.hashState
            )
              inconsistent();
            try {
              hasher.load(saved);
            } catch {
              inconsistent();
            }
          }
          hasher.update(unit.bytes);
          const bytes = sum(pending?.bytes ?? 0, unit.bytes.length),
            chunks = splitHistoryContent(
              new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(unit.bytes),
            ),
            offset = pending?.chunkCount ?? 0,
            chunkCount = sum(offset, chunks.length);
          if (bytes > value.byteLength) inconsistent();
          writes = chunks.map((content, index) => ({
            kind: 'history-body',
            id: digest({ versionId: value.id, index: offset + index }),
            value: { versionId: value.id, index: offset + index, content },
          }));
          history.bodyCount = sum(history.bodyCount, chunks.length);
          if (unit.done) {
            if (bytes !== value.byteLength || hasher.digest() !== value.contentHash) inconsistent();
            writes.push({
              kind: 'history-version',
              id: value.id,
              value: {
                ...value,
                chunkCount,
                schemaVersion: 1,
                resourceKey: digest(value.resource),
                deleting: false,
              },
            });
            history.versions = sum(history.versions, 1);
            history.byteLength = sum(history.byteLength, value.byteLength);
            history.sourceChunks = sum(history.sourceChunks, value.chunkCount);
            history.pending = null;
            cursor.itemIndex = sum(cursor.itemIndex, 1);
          } else {
            history.pending = {
              id: value.id,
              part: part + 1,
              bytes,
              chunkCount,
              algorithm: BOOK_RESTORE_HISTORY_HASH,
              hashState: Buffer.from(hasher.save()).toString('base64'),
              cursor: unit.cursor,
            };
          }
        } else if (item.record.kind === 'work-history') {
          const totals = initial.loaded.job.validationSummary.totals;
          if (
            history.pending ||
            item.record.id !== initial.loaded.job.bookId ||
            item.value.versions !== history.versions ||
            item.value.byteLength !== history.byteLength ||
            item.value.chunkCount !== history.sourceChunks ||
            history.versions !== totals.versions ||
            history.byteLength !== totals.historyBytes ||
            history.sourceChunks !== totals.historyChunks
          )
            inconsistent();
          cursor.itemIndex = sum(cursor.itemIndex, 1);
          cursor.phase = 'draft';
        } else inconsistent();
        writes.forEach((write) => assertSceneEnvelope(write.value));
        validateBookRestoreHistory(history);
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
        if (loaded.job.cleanupVersion < 10)
          await assertBookRestoreHistoryNamespacesEmpty(tx, db, loaded);
        const preparation = structuredClone(cursor),
          artifacts = await prepareBookRestoreArtifacts(
            tx,
            db,
            loaded,
            request.operationId,
            writes,
            10,
          );
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        const record = next(loaded.job, request, { cleanupVersion: 10, preparation });
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
