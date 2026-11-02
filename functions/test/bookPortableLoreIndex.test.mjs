import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookPortableLoreIndex as create,
  advanceBookPortableLoreIndex as advance,
  finishBookPortableLoreIndex as finish,
  BOOK_PORTABLE_LORE_INDEX_BYTES,
} from '../src/bookPortableLoreIndex.mjs';
import { validateBookBackupJSONItem } from '../src/bookBackupSchema.mjs';
import { GenerationError } from '../src/generation.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldValidation,
  finishBookLoreFieldValidation,
  createBookPortableLoreRelationsValidation,
  advanceBookPortableLoreRelationsPrefixValidation,
  finishBookPortableLoreRelationsValidation,
} from '../src/bookLoreFieldValidation.mjs';
const encode = (v) => Buffer.from(JSON.stringify(v));
const literal = '\ufeff🌙\u0000\b\f\n\r\t\u001b"\\/<>&\u2028\u2029';
function schema(data) {
  return validateBookBackupJSONItem(
    'book-lore',
    { schemaVersion: 1, kind: 'lore', parentId: null, id: 'entity', data },
    'book',
  );
}
function read(data, { step = 65536, raw = false, secret = null } = {}) {
  const bytes = raw ? Buffer.from(data) : encode(data);
  let state = create(),
    maximum = 0;
  const refs = [];
  for (let at = 0; at < bytes.length; at += step) {
    const before = structuredClone(state),
      original = state,
      result = advance(state, bytes.subarray(at, at + step));
    assert.deepEqual(original, before);
    state = JSON.parse(JSON.stringify(result.state));
    refs.push(...result.references);
    maximum = Math.max(maximum, Buffer.byteLength(JSON.stringify(state)));
    if (secret) assert.equal(JSON.stringify(state).includes(secret), false);
  }
  return { bytes, state, metadata: finish(state), refs, maximum };
}
function ranges(result, data) {
  for (const [key, span] of Object.entries(result.metadata.ranges))
    assert.deepEqual(
      JSON.parse(result.bytes.subarray(span.offset, span.offset + span.byteLength).toString()),
      data[key],
    );
}
test('portable object preserves exact byte ranges and logical presence at every byte boundary', () => {
  const value = {
    name: literal,
    aliases: ['', literal, 'same', 'same'],
    category: 'character',
    summary: literal,
    details: literal,
    structuredDetails: { notes: literal, appearance: '' },
    isPublic: false,
    createdAt: 0,
    updatedAt: 8640000000000000,
    relations: [
      { targetEntityId: 'universe:world:🌙', relationType: literal },
      { description: literal, relationType: '', targetEntityId: 'local🌙' },
    ],
  };
  schema(value);
  const result = read(value, { step: 1 });
  ranges(result, value);
  assert.deepEqual(result.metadata.isPublic, { present: true, value: false });
  assert.deepEqual(result.metadata.dates, { createdAt: 0, updatedAt: 8640000000000000 });
  assert.deepEqual(result.metadata.relations, { present: true, count: 2 });
  assert.deepEqual(result.refs, [
    { index: 0, targetEntityId: 'universe:world:🌙' },
    { index: 1, targetEntityId: 'local🌙' },
  ]);
  assert.ok(result.maximum < BOOK_PORTABLE_LORE_INDEX_BYTES);
});
test('missing optionals differ from explicit false, empty fields, empty arrays and empty structure', () => {
  const absent = read({ name: '', category: 'other' }).metadata,
    empty = read({
      name: '',
      category: 'other',
      aliases: [],
      summary: '',
      details: '',
      structuredDetails: {},
      relations: [],
      isPublic: false,
    }).metadata;
  assert.deepEqual(absent.fields, ['name', 'category']);
  assert.deepEqual(absent.isPublic, { present: false, value: null });
  assert.deepEqual(absent.relations, { present: false, count: 0 });
  assert.deepEqual(absent.dates, {});
  assert.deepEqual(empty.isPublic, { present: true, value: false });
  assert.deepEqual(empty.relations, { present: true, count: 0 });
  assert.equal(Object.hasOwn(empty.ranges, 'summary'), true);
});
test('lore and a relation description beyond 8 MiB/128 parts retain neither prose nor the complete list', () => {
  const secret = 'PRIVATE_PORTABLE_LORE_PROSE_NEVER_IN_STATE',
    value = {
      name: 'A',
      category: 'other',
      details: (secret + '🌙').repeat(220000),
      aliases: Array.from({ length: 2000 }, (_, i) => (i % 2 ? '' : 'same')),
      relations: Array.from({ length: 130 }, (_, i) => ({
        targetEntityId: 'target-' + i,
        relationType: '',
        description: i === 64 ? (secret + '🌙').repeat(220000) : secret,
      })),
    };
  schema(value);
  const result = read(value, { secret });
  assert.ok(result.bytes.length > 16 * 1024 * 1024);
  assert.ok(Math.ceil(result.bytes.length / 65536) > 128);
  assert.equal(result.refs.length, 130);
  assert.equal(result.metadata.relations.count, 130);
  assert.ok(result.maximum < 4000);
  ranges(result, value);
});
test('many relations are emitted by unit while the checkpoint holds only counters and the current ID', () => {
  const value = {
      name: 'N',
      category: 'other',
      relations: Array.from({ length: 10000 }, () => ({
        targetEntityId: 'same',
        relationType: '',
      })),
    },
    bytes = encode(value);
  let state = create(),
    total = 0,
    maximum = 0,
    units = 0;
  for (let at = 0; at < bytes.length; at += 4096) {
    const result = advance(state, bytes.subarray(at, at + 4096));
    state = JSON.parse(JSON.stringify(result.state));
    for (const ref of result.references)
      assert.deepEqual(ref, { index: total++, targetEntityId: 'same' });
    maximum = Math.max(maximum, JSON.stringify(state).length);
    units++;
  }
  assert.equal(total, 10000);
  assert.equal(finish(state).relations.count, 10000);
  assert.ok(units > 100);
  assert.ok(maximum < 2000);
});
test('portable relation states cannot widen the native page entry points', () => {
  let state = createBookPortableLoreRelationsValidation();
  const value = Array.from({ length: 130 }, () => ({ targetEntityId: 'id', relationType: '' }));
  state = advanceBookPortableLoreRelationsPrefixValidation(state, encode(value)).state;
  assert.equal(finishBookPortableLoreRelationsValidation(state).count, 130);
  assert.throws(() => createBookLoreFieldValidation({ field: 'relations', count: 65 }));
  assert.throws(() => advanceBookLoreFieldValidation(state, new Uint8Array()));
  assert.throws(() => finishBookLoreFieldValidation(state));
  assert.throws(() =>
    advanceBookPortableLoreRelationsPrefixValidation(
      createBookLoreFieldValidation({ field: 'relations', count: 1 }),
      encode(value),
    ),
  );
});
test('native field errors retain the exact GenerationError public identity and reason', () => {
  assert.throws(
    () => createBookLoreFieldValidation({ field: 'relations', count: 65 }),
    (error) =>
      error instanceof GenerationError &&
      error.code === 'invalid-argument' &&
      error.details.reason === 'book-lore-field-invalid',
  );
});
const invalid = [
  '{}',
  '{"name":"n"}',
  '{"category":"other"}',
  '{"name":"n","category":"x"}',
  '{"name":"n","category":"other","summary":null}',
  '{"name":"n","category":"other","name":"x"}',
  '{"name":"n","category":"other","bookId":"book"}',
  '{"name":"n","category":"other","payloadStorage":{}}',
  '{"name":"n","category":"other","aliases":[null]}',
  '{"name":"n","category":"other","aliases":[false]}',
  '{"name":"n","category":"other","isPublic":0}',
  '{"name":"n","category":"other","createdAt":-1}',
  '{"name":"n","category":"other","createdAt":01}',
  '{"name":"n","category":"other","updatedAt":1e3}',
  '{"name":"n","category":"other","updatedAt":1.0}',
  '{"name":"n","category":"other","updatedAt":8640000000000001}',
  '{"name":"n","category":"other","structuredDetails":{"unknown":""}}',
  '{"name":"n","category":"other","structuredDetails":{"notes":0}}',
  '{"name":"n","category":"other","relations":[{"targetEntityId":"id"}]}',
  '{"name":"n","category":"other","relations":[{"targetEntityId":"a/b","relationType":""}]}',
  '{"name":"n","category":"other","relations":[{"targetEntityId":"id","relationType":"","description":null}]}',
  '{"name":"n","category":"other","relations":[{"targetEntityId":"id","relationType":"","extra":""}]}',
  '{"name":"n","category":"other","relations":[{"targetEntityId":"id","targetEntityId":"id","relationType":""}]}',
  ' {"name":"n","category":"other"}',
  '{"name":"n","category":"other"} ',
  '{"name":"n", "category":"other"}',
  '{"name":"n","category":"other",}',
  '{"name":"n","category":"other"}{}',
  '{"name":"n","category":"other","summary":"\\u0041"}',
  '{"name":"n","category":"other","summary":"\\u001B"}',
  '{"name":"n","category":"other","summary":"\\/"}',
];
for (const [i, raw] of invalid.entries())
  test('rejects noncanonical/invalid portable data ' + i, () =>
    assert.throws(() => read(raw, { raw: true, step: 1 })),
  );
for (const invalid of [
  { name: 'n', category: 'other', relations: [{ targetEntityId: '.', relationType: '' }] },
  {
    name: 'n',
    category: 'other',
    relations: [{ targetEntityId: 'universe:bad/id:x', relationType: '' }],
  },
  { name: 'n', category: 'other', relations: [{ targetEntityId: 'id', relationType: 1 }] },
  { name: 'n', category: 'other', createdAt: null },
  { name: 'n', category: 'other', aliases: [1] },
])
  test('portable parser agrees with schema rejection ' + JSON.stringify(invalid), () => {
    assert.throws(() => schema(invalid));
    assert.throws(() => read(invalid));
  });
test('deterministic valid objects agree with the complete existing portable domain', () => {
  for (let i = 0; i < 100; i++) {
    const value = {
      name: i % 2 ? '' : literal,
      category: ['character', 'location', 'concept', 'other'][i % 4],
      ...(i % 2 ? { summary: literal } : {}),
      ...(i % 3 ? { isPublic: Boolean(i % 2) } : {}),
      ...(i % 4 ? { aliases: Array(i % 7).fill(literal) } : {}),
      ...(i % 5 ? { structuredDetails: { notes: literal } } : {}),
      ...(i % 6 ? { createdAt: i, updatedAt: i + 1 } : {}),
      ...(i % 7
        ? {
            relations: Array.from({ length: i % 9 }, (_, j) => ({
              relationType: literal,
              targetEntityId: j % 2 ? 'adventure:source:id' : 'local🌙',
            })),
          }
        : {}),
    };
    schema(value);
    ranges(read(value, { step: 31 }), value);
    ranges(read(Object.fromEntries(Object.entries(value).reverse()), { step: 43 }), value);
  }
});
test('unit bounds, malformed checkpoints, byte counters and mutation attempts fail closed', () => {
  const initial = create(),
    before = structuredClone(initial);
  assert.throws(() => advance(initial, new Uint8Array(65537)));
  assert.throws(() => advance(initial, new Uint16Array([1])));
  for (const patch of [
    { unknown: true },
    { phase: 'invented' },
    { key: 10 },
    { byteLength: -1 },
    { ranges: { name: { offset: 0, byteLength: 1 } } },
    { target: 'forged' },
    { child: {} },
    { referenceCount: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.throws(() => advance({ ...initial, ...patch }, new Uint8Array()));
  assert.deepEqual(initial, before);
  const partial = advance(initial, Buffer.from('{"name":"PRIVATE')).state,
    saved = structuredClone(partial);
  assert.throws(() => finish(partial));
  assert.throws(() => advance(partial, Buffer.from('\n')));
  assert.deepEqual(partial, saved);
});
test('invalid UTF-8 is rejected at a field boundary instead of replaced with U+FFFD', () => {
  for (const bytes of [[0x80], [0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80]]) {
    const start = advance(create(), Buffer.from('{"name":"')).state;
    assert.throws(() => advance(start, Uint8Array.from(bytes)));
  }
});

test('maximal qualified IDs remain valid within the fixed checkpoint bound at a split escape', () => {
  const targetEntityId = 'universe:' + '"'.repeat(1500) + ':' + '"'.repeat(1500),
    value = {
      name: 'N',
      aliases: [],
      category: 'other',
      summary: '',
      details: '',
      structuredDetails: {},
      isPublic: true,
      createdAt: 0,
      updatedAt: 1,
      relations: [{ targetEntityId, relationType: '' }],
    },
    bytes = encode(value),
    encodedTarget = encode(targetEntityId),
    cut = bytes.indexOf(encodedTarget) + encodedTarget.length - 2;
  schema(value);
  const first = advance(create(), bytes.subarray(0, cut));
  assert.ok(Buffer.byteLength(JSON.stringify(first.state)) < BOOK_PORTABLE_LORE_INDEX_BYTES);
  assert.ok(first.state.target.length > 2990);
  const last = advance(JSON.parse(JSON.stringify(first.state)), bytes.subarray(cut));
  assert.deepEqual(last.references, [{ index: 0, targetEntityId }]);
  assert.equal(finish(last.state).relations.count, 1);
});
test('range cursors, presence and reference counters cannot contradict a persisted state', () => {
  const partial = advance(
    create(),
    Buffer.from('{"name":"N","category":"other","details":"'),
  ).state;
  for (const patch of [
    { valueBytes: partial.valueBytes + 1 },
    { keyText: 'details' },
    { isPublic: true },
    { referenceCount: 1 },
    { dates: { createdAt: 1 } },
    { valueStart: partial.valueStart - 1 },
  ])
    assert.throws(() => advance({ ...partial, ...patch }, new Uint8Array()));
  const withTarget = advance(
    create(),
    Buffer.from('{"name":"N","category":"other","relations":[{"targetEntityId":"id'),
  ).state;
  assert.throws(() => advance({ ...withTarget, target: '' }, new Uint8Array()));
  assert.throws(() => advance({ ...withTarget, referenceCount: 3 }, new Uint8Array()));
});
