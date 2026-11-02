import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readBookLegacyJSONStep,
  scanBookLegacyJSON,
  readBookLegacyJSONSpan,
  BOOK_LEGACY_JSON_CURSOR_BYTES,
} from '../src/bookLegacyJSON.mjs';
const encode = (v) => new TextEncoder().encode(v);
function source(value) {
  const bytes = typeof value === 'string' ? encode(value) : value;
  return {
    size: bytes.length,
    reads: [],
    async read(offset, length) {
      assert.ok(length >= 1 && length <= 65536);
      this.reads.push({ offset, length });
      return bytes.slice(offset, offset + length);
    },
  };
}
async function walk(input, { maxBytes = 65536, maxValues = 64, onStep, firstBytes } = {}) {
  const src = typeof input?.read === 'function' ? input : source(input);
  let cursor = null,
    call = 0;
  const values = [],
    bytes = [];
  do {
    const before = cursor && structuredClone(cursor);
    const step = await readBookLegacyJSONStep(src, cursor, {
      maxBytes: call === 0 && firstBytes ? firstBytes : maxBytes,
      maxValues,
    });
    assert.deepEqual(cursor, before);
    assert.ok(step.values.length <= maxValues);
    assert.ok(step.bytes.length <= (call === 0 && firstBytes ? firstBytes : maxBytes));
    assert.ok(step.cursor.done || step.bytes.length || step.values.length);
    assert.equal(step.cursor.offset, (cursor?.offset ?? 0) + step.bytes.length);
    await onStep?.(step);
    values.push(...step.values);
    bytes.push(step.bytes);
    cursor = JSON.parse(JSON.stringify(step.cursor));
    assert.ok(++call < 50000);
  } while (!cursor.done);
  return { cursor, values, bytes: Buffer.concat(bytes), source: src };
}
function expected(value, path = [], out = []) {
  if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value))
      expected(v, [...path, Array.isArray(value) ? Number(k) : k], out);
  out.push({
    path,
    value,
    type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
  });
  return out;
}
test('resumes at every byte boundary with exact spans, postorder, BOM, UTF-8 and all lexical modes', async () => {
  const raw =
    '\ufeff { "a":[-0, 0.25e-12, 3E+8, true,false,null,"🌙é\\u0041\\n\\\\\\""], "é":{"x":""}} \r\n';
  const bytes = encode(raw),
    oracle = expected(JSON.parse(raw.slice(1)));
  for (let cut = 1; cut <= bytes.length; cut++) {
    const result = await walk(bytes, {
      firstBytes: cut,
      maxBytes: 1 + (cut % 7),
      maxValues: 1 + (cut % 3),
    });
    assert.deepEqual(result.bytes, Buffer.from(bytes), 'consumed once in order');
    assert.equal(result.cursor.offset, bytes.length);
    assert.equal(result.values.length, oracle.length);
    for (let i = 0; i < oracle.length; i++) {
      const span = result.values[i];
      assert.deepEqual(span.path, oracle[i].path);
      assert.equal(span.type, oracle[i].type);
      assert.deepEqual(await readBookLegacyJSONSpan(result.source, span), oracle[i].value);
    }
    assert.equal(result.values.at(-1).start, 4);
    assert.equal(result.values.at(-1).end, bytes.length - 3);
  }
});
test('strings and large arrays do not accumulate prose or an item list in the private cursor', async () => {
  const secret = 'UNIQUE_PRIVATE_PROSE_';
  const raw = JSON.stringify({
    body: secret + '🌙'.repeat(40000),
    values: Array.from({ length: 5000 }, (_, i) => i),
  });
  let largest = 0,
    steps = 0;
  const result = await walk(raw, {
    onStep(step) {
      const saved = JSON.stringify(step.cursor);
      assert.ok(!saved.includes(secret));
      largest = Math.max(largest, encode(saved).length);
      steps++;
    },
  });
  assert.equal(result.values.length, 5003);
  assert.ok(steps > 70);
  assert.ok(largest < 2048, String(largest));
});
test('preserves the full combination of valid depth, 64 keys and 256-byte key names', async () => {
  let value = 0;
  for (let depth = 0; depth < 24; depth++) {
    const entries = Array.from({ length: 63 }, (_, i) => [
      String(i).padStart(3, '0') + 'k'.repeat(253),
      i,
    ]);
    entries.push(['z'.repeat(256), value]);
    value = Object.fromEntries(entries);
  }
  let largest = 0;
  await walk(JSON.stringify(value), {
    onStep(step) {
      largest = Math.max(largest, encode(JSON.stringify(step.cursor)).length);
    },
  });
  assert.ok(largest > 65536, String(largest));
  assert.ok(largest <= BOOK_LEGACY_JSON_CURSOR_BYTES, String(largest));
});
test('rejects malformed syntax, duplicate decoded keys, reserved keys and non-JSON whitespace at tiny windows', async () => {
  const invalid = [
    '',
    ' ',
    '{',
    '[',
    ']',
    '{,}',
    '{"a":}',
    '{"a" 1}',
    '{"a":1,}',
    '[1,]',
    '{"a":1 "b":2}',
    '[1 2]',
    'null null',
    'trueX',
    'tru',
    'falze',
    'nul',
    '+1',
    '--1',
    '-',
    '01',
    '-01',
    '1.',
    '1e',
    '1e-',
    '1e+z',
    '.2',
    'NaN',
    'Infinity',
    '"\\x"',
    '"\\u12x4"',
    '"\\u123"',
    '"unterminated',
    '"line\nfeed"',
    '{"a":0,"\\u0061":1}',
    '{"__proto__":0}',
    '{"\\u005f_proto__":0}',
    ' \ufeff{}',
    '\ufeff\ufeff{}',
    '\u00a0null',
    '{"a":0,"a":1}',
    '{"obj":{"x":1,"x":2}}',
  ];
  for (const raw of invalid)
    await assert.rejects(
      () => walk(raw, { maxBytes: 1, maxValues: 1 }),
      { name: 'BookBackupFormatError' },
      raw,
    );
});
test('rejects invalid UTF-8 and incomplete terminal sequences across windows', async () => {
  const sequences = [
    [0xc0, 0xaf],
    [0x80],
    [0xc2],
    [0xe0, 0x9f, 0x80],
    [0xed, 0xa0, 0x80],
    [0xf0, 0x8f, 0xbf, 0xbf],
    [0xf4, 0x90, 0x80, 0x80],
    [0xf5, 0x80, 0x80, 0x80],
    [0xe2, 0x82],
    [0xe2, 0x28, 0xa1],
    [0xff],
  ];
  for (const middle of sequences) {
    await assert.rejects(() => walk(new Uint8Array([34, ...middle, 34]), { maxBytes: 1 }));
    await assert.rejects(() => walk(new Uint8Array([34, ...middle]), { maxBytes: 2 }));
  }
  for (const cp of [0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xffff, 0x10000, 0x10ffff])
    await walk(JSON.stringify(String.fromCodePoint(cp)), { maxBytes: 1, maxValues: 1 });
});
test('enforces depth, object-key and raw-key bounds without limiting array length', async () => {
  await walk('['.repeat(24) + '0' + ']'.repeat(24), { maxBytes: 1 });
  await assert.rejects(() => walk('['.repeat(25) + '0' + ']'.repeat(25)));
  await walk(
    JSON.stringify(Object.fromEntries(Array.from({ length: 64 }, (_, i) => ['k' + i, i]))),
  );
  await assert.rejects(() =>
    walk(JSON.stringify(Object.fromEntries(Array.from({ length: 65 }, (_, i) => ['k' + i, i])))),
  );
  await walk('{"' + 'a'.repeat(256) + '":0}', { maxBytes: 1 });
  await assert.rejects(() => walk('{"' + 'a'.repeat(257) + '":0}', { maxBytes: 1 }));
  await walk('{"' + '\\u0061'.repeat(42) + '":0}', { maxBytes: 1 });
  await assert.rejects(() => walk('{"' + '\\u0061'.repeat(43) + '":0}', { maxBytes: 1 }));
});
test('closed cursor, source length, step options and terminal replay are checked', async () => {
  const src = source('{"a":[1,2]}');
  const first = await readBookLegacyJSONStep(src, null, { maxBytes: 7 });
  const invalid = [
    [],
    { ...first.cursor, extra: true },
    { ...first.cursor, schemaVersion: 2 },
    { ...first.cursor, size: src.size + 1 },
    { ...first.cursor, offset: -1 },
    { ...first.cursor, done: true },
    { ...first.cursor, utf8: { need: 1, lower: 144, upper: 191 } },
    { ...first.cursor, frames: first.cursor.frames.map((f) => ({ ...f, extra: 1 })) },
    { ...first.cursor, token: { ...first.cursor.token, extra: 1 } },
    { ...first.cursor, frames: [{ ...first.cursor.frames[0], keys: ['a', 'a'] }] },
  ];
  for (const cursor of invalid) await assert.rejects(() => readBookLegacyJSONStep(src, cursor));
  for (const opts of [{ maxBytes: 0 }, { maxBytes: 65537 }, { maxValues: 0 }, { maxValues: 65 }])
    await assert.rejects(() => readBookLegacyJSONStep(src, null, opts));
  const result = await walk(src);
  const replay = await readBookLegacyJSONStep(src, result.cursor);
  assert.deepEqual(replay.values, []);
  assert.equal(replay.bytes.length, 0);
  assert.deepEqual(replay.cursor, result.cursor);
  await assert.rejects(() =>
    readBookLegacyJSONStep({ size: 4, read: async () => new Uint8Array(3) }),
  );
  await assert.rejects(() => readBookLegacyJSONStep({ size: 4, read: async () => [1, 2, 3, 4] }));
});
test('abort and changing source size never yield a continuation', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    () => readBookLegacyJSONStep(source('null'), null, { signal: ctrl.signal }),
    { name: 'AbortError' },
  );
  const src = source('null'),
    read = src.read.bind(src);
  src.read = async (...args) => {
    const bytes = await read(...args);
    src.size++;
    return bytes;
  };
  await assert.rejects(() => readBookLegacyJSONStep(src));
  const later = new AbortController(),
    src2 = source('null');
  src2.read = async () => {
    later.abort();
    return encode('null');
  };
  await assert.rejects(() => readBookLegacyJSONStep(src2, null, { signal: later.signal }), {
    name: 'AbortError',
  });
});
test('callback scanner fingerprints exact consumed bytes and always releases its hasher', async () => {
  const raw =
    '\ufeff' +
    JSON.stringify({ items: Array.from({ length: 300 }, (_, i) => ({ text: '🌙', i })) });
  let created = 0,
    destroyed = 0;
  const hash = {
    create() {
      created++;
      const h = createHash('sha256');
      return {
        update: (b) => h.update(b),
        digest: () => h.digest('hex'),
        destroy: () => {
          destroyed++;
          h.destroy();
        },
      };
    },
  };
  const events = [];
  const result = await scanBookLegacyJSON(source(raw), { hash, onValue: (s) => events.push(s) });
  assert.equal(result.fingerprint, createHash('sha256').update(raw).digest('hex'));
  assert.equal(result.size, encode(raw).length);
  assert.equal(events.length, 902);
  assert.equal(destroyed, 1);
  const quota = new Error('quota');
  await assert.rejects(
    () =>
      scanBookLegacyJSON(source('{}'), {
        hash,
        onValue: () => {
          throw quota;
        },
      }),
    quota,
  );
  const src = source('{}');
  await assert.rejects(() =>
    scanBookLegacyJSON(src, {
      hash,
      onValue: () => {
        src.size++;
      },
    }),
  );
  await assert.rejects(() => scanBookLegacyJSON(source('['), { hash, onValue: () => {} }));
  assert.equal(created, 4);
  assert.equal(destroyed, created);
});
test('randomized valid JSON matches independent parse/tree traversal after serialized continuations', async () => {
  let seed = 0x12345;
  const random = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const texts = ['', 'é🌙', '\ufeff', 'quote"\\\n', '\ud800', 'z'];
  function value(depth = 0) {
    const kind = random(depth < 4 ? 8 : 5);
    if (kind === 0) return null;
    if (kind === 1) return !!random(2);
    if (kind === 2) return (random(100000) - 50000) / 7;
    if (kind < 5) return texts[random(texts.length)];
    if (kind === 5) return Array.from({ length: random(5) }, () => value(depth + 1));
    return Object.fromEntries(
      Array.from({ length: random(5) }, (_, i) => ['k' + i, value(depth + 1)]),
    );
  }
  for (let i = 0; i < 100; i++) {
    const v = value(),
      raw = JSON.stringify(v, null, i % 3),
      oracle = expected(v);
    const result = await walk(raw, { maxBytes: 1 + random(19), maxValues: 1 + random(8) });
    assert.equal(result.values.length, oracle.length);
    for (let k = 0; k < oracle.length; k++) {
      assert.deepEqual(result.values[k].path, oracle[k].path);
      assert.deepEqual(
        await readBookLegacyJSONSpan(result.source, result.values[k]),
        oracle[k].value,
      );
    }
  }
});
