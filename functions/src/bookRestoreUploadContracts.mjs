import { createHash } from 'node:crypto';
import { GenerationError, validateId } from './generation.mjs';
import { digest } from './sceneContracts.mjs';
export const BOOK_RESTORE_CHUNK_BYTES = 65536;
export const BOOK_RESTORE_SEED = digest({ version: 1, kind: 'book-restore-upload' });
export const BOOK_RESTORE_METHODS = [
  'startBookRestore',
  'resolveBookRestoreStart',
  'getBookRestore',
  'listBookRestores',
  'appendBookRestoreChunk',
  'resolveBookRestoreOperation',
  'cancelBookRestore',
  'advanceBookRestoreCleanup',
];
export function restoreFail(code, reason) {
  const error = new GenerationError(
    code,
    'Não foi possível concluir a preparação da cópia do livro.',
  );
  error.details = { reason };
  throw error;
}
export const invalid = (reason = 'invalid-input') => restoreFail('invalid-argument', reason);
export const inconsistent = () => restoreFail('failed-precondition', 'identity-conflict');
export function closed(value, required, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...required, ...optional].includes(k))
  )
    invalid();
  return value;
}
export function restoreId(value) {
  try {
    return validateId(value);
  } catch {
    return invalid('invalid-id');
  }
}
export function restoreHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid();
  return value;
}
export function integer(value, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) invalid();
  return value === 0 ? 0 : value;
}
export function sum(a, b) {
  integer(a);
  integer(b);
  if (!Number.isSafeInteger(a + b)) restoreFail('resource-exhausted', 'counter-overflow');
  return a + b;
}
export function date(now, previous = -1) {
  const value = Math.max(now(), previous + 1);
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime()))
    inconsistent();
  return value;
}
export function authorize(uid) {
  if (
    typeof uid !== 'string' ||
    !uid ||
    uid.length > 128 ||
    !uid.isWellFormed() ||
    uid.includes('/') ||
    uid.includes('\\') ||
    ['.', '..'].includes(uid) ||
    [...uid].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    restoreFail('unauthenticated', 'auth-required');
}
export function source(value) {
  closed(value, ['format', 'version', 'byteLength', 'sha256']);
  if (
    value.format === 'writer-book-archive'
      ? value.version !== 1
      : value.format !== 'writer-book-backup' || ![1, 2, 3, 4, 5, 6].includes(value.version)
  )
    invalid('unsupported-source');
  return {
    format: value.format,
    version: value.version,
    byteLength: integer(value.byteLength, 1),
    sha256: restoreHash(value.sha256),
  };
}
export function startInput(value) {
  closed(value, ['operationId', 'source', 'reviewHash']);
  return {
    operationId: restoreId(value.operationId),
    source: source(value.source),
    reviewHash: restoreHash(value.reviewHash),
  };
}
export function mutationInput(value, extra = []) {
  closed(value, ['restoreId', 'jobToken', 'operationId', 'expectedCheckpoint', ...extra]);
  return {
    restoreId: restoreId(value.restoreId),
    jobToken: restoreHash(value.jobToken),
    operationId: restoreId(value.operationId),
    expectedCheckpoint: integer(value.expectedCheckpoint),
  };
}
export function chunkInput(value) {
  const result = mutationInput(value, ['index', 'chunkHash', 'chunkBase64']);
  result.index = integer(value.index);
  result.chunkHash = restoreHash(value.chunkHash);
  if (
    typeof value.chunkBase64 !== 'string' ||
    value.chunkBase64.length > 4 * Math.ceil(BOOK_RESTORE_CHUNK_BYTES / 3) ||
    !value.chunkBase64 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.chunkBase64)
  )
    invalid('invalid-chunk');
  const bytes = Buffer.from(value.chunkBase64, 'base64');
  if (
    bytes.toString('base64') !== value.chunkBase64 ||
    bytes.length > BOOK_RESTORE_CHUNK_BYTES ||
    sha256(bytes) !== result.chunkHash
  )
    invalid('invalid-chunk');
  return { ...result, bytes };
}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function requestHash(action, request) {
  const { bytes, ...metadata } = request;
  void bytes;
  return digest({ schemaVersion: 1, action, request: metadata });
}
export const targetId = (uid, id, fingerprint) =>
  'restore-' + digest({ schemaVersion: 1, uid, restoreId: id, startFingerprint: fingerprint });
export const chunkId = (index) => String(integer(index)).padStart(15, '0');
export function born(snapshot) {
  const value = snapshot?.createTime;
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    inconsistent();
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export const bornEqual = (a, b) => digest(born(a)) === digest(born(b));
export const jobToken = (uid, id, snapshot, fingerprint) =>
  digest({
    schemaVersion: 1,
    uid,
    restoreId: id,
    born: born(snapshot),
    startFingerprint: fingerprint,
  });
export function chunkChain(previous, index, hash, length) {
  return digest({ version: 1, previous, index, hash, byteLength: length });
}
export function jobShape(uid, id, job) {
  if (!job || job.ownerId !== uid || job.restoreId !== id)
    restoreFail('not-found', 'restore-unavailable');
  if (
    job.schemaVersion !== 1 ||
    job.cleanupVersion !== 1 ||
    !['uploading', 'uploaded', 'cancelling', 'cancelled'].includes(job.state)
  )
    inconsistent();
  source(job.source);
  restoreHash(job.startFingerprint);
  restoreHash(job.reviewHash);
  restoreHash(job.keyId);
  restoreHash(job.uploadedChainHash);
  [
    'checkpoint',
    'uploadedChunks',
    'uploadedBytes',
    'cleanedChunks',
    'createdAt',
    'updatedAt',
  ].forEach((k) => integer(job[k]));
  if (
    job.bookId !== targetId(uid, id, job.startFingerprint) ||
    typeof job.keyEverCreated !== 'boolean' ||
    typeof job.recoveryReady !== 'boolean' ||
    job.cleanedChunks > job.uploadedChunks ||
    job.uploadedBytes > job.source.byteLength ||
    job.uploadedChunks > Math.ceil(job.source.byteLength / BOOK_RESTORE_CHUNK_BYTES)
  )
    inconsistent();
  if (
    job.keyEverCreated
      ? typeof job.keyFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(job.keyFingerprint)
      : job.keyFingerprint !== null || job.recoveryReady
  )
    inconsistent();
  if (['cancelling', 'cancelled'].includes(job.state) && job.recoveryReady) inconsistent();
  if (
    job.state === 'uploaded' &&
    (job.uploadedBytes !== job.source.byteLength ||
      job.uploadedChunks !== Math.ceil(job.source.byteLength / BOOK_RESTORE_CHUNK_BYTES))
  )
    inconsistent();
  if (
    job.state === 'uploading' &&
    (job.uploadedBytes !== job.uploadedChunks * BOOK_RESTORE_CHUNK_BYTES ||
      job.uploadedBytes >= job.source.byteLength ||
      job.cleanedChunks !== 0)
  )
    inconsistent();
  if (
    !Number.isFinite(new Date(job.createdAt).getTime()) ||
    !Number.isFinite(new Date(job.updatedAt).getTime()) ||
    job.updatedAt < job.createdAt
  )
    inconsistent();
  return job;
}
export function progress(uid, id, snapshot) {
  const job = jobShape(uid, id, snapshot.data());
  return {
    schemaVersion: 1,
    ownerId: uid,
    restoreId: id,
    bookId: job.bookId,
    jobToken: jobToken(uid, id, snapshot, job.startFingerprint),
    source: { ...job.source },
    reviewHash: job.reviewHash,
    keyId: job.keyId,
    recoveryReady: job.recoveryReady,
    state: job.state,
    checkpoint: job.checkpoint,
    uploadedChunks: job.uploadedChunks,
    uploadedBytes: job.uploadedBytes,
    cleanedChunks: job.cleanedChunks,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
