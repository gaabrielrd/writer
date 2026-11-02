import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
import { bookRestoreStorageWire as wire } from './helpers/bookRestoreStorageWire.mjs';
const bytes = Buffer.from('private exact cover bytes'),
  c = {
    ownerId: 'author',
    restoreId: 'media-restore-001',
    jobToken: 'a'.repeat(64),
    imageId: 'restore-' + 'b'.repeat(64),
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
  },
  path = 'book-covers/' + c.ownerId + '/' + c.imageId + '.png';
const setup = () => {
  const f = bookRestoreStorageBucket();
  return { ...f, api: createBookRestoreCoverStorage(f.bucket) };
};
test('acceptance patches only metadata at the exact prepared generation and retains a stable download URL', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes),
    before = Buffer.from(f.version(path).bytes),
    result = await f.api.accept(c, proof),
    after = f.version(path);
  assert.deepEqual(after.bytes, before);
  assert.equal(result.proof.generation, proof.generation);
  assert.equal(result.proof.metageneration, String(BigInt(proof.metageneration) + 1n));
  assert.equal(after.metadata.metadata.accepted, 'true');
  assert.equal(after.metadata.metadata.restoreState, 'active');
  assert.match(
    result.url,
    /^https:\/\/firebasestorage.googleapis.com\/v0\/b\/demo-restore-memory\/o\//,
  );
  const patch = f.events.find((e) => e.method === 'patch');
  assert.equal(patch.options.generation, proof.generation);
  assert.deepEqual(patch.options.preconditionOpts, {
    ifGenerationMatch: proof.generation,
    ifMetagenerationMatch: proof.metageneration,
  });
  assert.deepEqual(await f.api.accept(c, proof), result);
  assert.equal(f.events.filter((e) => e.method === 'patch').length, 1);
  await assert.rejects(() => f.api.fence(c, proof));
  await assert.rejects(() => f.api.stage(c, bytes));
  await assert.rejects(() => f.api.verify(c, proof));
  assert.deepEqual(f.version(path).bytes, before);
});
test('lost acceptance response is recovered without replacing the token or rewriting bytes', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes);
  f.hooks.afterPatch = () => {
    throw Error('response lost after PATCH');
  };
  await assert.rejects(() => f.api.accept(c, proof), /response lost/);
  const token = f.version(path).metadata.metadata.firebaseStorageDownloadTokens;
  f.hooks.afterPatch = null;
  const result = await f.api.accept(c, proof);
  assert.ok(result.url.endsWith(token));
  assert.equal(f.events.filter((e) => e.method === 'patch').length, 1);
  assert.equal(f.versions.get(path).size, 1);
});
for (const kind of ['foreign', 'fence', 'recreated', 'metadata', 'token'])
  test('acceptance refuses ' + kind + ' Storage state and preserves uncertain data', async () => {
    const f = setup(),
      proof = await f.api.stage(c, bytes);
    if (kind === 'foreign') f.put(path, bytes, { metadata: { ownerId: 'foreign' } });
    if (kind === 'fence') await f.api.fence(c, proof);
    if (kind === 'recreated') {
      const v = f.version(path);
      f.put(path, v.bytes, v.metadata);
    }
    if (kind === 'metadata') f.mutate(path, (m) => (m.metadata.extra = 'foreign'));
    if (kind === 'token')
      f.mutate(path, (m) => (m.metadata.firebaseStorageDownloadTokens = 'premature'));
    const before = structuredClone(f.version(path)),
      at = f.events.length;
    await assert.rejects(() => f.api.accept(c, proof));
    assert.deepEqual(f.version(path).bytes, Buffer.from(before.bytes));
    assert.deepEqual(f.version(path).metadata, before.metadata);
    assert.equal(
      f.events.slice(at).some((e) => e.method === 'patch'),
      false,
    );
  });
test('metadata changing while PATCH is in flight receives a conditional failure and is preserved', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes);
  f.hooks.beforePatch = () => f.mutate(path, (m) => (m.metadata.extra = 'concurrent'));
  await assert.rejects(() => f.api.accept(c, proof));
  assert.equal(f.version(path).metadata.metadata.accepted, 'false');
  assert.equal(f.version(path).metadata.metadata.extra, 'concurrent');
});
test('accepted metadata changed or token replaced after completion cannot be adopted', async () => {
  const f = setup(),
    proof = await f.api.stage(c, bytes);
  await f.api.accept(c, proof);
  f.mutate(
    path,
    (m) => (m.metadata.firebaseStorageDownloadTokens = '00000000-0000-4000-8000-000000000000'),
  );
  await assert.rejects(() => f.api.accept(c, proof));
});
test('real GCS SDK PATCH sends both decimal preconditions and preserves the native generation', async (t) => {
  const f = await wire(t),
    prepared = await f.api.stage(c, bytes);
  f.current.get(path).metageneration = '9007199254741007';
  const proof = { ...prepared, metageneration: f.current.get(path).metageneration },
    result = await f.api.accept(c, proof),
    patch = f.requests.find((r) => r.method === 'PATCH');
  assert.ok(BigInt(proof.generation) > BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(patch.qs.generation, proof.generation);
  assert.equal(patch.qs.ifGenerationMatch, proof.generation);
  assert.equal(patch.qs.ifMetagenerationMatch, proof.metageneration);
  assert.equal(result.proof.generation, proof.generation);
  assert.deepEqual(f.current.get(path).bytes, bytes);
  assert.deepEqual(await f.api.accept(c, proof), result);
  assert.equal(f.requests.filter((r) => r.method === 'PATCH').length, 1);
});
test('real GCS SDK recovers a committed PATCH followed by HTTP failure using its original token', async (t) => {
  const f = await wire(t),
    proof = await f.api.stage(c, bytes);
  f.hooks.afterPatch = () => {
    throw Error('committed then response failed');
  };
  await assert.rejects(() => f.api.accept(c, proof));
  const token = f.current.get(path).metadata.firebaseStorageDownloadTokens;
  f.hooks.afterPatch = null;
  assert.ok((await f.api.accept(c, proof)).url.endsWith(token));
  assert.equal(f.requests.filter((r) => r.method === 'PATCH').length, 1);
});
test('real GCS SDK refuses HTTP 412 from a concurrent metageneration update', async (t) => {
  const f = await wire(t),
    proof = await f.api.stage(c, bytes);
  f.hooks.beforePatch = (v) => {
    v.metageneration = String(BigInt(v.metageneration) + 1n);
    v.metadata.extra = 'foreign';
  };
  await assert.rejects(() => f.api.accept(c, proof));
  assert.equal(f.current.get(path).metadata.accepted, 'false');
  assert.equal(f.current.get(path).metadata.extra, 'foreign');
});
