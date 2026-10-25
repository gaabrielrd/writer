import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookPortableLoreItemIndex as create,
  advanceBookPortableLoreItemIndex as advance,
  finishBookPortableLoreItemIndex as finish,
  BOOK_PORTABLE_LORE_ITEM_INDEX_BYTES,
} from '../src/bookPortableLoreItemIndex.mjs';
import {
  createBookPortableLoreIndex,
  advanceBookPortableLoreIndex,
  advanceBookPortableLorePrefixIndex,
  finishBookPortableLoreIndex,
} from '../src/bookPortableLoreIndex.mjs';
import {
  createBookLoreFieldValidation,
  createBookPortableLoreRelationsValidation,
  advanceBookPortableLoreRelationsPrefixValidation,
  advanceBookLoreFieldPrefixValidation,
} from '../src/bookLoreFieldValidation.mjs';
import { validateBookBackupJSONItem } from '../src/bookBackupSchema.mjs';
const encode = (v) => Buffer.from(JSON.stringify(v)),
  bad = { code: 'invalid-record' },
  literal = '\ufeff🌙\u0000\b\f\n\r\t"\\/\u2028\u2029',
  item = (data = {}) => ({
    schemaVersion: 1,
    kind: 'lore',
    parentId: null,
    id: '🌙 " entidade',
    data: { name: literal, category: 'other', ...data },
  });
function scan(value, { step = 65536, limit = 64, raw = false, secret = null } = {}) {
  const bytes = raw ? Buffer.from(value) : encode(value),
    references = [];
  let state = create(),
    maximum = 0,
    pauses = 0,
    steps = 0;
  for (let start = 0; start < bytes.length; start += step) {
    const unit = bytes.subarray(start, start + step);
    for (let at = 0; at < unit.length;) {
      const original = state,
        before = structuredClone(state),
        result = advance(state, unit.subarray(at), limit);
      assert.deepEqual(original, before);
      assert.ok(result.consumed > 0 && result.consumed <= unit.length - at);
      assert.ok(result.references.length <= limit);
      if (result.consumed < unit.length - at) {
        assert.equal(result.references.length, limit);
        pauses++;
      }
      state = JSON.parse(JSON.stringify(result.state));
      const checkpoint = JSON.stringify(state);
      maximum = Math.max(maximum, Buffer.byteLength(checkpoint));
      if (secret) assert.equal(checkpoint.includes(secret), false);
      references.push(...result.references);
      at += result.consumed;
      steps++;
    }
  }
  return { bytes, references, state, metadata: finish(state), maximum, pauses, steps };
}
function consistent(r, value) {
  assert.equal(r.metadata.byteLength, r.bytes.length);
  assert.equal(r.metadata.id, value.id);
  const { dataOffset: start, dataByteLength: length, index } = r.metadata;
  assert.deepEqual(JSON.parse(r.bytes.subarray(start, start + length).toString()), value.data);
  for (const [field, span] of Object.entries(index.ranges))
    assert.deepEqual(
      JSON.parse(
        r.bytes.subarray(start + span.offset, start + span.offset + span.byteLength).toString(),
      ),
      value.data[field],
    );
  assert.deepEqual(
    r.references,
    (value.data.relations ?? []).map((relation, index) => ({
      index,
      targetEntityId: relation.targetEntityId,
    })),
  );
  assert.ok(r.maximum < BOOK_PORTABLE_LORE_ITEM_INDEX_BYTES);
}
function permutations(keys) {
  if (!keys.length) return [[]];
  return keys.flatMap((key, at) =>
    permutations(keys.filter((_, i) => i !== at)).map((tail) => [key, ...tail]),
  );
}
test('all 120 envelope key orders preserve the existing canonical portable contract', () => {
  const value = item({
    aliases: ['', 'same', 'same'],
    createdAt: 0,
    isPublic: false,
    relations: [],
  });
  for (const order of permutations(Object.keys(value))) {
    const ordered = Object.fromEntries(order.map((key) => [key, value[key]]));
    validateBookBackupJSONItem('book-lore', ordered, 'book');
    consistent(scan(ordered), ordered);
  }
});
test('byte-by-byte checkpoints preserve Unicode IDs, literal BOM/escapes and data in any position', () => {
  const normal = item({
    summary: literal,
    structuredDetails: { notes: literal },
    updatedAt: 8640000000000000,
    relations: [{ description: literal, targetEntityId: 'universe:mundo:🌙', relationType: '' }],
  });
  for (const value of [
    normal,
    { data: normal.data, id: normal.id, parentId: null, kind: 'lore', schemaVersion: 1 },
  ])
    consistent(scan(value, { step: 1, limit: 1 }), value);
});
test('item beyond 8 MiB/128 parts and a large relation description never enter the checkpoint', () => {
  const secret = 'PRIVATE_PROSE_NOT_IN_ITEM_CHECKPOINT',
    value = item({
      details: (secret + '🌙').repeat(230000),
      aliases: Array.from({ length: 1500 }, () => 'same'),
      relations: [
        { targetEntityId: 'local', relationType: '', description: (secret + '🌙').repeat(230000) },
        { targetEntityId: 'local', relationType: '' },
      ],
    }),
    r = scan(value, { secret });
  assert.ok(r.bytes.length > 16 * 1024 * 1024);
  assert.ok(Math.ceil(r.bytes.length / 65536) > 128);
  assert.ok(r.maximum < 8192);
  consistent(r, value);
});
for (const limit of [1, 17, 64])
  test('dense relations pause at the exact semantic budget ' + limit, () => {
    const value = item({
        relations: Array.from({ length: 1000 }, (_, i) => ({
          targetEntityId: i % 2 ? 'same' : 'universe:world:external',
          relationType: '',
        })),
      }),
      r = scan(value, { limit });
    assert.ok(r.pauses > 0);
    assert.ok(r.steps >= Math.ceil(1000 / limit));
    consistent(r, value);
  });
test('data prefix leaves envelope delimiter/trailing bytes and old whole-unit entry stays strict', () => {
  const value = item().data,
    bytes = Buffer.concat([encode(value), Buffer.from('},"next":true')]),
    result = advanceBookPortableLorePrefixIndex(createBookPortableLoreIndex(), bytes);
  assert.equal(result.consumed, encode(value).length);
  assert.equal(bytes[result.consumed], 125);
  assert.equal(finishBookPortableLoreIndex(result.state).relations.count, 0);
  assert.throws(() => advanceBookPortableLoreIndex(createBookPortableLoreIndex(), bytes), bad);
});
test('portable relation budget is separate from native state and preserves exact remaining bytes', () => {
  const value = Array.from({ length: 65 }, () => ({ targetEntityId: 'same', relationType: '' })),
    bytes = encode(value),
    one = advanceBookPortableLoreRelationsPrefixValidation(
      createBookPortableLoreRelationsValidation(),
      bytes,
      undefined,
      64,
    );
  assert.ok(one.consumed < bytes.length);
  assert.equal(one.state.mode, 'syntax');
  assert.equal(bytes[one.consumed], 44);
  assert.throws(() =>
    advanceBookLoreFieldPrefixValidation(one.state, bytes.subarray(one.consumed)),
  );
  assert.throws(() =>
    advanceBookPortableLoreRelationsPrefixValidation(
      createBookLoreFieldValidation({ field: 'relations', count: 64 }),
      bytes,
      undefined,
      64,
    ),
  );
});
for (const limit of [0, -1, 65, 1.5, NaN, null, Infinity])
  test('invalid semantic budget fails closed: ' + limit, () => {
    assert.throws(() => advance(create(), Buffer.from('{'), limit), bad);
    assert.throws(
      () =>
        advanceBookPortableLorePrefixIndex(createBookPortableLoreIndex(), Buffer.from('{'), limit),
      bad,
    );
    assert.throws(() =>
      advanceBookPortableLoreRelationsPrefixValidation(
        createBookPortableLoreRelationsValidation(),
        Buffer.from('['),
        undefined,
        limit,
      ),
    );
  });
const text = JSON.stringify(item({ relations: [] }));
const invalid = [
  text + ' ',
  text + '{}',
  ' ' + text,
  '\ufeff' + text,
  text.replace('"schemaVersion":1', '"schemaVersion":2'),
  text.replace('"schemaVersion":1', '"schemaVersion":1.0'),
  text.replace('"kind":"lore"', '"kind":"scene"'),
  text.replace('"parentId":null', '"parentId":"parent"'),
  text.replace('"id":' + JSON.stringify(item().id), '"id":""'),
  text.replace('"id":' + JSON.stringify(item().id), '"id":"bad/id"'),
  text.replace('"id":' + JSON.stringify(item().id), '"id":".."'),
  text.replace('"id":' + JSON.stringify(item().id), '"id":1'),
  text.replace('"id":' + JSON.stringify(item().id), '"id":"' + 'x'.repeat(1501) + '"'),
  text.replace('"schemaVersion":1,', ''),
  text.replace('"parentId":null,', ''),
  text.replace('"data":', '"payloadStorage":'),
  text.replace('"data":', '"data":null,"data":'),
  text.replace('"kind":"lore",', '"kind":"lore","kind":"lore",'),
  text.replace('"data":{', '"data":{"secret":true,'),
  text.replace('"category":"other"', '"category":"unknown"'),
  text.replace('"relations":[]', '"relations":[{"targetEntityId":".","relationType":""}]'),
  text.replace('"schemaVersion"', '"schema\\u0056ersion"'),
  text.replace('🌙', '\\ud83c\\udf19'),
  text.replace('"parentId":null', '"parentId":null,"__proto__":{}'),
];
for (let i = 0; i < invalid.length; i++)
  test('malformed or noncanonical envelope is rejected ' + i, () => {
    assert.throws(() => scan(invalid[i], { raw: true, step: 7 }), bad);
  });
test('all truncated envelopes fail without a completion proof', () => {
  const bytes = encode(item({ details: literal, relations: [] }));
  for (let end = 0; end < bytes.length; end++)
    assert.throws(() => scan(bytes.subarray(0, end), { raw: true }), bad);
});
test('invalid UTF-8 in the envelope ID fails instead of replacing code points', () => {
  const bytes = encode(item());
  bytes[bytes.indexOf(Buffer.from('🌙'))] = 0xff;
  assert.throws(() => scan(bytes, { raw: true, step: 1 }), bad);
});
test('bounded units and malformed checkpoints cannot authorize a completed item', () => {
  assert.throws(() => advance(create(), new Uint8Array(65537)), bad);
  const base = advance(create(), Buffer.from('{"data":{')).state;
  for (const change of [
    { privateProse: 'secret' },
    { phase: 'done' },
    { mask: 31 },
    { byteLength: -1 },
    { dataOffset: -1 },
    { dataOffset: 0 },
    { dataOffset: base.byteLength + 1 },
    { literalAt: 6 },
    { key: 'payloadStorage' },
    { child: {} },
    { id: 'unexpected' },
    { data: null },
  ])
    assert.throws(() => advance({ ...base, ...change }, new Uint8Array()), bad);
  const before = structuredClone(base);
  assert.throws(() => advance(base, Buffer.from('"name":false')), bad);
  assert.deepEqual(base, before);
});
test('maximal ID and qualified target resume at split code points within a fixed metadata bound', () => {
  const value = item({
    relations: [
      {
        targetEntityId: 'universe:' + 'w'.repeat(1500) + ':' + '🌙'.repeat(375),
        relationType: '',
      },
    ],
  });
  value.id = '🌙'.repeat(375);
  consistent(scan(value, { step: 13, limit: 1 }), value);
});
