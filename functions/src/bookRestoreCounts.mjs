import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import {
  prepareBookRestoreArtifacts,
  readBookRestoreArtifact,
  assertBookRestoreEntityIndexEmpty,
} from './bookRestoreArtifacts.mjs';
import { createBookRestoreCountEffects } from './bookRestoreCountEffects.mjs';
import {
  prepareBookRestoreLoreReconciliationSource,
  prepareBookRestoreLoreReconciliation,
} from './bookRestoreLoreReconcile.mjs';
import { prepareBookRestoreLoreStagingDrain } from './bookRestoreLoreStaging.mjs';
const action = 'advanceBookRestoreCounts';

export function createBookRestoreCountsService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const effects = createBookRestoreCountEffects({ db }),
    opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  function available(loaded, request) {
    if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    if (loaded.job.preparation?.phase !== 'resource-counts')
      fail('failed-precondition', 'counts-phase-conflict');
  }
  return {
    async advanceBookRestoreCounts(uid, input) {
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
        initial.loaded.job.preparation.schemaVersion === 3
          ? {
              ...initial.loaded.job.preparation,
              schemaVersion: 4,
              counts: {
                schemaVersion: 1,
                step: 'scenes',
                itemIndex: initial.loaded.job.preparation.resourceStartIndex,
                sceneCount: 0,
                linkCount: 0,
                linkId: null,
                linkCursor: null,
              },
            }
          : structuredClone(initial.loaded.job.preparation);
      let item,
        lorePage,
        loreReconciliation = null;
      if (cursor.counts.step === 'scenes') {
        try {
          const reader = await createVerifiedBookRestoreContent({
            db,
            uid,
            id: request.restoreId,
            token: request.jobToken,
            load,
          });
          const indexed = await reader.openMappedIndexedLore(cursor.counts.itemIndex);
          if (indexed)
            loreReconciliation = await prepareBookRestoreLoreReconciliationSource(
              db,
              initial.loaded,
              indexed,
            );
          item = loreReconciliation
            ? indexed
            : await reader.readMappedItem(cursor.counts.itemIndex);
          if (cursor.counts.lorePayloadOffset) {
            if (!item.loreRelations) inconsistent();
            lorePage = await item.loreRelations.read(cursor.counts.lorePayloadOffset.offset);
          }
        } catch (error) {
          const result = await db.runTransaction(async (tx) =>
            resolved(tx, await load(tx, uid, request.restoreId, request.jobToken)),
          );
          if (result) return result;
          throw error;
        }
      }
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return result;
        available(loaded, request);
        if (item) await item.verify(tx);
        if (lorePage) await lorePage.verify(tx);
        if (loaded.job.cleanupVersion < 8) await assertBookRestoreEntityIndexEmpty(tx, db, loaded);
        const preparation = structuredClone(cursor),
          counts = preparation.counts,
          writes = [];
        let remove = [],
          itemPending = false;
        if (counts.step === 'scenes') {
          if (item.record.kind === 'book-resources') {
            if (counts.sceneCount !== preparation.resourceCounts.scene) inconsistent();
            counts.step = 'links';
          } else if (loreReconciliation) {
            const checked = await prepareBookRestoreLoreReconciliation(
              tx,
              db,
              loaded,
              item,
              loreReconciliation,
            );
            writes.push(...checked.writes);
            itemPending = checked.pending;
          } else {
            const checked = await effects.check(tx, loaded, item, preparation, lorePage);
            const native = checked.native;
            itemPending = checked.pending;
            if (item.record.kind === 'book-scene') {
              writes.push(...(await effects.scene(tx, loaded, native.get('scene'), preparation)));
              counts.sceneCount = sum(counts.sceneCount, 1);
            } else if (['book-arc', 'book-event', 'book-milestone'].includes(item.record.kind))
              writes.push(...(await effects.sequence(tx, loaded, native.get(item.value.kind))));
          }
          if (!itemPending) counts.itemIndex = sum(counts.itemIndex, 1);
        } else {
          if (counts.linkId !== null)
            await readBookRestoreArtifact(tx, db, loaded, 'narrative-link', counts.linkId);
          if (counts.step === 'links') {
            let query = db
              .collection(loaded.ref.path + '/materializationArtifacts')
              .where('kind', '==', 'narrative-link')
              .orderBy('__name__')
              .select('kind', 'id')
              .limit(1);
            if (counts.linkCursor !== null) query = query.startAfter(counts.linkCursor);
            const page = await tx.get(query);
            if (!page.docs.length) counts.step = 'finish';
            else {
              const snapshot = page.docs[0],
                id = snapshot.data().id;
              if (snapshot.id !== digest(['narrative-link', id])) inconsistent();
              const native = await readBookRestoreArtifact(tx, db, loaded, 'narrative-link', id);
              writes.push(...(await effects.link(tx, loaded, native)));
              counts.linkCursor = snapshot.id;
              counts.linkId = id;
              counts.linkCount = sum(counts.linkCount, 1);
            }
          } else if (counts.step === 'finish') {
            const drained = await prepareBookRestoreLoreStagingDrain(tx, db, loaded, preparation);
            remove = drained.remove;
            if (drained.complete) {
              writes.push(...(await effects.finish(tx, loaded, preparation)));
              counts.step = 'done';
              preparation.phase = 'personas';
            }
          } else inconsistent();
        }
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          8,
        );
        preparation.artifactCount = sum(preparation.artifactCount, artifacts.created);
        const record = next(loaded.job, request, { cleanupVersion: 8, preparation });
        artifacts.commit();
        for (const ref of remove) tx.delete(ref);
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
