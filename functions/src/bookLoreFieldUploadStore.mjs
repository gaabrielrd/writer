import { born, bornEqual, closed, integer } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import { readLoreBook, loreEntityToken } from './bookLoreReadContracts.mjs';
import { openBookLoreRecord } from './bookLoreStorageRead.mjs';
import {
  FIELD_UPLOAD_ALGORITHM,
  fieldUploadConflict as conflict,
  fieldUploadIntent,
  fieldUploadStartHash,
  uploadJobToken,
  uploadView,
  uploadImmutable,
  uploadAtMost,
} from './bookLoreFieldUploadContracts.mjs';
import { editUploadReservation, editPreparationRef } from './bookLoreEditReservationContracts.mjs';
import { openCreationUploadSource } from './bookLoreCreationSource.mjs';
import { verifyCreationUploadBinding } from './bookLoreCreationUploads.mjs';
const openings = new WeakMap();
export const assertFieldUploadOpening = (tx, loaded) => {
  if (openings.get(loaded) !== tx) conflict();
};
const identityUpdate = (s) => born({ createTime: s.updateTime });
export const uploadStateFields = [
  'schemaVersion',
  'ownerId',
  'uploadId',
  'startHash',
  'algorithm',
  'hashState',
  'parserState',
];
export const uploadLeaseRef = (c, j) =>
  c.db.doc('books/' + j.context.bookId + '/bookResourceLeases/' + j.context.manifest.bodyId);
export async function uploadSource(tx, c, context, full = false) {
  if (context.creation) return (await openCreationUploadSource(tx, c, context)).origin;
  const scope = { db: c.db, uid: c.uid, bookId: context.bookId, path: 'books/' + context.bookId },
    book = await readLoreBook(tx, scope),
    ref = c.db.doc(scope.path + '/lore/' + context.loreId),
    snapshot = full
      ? await tx.get(ref)
      : await readWorkMetadata(tx, ref, [
          'bookId',
          'ownerId',
          'deleting',
          'rebalancing',
          'universeId',
          'adventureId',
        ]),
    data = snapshot.data();
  if (
    !snapshot.exists ||
    loreEntityToken(scope, book, snapshot) !== context.sourceToken ||
    (context.bookBirth && !bornEqual(book.snapshot, { createTime: context.bookBirth })) ||
    (Object.hasOwn(data, 'deleting') && data.deleting !== false) ||
    (Object.hasOwn(data, 'rebalancing') && data.rebalancing !== false) ||
    (data.bookId !== undefined && data.bookId !== context.bookId) ||
    (data.ownerId !== undefined && data.ownerId !== c.uid) ||
    Object.hasOwn(data, 'universeId') ||
    Object.hasOwn(data, 'adventureId')
  )
    conflict();
  if (full) await openBookLoreRecord(tx, scope, snapshot);
  return { bookBirth: born(book.snapshot) };
}
export async function uploadPair(tx, c, loaded, operationId) {
  bookContentId(operationId);
  const receipt = await tx.get(c.db.doc(c.path + '/operations/' + operationId)),
    anchor = await tx.get(c.db.doc(c.path + '/operationProofs/' + operationId));
  if (!receipt.exists && !anchor.exists) return null;
  const r = receipt.data(),
    a = anchor.data();
  if (
    !uploadImmutable(receipt) ||
    !uploadImmutable(anchor) ||
    !bornEqual(receipt, anchor) ||
    !uploadAtMost(born(loaded.snapshot), born(receipt))
  )
    conflict();
  closed(r, [
    'schemaVersion',
    'ownerId',
    'uploadId',
    'startHash',
    'jobToken',
    'operationId',
    'method',
    'requestHash',
    'revision',
    'jobHash',
    'progress',
  ]);
  closed(a, [
    'schemaVersion',
    'ownerId',
    'uploadId',
    'startHash',
    'jobToken',
    'operationId',
    'receiptHash',
  ]);
  for (const [key, value] of Object.entries({
    schemaVersion: 1,
    ownerId: c.uid,
    uploadId: c.uploadId,
    startHash: loaded.job.startHash,
    jobToken: loaded.token,
    operationId,
  })) {
    if (r[key] !== value || a[key] !== value) conflict();
  }
  if (
    a.receiptHash !== digest(r) ||
    r.progress?.jobToken !== loaded.token ||
    r.progress?.revision !== r.revision
  )
    conflict();
  integer(r.revision, 1);
  if (
    r.revision > loaded.job.revision ||
    !uploadAtMost(born(receipt), identityUpdate(loaded.snapshot))
  )
    conflict();
  return { snapshot: receipt, record: r };
}
export async function loadFieldUpload(tx, c, r) {
  const snapshot = await tx.get(c.ref);
  if (!snapshot.exists) return null;
  const j = snapshot.data();
  if (
    j?.schemaVersion !== 1 ||
    j.ownerId !== c.uid ||
    j.uploadId !== c.uploadId ||
    j.startHash !== r.startHash
  )
    conflict();
  if (j.kind === 'fence') {
    closed(j, ['schemaVersion', 'kind', 'ownerId', 'uploadId', 'startHash', 'phase']);
    if (j.phase !== 'cancelled' || !uploadImmutable(snapshot) || r.jobToken !== undefined)
      conflict();
    return { c, snapshot, job: j, token: null };
  }
  closed(
    j,
    [
      'schemaVersion',
      'kind',
      'inventoryVersion',
      'ownerId',
      'uploadId',
      'startHash',
      'context',
      'phase',
      'revision',
      'nextIndex',
      'byteLength',
      'sealIndex',
      'sealed',
      'artifactCount',
      'cleanupIndex',
      'cleanedCount',
      'stateHash',
      'createdAt',
      'lastOperationId',
      'sealBarrierOperationId',
    ],
    ['reservation', 'materialization'],
  );
  if (Object.hasOwn(j, 'materialization')) {
    editPreparationRef(j.materialization);
    if (j.materialization.sourceToken !== j.context.sourceToken) conflict();
  }
  closed(
    j.context,
    ['bookId', 'loreId', 'uploadId', 'sourceToken', 'target', 'manifest', 'bookBirth'],
    ['creation', 'creationBirth'],
  );
  if (Object.hasOwn(j.context, 'creation') !== Object.hasOwn(j.context, 'creationBirth'))
    conflict();
  if (j.context.creationBirth) born({ createTime: j.context.creationBirth });
  const { bookBirth, creationBirth, ...intent } = j.context;
  void creationBirth;
  born({ createTime: bookBirth });
  if (
    j.kind !== 'upload' ||
    j.inventoryVersion !== (j.context.creation ? 2 : 1) ||
    j.context.uploadId !== c.uploadId ||
    fieldUploadStartHash(fieldUploadIntent(c.uid, intent)) !== j.startHash ||
    !['uploading', 'verifying', 'sealed', 'reserved', 'cancelling', 'cancelled'].includes(
      j.phase,
    ) ||
    typeof j.sealed !== 'boolean'
  )
    conflict();
  for (const key of [
    'revision',
    'nextIndex',
    'byteLength',
    'sealIndex',
    'artifactCount',
    'cleanupIndex',
    'cleanedCount',
    'createdAt',
  ])
    integer(j[key]);
  if (Object.hasOwn(j, 'reservation')) {
    editUploadReservation(j.reservation);
    if (!['reserved', 'cancelling', 'cancelled'].includes(j.phase)) conflict();
  } else if (j.phase === 'reserved') conflict();
  const m = j.context.manifest;
  if (j.reservation && (!j.sealed || j.nextIndex !== m.chunkCount || j.sealIndex !== m.chunkCount))
    conflict();
  if (
    !Number.isFinite(new Date(j.createdAt).getTime()) ||
    j.nextIndex > m.chunkCount ||
    j.sealIndex > j.nextIndex ||
    j.byteLength !== Math.min(j.nextIndex * 65536, m.byteLength) ||
    j.artifactCount !== j.nextIndex + (j.sealed ? 1 : 0) ||
    j.cleanupIndex > j.nextIndex ||
    j.cleanedCount > j.artifactCount
  )
    conflict();
  if (
    j.phase === 'uploading'
      ? j.nextIndex >= m.chunkCount ||
        j.sealIndex !== 0 ||
        j.sealed ||
        typeof j.stateHash !== 'string'
      : j.stateHash !== null
  )
    conflict();
  if (
    j.phase === 'verifying' &&
    (j.sealed || j.nextIndex !== m.chunkCount || j.sealIndex >= m.chunkCount)
  )
    conflict();
  if (
    ['sealed', 'reserved'].includes(j.phase) &&
    (!j.sealed || j.nextIndex !== m.chunkCount || j.sealIndex !== m.chunkCount)
  )
    conflict();
  if (
    j.phase === 'cancelled' &&
    (j.cleanedCount !== j.artifactCount || j.cleanupIndex !== j.nextIndex)
  )
    conflict();
  if ((j.nextIndex === m.chunkCount) !== (typeof j.sealBarrierOperationId === 'string')) conflict();
  const token = uploadJobToken(c, snapshot, j),
    leaseRef = uploadLeaseRef(c, j),
    lease = await tx.get(leaseRef),
    v = lease.data(),
    loaded = { c, snapshot, job: j, token, leaseRef, lease };
  if (r.jobToken !== undefined && r.jobToken !== token) conflict();
  if (
    !lease.exists ||
    !bornEqual(snapshot, lease) ||
    digest(identityUpdate(snapshot)) !== digest(identityUpdate(lease))
  )
    conflict();
  closed(
    v,
    [
      'schemaVersion',
      'ownerId',
      'uploadId',
      'startHash',
      'bookId',
      'loreId',
      'bodyId',
      'phase',
      'revision',
    ],
    ['reservation', 'materialization'],
  );
  if (
    digest(v) !==
    digest({
      schemaVersion: 1,
      ownerId: c.uid,
      uploadId: c.uploadId,
      startHash: j.startHash,
      bookId: j.context.bookId,
      loreId: j.context.loreId,
      bodyId: m.bodyId,
      phase: j.phase,
      revision: j.revision,
      ...(j.reservation ? { reservation: j.reservation } : {}),
      ...(j.materialization ? { materialization: j.materialization } : {}),
    })
  )
    conflict();
  if (j.revision === 0) {
    if (j.lastOperationId !== null || !uploadImmutable(snapshot) || !uploadImmutable(lease))
      conflict();
  } else {
    if (typeof j.lastOperationId !== 'string') conflict();
    const proof = await uploadPair(tx, c, loaded, j.lastOperationId);
    if (
      !proof ||
      proof.record.revision !== j.revision ||
      proof.record.jobHash !== digest(j) ||
      digest(identityUpdate(snapshot)) !== digest(born(proof.snapshot))
    )
      conflict();
  }
  if (j.context.creation) {
    if (j.materialization) conflict();
    await verifyCreationUploadBinding(tx, loaded);
  }
  openings.set(loaded, tx);
  return loaded;
}
export async function loadFieldState(tx, loaded) {
  const { c, job: j, snapshot } = loaded,
    s = await tx.get(c.stateRef);
  if (j.phase !== 'uploading') {
    if (s.exists) conflict();
    return null;
  }
  const v = s.data();
  closed(v, uploadStateFields);
  if (
    !s.exists ||
    !bornEqual(s, snapshot) ||
    digest(identityUpdate(s)) !== digest(identityUpdate(snapshot)) ||
    digest(v) !== j.stateHash ||
    v.schemaVersion !== 1 ||
    v.ownerId !== c.uid ||
    v.uploadId !== c.uploadId ||
    v.startHash !== j.startHash ||
    v.algorithm !== FIELD_UPLOAD_ALGORITHM ||
    v.parserState?.field !== j.context.target.field ||
    v.parserState?.byteLength !== j.byteLength ||
    (j.context.target.field === 'relations' &&
      v.parserState.relationCount !== j.context.target.count)
  )
    conflict();
  return v;
}
export async function replayFieldOperation(tx, loaded, method, r) {
  const pair = await uploadPair(tx, loaded.c, loaded, r.operationId);
  if (!pair) return null;
  if (pair.record.method !== method || pair.record.requestHash !== digest(r)) conflict();
  return { receipt: pair.record.progress, progress: uploadView(loaded) };
}
export function commitFieldOperation(tx, loaded, method, r, patch) {
  assertFieldUploadOpening(tx, loaded);
  const { c, job } = loaded,
    revision = job.revision + 1;
  if (job.reservation && patch.reservation && digest(job.reservation) !== digest(patch.reservation))
    conflict();
  if (
    job.phase === 'reserved' &&
    patch.phase &&
    patch.phase !== 'reserved' &&
    method !== 'cancelReservedBookLoreEditUpload'
  )
    conflict();
  if (
    patch.phase === 'reserved' &&
    (job.phase !== 'sealed' || method !== 'reserveBookLoreEditUpload' || !patch.reservation)
  )
    conflict();
  if (!Number.isSafeInteger(revision)) conflict();
  const next = { ...job, ...patch, revision, lastOperationId: r.operationId },
    progress = uploadView({ ...loaded, job: next }),
    record = {
      schemaVersion: 1,
      ownerId: c.uid,
      uploadId: c.uploadId,
      startHash: job.startHash,
      jobToken: loaded.token,
      operationId: r.operationId,
      method,
      requestHash: digest(r),
      revision,
      jobHash: digest(next),
      progress,
    },
    anchor = {
      schemaVersion: 1,
      ownerId: c.uid,
      uploadId: c.uploadId,
      startHash: job.startHash,
      jobToken: loaded.token,
      operationId: r.operationId,
      receiptHash: digest(record),
    };
  tx.update(c.ref, next);
  tx.update(loaded.leaseRef, {
    phase: next.phase,
    revision,
    ...(next.reservation ? { reservation: next.reservation } : {}),
  });
  tx.create(c.db.doc(c.path + '/operations/' + r.operationId), record);
  tx.create(c.db.doc(c.path + '/operationProofs/' + r.operationId), anchor);
  return { receipt: progress, progress };
}
