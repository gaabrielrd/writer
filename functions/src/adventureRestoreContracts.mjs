import { createHash } from 'node:crypto';
import { GenerationError } from './generationError.mjs';
import { digest } from './sceneContracts.mjs';
export { digest };
import {
  ADVENTURE_RESTORE_CLEANUP,
  ADVENTURE_VALIDATION_STATES,
  validAdventureValidationMeta,
  adventureValidationView,
} from './adventureRestoreValidationMeta.mjs';
import { validAdventureStagingMeta, adventureStagingView } from './adventureRestoreStagingMeta.mjs';
export const ADVENTURE_RESTORE_DOMAIN = 'writer-adventure-restore-v1';
export const ADVENTURE_RESTORE_CHUNK_BYTES = 65536;
export const ADVENTURE_RESTORE_SEED = digest([ADVENTURE_RESTORE_DOMAIN, 'upload']);
export const ADVENTURE_RESTORE_STATES = Object.freeze([
  'uploading',
  'uploaded',
  'checking',
  'bytes-verified',
  ...ADVENTURE_VALIDATION_STATES,
  'rejected',
  'cancelling',
  'cancelled',
]);
export const ADVENTURE_RESTORE_ACTIONS = Object.freeze({
  startAdventureRestore: ['uploading'],
  appendAdventureRestoreChunk: ['uploading', 'uploaded'],
  advanceAdventureRestoreIntegrity: ['checking', 'bytes-verified', 'rejected'],
  advanceAdventureRestoreValidation: ['validating', 'content-verified', 'content-rejected'],
  advanceAdventureRestoreStructure: ['content-verified'],
  advanceAdventureRestoreResources: ['content-verified'],
  cancelAdventureRestore: ['cancelling'],
  advanceAdventureRestoreCleanup: ['cancelling', 'cancelled'],
});
export function restoreFail(code, reason) {
  const error = new GenerationError(code, 'Não foi possível preparar a cópia privada da aventura.');
  error.details = { reason };
  throw error;
}
export const invalid = (reason = 'invalid-input') => restoreFail('invalid-argument', reason);
export const inconsistent = () => restoreFail('failed-precondition', 'identity-conflict');
export function closed(value, keys, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => !keys.includes(k) && !optional.includes(k))
  )
    invalid();
  return value;
}
export function authorize(uid) {
  if (
    typeof uid !== 'string' ||
    !uid ||
    uid.length > 128 ||
    !uid.isWellFormed() ||
    ['.', '..'].includes(uid) ||
    [...uid].some((c) => c === '/' || c === '\\' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    restoreFail('unauthenticated', 'auth-required');
}
export function restoreId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(value)) invalid('invalid-id');
  return value;
}
export function restoreHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid('invalid-hash');
  return value;
}
export function integer(value, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) invalid('invalid-count');
  return value === 0 ? 0 : value;
}
export function sum(a, b) {
  integer(a);
  integer(b);
  if (!Number.isSafeInteger(a + b)) restoreFail('resource-exhausted', 'counter-overflow');
  return a + b;
}
export function restoreDate(now, previous = -1) {
  const value = Math.max(now(), previous + 1);
  if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) inconsistent();
  return value;
}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function sourceDescriptor(value) {
  closed(value, ['format', 'version', 'byteLength', 'sha256']);
  if (value.format !== 'writer-adventure-archive' || value.version !== 1)
    invalid('unsupported-source');
  const byteLength = integer(value.byteLength, 16);
  if (Math.ceil(byteLength / ADVENTURE_RESTORE_CHUNK_BYTES) > 0xffffffff)
    invalid('source-too-large');
  return { format: value.format, version: 1, byteLength, sha256: restoreHash(value.sha256) };
}
export function startInput(value) {
  closed(value, ['operationId', 'source', 'reviewHash']);
  return {
    operationId: restoreId(value.operationId),
    source: sourceDescriptor(value.source),
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
  const request = mutationInput(value, ['index', 'chunkHash', 'chunkBase64']);
  const encoded = value.chunkBase64,
    hash = restoreHash(value.chunkHash);
  if (
    typeof encoded !== 'string' ||
    !encoded ||
    encoded.length > 4 * Math.ceil(ADVENTURE_RESTORE_CHUNK_BYTES / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  )
    invalid('invalid-chunk');
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.toString('base64') !== encoded ||
    bytes.length > ADVENTURE_RESTORE_CHUNK_BYTES ||
    sha256(bytes) !== hash
  )
    invalid('invalid-chunk');
  return { ...request, index: integer(value.index), chunkHash: hash, bytes };
}
export function requestHash(action, request) {
  const { bytes, ...metadata } = request;
  void bytes;
  return digest({ domain: ADVENTURE_RESTORE_DOMAIN, action, request: metadata });
}
export const targetId = (uid, id, fingerprint) =>
  'restore-a-' + digest([ADVENTURE_RESTORE_DOMAIN, uid, id, fingerprint]);
export const chunkId = (index) => String(integer(index)).padStart(15, '0');
export const chunkChain = (previous, index, hash, length) =>
  digest([ADVENTURE_RESTORE_DOMAIN, previous, index, hash, length]);
function stamp(value) {
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
export const born = (snap) => stamp(snap?.createTime);
export const updated = (snap) => stamp(snap?.updateTime);
export const bornEqual = (a, b) => digest(born(a)) === digest(born(b));
export const immutable = (snap) => {
  if (digest(born(snap)) !== digest(updated(snap))) inconsistent();
};
export const nativeToken = (snap) => digest([ADVENTURE_RESTORE_DOMAIN, born(snap), updated(snap)]);
export function compareStamp(a, b) {
  return a.seconds === b.seconds ? a.nanoseconds - b.nanoseconds : a.seconds - b.seconds;
}
export const jobToken = (uid, id, snap, hash) =>
  digest([ADVENTURE_RESTORE_DOMAIN, uid, id, born(snap), hash]);
export const pendingRoot = (uid, id, hash, retired = false) => ({
  schemaVersion: 1,
  kind: retired ? 'adventure-restore-retired' : 'adventure-restore-pending',
  restoreOwnerId: uid,
  restoreId: id,
  startFingerprint: hash,
});
export const JOB_FIELDS = Object.freeze([
  'schemaVersion',
  'ownerId',
  'restoreId',
  'adventureId',
  'startFingerprint',
  'source',
  'reviewHash',
  'state',
  'checkpoint',
  'uploadedChunks',
  'uploadedBytes',
  'uploadedChainHash',
  'checkedChunks',
  'checkedBytes',
  'checkedChainHash',
  'integrityDigest',
  'integrityFailure',
  'integrityStateId',
  'integrityStateHash',
  'writtenStates',
  'cleanupPhase',
  'cleanupCursor',
  'cleanedChunks',
  'cleanedProofs',
  'cleanedStates',
  'createdAt',
  'updatedAt',
  'lastOperationId',
  'lastRequestHash',
]);
export function parseJob(value, uid, id) {
  closed(value, JOB_FIELDS, ['validation', 'staging']);
  if (
    Object.hasOwn(value, 'validation')
      ? !validAdventureValidationMeta(value.validation, value)
      : ADVENTURE_VALIDATION_STATES.includes(value.state)
  )
    inconsistent();
  if (
    (Object.hasOwn(value, 'staging') && !validAdventureStagingMeta(value.staging, value)) ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.restoreId !== id ||
    !ADVENTURE_RESTORE_STATES.includes(value.state)
  )
    inconsistent();
  const source = sourceDescriptor(value.source),
    fingerprint = requestHash('startAdventureRestore', {
      operationId: id,
      source,
      reviewHash: restoreHash(value.reviewHash),
    });
  if (
    value.startFingerprint !== fingerprint ||
    value.adventureId !== targetId(uid, id, fingerprint)
  )
    inconsistent();
  for (const key of [
    'checkpoint',
    'uploadedChunks',
    'uploadedBytes',
    'checkedChunks',
    'checkedBytes',
    'writtenStates',
    'cleanedChunks',
    'cleanedProofs',
    'cleanedStates',
    'createdAt',
    'updatedAt',
  ])
    integer(value[key]);
  restoreId(value.lastOperationId);
  restoreHash(value.lastRequestHash);
  restoreHash(value.uploadedChainHash);
  restoreHash(value.checkedChainHash);
  if (value.updatedAt < value.createdAt || value.updatedAt > 8640000000000000) inconsistent();
  const total = Math.ceil(source.byteLength / ADVENTURE_RESTORE_CHUNK_BYTES),
    chunk = ADVENTURE_RESTORE_CHUNK_BYTES;
  if (
    value.uploadedChunks > total ||
    value.checkedChunks > value.uploadedChunks ||
    value.uploadedBytes !== Math.min(source.byteLength, value.uploadedChunks * chunk) ||
    value.checkedBytes !== Math.min(source.byteLength, value.checkedChunks * chunk) ||
    value.cleanedChunks > value.uploadedChunks ||
    value.cleanedProofs > value.checkedChunks ||
    value.cleanedStates > value.writtenStates ||
    value.writtenStates > value.checkedChunks ||
    (value.uploadedChunks === 0 && value.uploadedChainHash !== ADVENTURE_RESTORE_SEED) ||
    (value.checkedChunks === 0 && value.checkedChainHash !== ADVENTURE_RESTORE_SEED)
  )
    inconsistent();
  if (![...ADVENTURE_RESTORE_CLEANUP, 'done'].includes(value.cleanupPhase)) inconsistent();
  if (
    value.cleanupCursor !== null &&
    (typeof value.cleanupCursor !== 'string' ||
      value.cleanupCursor.length > 80 ||
      !/^[A-Za-z0-9-]+$/.test(value.cleanupCursor))
  )
    inconsistent();
  if (
    value.integrityStateId === null
      ? value.integrityStateHash !== null
      : typeof value.integrityStateId !== 'string' || typeof value.integrityStateHash !== 'string'
  )
    inconsistent();
  if (value.integrityStateId !== null) {
    restoreId(value.integrityStateId);
    restoreHash(value.integrityStateHash);
  }
  if (value.integrityDigest !== null) restoreHash(value.integrityDigest);
  if (
    value.integrityFailure !== null &&
    !['file-hash-mismatch', 'upload-chain-mismatch'].includes(value.integrityFailure)
  )
    inconsistent();
  if (value.state === 'uploading' && value.uploadedChunks === total) inconsistent();
  if (
    ['uploaded', 'checking', 'bytes-verified', 'rejected', ...ADVENTURE_VALIDATION_STATES].includes(
      value.state,
    ) &&
    value.uploadedChunks !== total
  )
    inconsistent();
  if (
    ['uploading', 'uploaded'].includes(value.state) &&
    (value.checkedChunks !== 0 ||
      value.integrityDigest !== null ||
      value.integrityFailure !== null ||
      value.integrityStateId !== null ||
      value.writtenStates !== 0)
  )
    inconsistent();
  if (
    value.state === 'checking' &&
    (value.checkedChunks === 0 ||
      value.checkedChunks >= total ||
      value.integrityStateId === null ||
      value.integrityDigest !== null ||
      value.integrityFailure !== null)
  )
    inconsistent();
  if (
    ['bytes-verified', 'rejected', ...ADVENTURE_VALIDATION_STATES].includes(value.state) &&
    (value.checkedChunks !== total ||
      value.integrityDigest === null ||
      value.integrityStateId !== null)
  )
    inconsistent();
  if (
    ['bytes-verified', ...ADVENTURE_VALIDATION_STATES].includes(value.state) &&
    (value.integrityDigest !== source.sha256 ||
      value.integrityFailure !== null ||
      value.checkedChainHash !== value.uploadedChainHash)
  )
    inconsistent();
  if (
    value.state === 'rejected' &&
    (value.integrityFailure === null ||
      (value.integrityFailure === 'file-hash-mismatch'
        ? value.integrityDigest === source.sha256
        : value.checkedChainHash === value.uploadedChainHash))
  )
    inconsistent();
  if (
    !['cancelling', 'cancelled'].includes(value.state) &&
    (value.cleanupPhase !== 'chunks' ||
      value.cleanupCursor !== null ||
      value.cleanedChunks ||
      value.cleanedProofs ||
      value.cleanedStates)
  )
    inconsistent();
  if (['cancelling', 'cancelled'].includes(value.state) && value.integrityStateId !== null)
    inconsistent();
  if (
    value.state === 'cancelled' &&
    (value.cleanupPhase !== 'done' ||
      value.cleanupCursor !== null ||
      value.cleanedChunks !== value.uploadedChunks ||
      value.cleanedProofs !== value.checkedChunks ||
      value.cleanedStates !== value.writtenStates)
  )
    inconsistent();
  return structuredClone(value);
}
export function progress(uid, id, snap, job = parseJob(snap.data(), uid, id)) {
  return {
    schemaVersion: 1,
    restoreId: id,
    adventureId: job.adventureId,
    jobToken: jobToken(uid, id, snap, job.startFingerprint),
    source: structuredClone(job.source),
    reviewHash: job.reviewHash,
    state: job.state,
    checkpoint: job.checkpoint,
    uploadedChunks: job.uploadedChunks,
    uploadedBytes: job.uploadedBytes,
    checkedChunks: job.checkedChunks,
    checkedBytes: job.checkedBytes,
    ...(job.validation ? { validation: adventureValidationView(job.validation) } : {}),
    ...(job.staging ? { staging: adventureStagingView(job.staging) } : {}),
    integrityDigest: job.integrityDigest,
    integrityFailure: job.integrityFailure,
    cleanedChunks: job.cleanedChunks,
    cleanedProofs: job.cleanedProofs,
    cleanedStates: job.cleanedStates,
    cleanupPhase: job.cleanupPhase,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
