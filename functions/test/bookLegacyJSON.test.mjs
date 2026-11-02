import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { scanBookLegacyJSON, readBookLegacyJSONSpan } from '../src/bookLegacyJSON.mjs';
const hash = {
  create() {
    const state = createHash('sha256');
    return {
      update: (bytes) => {
        state.update(bytes);
      },
      digest: () => state.digest('hex'),
      destroy: () => state.destroy(),
    };
  },
};
const utf8 = (s) => new TextEncoder().encode(s);
const source = (text, requests = []) => {
  const bytes = typeof text === 'string' ? utf8(text) : text;
  return {
    size: bytes.length,
    async read(offset, length) {
      requests.push(length);
      return bytes.slice(offset, offset + length);
    },
  };
};
async function scan(input) {
  const spans = [];
  const report = await scanBookLegacyJSON(input, {
    hash,
    onValue: async (span) => {
      spans.push(span);
    },
  });
  return { report, spans };
}
test('locates exact UTF-8 spans across range boundaries, preserving whitespace, escaped keys, literal BOM and fingerprint', async () => {
  const text =
    '\ufeff \r\n' +
    JSON.stringify(
      {
        chapters: [{ id: '🌙', content: '\ufeff' + 'ação 🌙'.repeat(10000) }],
        format: 'writer-book-backup',
        version: 1,
      },
      null,
      2,
    ) +
    ' \t';
  const requests = [],
    input = source(text, requests),
    { report, spans } = await scan(input);
  assert.equal(report.fingerprint, createHash('sha256').update(utf8(text)).digest('hex'));
  const chapter = spans.find((s) => JSON.stringify(s.path) === '["chapters",0]');
  const value = await readBookLegacyJSONSpan(input, chapter);
  assert.equal(value.content, '\ufeff' + 'ação 🌙'.repeat(10000));
  assert.equal(value.id, '🌙');
  assert.ok(Math.max(...requests) <= 65536);
  assert.equal(spans.at(-1).type, 'object');
});
test('validates all JSON number/literal/escape grammar without evaluating content', async () => {
  const text =
    '{"x":[-0,0,1,-1,1.25,1e+2,1E-2,true,false,null,"\\"\\\\\\/\\b\\f\\n\\r\\t\\u0061"]}';
  const { spans } = await scan(source(text));
  assert.deepEqual(await readBookLegacyJSONSpan(source(text), spans.at(-1)), JSON.parse(text));
});
test('rejects duplicates (including escaped aliases), invalid escapes, controls, trailing data and malformed grammar', async () => {
  const cases = [
    '',
    '{}{}',
    '{"a":1,"\\u0061":2}',
    '{"a":1,}',
    '[1,]',
    '{"a" 1}',
    '{"a":01}',
    '{"a":-}',
    '{"a":.1}',
    '{"a":1.}',
    '{"a":1e+}',
    '{"a":tru}',
    '{"a":"\\x00"}',
    '{"a":"\\u00xz"}',
    '{"a":"\n"}',
    '{"__proto__":{}}',
    '{"a":[1}',
    '{"a":"unfinished}',
  ];
  for (const text of cases) await assert.rejects(() => scan(source(text)), text);
  await assert.rejects(() => scan(source(new Uint8Array([123, 34, 97, 34, 58, 34, 255, 34, 125]))));
});
test('bounds depth/object keys without limiting the number of array items or materializing ignored strings', async () => {
  await assert.rejects(() => scan(source('['.repeat(26) + '0' + ']'.repeat(26))));
  await assert.rejects(() =>
    scan(
      source(
        JSON.stringify(Object.fromEntries(Array.from({ length: 65 }, (_, i) => ['key' + i, 0]))),
      ),
    ),
  );
  await assert.rejects(() => scan(source(JSON.stringify({ ['x'.repeat(300)]: 0 }))));
  let items = 0;
  const text = JSON.stringify({
      global: 'x'.repeat(1024 * 1024),
      items: Array(3000).fill(1),
    }),
    input = source(text);
  await scanBookLegacyJSON(input, {
    hash,
    onValue: async ({ path }) => {
      if (path[0] === 'items' && path.length === 2) items++;
    },
  });
  assert.equal(items, 3000);
  await assert.rejects(() =>
    readBookLegacyJSONSpan(source('x'.repeat(8 * 1024 * 1024 + 1)), {
      start: 0,
      end: 8 * 1024 * 1024 + 1,
    }),
  );
});
test('cancellation, changing size and short I/O cannot produce a completed fingerprint', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      scanBookLegacyJSON(source('{}'), {
        hash,
        signal: controller.signal,
        onValue: async () => {},
      }),
    { name: 'AbortError' },
  );
  await assert.rejects(() =>
    scan({
      size: 2,
      async read() {
        return new Uint8Array(1);
      },
    }),
  );
  const input = source('{}');
  input.read = async () => {
    input.size = 3;
    return utf8('{}');
  };
  await assert.rejects(() => scan(input));
  const error = new Error('read failed');
  await assert.rejects(
    () =>
      scan({
        size: 2,
        async read() {
          throw error;
        },
      }),
    error,
  );
});
