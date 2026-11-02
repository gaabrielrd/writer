import { born, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import {
  loreGenerationStorage,
  loreFieldPointer,
  BOOK_LORE_GENERATION_FIELDS,
} from './bookLoreGenerationContracts.mjs';
import { lorePayloadPointer } from './bookRestoreLorePayloadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import {
  editReservationTarget,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
export const COMPILATION_ALGORITHM = 'sha256-hash-wasm-lore-compilation-v1';
export const compilationPointer = (p) =>
  Object.hasOwn(p, 'partSealBirth') ? loreFieldPointer(p) : lorePayloadPointer(p);
export function compilationState(c) {
  closed(
    c,
    [
      'schemaVersion',
      'phase',
      'timestamp',
      'base',
      'fields',
      'fieldIndex',
      'page',
      'relations',
      'auditSelector',
      'auditIndex',
      'auditedParts',
      'auditHash',
      'cleanupPage',
      'storage',
    ],
    ['inlineWork'],
  );
  if (c.inlineWork !== undefined && c.inlineWork !== null) {
    closed(c.inlineWork, ['target', 'uploadId', 'startHash', 'operationId']);
    editReservationTarget(c.inlineWork.target);
    bookContentId(c.inlineWork.uploadId);
    restoreHash(c.inlineWork.startHash);
    bookContentId(c.inlineWork.operationId);
    if (!['fields', 'relations'].includes(c.phase)) conflict();
  }
  if (
    c.schemaVersion !== 1 ||
    !['base', 'fields', 'relations', 'audit', 'finalize', 'ready'].includes(c.phase)
  )
    conflict();
  for (const key of [
    'timestamp',
    'fieldIndex',
    'page',
    'auditSelector',
    'auditIndex',
    'auditedParts',
    'cleanupPage',
  ])
    integer(c[key]);
  if (
    !Number.isFinite(new Date(c.timestamp).getTime()) ||
    c.fieldIndex > 7 ||
    c.cleanupPage > c.page
  )
    conflict();
  if (c.base !== null) compilationPointer(c.base);
  closed(c.fields, [], BOOK_LORE_GENERATION_FIELDS);
  for (const [field, pointer] of Object.entries(c.fields)) {
    if (pointer === null) {
      if (['name', 'category'].includes(field)) conflict();
    } else compilationPointer(pointer);
  }
  const r = c.relations;
  closed(r, ['present', 'count', 'pages', 'generationId', 'sealBirth', 'copied']);
  integer(r.count);
  integer(r.pages);
  restoreHash(r.generationId);
  if (
    typeof r.present !== 'boolean' ||
    typeof r.copied !== 'boolean' ||
    (!r.present && r.count !== 0) ||
    r.pages !== Math.ceil(r.count / 64) ||
    c.page > r.pages ||
    c.auditSelector > 8 + r.pages
  )
    conflict();
  if (r.sealBirth !== null) {
    closed(r.sealBirth, ['seconds', 'nanoseconds']);
    born({ createTime: r.sealBirth });
  }
  if (c.auditHash !== null) restoreHash(c.auditHash);
  if (c.auditHash !== null && c.phase !== 'audit') conflict();
  if (c.phase === 'ready') {
    loreGenerationStorage(c.storage);
    if (c.auditHash !== null) conflict();
  } else if (c.storage !== null) conflict();
  return c;
}
export const compilationView = (c) => ({
  phase: c.phase,
  fieldIndex: c.fieldIndex,
  page: c.page,
  totalPages: c.relations.pages,
  auditSelector: c.auditSelector,
  auditIndex: c.auditIndex,
  auditedParts: c.auditedParts,
  cleanupPage: c.cleanupPage,
  ...(Object.hasOwn(c, 'inlineWork') ? { materializing: c.inlineWork?.target ?? null } : {}),
});
