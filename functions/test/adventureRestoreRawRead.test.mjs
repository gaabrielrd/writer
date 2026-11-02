import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  encodeAdventureBackup,
  readAdventureBackupFrame,
} from '../src/adventureBackupContainer.mjs';
import { createAdventureContentHash } from '../src/adventureContentHash.mjs';
import { prepareAdventureRestoreRawStep } from '../src/adventureRestoreRawRead.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function fixture(data, layout = 'fixed-text', suppliedParts) {
  const parts =
      suppliedParts ??
      Array.from({ length: Math.max(1, Math.ceil(data.length / 65536)) }, (_, n) =>
        data.subarray(n * 65536, (n + 1) * 65536),
      ),
    kind = {
      'fixed-text': 'adventure-version-text',
      'utf8-parts': 'adventure-draft-text',
      png: 'adventure-image-bytes',
    }[layout],
    id = 'source-raw-record-0001',
    frames = [];
  for await (const bytes of encodeAdventureBackup([
    { kind: 'adventure-version-body', id, part: 0, payload: Buffer.from('{}') },
    ...parts.map((payload, part) => ({ kind, id, part, payload })),
  ]))
    frames.push(bytes);
  const bytes = Buffer.concat(frames),
    reads = [],
    source = {
      size: bytes.length,
      async read(offset, length) {
        reads.push({ offset, length });
        return bytes.subarray(offset, offset + length);
      },
    },
    start = await readAdventureBackupFrame(source);
  return {
    bytes,
    source,
    reads,
    descriptor: {
      sourceToken: 'a'.repeat(64),
      record: { kind, id, part: 0 },
      manifest: { byteLength: data.length, chunkCount: parts.length, contentHash: hash(data) },
      layout,
      cursor: start.cursor,
    },
  };
}
test('fixed64k raw keeps UTF8 continuation across trusted checkpoints and verifies full SHA at completion', async () => {
  const data = Buffer.from('a'.repeat(65535) + '🌙' + 'b'.repeat(65533)),
    f = await fixture(data),
    engine = await createAdventureContentHash(),
    first = await prepareAdventureRestoreRawStep(f.source, f.descriptor, null, { hash: engine });
  assert.equal(first.bytes.length, 65536);
  assert.equal(first.checkpoint.utf8.needed, 3);
  assert.equal(first.done, false);
  const before = JSON.stringify(first.checkpoint),
    last = await prepareAdventureRestoreRawStep(f.source, f.descriptor, JSON.parse(before), {
      hash: await createAdventureContentHash(),
    });
  assert.equal(JSON.stringify(first.checkpoint), before);
  assert.equal(last.done, true);
  assert.equal(last.validation, 'raw-content-complete');
  assert.equal(hash(Buffer.concat([first.bytes, last.bytes])), hash(data));
  assert.ok(f.reads.every((r) => r.length <= 81920));
});
test('utf8-parts enforces complete code points in each source part and handles explicit zero bytes', async () => {
  const chunks = [Buffer.from('a'.repeat(65535)), Buffer.from('🌙')],
    data = Buffer.concat(chunks),
    f = await fixture(data, 'utf8-parts', chunks),
    engine = await createAdventureContentHash(),
    one = await prepareAdventureRestoreRawStep(f.source, f.descriptor, null, { hash: engine }),
    last = await prepareAdventureRestoreRawStep(f.source, f.descriptor, one.checkpoint, {
      hash: engine,
    });
  assert.equal(one.checkpoint.utf8.needed, 0);
  assert.equal(last.done, true);
  const empty = await fixture(Buffer.alloc(0), 'utf8-parts'),
    result = await prepareAdventureRestoreRawStep(empty.source, empty.descriptor, null, {
      hash: engine,
    });
  assert.equal(result.bytes.length, 0);
  assert.equal(result.done, true);
  assert.equal(result.checkpoint.part, 1);
});
test('invalid UTF8, PNG signature, manifest SHA and unsupported layouts never produce a complete proof', async () => {
  for (const [data, layout] of [
    [Buffer.from([0xff]), 'fixed-text'],
    [Buffer.from([0xe0, 0x80, 0x80]), 'utf8-parts'],
    [Buffer.alloc(8), 'png'],
  ]) {
    const f = await fixture(data, layout);
    await assert.rejects(() =>
      prepareAdventureRestoreRawStep(f.source, f.descriptor, null, { hash: undefined }),
    );
    const engine = await createAdventureContentHash();
    await assert.rejects(
      () => prepareAdventureRestoreRawStep(f.source, f.descriptor, null, { hash: engine }),
      { code: 'adventure-backup-invalid-content' },
    );
  }
  const f = await fixture(Buffer.from('valid')),
    engine = await createAdventureContentHash();
  await assert.rejects(() =>
    prepareAdventureRestoreRawStep(
      f.source,
      { ...f.descriptor, manifest: { ...f.descriptor.manifest, contentHash: 'b'.repeat(64) } },
      null,
      { hash: engine },
    ),
  );
  await assert.rejects(() =>
    prepareAdventureRestoreRawStep(
      f.source,
      { ...f.descriptor, record: { ...f.descriptor.record, kind: 'unknown' }, layout: undefined },
      null,
      { hash: engine },
    ),
  );
  await assert.rejects(() =>
    prepareAdventureRestoreRawStep(f.source, { ...f.descriptor, layout: 'unknown' }, null, {
      hash: engine,
    }),
  );
});
test('PNG data is bounded and complete only after all bytes and parts match its manifest', async () => {
  const data = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(65529, 7)]),
    f = await fixture(data, 'png'),
    engine = await createAdventureContentHash(),
    one = await prepareAdventureRestoreRawStep(f.source, f.descriptor, null, { hash: engine }),
    last = await prepareAdventureRestoreRawStep(f.source, f.descriptor, one.checkpoint, {
      hash: engine,
    });
  assert.equal(one.done, false);
  assert.equal(last.bytes.length, 1);
  assert.equal(last.done, true);
  await assert.rejects(() =>
    prepareAdventureRestoreRawStep(
      f.source,
      { ...f.descriptor, manifest: { ...f.descriptor.manifest, byteLength: 16 * 1024 * 1024 + 1 } },
      null,
      { hash: engine },
    ),
  );
});
test('checkpoint shape, source scope, byte counts, cursor position and completed reuse are checked', async () => {
  const f = await fixture(Buffer.alloc(65537, 65)),
    engine = await createAdventureContentHash(),
    first = await prepareAdventureRestoreRawStep(f.source, f.descriptor, null, { hash: engine });
  for (const patch of [
    { sourceToken: 'b'.repeat(64) },
    { part: 0 },
    { byteLength: 0 },
    { hashState: null },
    { done: true },
    { extra: 'no' },
    { container: { ...first.checkpoint.container, records: 0 } },
    { container: { ...first.checkpoint.container, payloadBytes: 0 } },
    { utf8: { needed: 0, minimum: 0, maximum: 999 } },
  ])
    await assert.rejects(() =>
      prepareAdventureRestoreRawStep(
        f.source,
        f.descriptor,
        { ...first.checkpoint, ...patch },
        { hash: engine },
      ),
    );
  const last = await prepareAdventureRestoreRawStep(f.source, f.descriptor, first.checkpoint, {
    hash: engine,
  });
  await assert.rejects(() =>
    prepareAdventureRestoreRawStep(f.source, f.descriptor, last.checkpoint, { hash: engine }),
  );
});
test('binds descriptor and checkpoint before pending I/O and rejects source size changes, short reads and abort', async () => {
  const f = await fixture(Buffer.from('verified')),
    engine = await createAdventureContentHash(),
    descriptor = structuredClone(f.descriptor);
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    waiting = new Promise((r) => (entered = r));
  const source = {
      size: f.source.size,
      async read(o, n) {
        entered();
        await gate;
        return f.source.read(o, n);
      },
    },
    pending = prepareAdventureRestoreRawStep(source, descriptor, null, { hash: engine });
  await waiting;
  descriptor.record.id = 'changed-source-0001';
  release();
  assert.equal((await pending).done, true);
  const changed = {
    size: f.source.size,
    async read(o, n) {
      changed.size++;
      return f.source.read(o, n);
    },
  };
  await assert.rejects(() =>
    prepareAdventureRestoreRawStep(changed, f.descriptor, null, { hash: engine }),
  );
  await assert.rejects(() =>
    prepareAdventureRestoreRawStep(
      { size: f.source.size, read: async () => new Uint8Array() },
      f.descriptor,
      null,
      { hash: engine },
    ),
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    () =>
      prepareAdventureRestoreRawStep(f.source, f.descriptor, null, {
        hash: engine,
        signal: abort.signal,
      }),
    { name: 'AbortError' },
  );
});

test('equivalent private checkpoint maps survive storage key reordering without resetting UTF8 or SHA', async () => {
  const data = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(65529, 7)]),
    f = await fixture(data, 'png'),
    engine = await createAdventureContentHash(),
    first = await prepareAdventureRestoreRawStep(f.source, f.descriptor, null, { hash: engine }),
    saved = JSON.parse(JSON.stringify(first.checkpoint));
  saved.utf8 = {
    maximum: saved.utf8.maximum,
    minimum: saved.utf8.minimum,
    needed: saved.utf8.needed,
  };
  saved.container = Object.fromEntries(Object.entries(saved.container).reverse());
  const last = await prepareAdventureRestoreRawStep(f.source, f.descriptor, saved, {
    hash: engine,
  });
  assert.equal(last.done, true);
  assert.equal(last.checkpoint.byteLength, data.length);
});
