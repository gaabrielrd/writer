import {
  applicationBookQuery,
  advanceDeletionApplication,
} from './loreAnalysisApplicationDeletion.mjs';
import { recoveryBookQuery, prepareBookLoreRecoveryDeletion } from './bookLoreRecoveryDeletion.mjs';
import { integer } from './bookRestoreUploadContracts.mjs';
import {
  loadBookLoreDeletion,
  initializeBookLoreDeletion,
  reserveBookLoreDeletionCommit,
  deletionNextState,
  assertDeletionOpening,
  assertBookLorePayloadsEmpty,
} from './bookLoreDeletionStore.mjs';
import { deletionJobQueries } from './bookLoreDeletionJobs.mjs';
import { prepareLoreCleanupUnit } from './bookLoreCleanup.mjs';
import { advanceBookLoreRemovalHandoff, removalBookQuery } from './bookLoreRemovalHandoff.mjs';
import { creationBookQuery, advanceBookLoreCreationCleanup } from './bookLoreCreation.mjs';
async function activity(tx, l) {
  const base = 'books/' + l.c.bookId + '/',
    queries = [
      ...[
        'bookResourceBodies',
        'bookResourceChunks',
        'bookLoreSegments',
        'bookLoreGenerations',
        'bookResourceInventory',
        'bookResourceLeases',
        'bookLoreRecoveryKeys',
      ].map((name) => l.c.db.collection(base + name)),
      ...deletionJobQueries(l.c.db, l.c.uid, l.c.bookId),
      recoveryBookQuery(l.c.db, l.c.uid, l.c.bookId),
      removalBookQuery(l.c.db, l.c.uid, l.c.bookId),
      creationBookQuery(l.c.db, l.c.uid, l.c.bookId),
      applicationBookQuery(l.c.db, l.c.uid, l.c.bookId),
    ];
  const pages = await Promise.all(queries.map((q) => tx.get(q.limit(1).select())));
  return pages.some((p) => p.docs.length > 0);
}
/** Reserve the external commit before any coordinated child writes. */
export async function prepareBookLoreDeletion(tx, { db, uid, bookId, operationId, limit = 16 }) {
  integer(limit, 1);
  limit = Math.min(limit, 16);
  const l = await loadBookLoreDeletion(tx, db, uid, bookId, operationId);
  if (l.missing) return initializeBookLoreDeletion(tx, l, await activity(tx, l));
  assertDeletionOpening(tx, l);
  if (l.state.complete && l.state.schemaVersion === 2)
    return { complete: true, processed: l.state.processed, commit() {} };
  const finish = await reserveBookLoreDeletionCommit(tx, l),
    next = deletionNextState(l);
  let unit = { remove: [], commit() {} };
  if (!next.recoveriesComplete) unit = await prepareBookLoreRecoveryDeletion(tx, l, next);
  else if (next.phase === 'applications') await advanceDeletionApplication(tx, l, next);
  else if (next.phase === 'removals') await advanceBookLoreRemovalHandoff(tx, l, next);
  else if (next.phase === 'creations') await advanceBookLoreCreationCleanup(tx, l, next);
  else if (next.phase === 'finish') {
    await assertBookLorePayloadsEmpty(tx, db, bookId);
    next.complete = true;
  } else unit = await prepareLoreCleanupUnit(tx, l, next, limit);
  next.processed += unit.remove.length;
  const result = finish(next);
  return {
    ...result,
    commit() {
      for (const ref of unit.remove) tx.delete(ref);
      unit.commit();
      result.commit();
    },
  };
}
