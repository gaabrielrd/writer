import { prepareBookLoreRemovalBatch } from './bookLoreRemovalStart.mjs';
import {
  removalBatchIntent,
  removalBatchHash,
  removalBatchRequest,
  removalBatchPaths,
  readRemovalBatch,
  removalBatchProgress,
} from './bookLoreRemovalBatchContracts.mjs';
import { removalConflict as conflict } from './bookLoreRemovalContracts.mjs';

/** Internal only; caller transport must bind UID and reserve a durable selection first. */
export function createBookLoreRemovalBatchService({ db, now = () => Date.now() }) {
  const service = {
    async startBookLoreRemovalBatch(uid, input) {
      const intent = removalBatchIntent(uid, input),
        control = {
          leaderRemovalId: intent.requests[0].removalId,
          batchId: intent.batchId,
          intentHash: removalBatchHash(uid, intent),
        };
      const result = await db.runTransaction(async (tx) =>
        (await prepareBookLoreRemovalBatch(tx, { db, now }, uid, intent)).commit(),
      );
      if (result) return result;
      const committed = await service.getBookLoreRemovalBatch(uid, control);
      if (!committed) conflict();
      return committed;
    },
    async getBookLoreRemovalBatch(uid, input) {
      const r = removalBatchRequest(uid, input),
        c = removalBatchPaths(db, uid, r.leaderRemovalId, r.batchId);
      return db.runTransaction(async (tx) => {
        const loaded = await readRemovalBatch(tx, c, r.intentHash, r.jobToken);
        return loaded ? removalBatchProgress(tx, loaded) : null;
      });
    },
  };
  return service;
}
