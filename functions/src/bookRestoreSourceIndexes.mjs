import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
  chunkId,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { readBookRestoreArtifact, prepareBookRestoreArtifacts } from './bookRestoreArtifacts.mjs';
import { openBookChapterText, validateBookChapterTextPart } from './bookChapterText.mjs';
import { readBookSceneSource } from './bookSceneSourceText.mjs';
import { createBookSceneSourceEncoding } from './bookSceneSourceEncoding.mjs';
export function createBookRestoreSourceIndexesService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const action = 'advanceBookRestoreSourceIndexes',
    opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  return {
    async advanceBookRestoreSourceIndexes(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          old = await tx.get(opRef(uid, request.operationId));
        if (old.exists)
          return confirmed(loaded, readOp(old, uid, request.restoreId, fingerprint, loaded));
        if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
        if (loaded.job.checkpoint !== request.expectedCheckpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        if (
          loaded.job.cleanupVersion !== 14 ||
          loaded.job.preparation?.phase !== 'resources-finalize' ||
          ![11, 12].includes(loaded.job.preparation.schemaVersion) ||
          loaded.job.preparation.sourceIndexes?.complete
        )
          fail('failed-precondition', 'source-indexes-phase-conflict');
        const preparation = structuredClone(loaded.job.preparation);
        if (preparation.schemaVersion === 11) {
          preparation.schemaVersion = 12;
          preparation.sourceIndexes = {
            schemaVersion: 1,
            scanned: 0,
            backfilled: 0,
            after: null,
            complete: false,
          };
        }
        const progress = preparation.sourceIndexes,
          writes = [];
        let query = db
          .collection('books/' + loaded.job.bookId + '/sceneSources')
          .select()
          .orderBy('__name__')
          .limit(1);
        if (progress.after !== null) query = query.startAfter(progress.after);
        const page = await tx.get(query);
        if (page.docs.length) {
          if (progress.scanned >= preparation.resourceCounts['scene-source']) inconsistent();
          const sourceId = page.docs[0].id,
            source = await readBookRestoreArtifact(tx, db, loaded, 'scene-source', sourceId);
          if (source.value.deleting || source.value.rebalancing) inconsistent();
          if (source.value.original?.contentStorage != null) {
            const opened = await openBookChapterText(tx, db, {
              uid,
              bookId: loaded.job.bookId,
              chapterId: sourceId,
              chapter: source.value.original,
            });
            if ('inline' in opened || opened.manifest.contentHash !== source.value.hash)
              inconsistent();
            const body = await readBookRestoreArtifact(
                tx,
                db,
                loaded,
                'text-body',
                opened.manifest.bodyId,
              ),
              parts = [];
            for (let index = 0; index < opened.manifest.chunkCount; index++) {
              const part = await readBookRestoreArtifact(
                tx,
                db,
                loaded,
                'text-chunk',
                opened.manifest.bodyId + ':' + chunkId(index),
              );
              parts.push(validateBookChapterTextPart(opened, index, part.snapshot));
            }
            const encoding = createBookSceneSourceEncoding(
              sourceId,
              source.value,
              opened.manifest,
              parts,
            );
            if (Object.hasOwn(body.value, 'sceneSourceEncoding')) {
              if (digest(body.value.sceneSourceEncoding) !== digest(encoding)) inconsistent();
            } else {
              writes.push({
                kind: 'text-body',
                id: opened.manifest.bodyId,
                replace: true,
                value: { ...body.value, sceneSourceEncoding: encoding },
              });
              progress.backfilled = sum(progress.backfilled, 1);
            }
          } else
            await readBookSceneSource(tx, db, {
              uid,
              bookId: loaded.job.bookId,
              sourceId,
              source: source.value,
            });
          progress.scanned = sum(progress.scanned, 1);
          progress.after = sourceId;
        } else {
          if (progress.scanned !== preparation.resourceCounts['scene-source']) inconsistent();
          progress.complete = true;
        }
        const effects = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
        );
        if (effects.created !== 0) inconsistent();
        const record = next(loaded.job, request, { preparation });
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
