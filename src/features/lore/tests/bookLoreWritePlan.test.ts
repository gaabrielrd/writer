// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  freezeBookLoreEditSource,
  planBookLoreEdit,
  type BookLoreEditChange,
} from '../services/bookLoreWritePlan';
const source = (data: Record<string, unknown> = {}) =>
  freezeBookLoreEditSource({
    bookId: 'book',
    id: 'entity',
    sourceToken: 'a'.repeat(64),
    data: {
      name: '  Literal \ufeff🌙 e\u0301 ',
      category: 'character',
      createdAt: 1000,
      updatedAt: 1001,
      ...data,
    },
  });
const relation = (i: number) => ({
  targetEntityId: 'target-' + i,
  relationType: 'knows',
  ...(i % 2 ? { description: '' } : {}),
});
const relations = (count: number) => Array.from({ length: count }, (_, i) => relation(i));
it('freezes a raw observed snapshot without retaining mutable caller data', () => {
  const aliases = ['', 'x', 'x'],
    data = { aliases, relations: [relation(0)], structuredDetails: { notes: '  ' } },
    s = source(data);
  aliases.push('later');
  data.relations[0]!.relationType = 'changed';
  data.structuredDetails.notes = 'changed';
  expect(s.data).toMatchObject({
    aliases: ['', 'x', 'x'],
    relations: [relation(0)],
    structuredDetails: { notes: '  ' },
  });
  expect(Object.isFrozen(s)).toBe(true);
  expect(Object.isFrozen(s.data.aliases)).toBe(true);
});
it('a no-op never creates fields, dates, defaults or uploads', () => {
  const s = source({
    aliases: ['', 'x', 'x'],
    structuredDetails: { notes: '', history: 'literal' },
  });
  const p = planBookLoreEdit(s, [
    { field: 'name', value: s.data.name },
    { field: 'structuredDetails', value: { history: 'literal', notes: '' } },
    { field: 'aliases', value: ['', 'x', 'x'] },
    { field: 'summary', remove: true },
  ]);
  expect(p.empty).toBe(true);
  expect(p.uploads).toEqual([]);
  expect(p.fields).toEqual([]);
  expect(p.relations).toBeNull();
});
it('changing only a small field excludes large untouched text and relation pages', () => {
  const s = source({
      details: '\ufeff' + 'large 🌙'.repeat(1200000),
      aliases: ['', 'same', 'same'],
      relations: relations(130),
    }),
    p = planBookLoreEdit(s, [{ field: 'summary', value: '  new\r\n\ufeff e\u0301  ' }]);
  expect(p.fields).toEqual([{ field: 'summary', upload: 0 }]);
  expect(p.uploads).toEqual([{ target: { field: 'summary' }, value: '  new\r\n\ufeff e\u0301  ' }]);
  expect(p.relations).toBeNull();
  expect(Object.keys(p)).not.toContain('data');
  expect(s.data.updatedAt).toBe(1001);
});
for (const [before, changes, expected] of [
  [{}, [{ field: 'details', value: '' }], [{ field: 'details', upload: 0 }]],
  [{ details: '' }, [{ field: 'details', remove: true }], [{ field: 'details', remove: true }]],
  [
    { isPublic: false },
    [{ field: 'isPublic', remove: true }],
    [{ field: 'isPublic', remove: true }],
  ],
  [{}, [{ field: 'isPublic', value: false }], [{ field: 'isPublic', upload: 0 }]],
] as [Record<string, unknown>, BookLoreEditChange[], unknown][])
  it(
    'preserves absent/empty/false: ' + JSON.stringify(before) + ' -> ' + JSON.stringify(changes),
    () => {
      expect(planBookLoreEdit(source(before), changes).fields).toEqual(expected);
    },
  );
for (const count of [0, 1, 64, 65, 130])
  it('no relation uploads for the same ordered ' + count + ' entries', () => {
    const r = relations(count),
      p = planBookLoreEdit(source({ relations: r }), [{ field: 'relations', value: r }]);
    expect(p.empty).toBe(true);
    expect(p.relations).toBeNull();
  });
it('a change on page 1 uploads only page 1 without normalizing duplicates or optional description', () => {
  const old = relations(130),
    next = structuredClone(old);
  next[64] = { ...next[64]!, description: '\ufeff literal 🌙' };
  const p = planBookLoreEdit(source({ relations: old }), [{ field: 'relations', value: next }]);
  expect(p.relations).toEqual({ present: true, count: 130 });
  expect(p.uploads).toEqual([
    { target: { field: 'relations', page: 1, count: 64 }, value: next.slice(64, 128) },
  ]);
  expect(Object.isFrozen(p.uploads[0]!.value)).toBe(true);
});
for (const [before, after, pages] of [
  [65, 64, []],
  [64, 65, [1]],
  [66, 65, [1]],
  [130, 129, [2]],
  [1, 0, []],
] as [number, number, number[]][])
  it('handles last-page shape ' + before + ' -> ' + after, () => {
    const p = planBookLoreEdit(source({ relations: relations(before) }), [
      { field: 'relations', value: relations(after) },
    ]);
    expect(p.relations).toEqual({ present: true, count: after });
    expect(p.uploads.map((u) => (u.target.field === 'relations' ? u.target.page : -1))).toEqual(
      pages,
    );
  });
it('absence and an explicit empty relation collection remain different', () => {
  expect(planBookLoreEdit(source(), [{ field: 'relations', value: [] }]).relations).toEqual({
    present: true,
    count: 0,
  });
  expect(
    planBookLoreEdit(source({ relations: [] }), [{ field: 'relations', remove: true }]).relations,
  ).toEqual({ present: false, count: 0 });
});
it('insertion and reordering retain sequence and dirty only the affected pages', () => {
  const old = relations(130),
    next = [relation(99), ...old],
    p = planBookLoreEdit(source({ relations: old }), [{ field: 'relations', value: next }]);
  expect(p.uploads.map((u) => u.target)).toEqual(
    [0, 1, 2].map((page) => ({ field: 'relations', page, count: Math.min(64, 131 - page * 64) })),
  );
  expect((p.uploads[0]!.value as unknown[]).slice(0, 2)).toEqual([relation(99), relation(0)]);
});
describe('rejects invalid intentions before serialization', () => {
  const bad: unknown[] = [
    [{ field: 'name', remove: true }],
    [{ field: 'category', remove: true }],
    [{ field: 'updatedAt', value: 9 }],
    [{ field: 'details', value: undefined }],
    [{ field: 'details', value: null }],
    [{ field: 'summary', value: 1 }],
    [{ field: 'category', value: 'invalid' }],
    [{ field: 'aliases', value: ['x', undefined] }],
    [{ field: 'details', value: '\ud800' }],
    [{ field: 'isPublic', value: 'false' }],
    [{ field: 'details', value: '', remove: true }],
    [{ field: 'details', remove: false }],
    [
      { field: 'summary', value: '' },
      { field: 'summary', value: 'other' },
    ],
    [{ field: 'structuredDetails', value: { unknown: '' } }],
    [{ field: 'relations', value: [{ ...relation(0), available: true }] }],
    [{ field: 'relations', value: [{ targetEntityId: 'bad/path', relationType: '' }] }],
  ];
  for (const [i, changes] of bad.entries())
    it('invalid input ' + i, () => {
      expect(() => planBookLoreEdit(source(), changes as BookLoreEditChange[])).toThrow();
    });
  it('does not execute accessors or toJSON and rejects sparse arrays', () => {
    let calls = 0;
    const getter = {
      get notes() {
        calls++;
        return '';
      },
    };
    expect(() =>
      planBookLoreEdit(source(), [{ field: 'structuredDetails', value: getter }]),
    ).toThrow();
    expect(() => source({ aliases: new Array(1) })).toThrow();
    expect(() =>
      source({
        structuredDetails: {
          toJSON() {
            calls++;
            return {};
          },
        },
      }),
    ).toThrow();
    expect(calls).toBe(0);
  });
});
