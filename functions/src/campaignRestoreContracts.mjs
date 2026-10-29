import { createHash } from 'node:crypto';
import { GenerationError } from './generationError.mjs';
import { campaignBackupIdentity } from './campaignBackupSource.mjs';
export const RESTORE_DOMAIN = 'writer-campaign-restore-v1';
export const RESTORE_CHUNK_BYTES = 65536;
export const RESTORE_HASH_ALGORITHM = 'sha256/hash-wasm@4.12.0';
export const fail = (code = 'failed-precondition', reason = 'restore-inconsistent') => {
  const e = new GenerationError(code, 'Não foi possível preparar a cópia privada da campanha.');
  e.details = { reason };
  throw e;
};
export const bad = () => fail();
export function closed(v, fields, optional = []) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    fields.some((k) => !Object.hasOwn(v, k)) ||
    Object.keys(v).some((k) => !fields.includes(k) && !optional.includes(k))
  )
    fail('invalid-argument', 'invalid-input');
  return v;
}
export const integer = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail('invalid-argument', 'invalid-integer');
  return v;
};
export const id = (v) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9-]{16,80}$/.test(v))
    fail('invalid-argument', 'invalid-id');
  return v;
};
export const authorize = (uid) => {
  if (
    typeof uid !== 'string' ||
    !uid ||
    [...uid].some(
      (c) => c === '/' || c === '\\' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) ||
    uid === '.' ||
    uid === '..' ||
    uid.length > 128 ||
    !uid.isWellFormed()
  )
    fail('unauthenticated', 'auth-required');
};
export const hash = (v) => {
  if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail('invalid-argument', 'invalid-hash');
  return v;
};
export const sha = (v) => createHash('sha256').update(v).digest('hex');
export { digest } from './sceneContracts.mjs';
import { digest } from './sceneContracts.mjs';
export const fingerprint = (action, request) => digest([RESTORE_DOMAIN, action, request]);
export const campaignId = (uid, rid, fp) => 'restore-c-' + digest([RESTORE_DOMAIN, uid, rid, fp]);
export const chunkId = (n) => String(integer(n)).padStart(15, '0');
export function source(v) {
  closed(v, ['format', 'version', 'byteLength', 'sha256']);
  if (v.format !== 'writer-campaign-backup' || v.version !== 1)
    fail('invalid-argument', 'unsupported-source');
  const n = integer(v.byteLength, 16);
  if (Math.ceil(n / RESTORE_CHUNK_BYTES) > 0xffffffff) fail('invalid-argument', 'source-too-large');
  return { format: v.format, version: 1, byteLength: n, sha256: hash(v.sha256) };
}
export function startInput(v) {
  closed(v, ['operationId', 'source']);
  return { operationId: id(v.operationId), source: source(v.source) };
}
export function mutation(v, extra = []) {
  closed(v, ['restoreId', 'jobToken', 'operationId', 'expectedCheckpoint', ...extra]);
  return {
    restoreId: id(v.restoreId),
    jobToken: hash(v.jobToken),
    operationId: id(v.operationId),
    expectedCheckpoint: integer(v.expectedCheckpoint),
  };
}
export function native(s) {
  try {
    const n = campaignBackupIdentity(s);
    if (!n) bad();
    return n;
  } catch {
    bad();
  }
}
export const sameBirth = (a, b) => digest(native(a).created) === digest(native(b).created);
export const immutable = (s) => {
  const n = native(s);
  if (digest(n.created) !== digest(n.updated)) bad();
};
export const sameUpdateBirth = (a, b) => digest(native(a).updated) === digest(native(b).created);
export const jobToken = (uid, rid, s, fp) =>
  digest([RESTORE_DOMAIN, uid, rid, native(s).created, fp]);
export const pendingRoot = (uid, rid, fp, retired = false) => ({
  schemaVersion: 1,
  kind: retired ? 'campaign-restore-retired' : 'campaign-restore-pending',
  restoreOwnerId: uid,
  restoreId: rid,
  startFingerprint: fp,
});
export const JOB_FIELDS = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'startFingerprint',
  'source',
  'state',
  'checkpoint',
  'uploadedChunks',
  'uploadedBytes',
  'computedHash',
  'hashState',
  'keyFingerprint',
  'hashAlgorithm',
  'cleanedChunks',
  'lastOperationId',
  'lastRequestHash',
  'createdAt',
  'updatedAt',
];
export function parseJob(v, uid, rid) {
  closed(v, JOB_FIELDS, ['fileReview', 'ownReview', 'reviewIndex']);
  if (
    v.schemaVersion !== 1 ||
    v.hashAlgorithm !== RESTORE_HASH_ALGORITHM ||
    v.ownerId !== uid ||
    v.restoreId !== rid ||
    !['uploading', 'bytes-verified', 'rejected', 'cancelling', 'cancelled'].includes(v.state)
  )
    bad();
  const input = { operationId: rid, source: source(v.source) },
    fp = fingerprint('start', input);
  if (v.startFingerprint !== fp || v.campaignId !== campaignId(uid, rid, fp)) bad();
  for (const k of [
    'checkpoint',
    'uploadedChunks',
    'uploadedBytes',
    'cleanedChunks',
    'createdAt',
    'updatedAt',
  ])
    integer(v[k]);
  hash(v.keyFingerprint);
  hash(v.lastRequestHash);
  id(v.lastOperationId);
  if (
    v.updatedAt < v.createdAt ||
    v.uploadedChunks > Math.ceil(v.source.byteLength / RESTORE_CHUNK_BYTES) ||
    v.uploadedBytes !== Math.min(v.source.byteLength, v.uploadedChunks * RESTORE_CHUNK_BYTES) ||
    v.cleanedChunks > v.uploadedChunks ||
    (v.computedHash !== null && hash(v.computedHash) !== v.computedHash)
  )
    bad();
  if (
    v.state === 'uploading' &&
    (v.uploadedBytes >= v.source.byteLength || Boolean(v.hashState) !== Boolean(v.uploadedChunks))
  )
    bad();
  if (
    ['bytes-verified', 'rejected'].includes(v.state) &&
    (v.uploadedBytes !== v.source.byteLength ||
      v.hashState !== null ||
      !v.computedHash ||
      (v.computedHash === v.source.sha256) !== (v.state === 'bytes-verified'))
  )
    bad();
  if (['cancelling', 'cancelled'].includes(v.state) && v.hashState !== null) bad();
  if (!['cancelling', 'cancelled'].includes(v.state) && v.cleanedChunks !== 0) bad();
  if (v.state === 'cancelled' && v.cleanedChunks !== v.uploadedChunks) bad();
  if (v.fileReview !== undefined && v.fileReview !== null) {
    const f = closed(v.fileReview, [
      'schemaVersion',
      'status',
      'checkpoint',
      'records',
      'offset',
      'units',
      'witnesses',
      'payload',
    ]);
    if (
      v.state !== 'bytes-verified' ||
      f.schemaVersion !== 1 ||
      !['running', 'verified'].includes(f.status) ||
      integer(f.checkpoint, 1, v.checkpoint) !== f.checkpoint ||
      integer(f.records, 1, 0xffffffff) < f.units ||
      integer(f.records) < f.witnesses ||
      integer(f.offset, 16, v.source.byteLength) !== f.offset ||
      (f.status === 'verified' && f.offset !== v.source.byteLength)
    )
      bad();
    integer(f.units);
    integer(f.witnesses);
    closed(f.payload, ['iv', 'tag', 'data']);
    for (const k of ['iv', 'tag', 'data']) {
      const max = k === 'iv' ? 12 : k === 'tag' ? 16 : 65536;
      const encoded = f.payload[k];
      if (typeof encoded !== 'string' || encoded.length > 4 * Math.ceil(max / 3)) bad();
      const b = Buffer.from(encoded, 'base64');
      if (
        b.toString('base64') !== encoded ||
        b.length > max ||
        (k !== 'data' && b.length !== max) ||
        (k === 'data' && !b.length)
      )
        bad();
    }
  }
  if (v.reviewIndex !== undefined) {
    const r = closed(v.reviewIndex, ['schemaVersion', 'rows', 'cleanedRows']);
    if (
      r.schemaVersion !== 1 ||
      integer(r.rows, 0, 0xffffffff) < integer(r.cleanedRows) ||
      (!['cancelling', 'cancelled'].includes(v.state) && r.cleanedRows !== 0) ||
      (v.state === 'cancelled' && r.cleanedRows !== r.rows)
    )
      bad();
  }
  if (v.ownReview !== undefined && v.ownReview !== null) {
    const r = closed(v.ownReview, [
      'schemaVersion',
      'phase',
      'checkpoint',
      'records',
      'offset',
      'rows',
      'processed',
      'payload',
    ]);
    if (
      r.schemaVersion !== 1 ||
      v.state !== 'bytes-verified' ||
      v.fileReview?.status !== 'verified' ||
      !v.reviewIndex ||
      !['indexing', 'checking', 'verified'].includes(r.phase) ||
      integer(r.checkpoint, 1, v.checkpoint) !== r.checkpoint ||
      integer(r.records, 1, 0xffffffff) !== r.records ||
      integer(r.offset, 16, v.source.byteLength) !== r.offset ||
      integer(r.rows) !== v.reviewIndex.rows ||
      integer(r.processed) > r.rows ||
      (r.phase === 'indexing'
        ? r.processed !== 0
        : r.offset !== v.source.byteLength || r.rows < 2) ||
      (r.phase === 'verified' && r.processed !== r.rows)
    )
      bad();
    closed(r.payload, ['iv', 'tag', 'data']);
    for (const k of ['iv', 'tag', 'data']) {
      const max = k === 'iv' ? 12 : k === 'tag' ? 16 : 65536,
        encoded = r.payload[k];
      if (typeof encoded !== 'string' || encoded.length > 4 * Math.ceil(max / 3)) bad();
      const b = Buffer.from(encoded, 'base64');
      if (
        b.toString('base64') !== encoded ||
        b.length > max ||
        (k !== 'data' && b.length !== max) ||
        (k === 'data' && !b.length)
      )
        bad();
    }
  }
  return structuredClone(v);
}
export const progress = (l) => ({
  schemaVersion: 1,
  ownerId: l.uid,
  restoreId: l.rid,
  campaignId: l.job.campaignId,
  jobToken: l.token,
  source: structuredClone(l.job.source),
  state: l.job.state,
  checkpoint: l.job.checkpoint,
  uploadedChunks: l.job.uploadedChunks,
  uploadedBytes: l.job.uploadedBytes,
  cleanedChunks: l.job.cleanedChunks,
  computedHash: l.job.computedHash,
  ...(l.job.fileReview
    ? {
        fileReview: Object.fromEntries(
          Object.entries(l.job.fileReview).filter(([k]) => k !== 'payload' && k !== 'checkpoint'),
        ),
      }
    : {}),
  ...(l.job.ownReview
    ? {
        ownReview: Object.fromEntries(
          Object.entries(l.job.ownReview).filter(([k]) => k !== 'payload' && k !== 'checkpoint'),
        ),
      }
    : {}),
  ...(l.job.reviewIndex ? { reviewIndex: structuredClone(l.job.reviewIndex) } : {}),
  createdAt: l.job.createdAt,
  updatedAt: l.job.updatedAt,
});
export const date = (now, previous = -1) =>
  integer(Math.max(now(), previous + 1), 0, 8640000000000000);
