import { createWorkProgressService } from '../../src/workProgress.mjs';
import { createWorkHistoryService } from '../../src/workHistory.mjs';
import { digest } from '../../src/sceneContracts.mjs';
export async function chapterWritingFixture(db) {
  const uid = 'author',
    bookId = 'book',
    chapterId = 'chapter',
    target = { kind: 'book', id: bookId },
    resource = { kind: 'chapter', id: chapterId },
    api = createWorkProgressService({ db, now: () => 2000 }),
    history = createWorkHistoryService({ db, now: () => 3000 });
  await db.runTransaction((tx) => {
    tx.create(db.doc('books/book'), {
      authorId: uid,
      title: 'Book',
      status: 'draft',
      wordCount: 1,
      createdAt: 1,
      updatedAt: 1000,
    });
    tx.create(db.doc('books/book/chapters/chapter'), {
      id: chapterId,
      bookId,
      ownerId: uid,
      title: 'Chapter',
      order: 1,
      content: 'Base',
      wordCount: 1,
      createdAt: 1,
      updatedAt: 1000,
    });
    return Promise.resolve();
  });
  const source = () => history.getWorkVersionSource(uid, { target, resource });
  const save = async (content, operationId, expectedContentHash) =>
    api.saveLegacyChapter(uid, {
      bookId,
      chapterId,
      operationId,
      content,
      expectedContentHash: expectedContentHash ?? (await source()).contentHash,
    });
  const capture = async (operationId) =>
    history.createWorkVersion(uid, {
      target,
      resource,
      operationId,
      expectedSourceToken: (await source()).sourceToken,
    });
  const restore = async (versionId, operationId) =>
    history.restoreWorkVersion(uid, {
      target,
      resource,
      versionId,
      operationId,
      expectedSourceToken: (await source()).sourceToken,
    });
  const readVersion = async (versionId) => {
    const content = [];
    let cursor = null;
    do {
      const page = await history.readWorkVersion(uid, { target, versionId, cursor, limit: 8 });
      content.push(...page.chunks.map((c) => c.content));
      cursor = page.nextCursor;
    } while (cursor);
    return content.join('');
  };
  return {
    db,
    uid,
    bookId,
    chapterId,
    target,
    resource,
    api,
    history,
    source,
    save,
    capture,
    restore,
    readVersion,
    hash: digest,
    deleteVersion: (versionId, operationId) =>
      history.deleteWorkVersion(uid, { target, versionId, operationId }),
  };
}
