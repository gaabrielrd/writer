import { describe, expect, it } from 'vitest';
import {
  asLoreScope,
  entityScope,
  loreEntityDocumentId,
  preferredLoreTerms,
  universeEntityId,
} from '../model/loreScope';
import type { LoreEntity } from '../model/loreEntity';

const fields = {
  name: 'Arthur',
  aliases: ['Rei'],
  category: 'character' as const,
  summary: 'Rei',
  details: '',
  relations: [],
  isPublic: false,
  createdAt: 1,
  updatedAt: 1,
};
describe('identidade e prioridade de lore', () => {
  it('mantém referências locais e diferencia entidades globais com o mesmo ID', () => {
    const local: LoreEntity = { ...fields, id: 'same', bookId: 'book' };
    const global: LoreEntity = {
      ...fields,
      id: universeEntityId('world', 'same'),
      universeId: 'world',
    };
    expect(asLoreScope('book')).toEqual({ kind: 'book', id: 'book' });
    expect(asLoreScope(entityScope(global))).toEqual({ kind: 'universe', id: 'world' });
    expect(entityScope(local)).toEqual({ kind: 'book', id: 'book' });
    expect(loreEntityDocumentId(entityScope(global), global.id)).toBe('same');
    expect(loreEntityDocumentId(entityScope(local), local.id)).toBe('same');
    expect(global.id).not.toBe(local.id);
    expect(() => loreEntityDocumentId(entityScope(global), 'universe:other:same')).toThrow();
    expect(() => loreEntityDocumentId(entityScope(local), 'bad/id')).toThrow();
    expect(() => loreEntityDocumentId(entityScope(local), '')).toThrow();
  });
  it('dá prioridade ao termo local mesmo privado, independentemente da ordem', () => {
    const local: LoreEntity = { ...fields, id: 'local', bookId: 'book' };
    const global: LoreEntity = {
      ...fields,
      id: 'global',
      universeId: 'world',
      isPublic: true,
      aliases: ['Rei', 'Pendragon', ' '],
    };
    const terms = preferredLoreTerms([global, local]);
    expect(terms.get('arthur')).toBe(local);
    expect(terms.get('rei')).toBe(local);
    expect(terms.get('pendragon')).toBe(global);
    expect(terms.has('')).toBe(false);
  });
});
