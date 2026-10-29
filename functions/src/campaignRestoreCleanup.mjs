import {
  authorize,
  mutation,
  integer,
  fingerprint,
  bad,
  fail,
  chunkId,
} from './campaignRestoreContracts.mjs';
import { CHUNK_META } from './campaignRestoreStore.mjs';
import { createCampaignRestoreDerivedIndex } from './campaignRestoreDerivedIndex.mjs';
import { createCampaignRestoreReviewIndex } from './campaignRestoreReviewIndex.mjs';
export function createCampaignRestoreCleanup(store) {
  const { db } = store,
    reviewIndex = createCampaignRestoreReviewIndex(store),
    derivedIndex = createCampaignRestoreDerivedIndex(store);
  return {
    async cancelCampaignRestore(uid, input) {
      authorize(uid);
      const request = mutation(input),
        fp = fingerprint('cancel', request);
      const prior = await db.runTransaction(async (tx) => {
        const l = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await store.operation(tx, l, request.operationId, fp);
        if (op) return store.confirm(l, op);
        if (request.expectedCheckpoint !== l.job.checkpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        if (!['uploading', 'bytes-verified', 'rejected'].includes(l.job.state))
          fail('failed-precondition', 'state-conflict');
        const key = await store.key(tx, l);
        store.commit(tx, l, request, 'cancel', fp, {
          state: 'cancelling',
          hashState: null,
          ...(Object.hasOwn(l.job, 'fileReview') ? { fileReview: null } : {}),
          ...(Object.hasOwn(l.job, 'ownReview') ? { ownReview: null } : {}),
          ...(Object.hasOwn(l.job, 'derivedReview') ? { derivedReview: null } : {}),
        });
        tx.delete(key.ref);
        return null;
      });
      return prior ?? store.after(uid, request.restoreId, request.operationId, fp);
    },
    async advanceCampaignRestoreCleanup(uid, input) {
      authorize(uid);
      const request = { ...mutation(input, ['limit']), limit: integer(input.limit, 1, 25) },
        fp = fingerprint('cleanup', request);
      const prior = await db.runTransaction(async (tx) => {
        const l = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await store.operation(tx, l, request.operationId, fp);
        if (op) return store.confirm(l, op);
        if (request.expectedCheckpoint !== l.job.checkpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        if (l.job.state !== 'cancelling') fail('failed-precondition', 'state-conflict');
        if (await derivedIndex.cleanup(tx, l, request, fp)) return null;
        if (await reviewIndex.cleanup(tx, l, request, fp)) return null;
        const rows = (
          await tx.get(
            db
              .collection(l.ref.path + '/chunks')
              .orderBy('__name__')
              .select(...CHUNK_META)
              .limit(request.limit + 1),
          )
        ).docs;
        const count = Math.min(rows.length, request.limit),
          from = l.job.cleanedChunks;
        if (
          from + count > l.job.uploadedChunks ||
          (rows.length === 0 && from !== l.job.uploadedChunks)
        )
          bad();
        for (let n = 0; n < count; n++) {
          if (rows[n].id !== chunkId(from + n)) bad();
          await store.verifyChunk(tx, l, rows[n]);
        }
        const complete = from + count === l.job.uploadedChunks;
        if (complete && rows.length !== count) bad();
        store.commit(
          tx,
          l,
          request,
          'cleanup',
          fp,
          { cleanedChunks: from + count, state: complete ? 'cancelled' : 'cancelling' },
          null,
          complete,
        );
        for (const row of rows.slice(0, count)) tx.delete(row.ref);
        return null;
      });
      return prior ?? store.after(uid, request.restoreId, request.operationId, fp);
    },
  };
}
