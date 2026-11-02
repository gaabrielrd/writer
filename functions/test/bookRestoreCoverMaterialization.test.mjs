import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { BOOK_RESTORE_METHODS, preparationProgress } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
import {
  coverRestoreFixture,
  readyRestoreCover,
  finishRestoreCover,
} from './helpers/bookRestoreCoverFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'materialize-cover-001',
  root = 'users/' + uid + '/bookRestores/' + id,
  png = await sharp({
    create: { width: 3, height: 4, channels: 4, background: { r: 30, g: 60, b: 90, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    storage = bookRestoreStorageBucket(),
    assets = createBookRestoreCoverStorage(storage.bucket),
    factory = () =>
      createBookRestoreUploadService({ db: f.db, restoreAssets: assets, now: () => 1000 });
  return { ...f, storage, assets, factory, api: factory() };
}
async function ready(f, options = { bytes: png }) {
  const p = await finishRestoreCover(
    f.factory,
    uid,
    id,
    await readyRestoreCover(f.factory, uid, id, coverRestoreFixture(options)),
  );
  return (await f.api.reserveBookRestoreCover(uid, mutation(id, p, 'reserve-cover-0001'))).progress;
}
const materialize = (f, p, operationId = 'materialize-cover-0001') =>
  f.api.materializeBookRestoreCover(uid, mutation(id, p, operationId));
const path = (p) => 'book-covers/' + uid + '/' + p.preparation.cover.imageId + '.png';
test('durable native intent and inventory v13 precede all Storage I/O', async () => {
  const f = setup(),
    p = await ready(f),
    value = f.records.get(root + '/preparedCoverStorage/current');
  assert.equal(p.preparation.schemaVersion, 10);
  assert.equal(f.records.get(root).cleanupVersion, 13);
  assert.equal(value.state, 'reserved');
  assert.equal(value.storage, null);
  assert.equal(f.storage.events.length, 0);
  assert.equal(BOOK_RESTORE_METHODS.includes('reserveBookRestoreCover'), true);
  assert.equal(BOOK_RESTORE_METHODS.includes('materializeBookRestoreCover'), true);
});
test('materialization preserves exact valid PNG bytes and metadata without root/library/token exposure', async () => {
  const f = setup(),
    p = await ready(f),
    result = await materialize(f, p),
    v = f.storage.version(path(p)),
    intent = f.records.get(root + '/preparedCoverStorage/current');
  assert.equal(result.progress.preparation.phase, 'personas-integrate');
  assert.equal(result.progress.preparation.itemIndex, p.preparation.itemIndex);
  assert.deepEqual(v.bytes, png);
  assert.equal((await sharp(v.bytes).metadata()).width, 3);
  assert.equal(intent.cover.name, '\ufeff  Capa 🌙  ');
  assert.equal(intent.cover.createdAt, 3);
  assert.equal(intent.cover.updatedAt, 7);
  assert.equal(intent.state, 'prepared');
  assert.equal(v.metadata.metadata.accepted, 'false');
  assert.deepEqual(intent.storage, result.progress.preparation.coverStorage.proof);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('users/' + uid + '/imageLibrary/')),
    false,
  );
  const count = f.storage.events.length;
  assert.deepEqual(await materialize(f, p), result);
  assert.equal(f.storage.events.length, count);
});
for (const kind of ['none', 'legacy-unavailable'])
  test(kind + ' materializes without Storage and cleans every native artifact', async () => {
    const f = setup(),
      p = await ready(f, { kind }),
      done = (await materialize(f, p)).progress,
      cancelled = await cleanupLegacyRestore(f.api, uid, id, done, { limit: 5 });
    assert.equal(done.preparation.phase, 'personas-integrate');
    assert.equal(done.preparation.coverStorage.proof, null);
    assert.equal(cancelled.state, 'cancelled');
    assert.deepEqual(cancelled.preparation.coverStorage.fence, { kind: 'none' });
    assert.equal(f.storage.events.length, 0);
    assert.equal(f.records.has(root + '/preparedCoverStorage/current'), false);
  });
test('a lost upload response resumes the existing exact object without duplication', async () => {
  const f = setup(),
    p = await ready(f),
    before = structuredClone([...f.records]);
  let lost = false;
  f.storage.hooks.afterSave = (_path, v) => {
    if (v.bytes.length && !lost) {
      lost = true;
      throw new Error('lost upload response');
    }
  };
  await assert.rejects(() => materialize(f, p), /lost upload response/);
  assert.deepEqual([...f.records], before);
  const generation = f.storage.current.get(path(p)),
    done = (await materialize(f, p)).progress;
  assert.equal(done.preparation.coverStorage.proof.generation, generation);
  assert.equal(f.storage.versions.get(path(p)).size, 1);
});
test('invalid PNG pixels fail before Storage I/O and preserve the reserved preparation', async () => {
  const f = setup(),
    bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(80)]),
    p = await ready(f, { bytes }),
    before = structuredClone([...f.records]);
  await assert.rejects(() => materialize(f, p));
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, 0);
  const done = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal(f.storage.version(path(p)).bytes.length, 0);
});
test('cancellation after object creation prevents confirmation and cleans the unacknowledged object', async () => {
  const f = setup(),
    p = await ready(f),
    stage = f.assets.stage;
  f.assets.stage = async (...args) => {
    const result = await stage(...args);
    await f.api.cancelBookRestore(uid, mutation(id, p, 'cancel-after-upload01'));
    return result;
  };
  await assert.rejects(() => materialize(f, p));
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/materialize-cover-0001'),
    false,
  );
  const current = await f.api.getBookRestore(uid, { restoreId: id, jobToken: p.jobToken });
  const done = await cleanupLegacyRestore(f.api, uid, id, current, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal(f.storage.version(path(p)).bytes.length, 0);
  assert.equal(f.storage.versions.get(path(p)).size, 1);
});
test('late conditional upload cannot recreate bytes after complete cancellation and native cleanup', async () => {
  const f = setup(),
    p = await ready(f);
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  f.storage.hooks.beforeSave = async (_path, bytes) => {
    if (bytes.length) {
      enter();
      await gate;
    }
  };
  const pending = materialize(f, p);
  await entered;
  const done = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 5 });
  release();
  await assert.rejects(() => pending);
  assert.equal(done.state, 'cancelled');
  assert.equal(f.storage.version(path(p)).bytes.length, 0);
  assert.equal(f.records.has(root + '/preparedCoverChunks/000000000000000'), false);
  assert.equal(f.records.has(root + '/preparedCoverStorage/current'), false);
});
test('confirmed native generation recreated with identical metadata is preserved by cleanup', async () => {
  const f = setup(),
    p = await ready(f),
    done = (await materialize(f, p)).progress,
    v = f.storage.version(path(p));
  f.storage.put(path(p), v.bytes, v.metadata);
  const newGeneration = f.storage.current.get(path(p));
  const cancelled = (
    await f.api.cancelBookRestore(uid, mutation(id, done, 'cancel-recreated-image01'))
  ).progress;
  await assert.rejects(() =>
    f.api.advanceBookRestoreCleanup(uid, {
      ...mutation(id, cancelled, 'cleanup-recreated-image01'),
      limit: 5,
    }),
  );
  assert.equal(f.storage.current.get(path(p)), newGeneration);
  assert.deepEqual(f.storage.version(path(p)).bytes, png);
  assert.equal(f.records.get(root).cleanupPhase, 'cover-storage');
  assert.equal(f.records.has(root + '/preparedCoverStorage/current'), true);
});
test('CAS allows one materializer and old receipts remain replayable after full cleanup', async () => {
  const f = setup(),
    p = await ready(f),
    a = mutation(id, p, 'materialize-race-one01'),
    b = mutation(id, p, 'materialize-race-two01'),
    results = await Promise.allSettled([
      f.api.materializeBookRestoreCover(uid, a),
      f.factory().materializeBookRestoreCover(uid, b),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const won = results[0].status === 'fulfilled' ? a : b,
    result = results.find((r) => r.status === 'fulfilled').value;
  const done = await cleanupLegacyRestore(f.api, uid, id, result.progress, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  const events = f.storage.events.length;
  assert.deepEqual((await f.api.materializeBookRestoreCover(uid, won)).receipt, result.receipt);
  assert.equal(f.storage.events.length, events);
});
test('foreign native intent prevents inventory migration before any Storage write', async () => {
  const f = setup(),
    p = await finishRestoreCover(
      f.factory,
      uid,
      id,
      await readyRestoreCover(f.factory, uid, id, coverRestoreFixture({ bytes: png })),
    );
  f.records.set(root + '/preparedCoverStorage/foreign', { keep: true });
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.api.reserveBookRestoreCover(uid, mutation(id, p, 'reserve-occupied-cover01')),
  );
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, 0);
  assert.equal(f.records.get(root).cleanupVersion, 12);
});
test('closed progress rejects forged proof, field, phase and missing fence', async () => {
  const f = setup(),
    p = await ready(f);
  for (const change of [
    (v) => (v.coverStorage.path = 'outside'),
    (v) => (v.coverStorage.proof = { generation: '1', metageneration: '1' }),
    (v) => (v.phase = 'personas-integrate'),
    (v) => (v.coverStorage.fence = { generation: '0', metageneration: '1' }),
  ]) {
    const v = structuredClone(p.preparation);
    change(v);
    assert.throws(() => preparationProgress(v));
  }
});
