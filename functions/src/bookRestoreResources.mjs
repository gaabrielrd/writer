import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { BOOK_RESOURCE_KINDS } from './bookBackupResources.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import { projectBookRestoreResource } from './bookRestoreResourceProjection.mjs';
import { prepareRestoredBookSceneSource } from './bookSceneSourceText.mjs';
import {
  prepareBookRestoreArtifacts,
  assertBookRestoreResourceNamespacesEmpty,
} from './bookRestoreArtifacts.mjs';
const action = 'advanceBookRestoreResources';
export function createBookRestoreResourcesService({
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
    if (loaded.job.preparation?.phase !== 'scenes')
      fail('failed-precondition', 'resource-phase-conflict');
  }
  return {
    async advanceBookRestoreResources(uid, input) {
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
      const cursor =
        initial.loaded.job.preparation.schemaVersion === 2
          ? {
              ...initial.loaded.job.preparation,
              schemaVersion: 3,
              resourceStartIndex: initial.loaded.job.preparation.itemIndex,
              resourceCounts: Object.fromEntries(BOOK_RESOURCE_KINDS.map((kind) => [kind, 0])),
            }
          : structuredClone(initial.loaded.job.preparation);
      let item;
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        const indexed = await reader.openMappedIndexedLore(cursor.itemIndex);
        item = indexed
          ? {
              record: indexed.record,
              value: { kind: 'lore', parentId: null, id: indexed.id },
              verify: indexed.verify,
            }
          : await reader.readMappedItem(cursor.itemIndex);
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
        if (loaded.job.cleanupVersion < 7)
          await assertBookRestoreResourceNamespacesEmpty(tx, db, loaded);
        const preparation = structuredClone(cursor),
          writes = [];
        if (item.record.kind === 'book-resources') {
          if (
            BOOK_RESOURCE_KINDS.some(
              (kind) => item.value.counts[kind] !== preparation.resourceCounts[kind],
            ) ||
            preparation.resourceCounts.lore !== preparation.loreCount
          )
            inconsistent();
          preparation.phase = 'resource-counts';
        } else {
          const kind = item.value.kind;
          if (!BOOK_RESOURCE_KINDS.includes(kind) || item.record.kind !== 'book-' + kind)
            inconsistent();
          if (kind !== 'lore') {
            const projected = projectBookRestoreResource(item.value, uid, preparation.timestamp);
            if (kind === 'scene-source') {
              const source = prepareRestoredBookSceneSource({
                uid,
                bookId: loaded.job.bookId,
                sourceId: item.value.id,
                operationId: request.operationId,
                timestamp: preparation.timestamp,
                source: projected[0].value,
              });
              projected[0].value = source.value;
              writes.push(...source.writes);
            }
            writes.push(...projected);
          }
          preparation.resourceCounts[kind] = sum(preparation.resourceCounts[kind], 1);
        }
        preparation.itemIndex = sum(preparation.itemIndex, 1);
        const effects = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          7,
        );
        preparation.artifactCount = sum(preparation.artifactCount, effects.created);
        const record = next(loaded.job, request, { cleanupVersion: 7, preparation });
        effects.commit();
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
