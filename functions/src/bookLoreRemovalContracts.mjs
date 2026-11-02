import { authorize, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { editInspectionRef } from './bookLoreEditReservationContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
export const removalConflict = () =>
  workFail(
    'failed-precondition',
    'A exclusão da ficha mudou ou está indisponível.',
    'book-lore-removal-conflict',
  );
export function removalIntent(uid, r) {
  authorize(uid);
  closed(r, ['bookId', 'loreId', 'removalId', 'sourceToken', 'inspection']);
  return {
    bookId: bookContentId(r.bookId),
    loreId: bookContentId(r.loreId),
    removalId: bookContentId(r.removalId),
    sourceToken: restoreHash(r.sourceToken),
    inspection: editInspectionRef(r.inspection),
  };
}
export const removalStartHash = (intent) =>
  digest({ domain: 'writer-book-lore-removal', schemaVersion: 1, intent });
export function removalPaths(db, uid, id) {
  authorize(uid);
  bookContentId(id);
  const path = 'users/' + uid + '/bookLoreRemovals/' + id;
  return { db, uid, id, path, ref: db.doc(path), stateRef: db.doc(path + '/state/current') };
}
export function removalRequest(uid, r, mutate = false) {
  authorize(uid);
  closed(
    r,
    ['removalId', 'startHash', ...(mutate ? ['jobToken', 'operationId', 'expectedRevision'] : [])],
    mutate ? [] : ['jobToken'],
  );
  const v = { removalId: bookContentId(r.removalId), startHash: restoreHash(r.startHash) };
  if (Object.hasOwn(r, 'jobToken')) v.jobToken = restoreHash(r.jobToken);
  if (mutate) {
    v.operationId = bookContentId(r.operationId);
    integer(r.expectedRevision);
    v.expectedRevision = r.expectedRevision;
  }
  return v;
}
export const removalTombstonePath = (bookId, loreId) =>
  'books/' + bookId + '/bookLoreTombstones/' + loreId;
export const removalToken = (c, s, context) =>
  digest({
    domain: 'writer-book-lore-removal-job',
    uid: c.uid,
    id: c.id,
    birth: { seconds: s.createTime.seconds, nanoseconds: s.createTime.nanoseconds },
    context,
  });
export const removalView = (l) => ({
  removalId: l.c.id,
  startHash: l.context.startHash,
  jobToken: l.token,
  removed: true,
  revision: l.state.revision,
  phase: l.record.handoff ? 'handed-off' : l.state.phase,
  complete: l.state.complete,
  processed: l.state.processed,
  coordinatedUnits: l.state.coordinatedUnits,
});
