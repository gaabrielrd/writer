import { creationFixture, seedCreationBook } from './bookLoreCreationFixture.mjs';
import { createBookLoreFieldUploadService } from '../../src/bookLoreFieldUpload.mjs';
import { prepareBookResourcePayload } from '../../src/bookResourcePayload.mjs';
import {
  fieldUploadOperationId,
  fieldUploadIntent,
  fieldUploadStartHash,
  fieldUploadPaths,
} from '../../src/bookLoreFieldUploadContracts.mjs';
export async function creationUploadFixture(
  db,
  {
    parent = null,
    uid = 'author',
    bookId = 'book',
    creationId = 'creation-operation-0001',
    uploadId = 'creation-field-0001',
    target = { field: 'details' },
    value = '\ufeffliteral 🌙',
  } = {},
) {
  if (!parent) {
    const root = await db.runTransaction(async (tx) => tx.get(db.doc('books/' + bookId)));
    if (!root.exists) await seedCreationBook(db, bookId, uid);
    parent = creationFixture(db, { uid, bookId, creationId });
  }
  const p = await parent.start();
  uid = parent.uid;
  bookId = parent.bookId;
  const loreId = p.loreId,
    prepared = prepareBookResourcePayload({
      uid,
      bookId,
      resource: { kind: 'lore', parentId: null, id: loreId },
      operationId: fieldUploadOperationId(uid, bookId, loreId, uploadId, target),
      timestamp: 1000,
      value,
    }),
    intent = fieldUploadIntent(uid, {
      bookId,
      loreId,
      uploadId,
      sourceToken: p.jobToken,
      target,
      manifest: prepared.manifest,
      creation: { creationId: p.creationId, startHash: p.startHash, jobToken: p.jobToken },
    }),
    factory = () => createBookLoreFieldUploadService({ db, now: () => 1000 });
  return {
    db,
    uid,
    bookId,
    loreId,
    uploadId,
    target,
    value,
    parent,
    parentProgress: p,
    prepared,
    intent,
    startHash: fieldUploadStartHash(intent),
    factory,
    c: fieldUploadPaths(db, uid, uploadId),
  };
}
export const creationCleanupControl = (
  parent,
  p,
  operationId = 'advance-creation-cleanup-' + p.cleanupRevision,
) => ({
  ...parent.intent,
  jobToken: p.jobToken,
  expectedRevision: p.cleanupRevision,
  operationId,
});
export const advanceParent = (parent, p) =>
  parent.factory().advanceBookLoreCreationCleanup(parent.uid, creationCleanupControl(parent, p));
export async function finishCreationUploads(parent, p = null) {
  p ??= await parent.cancel();
  for (let i = 0; i < 10000 && p.phase !== 'cancelled'; i++)
    p = (await advanceParent(parent, p)).progress;
  if (p.phase !== 'cancelled') throw Error('Creation uploads did not finish cleanup');
  return p;
}
