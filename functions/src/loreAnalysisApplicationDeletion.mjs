import { advanceApplicationCleanupInTransaction } from './loreAnalysisApplicationPreparation.mjs';
import { bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { applicationPaths } from './loreAnalysisApplicationContracts.mjs';
import {
  loadApplication,
  prepareApplicationCancellation,
} from './loreAnalysisApplicationStore.mjs';
import {
  assertDeletionOpening,
  deletionScopeCheck,
  deletionConflict as conflict,
} from './bookLoreDeletionStore.mjs';
export const applicationBookQuery = (db, uid, bookId) =>
  db.collection('users/' + uid + '/loreAnalysisApplications').where('bookId', '==', bookId);
/** Pending parents close before cleanup; successful batches retain their native receipts. */
export async function advanceDeletionApplication(tx, l, next) {
  assertDeletionOpening(tx, l);
  let query = applicationBookQuery(l.c.db, l.c.uid, l.c.bookId).orderBy('__name__').limit(1);
  if (next.cursor) query = query.startAfter(next.cursor);
  const document = (await tx.get(query)).docs[0];
  if (!document) {
    next.phase = 'edits';
    next.cursor = null;
    return;
  }
  deletionScopeCheck(l, document);
  const c = applicationPaths(l.c.db, l.c.uid, document.id),
    app = await loadApplication(tx, c, { requestHash: document.data().requestHash });
  if (
    !app ||
    app.context.kind !== 'reservation' ||
    app.context.bookId !== l.c.bookId ||
    !bornEqual({ createTime: app.context.bookBirth }, l.root)
  )
    conflict();
  if (!['cancelled', 'applied'].includes(app.state.phase)) {
    const operationId = digest(['book-lore-delete-application', l.token, l.state.revision]);
    if (app.state.phase === 'cancelling') {
      await advanceApplicationCleanupInTransaction(tx, app, {
        id: app.c.id,
        requestHash: app.context.requestHash,
        jobToken: app.token,
        operationId,
        expectedRevision: app.state.revision,
      });
    } else {
      const plan = await prepareApplicationCancellation(tx, app, operationId);
      plan.commit();
    }
    next.coordinatedUnits++;
    return;
  }
  next.cursor = document.id;
}
