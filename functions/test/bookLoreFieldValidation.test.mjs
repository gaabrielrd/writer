import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookLoreFieldValidation as create,
  advanceBookLoreFieldValidation as advance,
  finishBookLoreFieldValidation as finish,
} from '../src/bookLoreFieldValidation.mjs';
import { validateBookBackupJSONItem } from '../src/bookBackupSchema.mjs';
const encode = (v) => Buffer.from(JSON.stringify(v));
const config = (field, count) => (field === 'relations' ? { field, count } : { field });
function read(
  field,
  value,
  { step = 65536, count = Array.isArray(value) ? value.length : undefined, reload = false } = {},
) {
  let state = create(config(field, count)),
    maximum = 0;
  const bytes = encode(value);
  for (let from = 0; from < bytes.length; from += step) {
    const before = structuredClone(state),
      original = state;
    state = advance(state, bytes.subarray(from, from + step));
    assert.deepEqual(original, before);
    maximum = Math.max(maximum, Buffer.byteLength(JSON.stringify(state)));
    if (reload) state = JSON.parse(JSON.stringify(state));
  }
  assert.deepEqual(finish(state), {
    field,
    byteLength: bytes.length,
    ...(field === 'relations' ? { count } : {}),
  });
  return { state, maximum };
}
const literal = '\ufeff🌙\u0000\b\f\n\r\t\u001b"\\/<>&\u2028\u2029';
const valid = [
  ['name', literal],
  ['summary', literal],
  ['details', literal],
  ['category', 'character'],
  ['category', 'location'],
  ['category', 'concept'],
  ['category', 'other'],
  ['isPublic', true],
  ['isPublic', false],
  ['aliases', ['', literal, 'same', 'same']],
  ['structuredDetails', { notes: literal, appearance: '', history: 'same', personality: 'same' }],
  ['structuredDetails', {}],
  ['relations', []],
  [
    'relations',
    [
      { targetEntityId: 'universe:world:entity', relationType: literal, description: '' },
      { description: literal, relationType: '', targetEntityId: 'local🌙' },
    ],
  ],
];
for (const [i, [field, value]] of valid.entries())
  test('canonical field ' + field + ' at every byte boundary ' + i, () => {
    read(field, value, { step: 1, reload: true });
    validateBookBackupJSONItem(
      'book-lore',
      {
        schemaVersion: 1,
        kind: 'lore',
        parentId: null,
        id: 'entity',
        data: { name: 'A', category: 'other', [field]: value },
      },
      'book',
    );
  });
test('more than 8 MiB and 128 parts keep a constant small checkpoint without prose', () => {
  const secret = 'PRIVATE_PROSE_NEVER_IN_CHECKPOINT',
    bytes = encode('\ufeff' + (secret + '🌙').repeat(270000));
  assert.ok(bytes.length > 8 * 1024 * 1024);
  assert.ok(Math.ceil(bytes.length / 65536) > 128);
  let state = create({ field: 'details' }),
    maximum = 0;
  for (let from = 0; from < bytes.length; from += 65536) {
    state = advance(state, bytes.subarray(from, from + 65536));
    const json = JSON.stringify(state);
    assert.equal(json.includes(secret), false);
    maximum = Math.max(maximum, Buffer.byteLength(json));
    state = JSON.parse(json);
  }
  assert.ok(maximum < 1024);
  assert.equal(finish(state).byteLength, bytes.length);
});
test('aliases preserve arbitrary total, empty entries and duplicates without buffering the list', () => {
  const result = read(
    'aliases',
    Array.from({ length: 50000 }, (_, i) => (i % 3 ? 'same' : '')),
    { step: 127, reload: true },
  );
  assert.ok(result.maximum < 1024);
});
test('a page of 64 relations may exceed one document with bounded checkpoint', () => {
  const value = Array.from({ length: 64 }, (_, i) => ({
    targetEntityId: 'entity' + i,
    relationType: 'same',
    description: 'text🌙'.repeat(4000),
  }));
  assert.ok(encode(value).length > 1024 * 1024);
  assert.ok(read('relations', value, { reload: true }).maximum < 8192);
});
test('qualified target IDs match portable limits rather than a smaller ID ceiling', () => {
  const targetEntityId = 'adventure:' + 'w'.repeat(1500) + ':' + '"'.repeat(1500);
  assert.ok(
    read('relations', [{ targetEntityId, relationType: '' }], { step: 1, reload: true }).maximum <
      8192,
  );
});
test('all split points resume UTF-8, escapes, object keys and container grammar', () => {
  for (const [field, value] of [
    ['details', literal],
    ['structuredDetails', { notes: literal, history: '' }],
    ['relations', [{ targetEntityId: 'local🌙"', relationType: literal, description: literal }]],
  ]) {
    const bytes = encode(value);
    for (let split = 0; split <= bytes.length; split++) {
      const first = advance(create(config(field, 1)), bytes.subarray(0, split));
      assert.equal(
        finish(advance(JSON.parse(JSON.stringify(first)), bytes.subarray(split))).byteLength,
        bytes.length,
      );
    }
  }
});
test('an invalid unit never mutates the checkpoint and a valid retry can complete', () => {
  const state = advance(create({ field: 'details' }), Buffer.from('"unfinished\\')),
    before = structuredClone(state);
  assert.throws(() => advance(state, Buffer.from('x')));
  assert.deepEqual(state, before);
  assert.equal(finish(advance(state, Buffer.from('n"'))).field, 'details');
  assert.deepEqual(state, before);
});
const invalid = [
  ['details', 'null'],
  ['details', '1'],
  ['details', '[]'],
  ['details', '{}'],
  ['details', ' "x"'],
  ['details', '"x" '],
  ['details', '"x"\n'],
  ['details', '"x""y"'],
  ['details', '"\\/"'],
  ['details', '"\\u0061"'],
  ['details', '"\\u0008"'],
  ['details', '"\\u001B"'],
  ['details', '"\\ud800"'],
  ['details', '"\\ud83c\\udf19"'],
  ['details', '"\ufeff"\ufeff'],
  ['details', '"line\nline"'],
  ['category', '"Character"'],
  ['category', '""'],
  ['category', '"characterx"'],
  ['isPublic', '0'],
  ['isPublic', 'null'],
  ['isPublic', 'True'],
  ['isPublic', 'truefalse'],
  ['isPublic', 'false '],
  ['aliases', '["x",]'],
  ['aliases', '[,"x"]'],
  ['aliases', '[1]'],
  ['aliases', '[null]'],
  ['aliases', '[[]]'],
  ['structuredDetails', '{"notes":false}'],
  ['structuredDetails', '{"notes":"" , "history":""}'],
  ['structuredDetails', '{"notes":"","notes":""}'],
  ['structuredDetails', '{"extra":""}'],
  ['structuredDetails', '{"notes":"",}'],
  ['structuredDetails', '{"notes":{}}'],
  ['relations', '[{}]', 1],
  ['relations', '[{"targetEntityId":"x"}]', 1],
  ['relations', '[{"targetEntityId":"x","relationType":"","extra":""}]', 1],
  ['relations', '[{"targetEntityId":"x","relationType":"","targetEntityId":"y"}]', 1],
  ['relations', '[{"targetEntityId":"bad/path","relationType":""}]', 1],
  ['relations', '[{"targetEntityId":"","relationType":""}]', 1],
  ['relations', '[{"targetEntityId":"..","relationType":""}]', 1],
  ['relations', '[{"targetEntityId":"x","relationType":"","available":true}]', 1],
  ['relations', '[{"targetEntityId":"x","relationType":"","description":null}]', 1],
  ['relations', '[]', 1],
  ['relations', '[{"targetEntityId":"x","relationType":""}]', 0],
];
for (const [i, [field, json, count]] of invalid.entries())
  test('rejects noncanonical or invalid ' + field + ' ' + i, () => {
    assert.throws(() => finish(advance(create(config(field, count)), Buffer.from(json))));
  });
for (const bytes of [
  [0x80],
  [0xc0, 0x80],
  [0xc1, 0x81],
  [0xc2, 0x20],
  [0xe0, 0x80, 0x80],
  [0xed, 0xa0, 0x80],
  [0xf0, 0x80, 0x80, 0x80],
  [0xf4, 0x90, 0x80, 0x80],
  [0xf5, 0x80, 0x80, 0x80],
  [0xff],
])
  test('rejects invalid UTF-8 ' + bytes.join('-') + ' at every split', () => {
    const data = Buffer.from([34, ...bytes, 34]);
    for (let split = 0; split <= data.length; split++)
      assert.throws(() => {
        const first = advance(create({ field: 'details' }), data.subarray(0, split));
        finish(advance(JSON.parse(JSON.stringify(first)), data.subarray(split)));
      });
  });
for (const text of [
  '',
  '"',
  '"abc',
  '"abc\\',
  '"\\u0',
  '"🌙',
  '[',
  '["x"',
  '{"notes"',
  '{"notes":',
  '{"notes":"x"',
  'tru',
  'fals',
]) {
  const field = text.startsWith('[')
    ? 'aliases'
    : text.startsWith('{')
      ? 'structuredDetails'
      : ['tru', 'fals'].includes(text)
        ? 'isPublic'
        : 'details';
  test('refuses a truncated field at EOF ' + JSON.stringify(text), () => {
    assert.throws(() => finish(advance(create({ field }), Buffer.from(text))));
  });
}
test('invalid scope, page/unit bounds and malformed checkpoints fail closed', () => {
  for (const v of [
    { field: 'createdAt' },
    { field: 'payloadStorage' },
    { field: 'name', count: 1 },
    { field: 'relations' },
    { field: 'relations', count: 65 },
    { field: 'relations', count: -1 },
    { field: 'relations', count: 0.5 },
    null,
  ])
    assert.throws(() => create(v));
  const s = create({ field: 'name' });
  for (const v of [
    { ...s, extra: true },
    { ...s, field: 'other' },
    { ...s, mode: 'unknown' },
    { ...s, byteLength: -1 },
    { ...s, text: 'private prose', textBytes: 13 },
    { ...s, role: 'target', text: '🌙', textBytes: 1 },
    { ...s, role: 'category', text: 'x'.repeat(10), textBytes: 10 },
    { ...s, utf8: { remaining: 5, code: 0, min: 128, max: 191 } },
    { ...s, stack: [{}, {}, {}] },
  ])
    assert.throws(() => advance(v, new Uint8Array()));
  assert.throws(() => advance(s, Buffer.alloc(65537)));
  assert.throws(() => advance(s, 'raw'));
  assert.throws(() => advance({ ...s, byteLength: Number.MAX_SAFE_INTEGER }, Buffer.from('"')));
});
test('deterministic valid fixtures agree with the complete portable field schema', () => {
  let seed = 731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const alphabet = ['', 'a', '🌙', '\ufeff', '\n', '\u0000', '"', '\\', 'é', 'same'];
  for (let i = 0; i < 160; i++) {
    const text = () =>
      Array.from({ length: random() % 18 }, () => alphabet[random() % alphabet.length]).join('');
    const field = ['name', 'summary', 'details', 'aliases', 'structuredDetails', 'relations'][
        i % 6
      ],
      value =
        field === 'aliases'
          ? [text(), text(), '', 'same', 'same']
          : field === 'structuredDetails'
            ? { notes: text(), history: text() }
            : field === 'relations'
              ? [{ targetEntityId: 'universe:scope:id', relationType: text(), description: text() }]
              : text();
    validateBookBackupJSONItem(
      'book-lore',
      {
        schemaVersion: 1,
        kind: 'lore',
        parentId: null,
        id: 'entity',
        data: { name: 'A', category: 'other', [field]: value },
      },
      'book',
    );
    read(field, value, { step: 1 + (random() % 37), reload: true });
  }
});

test('valid UTF-8 endpoints and all supported control escapes match canonical JSON at one byte per checkpoint', () => {
  read(
    'details',
    String.fromCodePoint(0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xffff, 0x10000, 0x10ffff) +
      Array.from({ length: 32 }, (_, index) => String.fromCharCode(index)).join(''),
    { step: 1, reload: true },
  );
});
test('invalid local and qualified IDs use the same portable bound', () => {
  for (const targetEntityId of [
    'x'.repeat(1501),
    'universe:' + 'w'.repeat(1501) + ':id',
    'adventure:world:' + 'x'.repeat(1501),
  ]) {
    const value = [{ targetEntityId, relationType: '' }];
    assert.throws(() =>
      validateBookBackupJSONItem(
        'book-lore',
        {
          schemaVersion: 1,
          kind: 'lore',
          parentId: null,
          id: 'entity',
          data: { name: 'A', category: 'other', relations: value },
        },
        'book',
      ),
    );
    assert.throws(() => read('relations', value, { step: 73, reload: true }));
  }
});
