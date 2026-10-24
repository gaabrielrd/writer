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
/** Parent closes before child cleanup; B1 has not enabled any byte producer. */
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
  if (app.state.phase !== 'cancelled') {
    const plan = await prepareApplicationCancellation(
      tx,
      app,
      digest(['book-lore-delete-application', l.token, l.state.revision]),
    );
    plan.commit();
    next.coordinatedUnits++;
  }
  next.cursor = document.id;
}
