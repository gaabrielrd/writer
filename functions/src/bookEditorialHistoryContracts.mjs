import { EDITORIAL_STATUSES } from './literaryContracts.mjs';
import { normalizeLiteraryCollaboration } from './literaryCollaborationProtocol.mjs';
import {
  closed,
  integer,
  restoreHash,
  restoreId,
  inconsistent,
  invalid,
} from './bookRestoreUploadContracts.mjs';
import { normalizeBookEditorialReference } from './bookEditorialProtocol.mjs';
export const BOOK_EDITORIAL_HISTORY_RECORD_FIELDS = Object.freeze([
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
  'bodyBirth',
]);
export function editorialHistoryInput(input, extra = []) {
  closed(input, ['bookId', ...extra]);
  return { ...input, bookId: restoreId(input.bookId) };
}
export function editorialHistoryLimit(limit) {
  integer(limit, 1);
  if (limit > 50) invalid();
  return limit;
}
export function readEditorialHistoryCursor(value, bookId, contextToken) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value))
    invalid();
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    invalid();
  }
  closed(parsed, ['schemaVersion', 'bookId', 'contextToken', 'after']);
  if (
    parsed.schemaVersion !== 1 ||
    parsed.bookId !== bookId ||
    parsed.contextToken !== contextToken ||
    Buffer.from(JSON.stringify(parsed)).toString('base64url') !== value
  )
    invalid();
  return restoreHash(parsed.after);
}
export function editorialHistoryCursor(bookId, contextToken, after) {
  return Buffer.from(JSON.stringify({ schemaVersion: 1, bookId, contextToken, after })).toString(
    'base64url',
  );
}
export function editorialHistoryView(value) {
  return {
    id: value.id,
    recordKind: value.sourceRecord.kind,
    artifact: value.artifact,
    byteLength: value.byteLength,
    chunkCount: value.chunkCount,
    contentHash: value.contentHash,
  };
}
export function validateEditorialRestoreReview(value, id) {
  closed(value, [
    'schemaVersion',
    'id',
    'kind',
    'sourceArtifactId',
    'nativeRevision',
    'nativeContentHash',
    'sourceRevision',
    'sourceCreatedAt',
    'sourceUpdatedAt',
    'historicalStatus',
    'historicalCollaboration',
    'pendingReferences',
    'review',
    'execution',
    'publication',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.id !== id ||
    !['contract', 'plan'].includes(value.kind) ||
    (value.kind === 'contract') !== (id === 'contract') ||
    value.nativeRevision !== 1 ||
    value.review !== 'required' ||
    value.execution !== 'disabled' ||
    value.publication !== 'private' ||
    !Array.isArray(value.pendingReferences) ||
    value.pendingReferences.length > 12
  )
    inconsistent();
  restoreHash(value.sourceArtifactId);
  restoreHash(value.nativeContentHash);
  for (const field of ['sourceRevision', 'sourceCreatedAt', 'sourceUpdatedAt'])
    if (value[field] !== null) integer(value[field]);
  for (const reference of value.pendingReferences) normalizeBookEditorialReference(reference);
  if (
    value.kind === 'contract' &&
    (value.pendingReferences.length !== 0 || value.historicalStatus !== null)
  )
    inconsistent();
  if (value.kind === 'plan' && !EDITORIAL_STATUSES.includes(value.historicalStatus)) inconsistent();
  if (value.historicalCollaboration !== null)
    normalizeLiteraryCollaboration(value.historicalCollaboration);
  if (value.kind === 'plan' && value.historicalCollaboration !== null) inconsistent();
  return value;
}
export function editorialRestoreReviewId(id) {
  if (id !== 'contract' && (typeof id !== 'string' || !/^restore-[a-f0-9]{64}$/.test(id)))
    invalid();
  return id;
}
