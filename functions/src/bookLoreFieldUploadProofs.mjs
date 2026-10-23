import { born, bornEqual, closed, chunkId } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { resourcePayloadBodyPath, resourcePayloadChunkPath } from './bookResourcePayloadPaths.mjs';
import { openBookResourcePayload } from './bookResourcePayloadRead.mjs';
import {
  fieldUploadConflict as conflict,
  fieldUploadResource,
  uploadImmutable,
  uploadAtMost,
} from './bookLoreFieldUploadContracts.mjs';
import {
  uploadPair,
  loadFieldUpload,
  uploadSource,
  loadFieldState,
} from './bookLoreFieldUploadStore.mjs';
export function uploadArtifactAddress(loaded, kind, index = null) {
  const { c, job: j } = loaded,
    m = j.context.manifest;
  return {
    ref: c.db.doc(
      kind === 'chunk'
        ? resourcePayloadChunkPath(j.context.bookId, m.bodyId, index)
        : resourcePayloadBodyPath(j.context.bookId, m.bodyId),
    ),
    journal: c.db.doc(
      c.path + '/artifacts/' + (kind === 'chunk' ? 'chunk-' + chunkId(index) : 'header'),
    ),
  };
}
export async function prepareUploadArtifact(tx, loaded, kind, index, operationId, value) {
  const address = uploadArtifactAddress(loaded, kind, index);
  const old = await readWorkMetadata(tx, address.ref, []),
    journal = await tx.get(address.journal);
  if (old.exists || journal.exists) conflict();
  return {
    ...address,
    value,
    proof: {
      schemaVersion: 1,
      ownerId: loaded.c.uid,
      uploadId: loaded.c.uploadId,
      jobToken: loaded.token,
      kind,
      index,
      operationId,
      bodyId: loaded.job.context.manifest.bodyId,
    },
  };
}
export function writeUploadArtifact(tx, plan) {
  tx.create(plan.ref, plan.value);
  tx.create(plan.journal, plan.proof);
}
export async function readUploadArtifact(tx, loaded, kind, index = null) {
  const address = uploadArtifactAddress(loaded, kind, index),
    journal = await tx.get(address.journal),
    p = journal.data(),
    fields =
      kind === 'chunk'
        ? ['schemaVersion', 'ownerId', 'bookId', 'bodyId', 'index']
        : [
            'schemaVersion',
            'ownerId',
            'bookId',
            'resource',
            'createdAt',
            ...Object.keys(loaded.job.context.manifest),
          ],
    snapshot = await readWorkMetadata(tx, address.ref, [...new Set(fields)]);
  if (!journal.exists || !uploadImmutable(journal) || !uploadImmutable(snapshot)) conflict();
  closed(p, [
    'schemaVersion',
    'ownerId',
    'uploadId',
    'jobToken',
    'kind',
    'index',
    'operationId',
    'bodyId',
  ]);
  if (
    p.schemaVersion !== 1 ||
    p.ownerId !== loaded.c.uid ||
    p.uploadId !== loaded.c.uploadId ||
    p.jobToken !== loaded.token ||
    p.kind !== kind ||
    p.index !== index ||
    p.bodyId !== loaded.job.context.manifest.bodyId
  )
    conflict();
  const pair = await uploadPair(tx, loaded.c, loaded, p.operationId);
  if (
    !pair ||
    !bornEqual(journal, pair.snapshot) ||
    !bornEqual(snapshot, pair.snapshot) ||
    pair.record.method !==
      (kind === 'chunk' ? 'appendBookLoreFieldUpload' : 'advanceBookLoreFieldSeal')
  )
    conflict();
  const j = loaded.job,
    expected =
      kind === 'chunk'
        ? {
            schemaVersion: 1,
            ownerId: loaded.c.uid,
            bookId: j.context.bookId,
            bodyId: j.context.manifest.bodyId,
            index,
          }
        : {
            ...j.context.manifest,
            ownerId: loaded.c.uid,
            bookId: j.context.bookId,
            resource: fieldUploadResource({ ...j.context, uid: loaded.c.uid }).resource,
            createdAt: j.createdAt,
          };
  if (digest(snapshot.data()) !== digest(expected)) conflict();
  if (
    kind === 'chunk' ? pair.record.progress.nextIndex !== index + 1 : !pair.record.progress.prepared
  )
    conflict();
  return { ...address, snapshot, journal, pair };
}
export async function uploadSealBarrier(tx, loaded) {
  const pair = await uploadPair(tx, loaded.c, loaded, loaded.job.sealBarrierOperationId);
  if (
    !pair ||
    pair.record.method !== 'appendBookLoreFieldUpload' ||
    pair.record.progress.phase !== 'verifying' ||
    pair.record.progress.nextIndex !== loaded.job.context.manifest.chunkCount ||
    pair.record.progress.byteLength !== loaded.job.context.manifest.byteLength
  )
    conflict();
  return born(pair.snapshot);
}
/** Native authorized opening only; caller must carry partSealBirth into every field read. */
export async function openSealedBookLoreFieldUpload(tx, c, r) {
  const loaded = await loadFieldUpload(tx, c, r);
  if (!loaded || loaded.job.kind !== 'upload' || loaded.job.phase !== 'sealed') conflict();
  await uploadSource(tx, c, loaded.job.context);
  await loadFieldState(tx, loaded);
  const artifact = await readUploadArtifact(tx, loaded, 'header'),
    partSealBirth = await uploadSealBarrier(tx, loaded),
    expectedBirth = born(artifact.snapshot);
  if (!uploadAtMost(partSealBirth, expectedBirth)) conflict();
  const pointer = { manifest: loaded.job.context.manifest, expectedBirth, partSealBirth },
    opened = await openBookResourcePayload(tx, c.db, {
      ...fieldUploadResource({ ...loaded.job.context, uid: c.uid }),
      ...pointer,
    });
  return { loaded, target: loaded.job.context.target, pointer, opened };
}
