import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
const bytes = Buffer.from('private exact cover bytes'),
  c = {
    ownerId: 'author',
    restoreId: 'storage-restore01',
    jobToken: 'a'.repeat(64),
    imageId: 'restore-' + 'b'.repeat(64),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  },
  path = 'book-covers/' + c.ownerId + '/' + c.imageId + '.png';
function setup() {
  const f = bookRestoreStorageBucket();
  return { ...f, api: createBookRestoreCoverStorage(f.bucket) };
}
test('create-only image preserves bytes privately and repeated upload adopts the exact generation', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes),
    v = f.version(path);
  assert.deepEqual(v.bytes, bytes);
  assert.equal(v.metadata.metadata.accepted, 'false');
  assert.equal(v.metadata.cacheControl, 'private, no-store');
  assert.equal(v.metadata.metadata.firebaseStorageDownloadTokens, undefined);
  assert.ok(BigInt(proof.generation) > BigInt(Number.MAX_SAFE_INTEGER));
  assert.deepEqual(await f.api.stage(c, bytes), proof);
  assert.equal(f.versions.get(path).size, 1);
  assert.ok(
    f.events
      .filter((e) => e.method === 'save')
      .every((e) => e.options.preconditionOpts.ifGenerationMatch === 0),
  );
  assert.deepEqual(await f.api.verify(c, proof), proof);
});
test('a foreign path and incorrect bytes are preserved without overwriting', async () => {
  const f = setup();
  f.put(path, Buffer.from('foreign'), { metadata: { keep: true } });
  await assert.rejects(() => f.api.stage(c, bytes));
  assert.equal(f.version(path).bytes.toString(), 'foreign');
  const empty = setup();
  await assert.rejects(() => empty.api.stage(c, Buffer.from('wrong')));
  assert.equal(empty.current.size, 0);
});
test('cancellation before creation leaves an empty permanent fence that rejects late bytes', async () => {
  const f = setup(),
    proof = await f.api.fence(c),
    v = f.version(path);
  assert.equal(v.bytes.length, 0);
  assert.equal(v.metadata.metadata.restoreState, 'fenced');
  assert.deepEqual(await f.api.fence(c), proof);
  await assert.rejects(() => f.api.stage(c, bytes));
  assert.equal(f.version(path).bytes.length, 0);
});
test('fencing a confirmed image removes only its prior generation, including versioned storage', async () => {
  const f = setup(),
    first = await f.api.stage(c, bytes),
    fence = await f.api.fence(c, first);
  assert.notEqual(first.generation, fence.generation);
  assert.equal(f.versions.get(path).size, 1);
  assert.equal(f.version(path).bytes.length, 0);
  assert.deepEqual(await f.api.fence(c, first), fence);
  const deletion = f.events.find((e) => e.method === 'delete');
  assert.equal(deletion.options.generation, first.generation);
  assert.equal(deletion.options.preconditionOpts.ifGenerationMatch, first.generation);
});
test('lost fence response is recovered and deletes the old payload without deleting the marker', async () => {
  const f = setup(),
    first = await f.api.stage(c, bytes);
  let failed = false;
  f.hooks.afterSave = (_p, v) => {
    if (!v.bytes.length && !failed) {
      failed = true;
      throw new Error('lost fence response');
    }
  };
  await assert.rejects(() => f.api.fence(c, first), /lost fence response/);
  assert.equal(f.versions.get(path).size, 2);
  const marker = await f.api.fence(c, first);
  assert.equal(f.versions.get(path).size, 1);
  assert.equal(f.current.get(path), marker.generation);
});
test('an upload paused before conditional creation cannot resurrect payload after cancellation', async () => {
  const f = setup();
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  f.hooks.beforeSave = async (_p, data) => {
    if (data.length) {
      enter();
      await gate;
    }
  };
  const pending = f.api.stage(c, bytes);
  await entered;
  const proof = await f.api.fence(c);
  release();
  await assert.rejects(() => pending);
  assert.equal(f.version(path).bytes.length, 0);
  assert.equal(f.current.get(path), proof.generation);
});
test('recreated generation or changed metadata after confirmation is protected', async () => {
  for (const recreate of [true, false]) {
    const f = setup(),
      proof = await f.api.stage(c, bytes);
    if (recreate) {
      const v = f.version(path);
      f.put(path, v.bytes, v.metadata);
    } else f.mutate(path, (m) => (m.metadata.extra = 'foreign mutation'));
    const current = f.current.get(path);
    await assert.rejects(() => f.api.fence(c, proof));
    assert.equal(f.current.get(path), current);
    assert.deepEqual(f.version(path).bytes, bytes);
  }
});
test('the adapter verifies stored bytes and refuses token-bearing or changed metadata', async () => {
  const f = setup();
  await f.api.stage(c, bytes);
  f.version(path).bytes[0] ^= 1;
  await assert.rejects(() => f.api.stage(c, bytes));
  const g = setup(),
    proof = await g.api.stage(c, bytes);
  g.mutate(path, (m) => (m.metadata.firebaseStorageDownloadTokens = 'unexpected'));
  await assert.rejects(() => g.api.verify(c, proof));
  await assert.rejects(() => g.api.fence(c, proof));
});
test('closed context and generation proofs reject unsafe identities before I/O', async () => {
  const f = setup();
  for (const change of [
    (v) => (v.ownerId = '../other'),
    (v) => (v.path = 'outside'),
    (v) => (v.imageId = 'old'),
    (v) => (v.byteLength = 0),
  ]) {
    const value = structuredClone(c);
    change(value);
    await assert.rejects(() => f.api.stage(value, bytes));
  }
  await assert.rejects(() => f.api.verify(c, { generation: 1, metageneration: '1' }));
  assert.equal(f.events.length, 0);
});
