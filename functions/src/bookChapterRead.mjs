import { openBookChapterText, readBookChapterTextPart } from './bookChapterText.mjs';
import { bookBackupIdentity, bookBackupToken } from './bookBackupContext.mjs';
import {
  digest,
  workClosed,
  workId,
  workScope,
  workProject,
  workFail,
  workConflict,
} from './workProgressContracts.mjs';

/** Read only the current chapter generation; never authorizes a reserved destination. */
export function addBookChapterRead(api, { db }) {
  api.readLegacyChapterText = async (uid, data) => {
    workClosed(data, ['bookId', 'chapterId', 'bodyId', 'index', 'sourceToken']);
    const bookId = workId(data.bookId),
      chapterId = workId(data.chapterId),
      bodyId = bookBackupToken(data.bodyId),
      expected = data.sourceToken == null ? null : bookBackupToken(data.sourceToken),
      context = workScope(db, uid, { target: { kind: 'book', id: bookId } }, []);
    if (
      !Number.isSafeInteger(data.index) ||
      data.index < 0 ||
      data.index >= 128 ||
      (data.index !== 0 && expected === null)
    )
      workFail('invalid-argument', 'Parte inválida do capítulo.');
    return db.runTransaction(async (tx) => {
      await workProject(tx, context);
      const bookSnapshot = await tx.get(context.ref),
        snapshot = await tx.get(db.doc(context.path + '/chapters/' + chapterId)),
        chapter = snapshot.data();
      if (!chapter || chapter.deleting || chapter.contentMode === 'scenes')
        workFail('not-found', 'Capítulo indisponível.');
      const opened = await openBookChapterText(tx, db, { uid, bookId, chapterId, chapter });
      if ('inline' in opened || opened.manifest.bodyId !== bodyId) workConflict();
      const sourceToken = digest({
        version: 1,
        uid,
        bookId,
        chapterId,
        bookCreated: bookBackupIdentity(bookSnapshot).created,
        chapter: bookBackupIdentity(snapshot),
        bodyCreated: bookBackupIdentity(opened.body).created,
        manifest: opened.manifest,
      });
      if (expected !== null && expected !== sourceToken) workConflict();
      const bytes = await readBookChapterTextPart(tx, db, opened, data.index);
      return {
        bookId,
        chapterId,
        manifest: opened.manifest,
        sourceToken,
        index: data.index,
        chunkBase64: Buffer.from(bytes).toString('base64'),
      };
    });
  };
}
