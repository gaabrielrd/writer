import {
  authorize,
  born,
  bornEqual,
  closed,
  integer,
  restoreHash,
} from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { BOOK_LORE_BASE_FIELDS } from './bookLoreBaseIndex.mjs';
import { BOOK_LORE_GENERATION_FIELDS } from './bookLoreGenerationContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
import { publicationCandidate } from './bookLorePublicationValidation.mjs';
export const SOURCE_INSPECTION_ALGORITHM = 'sha256/hash-wasm@4.12.0';
export const inspectionConflict = () =>
  workFail(
    'failed-precondition',
    'A inspeção da origem mudou ou está indisponível.',
    'book-lore-inspection-conflict',
  );
export function inspectionIntent(uid, r) {
  authorize(uid);
  closed(r, ['bookId', 'loreId', 'inspectionId', 'sourceToken'], ['publicationHash']);
  return {
    bookId: bookContentId(r.bookId),
    loreId: bookContentId(r.loreId),
    inspectionId: bookContentId(r.inspectionId),
    sourceToken: restoreHash(r.sourceToken),
    ...(Object.hasOwn(r, 'publicationHash')
      ? { publicationHash: restoreHash(r.publicationHash) }
      : {}),
  };
}
export const inspectionStartHash = (intent) =>
  digest({ domain: 'writer-lore-source-inspection', schemaVersion: 1, intent });
export function inspectionPaths(db, uid, id) {
  authorize(uid);
  bookContentId(id);
  const path = 'users/' + uid + '/bookLoreSourceInspections/' + id;
  return {
    db,
    uid,
    id,
    path,
    ref: db.doc(path),
    stateRef: db.doc(path + '/state/current'),
    certificateRef: db.doc(path + '/certificate/current'),
  };
}
export function inspectionRequest(uid, r, mutation = false, cas = false) {
  authorize(uid);
  closed(
    r,
    [
      'inspectionId',
      'startHash',
      ...(mutation ? ['operationId'] : []),
      ...(cas ? ['jobToken', 'expectedRevision'] : []),
    ],
    cas ? ['publication'] : ['jobToken'],
  );
  const value = {
    inspectionId: bookContentId(r.inspectionId),
    startHash: restoreHash(r.startHash),
  };
  if (Object.hasOwn(r, 'jobToken')) value.jobToken = restoreHash(r.jobToken);
  if (mutation) value.operationId = bookContentId(r.operationId);
  if (cas) {
    integer(r.expectedRevision);
    value.expectedRevision = r.expectedRevision;
    if (Object.hasOwn(r, 'publication')) value.publication = publicationCandidate(r.publication);
  }
  return value;
}
export const inspectionToken = (c, s, j) =>
  digest({
    domain: 'writer-lore-source-job',
    schemaVersion: 1,
    uid: c.uid,
    inspectionId: c.id,
    startHash: j.startHash,
    birth: born(s),
  });
export const inspectionImmutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
export const inspectionAtMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
export const inspectionUpdate = (s) => born({ createTime: s.updateTime });
export const inspectionView = (loaded) => {
  const j = loaded.job,
    fence = j.kind === 'fence';
  return {
    inspectionId: loaded.c.id,
    startHash: j.startHash,
    jobToken: fence ? null : loaded.token,
    phase: j.phase,
    revision: fence ? 0 : j.revision,
    nextIndex: fence ? 0 : j.nextIndex,
    byteLength: fence ? 0 : j.byteLength,
    totalParts: fence ? 0 : (j.context.manifest?.chunkCount ?? 0),
    ready: !fence && j.phase === 'ready',
  };
};
export function inspectionMetadata(m) {
  closed(m, ['schemaVersion', 'fields', 'isPublic', 'dates', 'ranges', 'relations']);
  if (
    m.schemaVersion !== 1 ||
    !Array.isArray(m.fields) ||
    m.fields.length > 7 ||
    new Set(m.fields).size !== m.fields.length ||
    m.fields.some((k) => !BOOK_LORE_GENERATION_FIELDS.includes(k))
  )
    inspectionConflict();
  closed(m.isPublic, ['present', 'value']);
  if (
    typeof m.isPublic.present !== 'boolean' ||
    m.isPublic.present !== m.fields.includes('isPublic') ||
    (m.isPublic.present ? typeof m.isPublic.value !== 'boolean' : m.isPublic.value !== null)
  )
    inspectionConflict();
  closed(m.dates, [], ['createdAt', 'updatedAt']);
  for (const n of Object.values(m.dates)) {
    integer(n);
    if (!Number.isFinite(new Date(n).getTime())) inspectionConflict();
  }
  closed(m.ranges, [], BOOK_LORE_BASE_FIELDS);
  for (const r of Object.values(m.ranges)) {
    closed(r, ['offset', 'byteLength']);
    integer(r.offset);
    integer(r.byteLength, 1);
    if (!Number.isSafeInteger(r.offset + r.byteLength)) inspectionConflict();
  }
  closed(m.relations, ['present', 'count', 'pages']);
  integer(m.relations.count);
  integer(m.relations.pages);
  if (
    typeof m.relations.present !== 'boolean' ||
    (!m.relations.present && m.relations.count !== 0) ||
    m.relations.pages !== Math.ceil(m.relations.count / 64)
  )
    inspectionConflict();
  return m;
}
