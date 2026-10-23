import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { resourcePayloadBodyPath } from './bookResourcePayloadPaths.mjs';
import {
  fieldUploadRequest,
  fieldUploadPaths,
  fieldUploadCAS,
  fieldUploadConflict as conflict,
  uploadView,
} from './bookLoreFieldUploadContracts.mjs';
import {
  loadFieldUpload,
  loadFieldState,
  replayFieldOperation,
  commitFieldOperation,
} from './bookLoreFieldUploadStore.mjs';
import { readUploadArtifact } from './bookLoreFieldUploadProofs.mjs';
export function createBookLoreFieldUploadCleanup({ db }) {
  return {
    async cancelBookLoreFieldUpload(uid, input) {
      const r = fieldUploadRequest(uid, input, [], true),
        c = fieldUploadPaths(db, uid, r.uploadId);
      return db.runTransaction(async (tx) => {
        const loaded = await loadFieldUpload(tx, c, r);
        if (!loaded) {
          if (r.jobToken !== undefined) conflict();
          const job = {
            schemaVersion: 1,
            kind: 'fence',
            ownerId: uid,
            uploadId: r.uploadId,
            startHash: r.startHash,
            phase: 'cancelled',
          };
          tx.create(c.ref, job);
          return { receipt: null, progress: uploadView({ c, job }) };
        }
        if (loaded.job.kind === 'fence') return { receipt: null, progress: uploadView(loaded) };
        const replay = await replayFieldOperation(tx, loaded, 'cancelBookLoreFieldUpload', r);
        if (replay) return replay;
        if (['cancelling', 'cancelled'].includes(loaded.job.phase))
          return { receipt: null, progress: uploadView(loaded) };
        const state = await loadFieldState(tx, loaded);
        if (state) tx.delete(c.stateRef);
        return commitFieldOperation(tx, loaded, 'cancelBookLoreFieldUpload', r, {
          phase: 'cancelling',
          stateHash: null,
        });
      });
    },
    async advanceBookLoreFieldCleanup(uid, input) {
      const r = fieldUploadRequest(uid, input, ['expectedRevision'], true);
      fieldUploadCAS(r);
      const c = fieldUploadPaths(db, uid, r.uploadId);
      return db.runTransaction(async (tx) => {
        const loaded = await loadFieldUpload(tx, c, r);
        if (!loaded || loaded.job.kind === 'fence') conflict();
        const replay = await replayFieldOperation(tx, loaded, 'advanceBookLoreFieldCleanup', r);
        if (replay) return replay;
        const j = loaded.job;
        if (j.phase === 'cancelled') return { receipt: null, progress: uploadView(loaded) };
        if (j.phase !== 'cancelling' || r.expectedRevision !== j.revision) conflict();
        await loadFieldState(tx, loaded);
        const book = await readWorkMetadata(tx, db.doc('books/' + j.context.bookId), []);
        if (book.exists && !bornEqual(book, { createTime: j.context.bookBirth })) conflict();
        if (j.cleanupIndex < j.nextIndex) {
          const end = Math.min(j.nextIndex, j.cleanupIndex + 16),
            artifacts = [];
          for (let index = j.cleanupIndex; index < end; index++)
            artifacts.push(await readUploadArtifact(tx, loaded, 'chunk', index));
          for (const artifact of artifacts) tx.delete(artifact.ref);
          return commitFieldOperation(tx, loaded, 'advanceBookLoreFieldCleanup', r, {
            cleanupIndex: end,
            cleanedCount: j.cleanedCount + artifacts.length,
          });
        }
        const leftover = await tx.get(
          db
            .collection('books/' + j.context.bookId + '/bookResourceChunks')
            .where('bodyId', '==', j.context.manifest.bodyId)
            .limit(1)
            .select(),
        );
        if (leftover.docs.length) conflict();
        let header = null;
        if (j.sealed) header = await readUploadArtifact(tx, loaded, 'header');
        else if (
          (
            await readWorkMetadata(
              tx,
              db.doc(resourcePayloadBodyPath(j.context.bookId, j.context.manifest.bodyId)),
              [],
            )
          ).exists
        )
          conflict();
        const cleanedCount = j.cleanedCount + (header ? 1 : 0);
        if (cleanedCount !== j.artifactCount) conflict();
        if (header) tx.delete(header.ref);
        return commitFieldOperation(tx, loaded, 'advanceBookLoreFieldCleanup', r, {
          phase: 'cancelled',
          cleanedCount,
        });
      });
    },
  };
}
