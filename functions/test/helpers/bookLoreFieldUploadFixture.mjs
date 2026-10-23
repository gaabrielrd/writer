import { createBookLoreReadService } from '../../src/bookLoreRead.mjs';
import { createBookLoreFieldUploadService } from '../../src/bookLoreFieldUpload.mjs';
import {
  fieldUploadOperationId,
  fieldUploadStartHash,
  fieldUploadIntent,
  fieldUploadPaths,
} from '../../src/bookLoreFieldUploadContracts.mjs';
import { openSealedBookLoreFieldUpload } from '../../src/bookLoreFieldUploadProofs.mjs';
import { readBookResourcePayload } from '../../src/bookResourcePayloadRead.mjs';
import { prepareBookResourcePayload } from '../../src/bookResourcePayload.mjs';
import { seedBookLoreRead } from './bookLoreReadFixture.mjs';
export async function fieldUploadFixture(
  db,
  {
    uid = 'author',
    bookId = 'book',
    loreId = 'entity',
    uploadId = 'field-upload-0001',
    value = '\ufeffnew literal 🌙',
    target = { field: 'details' },
    inline = true,
  } = {},
) {
  await seedBookLoreRead(db, {
    uid,
    bookId,
    id: loreId,
    inline,
    data: { name: 'Original', category: 'other', details: 'saved' },
  });
  const view = await createBookLoreReadService({ db }).getBookLoreRead(uid, { bookId, id: loreId }),
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
      sourceToken: view.readToken,
      target,
      manifest: prepared.manifest,
    }),
    startHash = fieldUploadStartHash(intent),
    factory = () => createBookLoreFieldUploadService({ db, now: () => 1000 }),
    c = fieldUploadPaths(db, uid, uploadId);
  const f = {
    db,
    uid,
    bookId,
    loreId,
    uploadId,
    value,
    target,
    prepared,
    intent,
    startHash,
    factory,
    c,
  };
  return f;
}
export const control = (f, p, operationId, extra = {}) => ({
  uploadId: f.uploadId,
  startHash: f.startHash,
  jobToken: p.jobToken,
  operationId,
  expectedRevision: p.revision,
  ...extra,
});
export const appendRequest = (f, p, index = p.nextIndex, operationId = 'append-' + index) => {
  const part = f.prepared.part(index);
  return control(f, p, operationId, {
    index,
    chunkBase64: part.bytes.toString('base64'),
    proof: part.proof,
  });
};
export async function uploadAll(f, p) {
  let current = p ?? (await f.factory().startBookLoreFieldUpload(f.uid, f.intent));
  while (current.phase === 'uploading')
    current = (await f.factory().appendBookLoreFieldUpload(f.uid, appendRequest(f, current)))
      .progress;
  return current;
}
export async function sealAll(f, p) {
  let current = p;
  while (current.phase === 'verifying')
    current = (
      await f
        .factory()
        .advanceBookLoreFieldSeal(f.uid, control(f, current, 'seal-' + current.sealIndex))
    ).progress;
  return current;
}
export async function cancelAll(f, p) {
  let current = (
    await f.factory().cancelBookLoreFieldUpload(f.uid, {
      uploadId: f.uploadId,
      startHash: f.startHash,
      jobToken: p.jobToken,
      operationId: 'cancel-upload',
    })
  ).progress;
  while (current.phase === 'cancelling')
    current = (
      await f
        .factory()
        .advanceBookLoreFieldCleanup(f.uid, control(f, current, 'cleanup-' + current.revision))
    ).progress;
  return current;
}
export async function readSealedField(f, p) {
  return f.db.runTransaction(async (tx) => {
    const opening = await openSealedBookLoreFieldUpload(tx, f.c, {
      startHash: f.startHash,
      jobToken: p.jobToken,
    });
    return readBookResourcePayload(tx, f.db, {
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
      ...opening.pointer,
    });
  });
}
