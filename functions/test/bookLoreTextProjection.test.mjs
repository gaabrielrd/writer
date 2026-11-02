import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookLoreTextProjection,
  createBookLoreProjectionBudget,
} from '../src/bookLoreTextProjection.mjs';
import {
  createBookLoreBaseIndex,
  advanceBookLoreBaseIndex,
  finishBookLoreBaseIndex,
} from '../src/bookLoreBaseIndex.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldValidation,
  finishBookLoreFieldValidation,
} from '../src/bookLoreFieldValidation.mjs';
const budget = () =>
  createBookLoreProjectionBudget({ bytes: 100000000, parts: 10000, retainedBytes: 1000000 });
function field(value, key, selection, size = 1, limit = budget()) {
  const p = createBookLoreTextProjection(selection, limit),
    bytes = Buffer.from(JSON.stringify(value));
  let state = createBookLoreFieldValidation({ field: key });
  for (let at = 0; at < bytes.length; at += size)
    state = advanceBookLoreFieldValidation(state, bytes.subarray(at, at + size), p.observers[key]);
  finishBookLoreFieldValidation(state);
  return { value: p.finish([key]), state, limit };
}
for (const [value, n, expected, truncated] of [
  ['\ufeffA🌙Z', 3, '\ufeffA', true],
  ['🌙', 1, '', true],
  ['🌙', 2, '🌙', false],
  ['', 0, '', false],
  ['x', 0, '', true],
  ['\r\n"\\\u0000🌙', null, '\r\n"\\\u0000🌙', false],
])
  test('literal prefix ' + JSON.stringify([value, n]) + ' survives every raw byte boundary', () => {
    const bytes = Buffer.from(JSON.stringify(value));
    for (let size = 1; size <= bytes.length; size++) {
      const r = field(value, 'details', { details: n }, size);
      assert.deepEqual(r.value.details, { value: expected, truncated });
      assert.equal(r.value.details.value.isWellFormed(), true);
      assert.equal(r.state.text, '');
    }
  });
test('aliases preserve empty entries, duplicates and exact omitted count', () => {
  const value = ['', 'same', 'same', '🌙abc', 'tail'],
    full = field(value, 'aliases', { aliases: { items: null, characters: null } }).value.aliases,
    short = field(value, 'aliases', { aliases: { items: 4, characters: 2 } }).value.aliases;
  assert.deepEqual(full, { value, count: 5, omitted: 0, truncated: false });
  assert.deepEqual(short, { value: ['', 'sa', 'sa', '🌙'], count: 5, omitted: 1, truncated: true });
  assert.deepEqual(
    field(value, 'aliases', { aliases: { items: 0, characters: 0 } }).value.aliases,
    { value: [], count: 5, omitted: 5, truncated: false },
  );
});
test('an empty aliases list is present while an absent field remains absent', () => {
  const p = createBookLoreTextProjection(
    { name: null, summary: 4, aliases: { items: 20, characters: 200 } },
    budget(),
  );
  const value = {
    name: 'N',
    category: 'other',
    bookId: 'book',
    createdAt: 0,
    updatedAt: 0,
    aliases: [],
  };
  let state = createBookLoreBaseIndex('book');
  state = advanceBookLoreBaseIndex(state, Buffer.from(JSON.stringify(value)), p.observers);
  const m = finishBookLoreBaseIndex(state),
    r = p.finish(m.fields);
  assert.equal(Object.hasOwn(r, 'summary'), false);
  assert.deepEqual(r.aliases.value, []);
  assert.equal(r.aliases.count, 0);
});
test('base observation keeps parser checkpoints identical and never persists retained prose', () => {
  const value = {
      name: 'PRIVATE_NAME',
      category: 'character',
      details: 'PRIVATE_PROSE_' + '🌙'.repeat(2300000),
      aliases: ['alias'],
      bookId: 'book',
      createdAt: 1,
      updatedAt: 2,
    },
    bytes = Buffer.from(JSON.stringify(value)),
    limit = budget(),
    p = createBookLoreTextProjection({ name: null, details: 30 }, limit);
  let observed = createBookLoreBaseIndex('book'),
    plain = createBookLoreBaseIndex('book');
  for (let at = 0; at < bytes.length; at += 65536) {
    const part = bytes.subarray(at, at + 65536);
    observed = advanceBookLoreBaseIndex(observed, part, p.observers);
    plain = advanceBookLoreBaseIndex(plain, part);
    assert.deepEqual(observed, plain);
    assert.equal(JSON.stringify(observed).includes('PRIVATE_'), false);
  }
  const m = finishBookLoreBaseIndex(observed),
    r = p.finish(m.fields);
  assert.equal(r.details.truncated, true);
  assert.ok(r.details.value.length <= 30);
  assert.equal(r.name.value, 'PRIVATE_NAME');
  assert.ok(limit.used.retainedBytes < 200);
});
test('empty strings cannot grow a retained alias list without spending its budget', () => {
  const limit = createBookLoreProjectionBudget({ bytes: 100000, parts: 10, retainedBytes: 40 });
  assert.throws(
    () =>
      field(
        Array(10000).fill(''),
        'aliases',
        { aliases: { items: null, characters: null } },
        65536,
        limit,
      ),
    { code: 'resource-exhausted' },
  );
  assert.ok(limit.used.retainedBytes <= 40);
});
test('observer failure leaves the original parser checkpoint available for a valid retry', () => {
  const state = createBookLoreFieldValidation({ field: 'details' }),
    before = structuredClone(state),
    bytes = Buffer.from(JSON.stringify('private'));
  assert.throws(
    () =>
      advanceBookLoreFieldValidation(state, bytes, {
        text() {
          throw Error('stop');
        },
      }),
    /stop/,
  );
  assert.deepEqual(state, before);
  finishBookLoreFieldValidation(advanceBookLoreFieldValidation(state, bytes));
});
test('invalid JSON and UTF8 are still rejected when collection is already truncated', () => {
  for (const bytes of [
    Buffer.from('"x"extra'),
    Buffer.from([34, 120, 255, 34]),
    Buffer.from('"x\\u0041"'),
  ]) {
    const p = createBookLoreTextProjection({ details: 0 }, budget());
    assert.throws(() =>
      advanceBookLoreFieldValidation(
        createBookLoreFieldValidation({ field: 'details' }),
        bytes,
        p.observers.details,
      ),
    );
  }
});
test('projection and budget shapes are closed and costs cannot exceed available balances', () => {
  for (const selection of [
    { relations: null },
    { aliases: { items: -1, characters: 1 } },
    { name: NaN },
    { name: 'full' },
  ])
    assert.throws(() => createBookLoreTextProjection(selection, budget()));
  const b = createBookLoreProjectionBudget({ bytes: 5, parts: 1, retainedBytes: 5 });
  b.reserve({ bytes: 5, parts: 1 });
  assert.throws(() => b.reserve({ bytes: 1 }), { code: 'resource-exhausted' });
  assert.throws(() => b.reserve({ other: 1 }));
  assert.deepEqual(b.used, { bytes: 5, parts: 1, retainedBytes: 0 });
});
