export const BOOK_STRUCTURE_LIMITS = Object.freeze({
  version: 1,
  pageItems: 50,
  chunkBytes: 65_536,
  itemBytes: 8 * 1024 * 1024,
});
const fields = {
  book: [
    'title',
    'genre',
    'synopsis',
    'personaId',
    'universeId',
    'coverImageId',
    'createdAt',
    'updatedAt',
  ],
  act: ['name', 'order', 'createdAt', 'updatedAt'],
  chapter: [
    'title',
    'order',
    'actId',
    'personaComplement',
    'content',
    'contentMode',
    'assemblyRevision',
    'structureRevision',
    'rankSlot',
    'createdAt',
    'updatedAt',
  ],
};
function pick(value, keys) {
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
}
function assertJSON(entry, depth = 0) {
  if (entry === null || ['string', 'boolean'].includes(typeof entry)) return;
  if (typeof entry === 'number' && Number.isFinite(entry)) return;
  if (
    depth <= 24 &&
    typeof entry === 'object' &&
    entry &&
    (Array.isArray(entry) || Object.getPrototypeOf(entry) === Object.prototype)
  ) {
    for (const value of Object.values(entry)) assertJSON(value, depth + 1);
    return;
  }
  throw new TypeError('Dados não representáveis no backup.');
}
/** Source projection only; this is not the complete portable-book schema. */
export function serializeBookBackupStructure(kind, value, control) {
  if (!Object.hasOwn(fields, kind)) throw new TypeError('Tipo de estrutura inválido.');
  const item = pick(value, fields[kind]);
  if (kind === 'chapter' && item.personaComplement != null) {
    const complement = item.personaComplement;
    if (!Array.isArray(complement.overrides)) throw new TypeError('Complemento inválido.');
    item.personaComplement = {
      ...pick(complement, ['personaId']),
      overrides: complement.overrides.map((override) => pick(override, ['traitId', 'value'])),
    };
  }
  const projected =
    kind === 'book'
      ? {
          book: item,
          progress: pick(control, ['editorialState', 'wordGoal']),
          cover: value.coverImageId
            ? { kind: 'library', imageId: value.coverImageId }
            : { kind: value.coverUrl ? 'legacy-unavailable' : 'none' },
        }
      : item;
  return encodeBookBackupJSON(projected);
}
export function encodeBookBackupJSON(projected) {
  assertJSON(projected);
  const json = JSON.stringify(projected);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > BOOK_STRUCTURE_LIMITS.itemBytes)
    throw new RangeError('Item excede o limite de leitura.');
  return { json, bytes };
}
