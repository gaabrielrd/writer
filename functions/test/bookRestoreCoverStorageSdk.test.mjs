import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { bookRestoreStorageWire as wire } from './helpers/bookRestoreStorageWire.mjs';
const bytes = Buffer.from('SDK wire exact private bytes'),
  c = {
    ownerId: 'author',
    restoreId: 'sdk-wire-restore01',
    jobToken: 'a'.repeat(64),
    imageId: 'restore-' + 'b'.repeat(64),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  },
  path = 'book-covers/' + c.ownerId + '/' + c.imageId + '.png';

test('real GCS SDK sends exact create, read and version-delete preconditions without rounding generation', async (t) => {
  const f = await wire(t),
    proof = await f.api.stage(c, bytes);
  assert.ok(BigInt(proof.generation) > BigInt(Number.MAX_SAFE_INTEGER));
  assert.deepEqual(await f.api.stage(c, bytes), proof);
  const fence = await f.api.fence(c, proof);
  assert.equal(f.current.get(path).bytes.length, 0);
  assert.equal(f.versions.get(path).size, 1);
  assert.equal(f.current.get(path).generation, fence.generation);
  const writes = f.requests.filter((r) => r.method === 'POST'),
    read = f.requests.find((r) => r.qs.alt === 'media'),
    deletion = f.requests.find((r) => r.method === 'DELETE');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].qs.ifGenerationMatch, '0');
  assert.equal(writes[1].qs.ifGenerationMatch, proof.generation);
  assert.equal(writes[1].qs.ifMetagenerationMatch, proof.metageneration);
  assert.equal(read.qs.generation, proof.generation);
  assert.equal(deletion.qs.generation, proof.generation);
  assert.equal(deletion.qs.ifGenerationMatch, proof.generation);
  await assert.rejects(() => f.api.stage(c, bytes));
  assert.equal(f.current.get(path).bytes.length, 0);
});
test('real SDK receives HTTP 412 when a delayed create reaches Storage after the cancellation fence', async (t) => {
  const f = await wire(t);
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  f.hooks.beforeCommit = async (data) => {
    if (data.length) {
      enter();
      await gate;
    }
  };
  const pending = f.api.stage(c, bytes);
  await entered;
  try {
    await f.api.fence(c);
  } finally {
    release();
  }
  await assert.rejects(() => pending);
  assert.equal(f.current.get(path).bytes.length, 0);
  assert.equal(f.versions.get(path).size, 1);
  assert.equal(f.requests.filter((r) => r.method === 'POST').length, 2);
});
