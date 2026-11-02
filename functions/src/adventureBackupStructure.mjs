export const ADVENTURE_STRUCTURE_LIMITS = Object.freeze({
  version: 1,
  pageItems: 50,
  chunkBytes: 65536,
});
export const ADVENTURE_STRUCTURE_FIELDS = Object.freeze({
  adventure: Object.freeze([
    'title',
    'synopsis',
    'language',
    'status',
    'editorialState',
    'personaId',
    'universeId',
    'createdAt',
    'updatedAt',
    'origin',
  ]),
  part: Object.freeze(['title', 'order', 'contentMode', 'content', 'createdAt', 'updatedAt']),
});
function invalid() {
  throw new TypeError('Dados da estrutura não podem ser representados no backup.');
}
function optional(value, key, valid) {
  if (Object.hasOwn(value, key) && !valid(value[key])) invalid();
}
const text = (value) => typeof value === 'string';
const date = (value) => Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
const nativeId = (value) =>
  value === null ||
  (text(value) &&
    value.length > 0 &&
    Buffer.byteLength(value, 'utf8') <= 1500 &&
    !value.includes('/') &&
    !['.', '..'].includes(value));
function origin(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (value.kind === 'authored') return { kind: 'authored' };
  if (
    value.kind !== 'imported' ||
    !text(value.sourceMediaType) ||
    !text(value.sourceHash) ||
    !text(value.reviewHash) ||
    !/^[a-f0-9]{64}$/i.test(value.sourceHash ?? '') ||
    !/^[a-f0-9]{64}$/i.test(value.reviewHash ?? '')
  )
    invalid();
  return {
    kind: 'imported',
    sourceMediaType: value.sourceMediaType,
    sourceHash: value.sourceHash,
    reviewHash: value.reviewHash,
  };
}
/** Source projection, not the complete adventure archive schema. No I/O or grants. */
export function serializeAdventureBackupStructure(kind, value) {
  if (
    !Object.hasOwn(ADVENTURE_STRUCTURE_FIELDS, kind) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    invalid();
  for (const key of kind === 'adventure' ? ['title', 'synopsis', 'language'] : ['title', 'content'])
    optional(value, key, text);
  for (const key of ['createdAt', 'updatedAt']) optional(value, key, date);
  if (kind === 'adventure') {
    if (!text(value.title) || !['draft', 'ready', 'archived'].includes(value.status)) invalid();
    optional(value, 'editorialState', (v) => ['draft', 'review', 'ready'].includes(v));
    for (const key of ['personaId', 'universeId']) optional(value, key, nativeId);
  } else {
    optional(value, 'order', Number.isFinite);
    optional(value, 'contentMode', (v) => ['scenes', 'legacy'].includes(v));
  }
  const data = Object.fromEntries(
      ADVENTURE_STRUCTURE_FIELDS[kind]
        .filter((key) => Object.hasOwn(value, key))
        .map((key) => [key, key === 'origin' ? origin(value.origin) : value[key]]),
    ),
    json = JSON.stringify({ schemaVersion: 1, kind, data }),
    bytes = new TextEncoder().encode(json);
  return { json, bytes };
}
