import { expect, it } from 'vitest';
import { presentBookLore } from '../model/bookLorePresentation';
import { freezeBookLoreEditSource } from '../services/bookLoreWritePlan';

it('presentation keeps literal values and treats missing consent as private without manufacturing writer fields', () => {
  const source = freezeBookLoreEditSource({
    bookId: 'book',
    id: 'entity',
    sourceToken: 'a'.repeat(64),
    data: {
      name: '  🌙 ',
      category: 'other',
      aliases: ['', 'a', 'a'],
      structuredDetails: { notes: '' },
    },
  });
  const row = presentBookLore(source);
  expect(row).toMatchObject({
    name: '  🌙 ',
    aliases: ['', 'a', 'a'],
    isPublic: false,
    summary: '',
    relations: [],
    sourceToken: source.sourceToken,
  });
  expect('createdAt' in row).toBe(false);
  expect('updatedAt' in row).toBe(false);
  expect(Object.hasOwn(source.data, 'isPublic')).toBe(false);
  expect(Object.hasOwn(source.data, 'summary')).toBe(false);
  expect(source.data.structuredDetails).toEqual({ notes: '' });
});
it('presentation never silently substitutes an unrecognized name or category', () => {
  expect(() =>
    presentBookLore({
      bookId: 'book',
      id: 'entity',
      sourceToken: 'a'.repeat(64),
      data: { name: 'name', category: 'unknown' },
    }),
  ).toThrow('ficha completa');
});
