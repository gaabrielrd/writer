import { fixture, resource } from './bookContentFixture.mjs';
export const PRIVATE_LORE_BODY = 'PRIVATE_INDEXED_LORE_BODY🌙';
export function indexedLoreData({ large = false, largeRelation = false, count = 130 } = {}) {
  return {
    relations: Array.from({ length: count }, (_, i) => ({
      targetEntityId: ['entity', 'gone', 'universe:world:outside'][i % 3],
      relationType: '',
      ...(largeRelation && i === 64 ? { description: PRIVATE_LORE_BODY.repeat(350000) } : {}),
    })),
    name: ' \ufeff🌙 Literal ',
    category: 'character',
    aliases: ['', 'same', 'same'],
    summary: '',
    details: large ? PRIVATE_LORE_BODY.repeat(350000) : PRIVATE_LORE_BODY,
    structuredDetails: { notes: '\ufeff private literal' },
    isPublic: false,
    createdAt: 0,
    updatedAt: 2,
  };
}
export function indexedLoreArchive(data = indexedLoreData(), { id = 'entity' } = {}) {
  const replacement = resource('lore', id, data),
    parts = [];
  for (let offset = 0; offset < replacement.payload.length; offset += 65536)
    parts.push({
      ...replacement,
      part: offset / 65536,
      payload: replacement.payload.subarray(offset, offset + 65536),
    });
  return fixture().flatMap((record) => (record.kind === 'book-lore' ? parts : [record]));
}
