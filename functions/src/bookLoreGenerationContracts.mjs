import { born, closed, inconsistent, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { lorePayloadPointer, lorePayloadStorage } from './bookRestoreLorePayloadContracts.mjs';
import { resourcePayloadManifest } from './bookResourcePayloadContracts.mjs';

export const BOOK_LORE_GENERATION_FIELDS = Object.freeze([
  'name',
  'category',
  'summary',
  'details',
  'aliases',
  'structuredDetails',
  'isPublic',
]);
export const loreBirthAtMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
function stamp(value) {
  closed(value, ['seconds', 'nanoseconds']);
  born({ createTime: value });
}
function date(value) {
  integer(value);
  if (!Number.isFinite(new Date(value).getTime())) inconsistent();
}
export function loreFieldPointer(value) {
  closed(value, ['manifest', 'expectedBirth', 'partSealBirth']);
  resourcePayloadManifest(value.manifest);
  stamp(value.expectedBirth);
  stamp(value.partSealBirth);
  if (!loreBirthAtMost(value.partSealBirth, value.expectedBirth)) inconsistent();
  return structuredClone(value);
}
/** A flat generation is storage metadata, never authorization or a portable book record. */
export function loreGenerationStorage(value) {
  if (value?.schemaVersion === 1) return lorePayloadStorage(value);
  closed(value, [
    'schemaVersion',
    'generationId',
    'base',
    'fields',
    'dates',
    'relations',
    'sealBirth',
  ]);
  if (value.schemaVersion !== 2) inconsistent();
  restoreHash(value.generationId);
  stamp(value.sealBirth);
  if (value.base !== null) {
    lorePayloadPointer(value.base);
    if (!loreBirthAtMost(value.base.expectedBirth, value.sealBirth)) inconsistent();
  }
  closed(value.fields, [], BOOK_LORE_GENERATION_FIELDS);
  for (const [field, pointer] of Object.entries(value.fields)) {
    if (pointer === null) {
      if (['name', 'category'].includes(field)) inconsistent();
    } else {
      loreFieldPointer(pointer);
      if (!loreBirthAtMost(pointer.expectedBirth, value.sealBirth)) inconsistent();
    }
  }
  if (value.base === null && ['name', 'category'].some((field) => !value.fields[field]))
    inconsistent();
  closed(value.dates, ['updatedAt'], ['createdAt']);
  for (const number of Object.values(value.dates)) date(number);
  const r = value.relations;
  closed(r, ['present', 'count', 'pages', 'generationId', 'sealBirth']);
  integer(r.count);
  integer(r.pages);
  restoreHash(r.generationId);
  stamp(r.sealBirth);
  if (
    typeof r.present !== 'boolean' ||
    (!r.present && r.count !== 0) ||
    r.pages !== Math.ceil(r.count / 64) ||
    !loreBirthAtMost(r.sealBirth, value.sealBirth)
  )
    inconsistent();
  return structuredClone(value);
}
export const loreGenerationRelations = (storage) =>
  storage.schemaVersion === 1
    ? { ...storage.relations, generationId: storage.generationId, sealBirth: storage.sealBirth }
    : storage.relations;
export const loreReadRelations = (r) => ({ present: r.present, count: r.count, pages: r.pages });
