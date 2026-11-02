import { born, bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  assertDeletionOpening,
  deletionScopeCheck,
  deletionConflict as conflict,
} from './bookLoreDeletionStore.mjs';
import { removalPaths } from './bookLoreRemovalContracts.mjs';
import { loadBookLoreRemoval, reserveRemovalCommit } from './bookLoreRemovalStore.mjs';
export const removalBookQuery = (db, uid, bookId) =>
  db.collection('users/' + uid + '/bookLoreRemovals').where('intent.bookId', '==', bookId);
export async function advanceBookLoreRemovalHandoff(tx, l, next) {
  assertDeletionOpening(tx, l);
  let query = removalBookQuery(l.c.db, l.c.uid, l.c.bookId).orderBy('__name__').limit(1);
  if (next.cursor) query = query.startAfter(next.cursor);
  const s = (await tx.get(query)).docs[0];
  if (!s) {
    next.phase = 'creations';
    next.cursor = null;
    return;
  }
  deletionScopeCheck(l, s);
  const c = removalPaths(l.c.db, l.c.uid, s.id),
    job = await loadBookLoreRemoval(tx, c, { startHash: s.data().startHash });
  if (
    !job ||
    job.c.bookId !== l.c.bookId ||
    !bornEqual(l.root, { createTime: job.context.bookBirth })
  )
    conflict();
  next.cursor = s.id;
  if (job.state.complete) return;
  if (job.record.handoff) {
    const h = job.record.handoff;
    if (
      h.operationId !== l.c.operationId ||
      h.token !== l.token ||
      !bornEqual({ createTime: h.cutoff }, l.snapshot)
    )
      conflict();
    return;
  }
  const request = {
      removalId: s.id,
      startHash: job.context.startHash,
      jobToken: job.token,
      expectedRevision: job.state.revision,
      operationId: digest(['book-lore-removal-handoff', l.token, s.id]),
    },
    finish = await reserveRemovalCommit(tx, job, 'handoffBookLoreRemoval', request),
    plan = finish(job.state, {
      operationId: l.c.operationId,
      token: l.token,
      cutoff: born(l.snapshot),
    });
  plan.commit();
  next.coordinatedUnits++;
}
