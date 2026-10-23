import { born, bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { readLoreBook, loreEntityToken } from './bookLoreReadContracts.mjs';
import { openBookLoreRecord } from './bookLoreStorageRead.mjs';
import {
  inspectionConflict as conflict,
  inspectionIntent,
  inspectionStartHash,
  inspectionToken,
  inspectionView,
  inspectionImmutable,
  inspectionAtMost,
  inspectionUpdate,
  inspectionMetadata,
  SOURCE_INSPECTION_ALGORITHM,
} from './bookLoreSourceInspectionContracts.mjs';
export async function inspectionSource(tx, c, context) {
  const scope = { db: c.db, uid: c.uid, bookId: context.bookId, path: 'books/' + context.bookId },
    book = await readLoreBook(tx, scope),
    snapshot = await tx.get(c.db.doc(scope.path + '/lore/' + context.loreId));
  if (
    !snapshot.exists ||
    loreEntityToken(scope, book, snapshot) !== context.sourceToken ||
    (context.bookBirth && !bornEqual(book.snapshot, { createTime: context.bookBirth }))
  )
    conflict();
  const opened = await openBookLoreRecord(tx, scope, snapshot);
  if (
    context.mode !== undefined &&
    (context.mode !== opened.mode || digest(context.manifest) !== digest(opened.manifest))
  )
    conflict();
  return { book, opened };
}
function progress(r) {
  closed(r, [
    'inspectionId',
    'startHash',
    'jobToken',
    'phase',
    'revision',
    'nextIndex',
    'byteLength',
    'totalParts',
    'ready',
  ]);
}
export async function inspectionPair(tx, loaded, operationId) {
  bookContentId(operationId);
  const { c, job: j } = loaded,
    ref = c.db.doc(c.path + '/operations/' + operationId),
    receipt = await tx.get(ref),
    anchor = await tx.get(c.db.doc(c.path + '/operationProofs/' + operationId));
  if (!receipt.exists && !anchor.exists) return null;
  if (
    !inspectionImmutable(receipt) ||
    !inspectionImmutable(anchor) ||
    !bornEqual(receipt, anchor) ||
    !inspectionAtMost(born(loaded.snapshot), born(receipt)) ||
    !inspectionAtMost(born(receipt), inspectionUpdate(loaded.snapshot))
  )
    conflict();
  const r = receipt.data(),
    a = anchor.data();
  closed(r, [
    'schemaVersion',
    'ownerId',
    'inspectionId',
    'jobToken',
    'startHash',
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
    'inspectionId',
    'jobToken',
    'startHash',
    'operationId',
    'receiptHash',
  ]);
  for (const [key, value] of Object.entries({
    schemaVersion: 1,
    ownerId: c.uid,
    inspectionId: c.id,
    jobToken: loaded.token,
    startHash: j.startHash,
    operationId,
  }))
    if (r[key] !== value || a[key] !== value) conflict();
  progress(r.progress);
  integer(r.revision, 1);
  if (
    r.revision > j.revision ||
    r.progress.jobToken !== loaded.token ||
    r.progress.revision !== r.revision ||
    a.receiptHash !== digest(r)
  )
    conflict();
  return { snapshot: receipt, record: r };
}
export async function loadSourceInspection(tx, c, r) {
  const snapshot = await tx.get(c.ref);
  if (!snapshot.exists) return null;
  const j = snapshot.data();
  if (
    j.schemaVersion !== 1 ||
    j.ownerId !== c.uid ||
    j.inspectionId !== c.id ||
    j.startHash !== r.startHash
  )
    conflict();
  if (j.kind === 'fence') {
    closed(j, ['schemaVersion', 'kind', 'ownerId', 'inspectionId', 'startHash', 'phase']);
    if (j.phase !== 'cancelled' || !inspectionImmutable(snapshot) || r.jobToken !== undefined)
      conflict();
    return { c, snapshot, job: j, token: null };
  }
  closed(j, [
    'schemaVersion',
    'kind',
    'ownerId',
    'inspectionId',
    'startHash',
    'context',
    'phase',
    'revision',
    'nextIndex',
    'byteLength',
    'stateHash',
    'metadata',
    'lastOperationId',
    'createdAt',
  ]);
  closed(j.context, [
    'bookId',
    'loreId',
    'inspectionId',
    'sourceToken',
    'bookBirth',
    'mode',
    'manifest',
  ]);
  const { bookBirth, mode, manifest, ...intent } = j.context;
  if (
    j.kind !== 'inspection' ||
    j.context.inspectionId !== c.id ||
    inspectionStartHash(inspectionIntent(c.uid, intent)) !== j.startHash ||
    !['inline', 'payload'].includes(mode) ||
    !['checking', 'base', 'privacy', 'ready', 'cancelled'].includes(j.phase)
  )
    conflict();
  closed(bookBirth, ['seconds', 'nanoseconds']);
  born({ createTime: bookBirth });
  for (const k of ['revision', 'nextIndex', 'byteLength', 'createdAt']) integer(j[k]);
  if (!Number.isFinite(new Date(j.createdAt).getTime())) conflict();
  if (manifest !== null) {
    closed(manifest, ['schemaVersion', 'contentHash', 'byteLength', 'chunkCount']);
    restoreHash(manifest.contentHash);
    integer(manifest.byteLength, 1);
    integer(manifest.chunkCount, 1);
    if (
      manifest.schemaVersion !== 1 ||
      manifest.chunkCount !== Math.ceil(manifest.byteLength / 65536)
    )
      conflict();
  }
  const total = mode === 'payload' ? (manifest?.chunkCount ?? 0) : 0,
    totalBytes = mode === 'payload' ? (manifest?.byteLength ?? 0) : 0;
  if (
    j.nextIndex > total ||
    j.byteLength !== Math.min(j.nextIndex * 65536, totalBytes) ||
    (j.phase === 'base'
      ? total === 0 || j.nextIndex >= total || typeof j.stateHash !== 'string'
      : j.stateHash !== null) ||
    (j.phase === 'checking' && (total !== 0 || j.nextIndex !== 0)) ||
    (['privacy', 'ready'].includes(j.phase) && j.nextIndex !== total)
  )
    conflict();
  if (j.stateHash !== null) restoreHash(j.stateHash);
  if (j.metadata !== null) inspectionMetadata(j.metadata);
  if (['privacy', 'ready'].includes(j.phase) !== (j.metadata !== null)) conflict();
  const loaded = { c, snapshot, job: j, token: inspectionToken(c, snapshot, j) };
  if (r.jobToken !== undefined && r.jobToken !== loaded.token) conflict();
  if (j.revision === 0) {
    if (j.lastOperationId !== null || !inspectionImmutable(snapshot)) conflict();
  } else {
    if (typeof j.lastOperationId !== 'string') conflict();
    const p = await inspectionPair(tx, loaded, j.lastOperationId);
    if (
      !p ||
      p.record.jobHash !== digest(j) ||
      p.record.revision !== j.revision ||
      !bornEqual(p.snapshot, { createTime: snapshot.updateTime }) ||
      digest(p.record.progress) !== digest(inspectionView(loaded))
    )
      conflict();
  }
  return loaded;
}
export async function inspectionState(tx, loaded) {
  const { c, job: j } = loaded,
    s = await tx.get(c.stateRef);
  if (j.phase !== 'base') {
    if (s.exists) conflict();
    return null;
  }
  const v = s.data();
  if (
    !s.exists ||
    !bornEqual(s, loaded.snapshot) ||
    !bornEqual({ createTime: s.updateTime }, { createTime: loaded.snapshot.updateTime })
  )
    conflict();
  closed(v, [
    'schemaVersion',
    'ownerId',
    'inspectionId',
    'startHash',
    'algorithm',
    'hashState',
    'parser',
  ]);
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== c.uid ||
    v.inspectionId !== c.id ||
    v.startHash !== j.startHash ||
    v.algorithm !== SOURCE_INSPECTION_ALGORITHM ||
    digest(v) !== j.stateHash ||
    v.parser?.byteLength !== j.byteLength ||
    v.parser?.bookId !== j.context.bookId
  )
    conflict();
  return v;
}
export async function replaySourceInspection(tx, loaded, method, r) {
  const p = await inspectionPair(tx, loaded, r.operationId);
  if (!p) return null;
  if (p.record.method !== method || p.record.requestHash !== digest(r)) conflict();
  return { receipt: p.record.progress, progress: inspectionView(loaded) };
}
export function commitSourceInspection(tx, loaded, method, r, patch) {
  const { c, job: j } = loaded,
    revision = j.revision + 1;
  integer(revision, 1);
  const next = { ...j, ...patch, revision, lastOperationId: r.operationId },
    view = inspectionView({ ...loaded, job: next }),
    record = {
      schemaVersion: 1,
      ownerId: c.uid,
      inspectionId: c.id,
      jobToken: loaded.token,
      startHash: j.startHash,
      operationId: r.operationId,
      method,
      requestHash: digest(r),
      revision,
      jobHash: digest(next),
      progress: view,
    };
  tx.update(c.ref, next);
  tx.create(c.db.doc(c.path + '/operations/' + r.operationId), record);
  tx.create(c.db.doc(c.path + '/operationProofs/' + r.operationId), {
    schemaVersion: 1,
    ownerId: c.uid,
    inspectionId: c.id,
    jobToken: loaded.token,
    startHash: j.startHash,
    operationId: r.operationId,
    receiptHash: digest(record),
  });
  return { receipt: view, progress: view };
}
export function inspectionCertificate(loaded, metadata, operationId) {
  return {
    schemaVersion: 1,
    ownerId: loaded.c.uid,
    inspectionId: loaded.c.id,
    jobToken: loaded.token,
    startHash: loaded.job.startHash,
    contextHash: digest(loaded.job.context),
    metadataHash: digest(metadata),
    operationId,
  };
}
/** Metadata proof only. Reauthorizes the same source; does not grant current body/page availability. */
export async function openBookLoreSourceInspection(tx, c, r) {
  const loaded = await loadSourceInspection(tx, c, r);
  if (!loaded || loaded.job.kind !== 'inspection' || loaded.job.phase !== 'ready') conflict();
  await inspectionState(tx, loaded);
  const source = await inspectionSource(tx, c, loaded.job.context),
    certificate = await tx.get(c.certificateRef),
    expected = inspectionCertificate(loaded, loaded.job.metadata, loaded.job.lastOperationId);
  if (
    !inspectionImmutable(certificate) ||
    !bornEqual(certificate, { createTime: loaded.snapshot.updateTime }) ||
    digest(certificate.data()) !== digest(expected)
  )
    conflict();
  return { loaded, source, metadata: structuredClone(loaded.job.metadata) };
}
