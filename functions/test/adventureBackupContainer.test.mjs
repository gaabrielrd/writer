import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AdventureBackupFormatError,
  encodeAdventureBackup,
  decodeAdventureBackup,
  readAdventureBackupFrame,
  readAdventureBackupIndexedPart,
} from '../src/adventureBackupContainer.mjs';
import {
  BookBackupFormatError,
  encodeBookBackup,
  decodeBookBackup,
} from '../src/bookBackupContainer.mjs';

const utf8 = (text) => new TextEncoder().encode(text);
const record = (payload = utf8('Olá 🌙'), part = 0, extra = {}) => ({
  kind: 'text',
  id: 'cena-🌙',
  part,
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
async function collect(stream) {
  const values = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { values, seal: next.value };
    values.push(next.value);
  }
}
const encode = async (records = []) => {
  const result = await collect(encodeAdventureBackup(records));
  return { ...result, bytes: Buffer.concat(result.values) };
};
const decode = (bytes) => collect(decodeAdventureBackup(source(bytes)));
const rejects = (work, code) =>
  assert.rejects(
    work,
    (e) =>
      e instanceof AdventureBackupFormatError &&
      e.name === 'AdventureBackupFormatError' &&
      e.code === code,
  );

test('adventure stream matches an independent Python SHA/struct vector', async () => {
  const result = await encode([record(), record(new Uint8Array([0, 255, 128, 10]), 1)]);
  const fixture = JSON.parse(
    await readFile(new URL('./fixtures/adventureBackupContainer-v1.json', import.meta.url), 'utf8'),
  );
  assert.equal(result.bytes.toString('hex'), fixture.hex);
  assert.equal(result.seal.chainHash, fixture.chainHash);
  const decoded = await decode(result.bytes);
  assert.deepEqual(decoded.values, [record(), record(new Uint8Array([0, 255, 128, 10]), 1)]);
  assert.deepEqual(decoded.seal, { ...result.seal, archiveBytes: result.bytes.length });
});
test('each fresh domain decoder rejects the other signature with its own error class', async () => {
  const adventure = await encode([record()]);
  const book = await collect(encodeBookBackup([record()]));
  await rejects(() => decode(Buffer.concat(book.values)), 'invalid-format');
  await assert.rejects(
    () => collect(decodeBookBackup(source(adventure.bytes))),
    (e) =>
      e instanceof BookBackupFormatError &&
      !(e instanceof AdventureBackupFormatError) &&
      e.code === 'invalid-format',
  );
});
test('corruption, missing footer, unknown version and appended archives cannot be sealed', async () => {
  const output = await encode([record()]);
  const damaged = Buffer.from(output.bytes);
  damaged[28 + damaged.readUInt32BE(20)] ^= 1;
  await rejects(() => decode(damaged), 'integrity-mismatch');
  await rejects(() => decode(Buffer.concat(output.values.slice(0, -1))), 'incomplete-archive');
  await rejects(() => decode(output.bytes.subarray(0, -1)), 'incomplete-archive');
  await rejects(() => decode(Buffer.concat([output.bytes, output.bytes])), 'invalid-format');
  const future = Buffer.from(output.bytes);
  future.writeUInt32BE(2, 12);
  const calls = [];
  await rejects(() => collect(decodeAdventureBackup(source(future, calls))), 'unsupported-version');
  assert.deepEqual(calls, [{ offset: 0, length: 16 }]);
});
test('bounded indexed reads cross part-number digit boundaries without loading the file', async () => {
  const body = new Uint8Array(11 * 65536 + 97);
  for (let n = 0; n < body.length; n++) body[n] = n % 251;
  const records = [record(utf8('{}'), 0, { kind: 'metadata', id: 'root' })];
  for (let i = 0; i < 12; i++)
    records.push(
      record(body.slice(i * 65536, (i + 1) * 65536), i, { kind: 'scene-body', id: 'scene' }),
    );
  const encoded = await encode(records);
  const anchor = await readAdventureBackupFrame(source(encoded.bytes));
  const item = {
    record: { kind: 'scene-body', id: 'scene', part: 0 },
    byteLength: body.length,
    chunkCount: 12,
  };
  for (const index of [0, 9, 10, 11]) {
    const calls = [];
    const result = await readAdventureBackupIndexedPart(
      source(encoded.bytes, calls),
      anchor.cursor,
      item,
      index,
    );
    assert.deepEqual(result.bytes, body.slice(index * 65536, (index + 1) * 65536));
    assert.ok(calls.every((c) => c.length <= 65536 + 16384));
    assert.ok(calls.reduce((sum, c) => sum + c.length, 0) < 70000);
  }
  await rejects(
    () => readAdventureBackupIndexedPart(source(encoded.bytes), anchor.cursor, item, 12),
    'invalid-record',
  );
  assert.equal((await decode(encoded.bytes)).seal.records, 13);
});
test('aborting a suspended capture closes its iterator without requesting more records or a footer', async () => {
  let pulls = 0,
    closed = false;
  async function* items() {
    try {
      pulls++;
      yield record();
      pulls++;
      yield record();
    } finally {
      closed = true;
    }
  }
  const abort = new AbortController();
  const output = encodeAdventureBackup(items(), { signal: abort.signal });
  await output.next();
  await output.next();
  abort.abort();
  await assert.rejects(() => output.next(), { name: 'AbortError' });
  assert.equal(pulls, 1);
  assert.equal(closed, true);
});
test('book and adventure chains remain independent when their streams are interleaved', async () => {
  const a = encodeAdventureBackup([record()]),
    b = encodeBookBackup([record()]);
  const af = [],
    bf = [];
  for (;;) {
    const [left, right] = await Promise.all([a.next(), b.next()]);
    if (left.done && right.done) break;
    assert.equal(left.done, right.done);
    af.push(left.value);
    bf.push(right.value);
  }
  const [adventure, book] = await Promise.all([
    decode(Buffer.concat(af)),
    collect(decodeBookBackup(source(Buffer.concat(bf)))),
  ]);
  assert.deepEqual(adventure.values, book.values);
  assert.notEqual(adventure.seal.chainHash, book.seal.chainHash);
});
test('an untrusted declared frame length is refused before its body is read', async () => {
  const result = await encode([record()]);
  result.bytes.writeUInt32BE(262145, 24);
  const calls = [];
  await rejects(
    () => collect(decodeAdventureBackup(source(result.bytes, calls))),
    'limit-exceeded',
  );
  assert.deepEqual(
    calls.map((c) => c.length),
    [16, 12],
  );
});
test('source failure propagates and never becomes an empty successful backup', async () => {
  const failure = new Error('source changed');
  async function* items() {
    yield record();
    throw failure;
  }
  const writer = encodeAdventureBackup(items());
  await writer.next();
  await writer.next();
  await assert.rejects(
    () => writer.next(),
    (e) => e === failure,
  );
});
