import { validateBookRestoreAudit } from './bookRestoreAuditContracts.mjs';
import { validateEditorialHeads } from './bookRestoreEditorialHeadContracts.mjs';
import { inconsistent, integer, restoreHash, sum } from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
export const BOOK_RESTORE_EDITORIAL_ENCODING = 'source-json-v1';
export const BOOK_RESTORE_EDITORIAL_HASH = 'sha256/hash-wasm@4.12.0';
export const BOOK_RESTORE_EDITORIAL_PROOF_SEED = digest({
  domain: 'writer-restored-editorial-proof-v1',
});
export const BOOK_RESTORE_EDITORIAL_RECORDS = Object.freeze([
  'book-editorial-artifact',
  'book-editorial-link',
  'book-editorial',
]);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
function closed(value, keys, optional = []) {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !keys.includes(key) && !optional.includes(key)) ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    inconsistent();
}
function text(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    !value.isWellFormed() ||
    Buffer.byteLength(value) > 1500 ||
    /[\\/]/.test(value) ||
    [...value].some(
      (character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127,
    )
  )
    inconsistent();
}
export function editorialSourceRecord(record, bookId) {
  closed(record, ['kind', 'id', 'part']);
  if (!BOOK_RESTORE_EDITORIAL_RECORDS.includes(record.kind) || record.part !== 0) inconsistent();
  if (record.kind === 'book-editorial') {
    if (record.id !== bookId) inconsistent();
  } else restoreHash(record.id);
  return record;
}
export function editorialBodyDescriptor(value) {
  closed(value, [
    'schemaVersion',
    'encoding',
    'id',
    'sourceIndex',
    'sourceRecord',
    'sourceBookId',
    'sourceToken',
    'valueHash',
    'artifact',
    'byteLength',
    'chunkCount',
    'state',
    'contentHash',
    'partProofRoot',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.encoding !== BOOK_RESTORE_EDITORIAL_ENCODING ||
    !['preparing', 'complete'].includes(value.state)
  )
    inconsistent();
  restoreHash(value.id);
  integer(value.sourceIndex);
  text(value.sourceBookId);
  editorialSourceRecord(value.sourceRecord, value.sourceBookId);
  restoreHash(value.sourceToken);
  restoreHash(value.valueHash);
  integer(value.byteLength, 1);
  if (value.sourceRecord.kind === 'book-editorial-artifact') {
    closed(value.artifact, ['kind', 'revision', 'availability', 'role']);
    if (
      ![
        'contract',
        'plan',
        'document',
        'decision',
        'evidence',
        'report',
        'checkpoint',
        'prose',
      ].includes(value.artifact.kind) ||
      !['included', 'unavailable'].includes(value.artifact.availability) ||
      (value.artifact.role !== null &&
        ![
          'architecture',
          'series',
          'preparation',
          'progress',
          'readerGuide',
          'publicationManifest',
        ].includes(value.artifact.role))
    )
      inconsistent();
    if (value.artifact.kind !== 'document' && value.artifact.role !== null) inconsistent();
    if (value.artifact.revision !== null) integer(value.artifact.revision);
  } else if (value.artifact !== null) inconsistent();

  if (
    value.byteLength > 8 * 1024 * 1024 ||
    value.chunkCount !== Math.ceil(value.byteLength / 65536)
  )
    inconsistent();
  if (value.state === 'preparing') {
    if (value.contentHash !== null || value.partProofRoot !== null) inconsistent();
  } else {
    restoreHash(value.contentHash);
    restoreHash(value.partProofRoot);
  }
  return value;
}
export function editorialRecordDescriptor(value) {
  if (!object(value) || !Object.hasOwn(value, 'bodyBirth')) inconsistent();
  const { bodyBirth, ...body } = value;
  restoreHash(bodyBirth);
  editorialBodyDescriptor(body);
  if (body.state !== 'complete') inconsistent();
  return value;
}
export function editorialStoredPart(value, id, part, byteLength) {
  closed(value, ['schemaVersion', 'bodyId', 'index', 'byteLength', 'contentHash', 'bytesBase64']);
  if (
    value.schemaVersion !== 1 ||
    value.bodyId !== id ||
    value.index !== part ||
    value.byteLength !== byteLength ||
    byteLength < 1 ||
    byteLength > 65536 ||
    typeof value.bytesBase64 !== 'string' ||
    value.bytesBase64.length > 87384
  )
    inconsistent();
  restoreHash(value.contentHash);
  const bytes = Buffer.from(value.bytesBase64, 'base64');
  if (bytes.length !== byteLength || bytes.toString('base64') !== value.bytesBase64) inconsistent();
  return bytes;
}
export function editorialBirth(snapshot) {
  const stamp = snapshot?.createTime;
  if (
    !snapshot?.exists ||
    !Number.isSafeInteger(stamp?.seconds) ||
    !Number.isSafeInteger(stamp.nanoseconds) ||
    stamp.nanoseconds < 0 ||
    stamp.nanoseconds >= 1000000000
  )
    inconsistent();
  return digest({
    domain: 'writer-editorial-native-birth-v1',
    seconds: stamp.seconds,
    nanoseconds: stamp.nanoseconds,
  });
}
export function validateEditorialMaterialization(value) {
  closed(
    value,
    [
      'schemaVersion',
      'encoding',
      'phase',
      'sourceSha256',
      'sourceBookId',
      'itemCount',
      'itemIndex',
      'baseArtifacts',
      'artifacts',
      'links',
      'summaries',
      'bytes',
      'parts',
      'proofRoot',
      'lastRecord',
      'pending',
    ],
    ['heads', 'census'],
  );
  if (
    value.schemaVersion !== 1 ||
    value.encoding !== BOOK_RESTORE_EDITORIAL_ENCODING ||
    !['scan', 'copy', 'seal', 'materialized'].includes(value.phase)
  )
    inconsistent();
  text(value.sourceBookId);
  restoreHash(value.sourceSha256);
  restoreHash(value.proofRoot);
  for (const key of [
    'itemCount',
    'itemIndex',
    'baseArtifacts',
    'artifacts',
    'links',
    'summaries',
    'bytes',
    'parts',
  ])
    integer(value[key]);
  if (
    value.itemIndex > value.itemCount ||
    value.summaries > 1 ||
    value.artifacts + value.links + value.summaries > value.itemIndex
  )
    inconsistent();
  if (value.lastRecord !== null) {
    closed(value.lastRecord, ['id', 'recordHash']);
    restoreHash(value.lastRecord.id);
    restoreHash(value.lastRecord.recordHash);
    if (value.phase !== 'scan') inconsistent();
  }
  const p = value.pending;
  if (p !== null) {
    closed(p, [
      'body',
      'part',
      'bytes',
      'hashState',
      'algorithm',
      'partProofRoot',
      'lastPart',
      'bodyToken',
      'contentHash',
    ]);
    editorialBodyDescriptor(p.body);
    if (
      p.body.state !== 'preparing' ||
      p.body.sourceIndex !== value.itemIndex ||
      p.body.sourceBookId !== value.sourceBookId ||
      !['copy', 'seal'].includes(value.phase) ||
      value.lastRecord !== null
    )
      inconsistent();
    integer(p.part);
    integer(p.bytes);
    restoreHash(p.partProofRoot);
    if (
      p.part > p.body.chunkCount ||
      p.bytes !== Math.min(p.part * 65536, p.body.byteLength) ||
      p.algorithm !== BOOK_RESTORE_EDITORIAL_HASH
    )
      inconsistent();
    if (p.bodyToken !== null) restoreHash(p.bodyToken);
    if (p.part === 0) {
      if (
        p.bodyToken !== null ||
        p.lastPart !== null ||
        p.hashState !== null ||
        p.contentHash !== null
      )
        inconsistent();
    } else {
      if (p.bodyToken === null) inconsistent();
      closed(p.lastPart, ['index', 'contentHash']);
      if (p.lastPart.index !== p.part - 1) inconsistent();
      restoreHash(p.lastPart.contentHash);
    }
    if (value.phase === 'seal') {
      if (p.part !== p.body.chunkCount || p.hashState !== null) inconsistent();
      restoreHash(p.contentHash);
    } else if (p.part > 0) {
      if (
        p.part >= p.body.chunkCount ||
        typeof p.hashState !== 'string' ||
        p.hashState.length > 8192 ||
        p.contentHash !== null
      )
        inconsistent();
    }
  } else if (value.phase === 'copy' || value.phase === 'seal') inconsistent();
  if (
    value.phase === 'materialized' &&
    (value.itemIndex !== value.itemCount || value.lastRecord !== null || p !== null)
  )
    inconsistent();
  if (Object.hasOwn(value, 'heads')) {
    if (value.phase !== 'materialized') inconsistent();
    validateEditorialHeads(value.heads, value.itemCount);
  }
  if (Object.hasOwn(value, 'census')) {
    if (value.phase !== 'materialized' || value.heads?.phase !== 'prepared') inconsistent();
    validateBookRestoreAudit(value.census);
  }
  return value;
}
export function editorialArtifactCount(value) {
  const records = sum(sum(value.artifacts, value.links), value.summaries);
  return sum(
    sum(value.baseArtifacts, value.heads?.created ?? 0),
    sum(1, sum(records * 2, sum(value.parts, value.pending === null ? 0 : 1))),
  );
}
