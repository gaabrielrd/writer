import { authorize, closed, born, integer } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { resourcePayloadManifest } from './bookResourcePayloadContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
import { createBookLoreFieldValidation } from './bookLoreFieldValidation.mjs';
import { resourcePayloadBodyId } from './bookResourcePayload.mjs';

import { creationRef } from './bookLoreCreationContracts.mjs';
export const FIELD_UPLOAD_ALGORITHM = 'sha256/hash-wasm@4.12.0';
export const fieldUploadConflict = () =>
  workFail(
    'failed-precondition',
    'A preparação do campo mudou ou está indisponível.',
    'book-lore-upload-conflict',
  );
export const fieldUploadInvalid = () =>
  workFail('invalid-argument', 'Preparação de campo inválida.', 'book-lore-upload-invalid');
export const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fieldUploadInvalid();
  return value;
};
export function fieldTarget(value) {
  closed(value, ['field'], value?.field === 'relations' ? ['page', 'count'] : []);
  if (value.field === 'relations') {
    closed(value, ['field', 'page', 'count']);
    integer(value.page);
    integer(value.count);
  }
  createBookLoreFieldValidation(
    value.field === 'relations'
      ? { field: value.field, count: value.count }
      : { field: value.field },
  );
  return {
    field: value.field,
    ...(value.field === 'relations' ? { page: value.page, count: value.count } : {}),
  };
}
export const fieldUploadOperationId = (uid, bookId, loreId, uploadId, target) =>
  digest({
    domain: 'writer-lore-field-operation',
    uid,
    bookId,
    loreId,
    uploadId,
    target: fieldTarget(target),
  });
export const fieldUploadResource = (c) => ({
  uid: c.uid,
  bookId: c.bookId,
  resource: { kind: 'lore', parentId: null, id: c.loreId },
});
export function fieldUploadIntent(uid, input) {
  authorize(uid);
  closed(
    input,
    ['bookId', 'loreId', 'uploadId', 'sourceToken', 'target', 'manifest'],
    ['creation'],
  );
  const intent = {
    bookId: bookContentId(input.bookId),
    loreId: bookContentId(input.loreId),
    uploadId: bookContentId(input.uploadId),
    sourceToken: hash(input.sourceToken),
    target: fieldTarget(input.target),
    manifest: resourcePayloadManifest(input.manifest),
    ...(Object.hasOwn(input, 'creation') ? { creation: creationRef(input.creation) } : {}),
  };
  if (intent.creation && intent.creation.jobToken !== intent.sourceToken) fieldUploadInvalid();
  const operationId = fieldUploadOperationId(
    uid,
    intent.bookId,
    intent.loreId,
    intent.uploadId,
    intent.target,
  );
  if (
    resourcePayloadBodyId(fieldUploadResource({ ...intent, uid }), {
      operationId,
      ...intent.manifest,
    }) !== intent.manifest.bodyId
  )
    fieldUploadInvalid();
  return intent;
}
export const fieldUploadStartHash = (intent) =>
  digest({ domain: 'writer-lore-field-start', schemaVersion: 1, intent });
export function fieldUploadRequest(uid, input, extra = [], mutation = false) {
  authorize(uid);
  closed(
    input,
    ['uploadId', 'startHash', ...(mutation ? ['operationId'] : []), ...extra],
    ['jobToken'],
  );
  const r = { uploadId: bookContentId(input.uploadId), startHash: hash(input.startHash) };
  if (input.jobToken !== undefined) r.jobToken = hash(input.jobToken);
  if (mutation) r.operationId = bookContentId(input.operationId);
  for (const key of extra) r[key] = input[key];
  return r;
}
export function fieldUploadCAS(r) {
  if (r.jobToken === undefined) fieldUploadInvalid();
  integer(r.expectedRevision);
}
export function fieldUploadBytes(value) {
  if (typeof value !== 'string' || !value || value.length > 87384) fieldUploadInvalid();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > 65536 || bytes.toString('base64') !== value) fieldUploadInvalid();
  return bytes;
}
export function fieldUploadPaths(db, uid, uploadId) {
  authorize(uid);
  bookContentId(uploadId);
  const path = 'users/' + uid + '/bookLoreFieldUploads/' + uploadId;
  return { db, uid, uploadId, path, ref: db.doc(path), stateRef: db.doc(path + '/state/current') };
}
export const uploadJobToken = (c, snapshot, j) =>
  digest({
    domain: 'writer-lore-field-upload',
    schemaVersion: 1,
    uid: c.uid,
    uploadId: c.uploadId,
    startHash: j.startHash,
    birth: born(snapshot),
  });
export const uploadView = (loaded) =>
  loaded.job.kind === 'fence'
    ? {
        uploadId: loaded.c.uploadId,
        startHash: loaded.job.startHash,
        jobToken: null,
        phase: 'cancelled',
        revision: 0,
        nextIndex: 0,
        sealIndex: 0,
        totalParts: 0,
        byteLength: 0,
        cleanupIndex: 0,
        cleanedCount: 0,
        prepared: false,
      }
    : {
        uploadId: loaded.c.uploadId,
        startHash: loaded.job.startHash,
        jobToken: loaded.token,
        phase: loaded.job.phase,
        revision: loaded.job.revision,
        nextIndex: loaded.job.nextIndex,
        sealIndex: loaded.job.sealIndex,
        totalParts: loaded.job.context.manifest.chunkCount,
        byteLength: loaded.job.byteLength,
        cleanupIndex: loaded.job.cleanupIndex,
        cleanedCount: loaded.job.cleanedCount,
        prepared: loaded.job.phase === 'sealed',
      };
export const uploadImmutable = (s) =>
  s.exists && digest(born(s)) === digest(born({ createTime: s.updateTime }));
export const uploadAtMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
