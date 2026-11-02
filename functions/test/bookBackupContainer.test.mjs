import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  BOOK_BACKUP_LIMITS,
  BookBackupFormatError,
  encodeBookBackup,
  decodeBookBackup,
} from '../src/bookBackupContainer.mjs';

const utf8 = (text) => new TextEncoder().encode(text);
const hash = (bytes) => createHash('sha256').update(bytes).digest();
const record = (payload = utf8('Olá 🌙'), extra = {}) => ({
  kind: 'text',
  id: 'capítulo-🌙',
  part: 0,
  payload,
  ...extra,
});
const source = (bytes, calls = []) => ({
  size: bytes.length,
  async read(offset, length) {
    calls.push({ offset, length });
    return bytes.subarray(offset, offset + length);
  },
});
async function collect(generator) {
  const values = [];
  while (true) {
    const next = await generator.next();
    if (next.done) return { values, seal: next.value };
    values.push(next.value);
  }
}
async function encode(records = []) {
  const result = await collect(encodeBookBackup(records));
  return { ...result, bytes: Buffer.concat(result.values) };
}
const decode = (bytes, calls) => collect(decodeBookBackup(source(bytes, calls)));
const rejectsCode = (operation, code) =>
  assert.rejects(
    operation,
    (error) => error instanceof BookBackupFormatError && error.code === code,
  );

// Independent Node implementation for hostile files: does not call production encoder.
// Python hashlib/struct vector below separately verifies the actual output bytes.
function rawArchive(frames, { version = 1, seal = true, sealPatch = {} } = {}) {
  const header = Buffer.alloc(16);
  header.write('WRITER-BOOK\n');
  header.writeUInt32BE(version, 12);
  let previous = hash(header);
  const output = [header];
  let count = 0;
  let payloadBytes = 0;
  function add(metadata, payload, sequence) {
    const bytes = typeof metadata === 'string' ? Buffer.from(metadata) : Buffer.from(metadata);
    const prefix = Buffer.alloc(12);
    prefix.writeUInt32BE(sequence, 0);
    prefix.writeUInt32BE(bytes.length, 4);
    prefix.writeUInt32BE(payload.length, 8);
    const body = Buffer.concat([prefix, bytes, payload]);
    const trailer = hash(Buffer.concat([previous, body]));
    output.push(body, trailer);
    previous = trailer;
  }
  for (const entry of frames) {
    const payload = Buffer.from(entry.payload ?? []);
    add(entry.metadata, payload, entry.sequence ?? count);
    count += 1;
    payloadBytes += payload.length;
  }
  if (seal) {
    add(
      JSON.stringify({
        type: 'end',
        records: count,
        payloadBytes,
        chain: previous.toString('hex'),
        ...sealPatch,
      }),
      Buffer.alloc(0),
      count,
    );
  }
  return Buffer.concat(output);
}
const metadata = (extra = {}) =>
  JSON.stringify({
    type: 'record',
    kind: 'text',
    id: 'capítulo-🌙',
    part: 0,
    ...extra,
  });

test('matches independent Python binary vector, including UTF-8 and arbitrary bytes', async () => {
  const encoded = await encode([record(), record(new Uint8Array([0, 255, 128, 10]), { part: 1 })]);
  const fixture = JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile(new URL('./fixtures/bookBackupContainer-v1.json', import.meta.url), 'utf8'),
  );
  assert.equal(encoded.bytes.toString('hex'), fixture.hex);
  assert.equal(encoded.seal.chainHash, fixture.chainHash);
  const decoded = await decode(encoded.bytes);
  assert.deepEqual(decoded.values, [
    record(),
    record(new Uint8Array([0, 255, 128, 10]), { part: 1 }),
  ]);
  assert.deepEqual(decoded.seal, { ...encoded.seal, archiveBytes: encoded.bytes.length });
});
test('accepts an empty sealed archive and empty payload', async () => {
  const empty = await encode();
  assert.deepEqual((await decode(empty.bytes)).values, []);
  const withEmpty = await decode((await encode([record(new Uint8Array())])).bytes);
  assert.equal(withEmpty.values[0].payload.length, 0);
});
test('streams records lazily and bounds every requested read to one frame', async () => {
  let pulls = 0;
  async function* records() {
    for (let i = 0; i < 8; i += 1) {
      pulls += 1;
      yield record(new Uint8Array(BOOK_BACKUP_LIMITS.maxPayloadBytes).fill(i), { part: i });
    }
  }
  const writer = encodeBookBackup(records());
  assert.equal(pulls, 0);
  const header = await writer.next();
  assert.equal(pulls, 0);
  const first = await writer.next();
  assert.equal(pulls, 1);
  const remainder = await collect(writer);
  const bytes = Buffer.concat([header.value, first.value, ...remainder.values]);
  const calls = [];
  const decoded = await decode(bytes, calls);
  assert.equal(decoded.values.length, 8);
  assert.ok(calls.length > 8);
  assert.ok(
    calls.every(
      ({ length }) =>
        length <= BOOK_BACKUP_LIMITS.maxMetadataBytes + BOOK_BACKUP_LIMITS.maxPayloadBytes,
    ),
  );
  assert.equal(decoded.seal.payloadBytes, 8 * BOOK_BACKUP_LIMITS.maxPayloadBytes);
});
test('copies input payload before awaiting hash and does not alias the chain with yielded buffers', async (t) => {
  const payload = utf8('original');
  const writer = encodeBookBackup([record(payload)]);
  const first = await writer.next();
  const retainedHeader = first.value.slice();
  first.value.fill(0); // Must not mutate the state already hashed.
  const originalDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  t.mock.method(globalThis.crypto.subtle, 'digest', (...args) => {
    payload.fill(0); // Exact await boundary, without timing assumptions.
    return originalDigest(...args);
  });
  const second = await writer.next();
  const retainedFrame = second.value.slice();
  second.value.fill(0); // Trailer output also must not alias the next chain state.
  const rest = await collect(writer);
  const decoded = await decode(Buffer.concat([retainedHeader, retainedFrame, ...rest.values]));
  assert.equal(new TextDecoder().decode(decoded.values[0].payload), 'original');
});
test('copy of yielded payload cannot mutate reader chain', async () => {
  const encoded = await encode([record(), record(utf8('segunda'), { part: 1 })]);
  const reader = decodeBookBackup(source(encoded.bytes));
  const first = await reader.next();
  first.value.payload.fill(0);
  const result = await collect(reader);
  assert.equal(result.seal.records, 2);
  assert.equal(new TextDecoder().decode(result.values[0].payload), 'segunda');
});
test('detects payload, metadata and trailer corruption before emitting the affected record', async () => {
  const { bytes } = await encode([record()]);
  for (const position of [28, 28 + bytes.readUInt32BE(20), bytes.length - 1]) {
    const changed = Buffer.from(bytes);
    changed[position] ^= 1;
    await rejectsCode(() => decode(changed), 'integrity-mismatch');
  }
});
test('rejects unknown version before frame reads and bad signature', async () => {
  const { bytes } = await encode();
  const version = Buffer.from(bytes);
  version.writeUInt32BE(2, 12);
  const calls = [];
  await rejectsCode(() => decode(version, calls), 'unsupported-version');
  assert.deepEqual(calls, [{ offset: 0, length: 16 }]);
  version[0] = 0;
  await rejectsCode(() => decode(version), 'invalid-format');
});
test('rejects missing seal, truncated header/body/trailer, trailing data and concatenated archives', async () => {
  const { bytes, values } = await encode([record()]);
  for (const length of [0, 15])
    await rejectsCode(() => decode(bytes.subarray(0, length)), 'invalid-format');
  for (const length of [16, 20, 30, bytes.length - 1]) {
    await rejectsCode(() => decode(bytes.subarray(0, length)), 'incomplete-archive');
  }
  await rejectsCode(() => decode(Buffer.concat(values.slice(0, 2))), 'incomplete-archive');
  await rejectsCode(() => decode(Buffer.concat([bytes, Buffer.from([0])])), 'invalid-format');
  await rejectsCode(() => decode(Buffer.concat([bytes, bytes])), 'invalid-format');
});
test('rejects declared oversized lengths before requesting body bytes', async () => {
  for (const [offset, value] of [
    [20, 0],
    [20, 16385],
    [24, 262145],
    [24, 0xffffffff],
  ]) {
    const { bytes } = await encode([record()]);
    bytes.writeUInt32BE(value, offset);
    const calls = [];
    await rejectsCode(() => decode(bytes, calls), 'limit-exceeded');
    assert.deepEqual(
      calls.map(({ length }) => length),
      [16, 12],
    );
  }
});
test('rejects unsafe source sizes and short or non-byte read responses', async () => {
  for (const size of [-1, 0, NaN, Infinity, 16.5, Number.MAX_SAFE_INTEGER + 1]) {
    await rejectsCode(
      () => collect(decodeBookBackup({ size, read: async () => new Uint8Array() })),
      'invalid-format',
    );
  }
  for (const value of [new Uint8Array(15), [], null]) {
    await rejectsCode(
      () => collect(decodeBookBackup({ size: 16, read: async () => value })),
      'incomplete-archive',
    );
  }
});
test('propagates source I/O error without retrying or sealing', async () => {
  let reads = 0;
  const failure = new Error('file removed');
  await assert.rejects(
    () =>
      collect(
        decodeBookBackup({
          size: 16,
          read: async () => {
            reads += 1;
            throw failure;
          },
        }),
      ),
    (error) => error === failure,
  );
  assert.equal(reads, 1);
});
test('rejects validly hashed out-of-order frames and forged seal counts/chain', async () => {
  await rejectsCode(
    () => decode(rawArchive([{ metadata: metadata(), sequence: 1 }])),
    'invalid-format',
  );
  for (const sealPatch of [{ records: 2 }, { payloadBytes: 9 }, { chain: '0'.repeat(64) }]) {
    await rejectsCode(
      () => decode(rawArchive([{ metadata: metadata() }], { sealPatch })),
      'invalid-format',
    );
  }
});
test('canonical JSON rejects hidden/duplicate fields, whitespace, escaped identities, invalid UTF-8 and unknown type', async () => {
  const valid = metadata();
  const invalid = [
    valid.replace('"kind":"text"', '"kind":"text","kind":"text"'),
    valid.replace('"part":0', '"part":0,"extra":1'),
    valid.replace('"part":0', '"part":0.0'),
    valid.replace('capítulo', 'cap\\u00edtulo'),
    ' ' + valid,
    '\ufeff' + valid,
    '{"type":"unknown"}',
    'null',
    '[]',
    Buffer.from([0xff]),
  ];
  for (const value of invalid) {
    await rejectsCode(() => decode(rawArchive([{ metadata: value }])), 'invalid-format');
  }
});
test('writer and reader reject unsafe record identities and part numbers', async () => {
  const values = [
    { kind: '' },
    { kind: 'Text' },
    { kind: 'a'.repeat(49) },
    { id: '' },
    { id: '.' },
    { id: '..' },
    { id: 'a/b' },
    { id: 'a\\b' },
    { id: 'a\nb' },
    { id: '\ud800' },
    { id: 'é'.repeat(751) },
    { part: -1 },
    { part: 0.5 },
    { part: 0x100000000 },
    { part: null },
  ];
  for (const patch of values) {
    await rejectsCode(() => encode([record(undefined, patch)]), 'invalid-record');
    await rejectsCode(() => decode(rawArchive([{ metadata: metadata(patch) }])), 'invalid-record');
  }
});
test('writer refuses non-byte and over-limit payloads, without producing final seal', async () => {
  await rejectsCode(() => encode([record('text')]), 'invalid-record');
  await rejectsCode(() => encode([record(new Uint8Array(262145))]), 'limit-exceeded');
  const failure = new Error('capture changed');
  async function* records() {
    yield record();
    throw failure;
  }
  const writer = encodeBookBackup(records());
  await writer.next();
  await writer.next();
  await assert.rejects(
    () => writer.next(),
    (error) => error === failure,
  );
});
test('abort before or during I/O never yields more records or seal', async () => {
  const before = new AbortController();
  before.abort();
  await assert.rejects(() => encodeBookBackup([], { signal: before.signal }).next(), {
    name: 'AbortError',
  });
  await assert.rejects(
    () => decodeBookBackup(source(new Uint8Array(16)), { signal: before.signal }).next(),
    { name: 'AbortError' },
  );
  const { bytes } = await encode([record()]);
  const during = new AbortController();
  const reader = decodeBookBackup(
    {
      size: bytes.length,
      read: async (offset, length) => {
        during.abort();
        return bytes.subarray(offset, offset + length);
      },
    },
    { signal: during.signal },
  );
  await assert.rejects(() => reader.next(), { name: 'AbortError' });
  const afterFrame = new AbortController();
  const writer = encodeBookBackup([record()], { signal: afterFrame.signal });
  await writer.next();
  await writer.next();
  afterFrame.abort();
  await assert.rejects(() => writer.next(), { name: 'AbortError' });
});
test('stopping early does not report a verified archive', async () => {
  const { bytes } = await encode([record()]);
  bytes[bytes.length - 1] ^= 1;
  const reader = decodeBookBackup(source(bytes));
  const first = await reader.next();
  assert.equal(first.done, false);
  await rejectsCode(() => reader.next(), 'integrity-mismatch');
});

test('aborting a suspended writer does not request the next source item and closes the iterator', async () => {
  const controller = new AbortController();
  let pulls = 0;
  let closed = false;
  async function* records() {
    try {
      pulls += 1;
      yield record();
      pulls += 1;
      yield record();
    } finally {
      closed = true;
    }
  }
  const writer = encodeBookBackup(records(), { signal: controller.signal });
  await writer.next();
  await writer.next();
  controller.abort();
  await assert.rejects(() => writer.next(), { name: 'AbortError' });
  assert.equal(pulls, 1);
  assert.equal(closed, true);
});
test('reads payload property once and preserves composed/decomposed UTF-8 identities independently', async () => {
  let reads = 0;
  const value = record();
  Object.defineProperty(value, 'payload', {
    get() {
      reads += 1;
      return reads === 1 ? utf8('original') : new Uint8Array(262145);
    },
  });
  const encoded = await encode([
    value,
    record(new Uint8Array(), { id: 'e\u0301', part: 0xffffffff }),
  ]);
  assert.equal(reads, 1);
  const result = await decode(encoded.bytes);
  assert.equal(new TextDecoder().decode(result.values[0].payload), 'original');
  assert.equal(result.values[1].id, 'e\u0301');
  assert.equal(result.values[1].part, 0xffffffff);
});
test('reader emits no corrupt record, and a caller stopping early closes the source iterator', async () => {
  const { bytes } = await encode([record()]);
  bytes[28] ^= 1;
  await rejectsCode(() => decodeBookBackup(source(bytes)).next(), 'integrity-mismatch');
  let closed = false;
  async function* records() {
    try {
      yield record();
      yield record();
    } finally {
      closed = true;
    }
  }
  const writer = encodeBookBackup(records());
  await writer.next();
  await writer.next();
  await writer.return();
  assert.equal(closed, true);
});
