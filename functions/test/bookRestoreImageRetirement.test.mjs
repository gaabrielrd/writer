import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
import { bookRestoreStorageWire } from './helpers/bookRestoreStorageWire.mjs';
const bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex'),
  c = {
    ownerId: 'author',
    restoreId: 'retired-image-restore-0001',
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
test('retires the exact accepted generation to a permanent private empty marker and removes its versioned payload', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes),
    active = await f.api.accept(c, proof),
    retired = await f.api.retire(c, proof, active.proof),
    v = f.version(path);
  assert.ok(BigInt(proof.generation) > BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(v.bytes.length, 0);
  assert.equal(v.metadata.metadata.restoreState, 'retired');
  assert.equal(v.metadata.metadata.accepted, 'false');
  assert.equal(v.metadata.metadata.firebaseStorageDownloadTokens, undefined);
  assert.equal(v.metadata.cacheControl, 'private, no-store');
  assert.equal(v.metadata.contentType, 'application/octet-stream');
  assert.equal(v.metadata.metadata.preparedGeneration, proof.generation);
  assert.equal(f.versions.get(path).size, 1);
  assert.notEqual(retired.generation, proof.generation);
  const at = f.events.length;
  assert.deepEqual(await f.api.retire(c, proof, active.proof), retired);
  assert.equal(
    f.events.slice(at).some((e) => ['save', 'patch', 'delete'].includes(e.method)),
    false,
  );
  for (const call of [
    () => f.api.stage(c, bytes),
    () => f.api.verify(c, proof),
    () => f.api.accept(c, proof),
    () => f.api.fence(c),
  ])
    await assert.rejects(call);
  assert.equal(f.current.get(path), retired.generation);
  const deleted = f.events.find((e) => e.method === 'delete');
  assert.deepEqual(deleted.options.preconditionOpts, {
    ifGenerationMatch: active.proof.generation,
    ifMetagenerationMatch: active.proof.metageneration,
  });
});
test('retirement also closes prepared and missing paths without accepting or creating a public image', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes),
    prepared = await f.api.retire(c, proof);
  assert.equal(f.version(path).bytes.length, 0);
  assert.deepEqual(await f.api.retire(c, proof), prepared);
  const g = setup(),
    old = await g.api.stage(c, bytes);
  await g.bucket().file(path).delete({ ignoreNotFound: true });
  const missing = await g.api.retire(c, old);
  assert.equal(g.version(path).bytes.length, 0);
  assert.deepEqual(await g.api.retire(c, proof), missing);
  await assert.rejects(() => g.api.stage(c, bytes));
});
test('lost retirement response is resumed from the same marker before deleting only its known old version', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes);
  await f.api.accept(c, proof);
  let once = true;
  f.hooks.afterSave = (_path, v) => {
    if (v.bytes.length === 0 && once) {
      once = false;
      throw Error('lost retirement ACK');
    }
  };
  await assert.rejects(() => f.api.retire(c, proof), /lost retirement ACK/);
  const marker = f.current.get(path);
  assert.equal(f.versions.get(path).size, 2);
  assert.deepEqual(await f.api.retire(c, proof), { generation: marker, metageneration: '1' });
  assert.equal(f.versions.get(path).size, 1);
});
test('late duplicate upload after another request accepts and removes the image cannot recreate bytes', async () => {
  const f = setup();
  let enter,
    release,
    once = true;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  f.hooks.beforeSave = async (_path, payload) => {
    if (payload.length && once) {
      once = false;
      enter();
      await gate;
    }
  };
  const pending = f.api.stage(c, bytes);
  await entered;
  const proof = await f.api.stage(c, bytes),
    active = await f.api.accept(c, proof);
  let marker;
  try {
    marker = await f.api.retire(c, proof, active.proof);
  } finally {
    release();
  }
  await assert.rejects(() => pending);
  assert.equal(f.current.get(path), marker.generation);
  assert.equal(f.version(path).bytes.length, 0);
  assert.equal(f.versions.get(path).size, 1);
});
test('a known acceptance PATCH racing old-version deletion is preserved on CAS conflict and removed safely on retry', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes);
  let enter,
    release,
    once = true;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  f.hooks.beforePatch = async () => {
    enter();
    await gate;
  };
  const accepting = f.api.accept(c, proof),
    rejected = assert.rejects(() => accepting);
  await entered;
  f.hooks.beforeDelete = async () => {
    if (once) {
      once = false;
      release();
      await rejected;
    }
  };
  await assert.rejects(
    () => f.api.retire(c, proof),
    (e) => e.code === 412,
  );
  assert.equal(f.version(path).bytes.length, 0);
  assert.equal(f.versions.get(path).size, 2);
  const retired = await f.api.retire(c, proof);
  assert.equal(f.versions.get(path).size, 1);
  assert.equal(f.current.get(path), retired.generation);
});
for (const kind of ['foreign', 'recreated', 'metadata', 'wrong-proof', 'wrong-published'])
  test(
    'retirement preserves ' + kind + ' Storage data without replacing or deleting it',
    async () => {
      const f = setup(),
        proof = await f.api.stage(c, bytes),
        active = await f.api.accept(c, proof);
      let base = proof,
        published = active.proof;
      if (kind === 'foreign') f.put(path, bytes, { metadata: { ownerId: 'foreign' } });
      if (kind === 'recreated') {
        const v = f.version(path);
        f.put(path, v.bytes, v.metadata);
      }
      if (kind === 'metadata') f.mutate(path, (m) => (m.metadata.extra = 'foreign'));
      if (kind === 'wrong-proof') base = { ...proof, metageneration: '8' };
      if (kind === 'wrong-published') published = { ...active.proof, metageneration: '8' };
      const before = structuredClone(f.version(path)),
        at = f.events.length;
      await assert.rejects(() => f.api.retire(c, base, published));
      assert.deepEqual(f.version(path).bytes, Buffer.from(before.bytes));
      assert.deepEqual(f.version(path).metadata, before.metadata);
      assert.equal(
        f.events.slice(at).some((e) => ['save', 'delete', 'patch'].includes(e.method)),
        false,
      );
    },
  );
test('changed original metadata at DELETE never deletes the uncertain old version or the permanent marker', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes);
  await f.api.accept(c, proof);
  f.hooks.beforeDelete = () => {
    const old = f.version(path, proof.generation);
    old.metadata.metadata.extra = 'foreign';
    old.metadata.metageneration = '3';
  };
  await assert.rejects(
    () => f.api.retire(c, proof),
    (e) => e.code === 412,
  );
  f.hooks.beforeDelete = null;
  const marker = f.current.get(path);
  await assert.rejects(() => f.api.retire(c, proof));
  assert.equal(f.current.get(path), marker);
  assert.deepEqual(f.version(path, proof.generation).bytes, bytes);
});
test('real GCS SDK retires an active image using exact decimal CAS and version deletion including metageneration', async (t) => {
  const f = await bookRestoreStorageWire(t),
    proof = await f.api.stage(c, bytes);
  f.current.get(path).metageneration = '9007199254741007';
  const base = { ...proof, metageneration: f.current.get(path).metageneration },
    active = await f.api.accept(c, base),
    retired = await f.api.retire(c, base, active.proof),
    writes = f.requests.filter((r) => r.method === 'POST'),
    deleted = f.requests.find((r) => r.method === 'DELETE');
  assert.equal(writes.at(-1).qs.ifGenerationMatch, active.proof.generation);
  assert.equal(writes.at(-1).qs.ifMetagenerationMatch, active.proof.metageneration);
  assert.equal(deleted.qs.generation, active.proof.generation);
  assert.equal(deleted.qs.ifGenerationMatch, active.proof.generation);
  assert.equal(deleted.qs.ifMetagenerationMatch, active.proof.metageneration);
  assert.equal(f.current.get(path).bytes.length, 0);
  assert.equal(f.current.get(path).metadata.firebaseStorageDownloadTokens, undefined);
  assert.equal(f.versions.get(path).size, 1);
  assert.deepEqual(await f.api.retire(c, base, active.proof), retired);
});
test('real SDK delayed create receives HTTP 412 after retirement of an accepted version', async (t) => {
  const f = await bookRestoreStorageWire(t);
  let enter,
    release,
    once = true;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  f.hooks.beforeCommit = async (data) => {
    if (data.length && once) {
      once = false;
      enter();
      await gate;
    }
  };
  const pending = f.api.stage(c, bytes),
    rejected = assert.rejects(() => pending);
  await entered;
  const proof = await f.api.stage(c, bytes);
  await f.api.accept(c, proof);
  try {
    await f.api.retire(c, proof);
  } finally {
    release();
  }
  await rejected;
  assert.equal(f.current.get(path).bytes.length, 0);
  assert.equal(f.versions.get(path).size, 1);
});
