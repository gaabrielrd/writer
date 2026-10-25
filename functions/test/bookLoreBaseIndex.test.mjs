import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookLoreBaseIndex,
  advanceBookLoreBaseIndex,
  finishBookLoreBaseIndex,
} from '../src/bookLoreBaseIndex.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldPrefixValidation,
  finishBookLoreFieldValidation,
} from '../src/bookLoreFieldValidation.mjs';
const base = () => ({
  name: ' \ufeff🌙 ',
  category: 'character',
  details: 'literal\n"\\🌙',
  aliases: ['', 'same', 'same'],
  structuredDetails: { notes: '' },
  isPublic: false,
  bookId: 'b🌙"',
  createdAt: 0,
  updatedAt: 8640000000000000,
});
function scan(value, size = 65536, id = 'b🌙"') {
  const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  let s = createBookLoreBaseIndex(id);
  for (let at = 0; at < bytes.length; at += size)
    s = advanceBookLoreBaseIndex(s, bytes.subarray(at, at + size));
  return { state: s, metadata: finishBookLoreBaseIndex(s), bytes };
}
test('base index preserves presence, booleans, dates and exact UTF-8 byte ranges in every byte boundary', () => {
  const data = base(),
    bytes = Buffer.from(JSON.stringify(data));
  for (let split = 0; split <= bytes.length; split++) {
    let s = createBookLoreBaseIndex(data.bookId);
    s = advanceBookLoreBaseIndex(s, bytes.subarray(0, split));
    s = advanceBookLoreBaseIndex(s, bytes.subarray(split));
    const m = finishBookLoreBaseIndex(s);
    assert.deepEqual(m.fields, [
      'name',
      'category',
      'details',
      'aliases',
      'structuredDetails',
      'isPublic',
    ]);
    assert.deepEqual(m.isPublic, { present: true, value: false });
    assert.deepEqual(m.dates, { createdAt: 0, updatedAt: data.updatedAt });
    for (const [key, r] of Object.entries(m.ranges))
      assert.equal(
        bytes.subarray(r.offset, r.offset + r.byteLength).toString(),
        JSON.stringify(data[key]),
      );
  }
});
test('long strings and alias lists do not enter or grow the checkpoint above 8 MiB/128 units', () => {
  const value = {
      ...base(),
      details: 'PRIVATE_PROSE_' + '🌙'.repeat(2300000),
      aliases: Array.from({ length: 20000 }, () => 'NEVER_KEEP_THIS'),
    },
    bytes = Buffer.from(JSON.stringify(value));
  let state = createBookLoreBaseIndex(value.bookId),
    peak = 0,
    parts = 0;
  for (let at = 0; at < bytes.length; at += 65536) {
    state = advanceBookLoreBaseIndex(state, bytes.subarray(at, at + 65536));
    const text = JSON.stringify(state);
    assert.equal(text.includes('PRIVATE_PROSE'), false);
    assert.equal(text.includes('NEVER_KEEP'), false);
    peak = Math.max(peak, text.length);
    parts++;
  }
  assert.ok(parts > 128);
  assert.ok(peak < 3500);
  assert.equal(finishBookLoreBaseIndex(state).isPublic.value, false);
});
test('absence of optional fields is preserved rather than inferred false or empty', () => {
  const m = scan(
    { name: '', category: 'other', bookId: 'b🌙"', createdAt: 1, updatedAt: 2 },
    1,
  ).metadata;
  assert.deepEqual(m.fields, ['name', 'category']);
  assert.deepEqual(m.isPublic, { present: false, value: null });
});
test('known keys may arrive in any literal insertion order without normalization', () => {
  const x = base(),
    reversed = Object.fromEntries(Object.entries(x).reverse()),
    m = scan(reversed, 3).metadata;
  assert.equal(
    m.ranges.name.offset,
    Buffer.from(JSON.stringify(reversed)).indexOf(Buffer.from(JSON.stringify(x.name))),
  );
  assert.deepEqual(m.dates, { updatedAt: x.updatedAt, createdAt: 0 });
});
test('prefix validation consumes one complete field and leaves following delimiters untouched', () => {
  for (const [field, value] of [
    ['details', '🌙'],
    ['isPublic', false],
    ['aliases', ['', 'x', 'x']],
    ['structuredDetails', { notes: 'literal' }],
    ['relations', [{ targetEntityId: 't', relationType: 'r' }]],
  ]) {
    const json = JSON.stringify(value),
      bytes = Buffer.from(json + ', "next":0'),
      s = createBookLoreFieldValidation(field === 'relations' ? { field, count: 1 } : { field }),
      r = advanceBookLoreFieldPrefixValidation(s, bytes);
    assert.equal(r.consumed, Buffer.byteLength(json));
    assert.equal(r.state.byteLength, r.consumed);
    finishBookLoreFieldValidation(r.state);
    assert.equal(bytes[r.consumed], 44);
  }
});
for (const key of ['name', 'category', 'bookId', 'createdAt', 'updatedAt'])
  test('base index requires ' + key, () => {
    const x = base();
    delete x[key];
    assert.throws(() => scan(x));
  });
const invalid = {
  'wrong book': (x) => ({ ...x, bookId: 'other' }),
  'unknown key': (x) => ({ ...x, unknown: 'x' }),
  'inline relations': (x) => ({ ...x, relations: [] }),
  'bad category': (x) => ({ ...x, category: 'bad' }),
  'public nonboolean': (x) => ({ ...x, isPublic: 'false' }),
  'alias nonstring': (x) => ({ ...x, aliases: [1] }),
  'structured key': (x) => ({ ...x, structuredDetails: { unknown: 'x' } }),
  'negative date': (x) => ({ ...x, createdAt: -1 }),
  'unsafe date': (x) => ({ ...x, updatedAt: Number.MAX_SAFE_INTEGER }),
  'floating date': (x) => ({ ...x, updatedAt: 0.5 }),
};
for (const [name, edit] of Object.entries(invalid))
  test('base index rejects ' + name, () => assert.throws(() => scan(edit(base()), 5)));
for (const [name, edit] of Object.entries({
  'trailing bytes': (s) => s + ' ',
  'leading whitespace': (s) => ' ' + s,
  'trailing comma': (s) => s.slice(0, -1) + ',}',
  'duplicate field': (s) => s.slice(0, -1) + ',"name":"duplicate"}',
  'noncanonical number': (s) => s.replace('"createdAt":0', '"createdAt":-0'),
  'exponent date': (s) => s.replace('"createdAt":0', '"createdAt":1e3'),
  'escaped key': (s) => s.replace('"name"', '"na\\u006de"'),
  'truncated JSON': (s) => s.slice(0, -1),
}))
  test('base index rejects ' + name, () =>
    assert.throws(() => scan(edit(JSON.stringify(base())), 1)),
  );
test('invalid UTF-8 inside a value is rejected even when quotes and root syntax look valid', () => {
  const x = Buffer.from(JSON.stringify(base())),
    where = x.indexOf(Buffer.from('🌙'));
  x[where] = 0xff;
  assert.throws(() => advanceBookLoreBaseIndex(createBookLoreBaseIndex(base().bookId), x));
});
test('input checkpoints are not mutated, size is limited per unit and corrupt states fail', () => {
  const initial = createBookLoreBaseIndex(base().bookId),
    copy = structuredClone(initial);
  advanceBookLoreBaseIndex(initial, Buffer.from('{'));
  assert.deepEqual(initial, copy);
  assert.throws(() => advanceBookLoreBaseIndex(initial, new Uint8Array(65537)));
  assert.throws(() =>
    advanceBookLoreBaseIndex(
      { ...initial, keyText: 'PRIVATE_PROSE_'.repeat(10) },
      new Uint8Array(),
    ),
  );
});

test('raw value observation is optional, bounded and leaves native metadata unchanged', () => {
  const source = base(),
    bytes = Buffer.from(JSON.stringify(source)),
    pieces = new Map(),
    completed = [];
  let state = createBookLoreBaseIndex(source.bookId);
  for (let at = 0; at < bytes.length; at += 7) {
    const incoming = bytes.subarray(at, at + 7),
      before = structuredClone(state);
    state = advanceBookLoreBaseIndex(state, incoming, undefined, (field, raw, done) => {
      assert.ok(raw.length <= incoming.length);
      if (!pieces.has(field)) pieces.set(field, []);
      pieces.get(field).push(Buffer.from(raw));
      if (done) completed.push(field);
    });
    assert.notDeepEqual(state, before);
  }
  assert.deepEqual(finishBookLoreBaseIndex(state), scan(source).metadata);
  for (const [field, parts] of pieces)
    assert.equal(Buffer.concat(parts).toString(), JSON.stringify(source[field]));
  assert.deepEqual(
    new Set(completed),
    new Set(Object.keys(source).filter((k) => !['createdAt', 'updatedAt'].includes(k))),
  );
  assert.equal(pieces.has('createdAt'), false);
});
test('a raw observer failure never mutates its input checkpoint or certifies a completed field', () => {
  const state = createBookLoreBaseIndex('book'),
    before = structuredClone(state);
  assert.throws(
    () =>
      advanceBookLoreBaseIndex(state, Buffer.from('{"name":"A"'), undefined, () => {
        throw Error('observer failed');
      }),
    /observer failed/,
  );
  assert.deepEqual(state, before);
});
