import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { BOOK_RESOURCE_KINDS } from './bookBackupResources.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import {
  prepareBookRestoreArtifacts,
  assertBookRestoreLoreNamespaceEmpty,
  assertBookRestoreBodyNamespaceEmpty,
} from './bookRestoreArtifacts.mjs';

const action = 'advanceBookRestoreLore';
export function createBookRestoreLoreService({
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
    if (loaded.job.preparation?.phase !== 'resources')
      fail('failed-precondition', 'lore-phase-conflict');
  }
  return {
    async advanceBookRestoreLore(uid, input) {
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
        initial.loaded.job.preparation.schemaVersion === 1
          ? {
              ...initial.loaded.job.preparation,
              schemaVersion: 2,
              loreCount: 0,
              loreRelationCount: 0,
              relationOffset: 0,
              loreItemIndex: initial.loaded.job.preparation.itemIndex,
            }
          : structuredClone(initial.loaded.job.preparation);
      let item, page;
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        item = await reader.readMappedItem(cursor.loreItemIndex);
        if (item.record.kind === 'book-lore' && item.loreRelations !== null)
          page = await item.loreRelations.read(cursor.relationOffset);
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
        if (page) await page.verify(tx);
        if (loaded.job.cleanupVersion < 6) {
          await assertBookRestoreLoreNamespaceEmpty(tx, db, loaded);
          if (loaded.job.cleanupVersion < 5)
            await assertBookRestoreBodyNamespaceEmpty(tx, db, loaded);
        }
        // A new clone for every SDK callback attempt; never advance a captured cursor.
        const preparation = structuredClone(cursor),
          writes = [];
        if (item.record.kind === 'book-lore') {
          if (item.value.kind !== 'lore' || item.value.parentId !== null) inconsistent();
          const id = item.value.id,
            value = {
              ...item.value.data,
              bookId: loaded.job.bookId,
              createdAt: preparation.timestamp,
              updatedAt: preparation.timestamp,
            };
          if (preparation.relationOffset > 0) {
            const stored = await tx.get(db.doc('books/' + loaded.job.bookId + '/lore/' + id)),
              previous = stored.data(),
              { relations, ...base } = previous ?? {};
            if (
              !Array.isArray(relations) ||
              relations.length !== preparation.relationOffset ||
              digest(base) !== digest(value) ||
              !page
            )
              inconsistent();
            value.relations = [...relations, ...page.values];
          } else if (page) value.relations = page.values;
          writes.push({
            kind: 'lore',
            id,
            value,
            replace: preparation.relationOffset > 0,
          });
          if (page) {
            if (page.offset !== preparation.relationOffset) inconsistent();
            preparation.loreRelationCount = sum(preparation.loreRelationCount, page.values.length);
          }
          if (!page || page.done) {
            preparation.loreCount = sum(preparation.loreCount, 1);
            preparation.relationOffset = 0;
            preparation.loreItemIndex = sum(preparation.loreItemIndex, 1);
          } else preparation.relationOffset = sum(preparation.relationOffset, page.values.length);
        } else {
          if (preparation.relationOffset !== 0) inconsistent();
          if (item.record.kind === 'book-resources') {
            if (item.value.counts.lore !== preparation.loreCount) inconsistent();
            preparation.phase = 'scenes';
          } else {
            if (!BOOK_RESOURCE_KINDS.some((kind) => item.record.kind === 'book-' + kind))
              inconsistent();
            preparation.loreItemIndex = sum(preparation.loreItemIndex, 1);
          }
          // Keep itemIndex unchanged: every other resource still awaits materialization.
        }
        const effects = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          6,
        );
        preparation.artifactCount = sum(preparation.artifactCount, effects.created);
        const record = next(loaded.job, request, { cleanupVersion: 6, preparation });
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
