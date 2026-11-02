import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  encodeBookBackup,
  readBookBackupFrame,
  readBookBackupIndexedPart,
} from '../src/bookBackupContainer.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest();
const record = { kind: 'book-lore', id: 'Literal "🌙"-á', part: 0 };
// Independently serialize preceding metadata one frame at a time. Only the target
// and its preceding digest exist in this sparse source: scanning is an error.
// This fixture proves framing/seek arithmetic, not whole-file validation.
function sparse(part, { metadata = {}, sequence, short = false } = {}) {
  const start = {
      schemaVersion: 1,
      size: 0,
      offset: 3456,
      records: 7,
      payloadBytes: 800,
      previous: '11'.repeat(32),
      done: false,
    },
    payload = Buffer.alloc(short ? 730 : 731, part % 251),
    expectedLength = part * 65536 + 731;
  let offset = start.offset;
  for (let at = 0; at < part; at++)
    offset +=
      12 + Buffer.byteLength(JSON.stringify({ type: 'record', ...record, part: at })) + 65536 + 32;
  const meta = Buffer.from(JSON.stringify({ type: 'record', ...record, part, ...metadata })),
    prefix = Buffer.alloc(12),
    previous = Buffer.from(part ? '22'.repeat(32) : start.previous, 'hex');
  prefix.writeUInt32BE(sequence ?? start.records + part, 0);
  prefix.writeUInt32BE(meta.length, 4);
  prefix.writeUInt32BE(payload.length, 8);
  const body = Buffer.concat([prefix, meta, payload]),
    frame = Buffer.concat([body, hash(Buffer.concat([previous, body]))]),
    bytes = part ? Buffer.concat([previous, frame]) : frame,
    begin = part ? offset - 32 : offset,
    calls = [],
    source = {
      size: offset + frame.length + 250,
      async read(at, length) {
        calls.push({ offset: at, length });
        assert.ok(at >= begin && at + length <= begin + bytes.length, 'must not scan prior parts');
        return bytes.subarray(at - begin, at - begin + length);
      },
    };
  start.size = source.size;
  return {
    start,
    source,
    payload,
    frame,
    bytes,
    calls,
    offset,
    item: { record: { ...record }, byteLength: expectedLength, chunkCount: part + 1 },
  };
}
for (const part of [0, 1, 9, 10, 99, 100, 999, 1000, 9999, 10000])
  test('indexed part seeks directly across digit boundary ' + part, async () => {
    const f = sparse(part),
      result = await readBookBackupIndexedPart(f.source, f.start, f.item, part);
    assert.deepEqual(Buffer.from(result.bytes), f.payload);
    assert.equal(result.cursor.offset, f.offset + f.frame.length);
    assert.equal(result.cursor.records, f.start.records + part + 1);
    assert.equal(result.cursor.payloadBytes, f.start.payloadBytes + f.item.byteLength);
    assert.equal(f.calls.length, part ? 4 : 3);
    assert.ok(f.calls.every((call) => call.length <= 65536 + 1500));
  });
test('random reads agree with sequential decoding of an actual sealed archive', async () => {
  const payloads = Array.from({ length: 113 }, (_, part) =>
      Buffer.alloc(part === 112 ? 817 : 65536, part),
    ),
    records = [
      { kind: 'text', id: 'prefix', part: 0, payload: Buffer.from('before') },
      ...payloads.map((payload, part) => ({ ...record, part, payload })),
      { kind: 'text', id: 'suffix', part: 0, payload: Buffer.from('after') },
    ],
    encoded = [];
  for await (const bytes of encodeBookBackup(records)) encoded.push(bytes);
  const bytes = Buffer.concat(encoded),
    calls = [],
    source = {
      size: bytes.length,
      read: async (offset, length) => {
        calls.push({ offset, length });
        return bytes.subarray(offset, offset + length);
      },
    },
    start = (await readBookBackupFrame(source)).cursor,
    item = {
      record,
      byteLength: payloads.reduce((n, p) => n + p.length, 0),
      chunkCount: payloads.length,
    };
  const cursors = [];
  let cursor = start;
  for (let part = 0; part < payloads.length; part++) {
    cursor = (await readBookBackupFrame(source, cursor)).cursor;
    cursors.push(cursor);
  }
  for (const part of [112, 100, 10, 99, 0, 1]) {
    calls.length = 0;
    const actual = await readBookBackupIndexedPart(source, start, item, part);
    assert.deepEqual(Buffer.from(actual.bytes), payloads[part]);
    assert.deepEqual(actual.cursor, cursors[part]);
    assert.equal(calls.length, part ? 4 : 3);
  }
});
test('wrong sequence, kind, identity, part or final payload length is rejected even with a valid frame digest', async () => {
  for (const options of [
    { sequence: 0 },
    { metadata: { kind: 'text' } },
    { metadata: { id: 'different-id' } },
    { metadata: { part: 1 } },
    { short: true },
  ]) {
    const f = sparse(10, options);
    await assert.rejects(() => readBookBackupIndexedPart(f.source, f.start, f.item, 10));
  }
});
test('corruption of preceding digest, metadata, payload and trailer fails integrity', async () => {
  for (const byte of [0, 32 + 12, 32 + 100, -1]) {
    const f = sparse(100);
    f.bytes[byte === -1 ? f.bytes.length - 1 : byte] ^= 1;
    await assert.rejects(
      () => readBookBackupIndexedPart(f.source, f.start, f.item, 100),
      (e) => e.code === 'integrity-mismatch',
    );
  }
});
test('invalid descriptors, cursors and range bounds fail before source I/O', async () => {
  for (const change of [
    (f) => {
      f.start.done = true;
    },
    (f) => {
      f.start.size++;
    },
    (f) => {
      f.start.previous = 'bad';
    },
    (f) => {
      f.start.extra = true;
    },
    (f) => {
      f.item.record.part = 1;
    },
    (f) => {
      f.item.chunkCount++;
    },
    (f) => {
      f.item.byteLength = Number.MAX_SAFE_INTEGER;
    },
    (f) => {
      f.item.record.id = '../forbidden';
    },
    (f) => {
      f.start.records = 0xffffffff;
    },
  ]) {
    const f = sparse(10);
    change(f);
    await assert.rejects(() => readBookBackupIndexedPart(f.source, f.start, f.item, 10));
    assert.equal(f.calls.length, 0);
  }
  for (const index of [-1, 1.5, NaN, Infinity, 11, 0x100000000]) {
    const f = sparse(10);
    await assert.rejects(() => readBookBackupIndexedPart(f.source, f.start, f.item, index));
    assert.equal(f.calls.length, 0);
  }
  const f = sparse(10);
  f.source.size = f.offset;
  f.start.size = f.source.size;
  await assert.rejects(() => readBookBackupIndexedPart(f.source, f.start, f.item, 10));
  assert.equal(f.calls.length, 0);
});
test('short/nonbyte reads, size changes and cancellation never return a part', async () => {
  for (const mode of ['short', 'not-bytes', 'size', 'abort']) {
    const f = sparse(10),
      read = f.source.read,
      controller = new AbortController();
    f.source.read = async (...args) => {
      const bytes = await read(...args);
      if (mode === 'size') f.source.size++;
      if (mode === 'abort') controller.abort();
      return mode === 'short' ? bytes.subarray(1) : mode === 'not-bytes' ? [] : bytes;
    };
    await assert.rejects(() =>
      readBookBackupIndexedPart(f.source, f.start, f.item, 10, { signal: controller.signal }),
    );
  }
  const f = sparse(10),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(() =>
    readBookBackupIndexedPart(f.source, f.start, f.item, 10, { signal: controller.signal }),
  );
  assert.equal(f.calls.length, 0);
});
test('caller mutation while awaiting the preceding digest cannot retarget the read', async () => {
  const f = sparse(100),
    read = f.source.read;
  f.source.read = async (...args) => {
    const bytes = await read(...args);
    f.start.offset = 16;
    f.start.previous = '33'.repeat(32);
    f.item.record.id = 'changed';
    f.item.record.kind = 'text';
    f.item.byteLength = 1;
    f.item.chunkCount = 1;
    return bytes;
  };
  const actual = await readBookBackupIndexedPart(f.source, f.start, f.item, 100);
  assert.deepEqual(Buffer.from(actual.bytes), f.payload);
  assert.equal(actual.cursor.records, 108);
});
