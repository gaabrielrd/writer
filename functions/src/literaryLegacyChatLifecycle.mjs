import {
  workScope,
  workProject,
  readWorkMetadata,
  workFail,
  workId,
} from './workProgressContracts.mjs';
import {
  prepareLiteraryDependencyWrite,
  prepareLiteraryDependencyCleanup,
} from './literaryDependencyClock.mjs';
// Legacy chat keeps its existing storage and receipts. This clock covers changes
// in native private topology; it never copies conversation text or grants access.
export async function prepareLegacyChatMutation(tx, db, uid, data, { cleanup = false } = {}) {
  const c = workScope(db, uid, { target: { kind: 'book', id: workId(data.bookId) } }, []);
  if (cleanup) {
    const book = await readWorkMetadata(tx, c.ref, ['authorId', 'deleting']);
    if (!book.exists || book.data().authorId !== uid || book.data().deleting)
      return { commit() {} };
    return prepareLiteraryDependencyCleanup(tx, db, c.path);
  }
  await workProject(tx, c);
  const chapter = await readWorkMetadata(
    tx,
    db.doc(c.path + '/chapters/' + workId(data.chapterId)),
    ['bookId', 'deleting'],
  );
  if (
    !chapter.exists ||
    chapter.data().deleting ||
    (chapter.data().bookId != null && chapter.data().bookId !== c.target.id)
  )
    workFail('not-found', 'Capítulo indisponível.');
  return prepareLiteraryDependencyWrite(tx, c);
}
