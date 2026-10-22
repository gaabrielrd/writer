import { chapterTextManifest, BOOK_CHAPTER_TEXT_PART_BYTES } from './bookChapterText.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { bornEqual, chunkId, restoreHash, authorize } from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata, workFail } from './workProgressContracts.mjs';

export const BOOK_CHAPTER_BODY_FIELDS = Object.freeze([
  'schemaVersion',
  'ownerId',
  'bookId',
  'bodyId',
  'resource',
  'contentHash',
  'byteLength',
  'chunkCount',
  'pins',
  'state',
  'gcRevision',
]);
const PART_FIELDS = [
  'schemaVersion',
  'ownerId',
  'bookId',
  'bodyId',
  'chapterId',
  'index',
  'byteLength',
  'contentHash',
];
const inconsistent = () =>
  workFail('failed-precondition', 'Não foi possível conferir a origem do corpo de texto.');
export const chapterBodyPath = (bookId, bodyId) => {
  bookContentId(bookId);
  restoreHash(bodyId);
  return 'books/' + bookId + '/bookTextBodies/' + bodyId;
};
/** Owning project must be authorized first. Returns a bounded plan, no writes or prose reads. */
export async function prepareBookChapterBodyCleanup(
  tx,
  db,
  { uid, bookId, body, limit, requireUnreferenced = true },
) {
  authorize(uid);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) inconsistent();
  const value = body.data(),
    path = chapterBodyPath(bookId, body.id);
  if (
    !value ||
    body.ref.path !== path ||
    value.ownerId !== uid ||
    value.bookId !== bookId ||
    value.bodyId !== body.id ||
    value.schemaVersion !== 1 ||
    value.resource?.kind !== 'chapter' ||
    !Number.isSafeInteger(value.pins) ||
    value.pins < 0 ||
    (value.pins === 0 ? value.state !== 'unreferenced' : value.state !== 'ready') ||
    (requireUnreferenced && value.pins !== 0)
  )
    inconsistent();
  bookContentId(value.resource.id);
  const manifest = chapterTextManifest({
      schemaVersion: value.schemaVersion,
      bodyId: value.bodyId,
      contentHash: value.contentHash,
      byteLength: value.byteLength,
      chunkCount: value.chunkCount,
    }),
    revision = Object.hasOwn(value, 'gcRevision') ? value.gcRevision : 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER)
    inconsistent();
  const page = await tx.get(
      db
        .collection(path + '/chunks')
        .orderBy('__name__')
        .select(...PART_FIELDS)
        .limit(limit + 1),
    ),
    selected = page.docs.slice(0, limit),
    remove = [];
  for (const snapshot of selected) {
    const part = snapshot.data();
    if (
      !part ||
      part.schemaVersion !== 1 ||
      part.ownerId !== uid ||
      part.bookId !== bookId ||
      part.bodyId !== body.id ||
      part.chapterId !== value.resource.id ||
      !Number.isSafeInteger(part.index) ||
      part.index < 0 ||
      part.index >= manifest.chunkCount ||
      snapshot.id !== chunkId(part.index) ||
      part.byteLength !==
        Math.min(
          BOOK_CHAPTER_TEXT_PART_BYTES,
          manifest.byteLength - part.index * BOOK_CHAPTER_TEXT_PART_BYTES,
        ) ||
      !bornEqual(snapshot, body) ||
      !bornEqual(snapshot, { createTime: snapshot.updateTime })
    )
      inconsistent();
    restoreHash(part.contentHash);
    remove.push(snapshot.ref);
  }
  const headerRemoved = page.docs.length === 0;
  if (headerRemoved) remove.push(body.ref);
  return { remove, headerRemoved, nextRevision: revision + 1 };
}
export function createBookChapterCleanupService({ db }) {
  return {
    async collectBookChapterBody({ bookId, bodyId, expectedBirth }) {
      const path = chapterBodyPath(bookId, bodyId);
      return db.runTransaction(async (tx) => {
        const root = (
            await readWorkMetadata(tx, db.doc('books/' + bookId), ['authorId', 'deleting'])
          ).data(),
          body = await readWorkMetadata(tx, db.doc(path), BOOK_CHAPTER_BODY_FIELDS);
        if (!root || root.deleting) return { complete: true, processed: 0, deferred: true };
        if (!body.exists) return { complete: true, processed: 0 };
        if (!bornEqual(body, { createTime: expectedBirth })) inconsistent();
        const value = body.data();
        if (value.state !== 'unreferenced' || value.pins !== 0)
          return { complete: true, processed: 0 };
        const plan = await prepareBookChapterBodyCleanup(tx, db, {
          uid: root.authorId,
          bookId,
          body,
          limit: 50,
        });
        for (const ref of plan.remove) tx.delete(ref);
        if (!plan.headerRemoved) tx.update(body.ref, { gcRevision: plan.nextRevision });
        return { complete: plan.headerRemoved, processed: plan.remove.length };
      });
    },
  };
}
/** CloudEvent is trusted transport; current native state is still rechecked. */
export function createBookChapterCleanupHandler({ db }) {
  const service = createBookChapterCleanupService({ db });
  return async (event) => {
    const after = event.data?.after,
      value = after?.data();
    if (!value || value.state !== 'unreferenced' || value.pins !== 0) return null;
    const { bookId, bodyId } = event.params ?? {},
      path = chapterBodyPath(bookId, bodyId);
    if (after.ref?.path !== path || value.bookId !== bookId || value.bodyId !== bodyId)
      inconsistent();
    return service.collectBookChapterBody({ bookId, bodyId, expectedBirth: after.createTime });
  };
}
