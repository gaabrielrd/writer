import test from 'node:test';
import assert from 'node:assert/strict';
import {
  imageFixture,
  imageRequest,
  finishImages,
  smallPNG,
} from './helpers/adventureRestoreImageFixture.mjs';
import { cleanup, mutation } from './helpers/adventureRestoreTransferFixture.mjs';
import { adventureStageArtifactId } from '../src/adventureRestoreArtifacts.mjs';
const step = async (f, p) =>
  (await f.api.advanceAdventureRestoreImages(f.uid, imageRequest(p))).progress;
const rows = (f, prefix) =>
  [...f.records].filter(([k]) => k.startsWith(f.path + '/preparedRoot/' + prefix));
test('prepares exact private PNG, explicit binding, descriptor and native journals without library, root activation or manuscript changes', async () => {
  const { f, p } = await imageFixture(),
    original = structuredClone([...f.records].filter(([k]) => k.startsWith('adventures/'))),
    end = await finishImages(f, p),
    chunks = rows(f, 'image-bytes-'),
    assets = rows(f, 'image-').filter(([k]) => /\/image-[a-f0-9]{64}$/.test(k));
  assert.equal(end.staging.imageBindings, 1);
  assert.equal(end.staging.imageAssets, 1);
  assert.equal(end.staging.imageFrames, 1);
  assert.equal(end.staging.imageBytes, smallPNG.length);
  assert.equal(end.staging.itemIndex, p.staging.itemIndex);
  assert.equal(chunks.length, 1);
  assert.deepEqual(Buffer.from(chunks[0][1].bytes), smallPNG);
  assert.equal(assets.length, 1);
  assert.equal(assets[0][1].name, 'PRIVATE_IMAGE');
  assert.equal(assets[0][1].createdAt, 100);
  assert.equal(assets[0][1].updatedAt, 200);
  assert.equal(end.staging.artifactCount, p.staging.artifactCount + 4);
  assert.deepEqual(
    [...f.records].filter(([k]) => k.startsWith('adventures/')),
    original,
  );
  assert.ok(![...f.records.keys()].some((k) => k.includes('/imageLibrary/')));
  assert.doesNotMatch(
    JSON.stringify(end.staging),
    /PRIVATE_|rawCheckpoint|imageIndex|imageStateCreated|sourceToken/,
  );
  const cancelled = await cleanup(f, end, 50);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(rows(f, '').length, 0);
});
test('null image preserves explicit absence and creates no asset, bytes or read state', async () => {
  const { f, p } = await imageFixture({ nullImage: true }),
    end = await finishImages(f, p);
  assert.equal(end.staging.imageBindings, 1);
  assert.equal(end.staging.imageAssets, 0);
  assert.equal(end.staging.imageBytes, 0);
  assert.equal(end.staging.imageFrames, 0);
  assert.equal(rows(f, 'image-binding-')[0][1].image, null);
  assert.equal(rows(f, 'image-bytes-').length, 0);
  assert.equal(rows(f, 'image-state').length, 0);
  await cleanup(f, end, 50);
});
test('multiple frames are copied one unit at a time with stable metadata index and exact bytes', async () => {
  const image = Buffer.concat([smallPNG, Buffer.alloc(131072, 77)]),
    { f, p } = await imageFixture({ image });
  let current = await step(f, p);
  const bindingCheckpoint = current.checkpoint,
    first = await step(f, current);
  assert.equal(first.staging.imagePending, true);
  assert.equal(first.staging.imageBytes, 65536);
  assert.equal(first.staging.imageAssets, 0);
  assert.equal(first.staging.imageUnits, 1);
  assert.equal(rows(f, 'image-bytes-').length, 1);
  current = await finishImages(f, first);
  assert.equal(current.staging.imageFrames, 3);
  assert.equal(current.staging.imageBytes, image.length);
  assert.equal(current.checkpoint, bindingCheckpoint + 4);
  const copied = Buffer.concat(
    rows(f, 'image-bytes-')
      .sort((a, b) => a[1].index - b[1].index)
      .map(([, v]) => Buffer.from(v.bytes)),
  );
  assert.deepEqual(copied, image);
});
test('same operation and competing checkpoint do not duplicate bytes, metadata or counters', async () => {
  const { f, p } = await imageFixture(),
    input = imageRequest(p),
    [a, b] = await Promise.all([
      f.api.advanceAdventureRestoreImages(f.uid, input),
      f.api.advanceAdventureRestoreImages(f.uid, input),
    ]);
  assert.deepEqual(a, b);
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreImages(f.uid, mutation(p, 'competing-image-operation')),
  );
  const one = await step(f, a.progress);
  assert.equal(rows(f, 'image-bytes-').length, 1);
  const reply = await f.api.advanceAdventureRestoreImages(f.uid, input);
  assert.deepEqual(reply.receipt, a.receipt);
  assert.equal(reply.progress.checkpoint, one.checkpoint);
});
test('commit failure rolls back every byte, descriptor, state, journal, receipt and counter', async () => {
  const { f, p } = await imageFixture(),
    current = await step(f, p),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction,
    error = new Error('abort-image-write');
  f.db.runTransaction = (cb) =>
    run(async (tx) => {
      const result = await cb(tx);
      if (rows(f, 'image-bytes-').length === 0 && result?.progress?.staging?.imageFrames === 1)
        throw error;
      return result;
    });
  await assert.rejects(
    () => step(f, current),
    (e) => e === error,
  );
  f.db.runTransaction = run;
  assert.deepEqual([...f.records], before);
  const end = await finishImages(f, current);
  assert.equal(end.staging.imageAssets, 1);
});
test('cancel during partial image revokes personas first and removes all prepared frames without exposing source or library', async () => {
  const { f, p } = await imageFixture({
      image: Buffer.concat([smallPNG, Buffer.alloc(70000, 65)]),
    }),
    binding = await step(f, p),
    partial = await step(f, binding),
    cancelled = await cleanup(f, partial, 2);
  assert.equal(partial.staging.imagePending, true);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(rows(f, '').length, 0);
});
test('a recreated prepared head is preserved and refuses image binding preparation', async () => {
  const { f, p } = await imageFixture(),
    key = [...f.records.keys()].find(
      (k) => k.startsWith('adventures/' + p.adventureId + '/scenes/') && k.split('/').length === 4,
    ),
    value = f.records.get(key);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(key)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(key), value));
  const before = structuredClone([...f.records]);
  await assert.rejects(() => step(f, p));
  assert.deepEqual([...f.records], before);
});
test('a recreated frame journal prevents cleanup from deleting a replacement artifact', async () => {
  const { f, p } = await imageFixture(),
    first = await step(f, await step(f, p)),
    [[path]] = rows(f, 'image-bytes-'),
    address = { scope: 'job', path: ['preparedRoot', path.split('/').at(-1)] },
    journal = f.path + '/stagingArtifacts/' + adventureStageArtifactId(address),
    value = f.records.get(journal);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(journal)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(journal), value));
  await assert.rejects(() => cleanup(f, first, 50));
  assert.ok(f.records.has(path));
});

test('empty adventure completes the image section without synthetic bindings, assets or state', async () => {
  const { transferFixture } = await import('./helpers/adventureRestoreTransferFixture.mjs'),
    { emptyAdventureArchive } = await import('./helpers/adventureRestoreArchiveFixture.mjs'),
    { prepareAdventureImages } = await import('./helpers/adventureRestoreImageFixture.mjs'),
    f = transferFixture(),
    p = await prepareAdventureImages(f.api, f.uid, await emptyAdventureArchive()),
    end = await finishImages(f, p);
  assert.equal(end.staging.imageBindings, 0);
  assert.equal(end.staging.imageAssets, 0);
  assert.equal(end.staging.imageUnits, 1);
  assert.equal(rows(f, 'image-').length, 0);
  await cleanup(f, end, 50);
});
test('closed client input and current metadata refuse injected cursors, counters, phase and another UID', async () => {
  const { f, p } = await imageFixture(),
    input = imageRequest(p);
  for (const extra of [
    { imageIndex: 1 },
    { imagePending: false },
    { imageId: 'x' },
    { bytes: [1] },
  ])
    await assert.rejects(() => f.api.advanceAdventureRestoreImages(f.uid, { ...input, ...extra }));
  await assert.rejects(() => f.api.advanceAdventureRestoreImages('other', input));
  const next = await step(f, p),
    job = f.records.get(f.path),
    { validAdventureStagingMeta, validAdventureStagingView } =
      await import('../src/adventureRestoreStagingMeta.mjs');
  for (const change of [
    { imageIndex: 0 },
    { imageUnits: 0 },
    { imageAssets: 2 },
    { imagePending: true },
    { imageStateCreated: true },
    { phase: 'persona-library-ready' },
  ])
    assert.equal(
      validAdventureStagingMeta({ ...job.staging, ...change }, job),
      false,
      JSON.stringify(change),
    );
  assert.equal(validAdventureStagingView({ ...next.staging, imageIndex: 0 }), false);
});
test('modified source bytes, prepared binding and private read state stop the next unit without partial writes', async () => {
  for (const target of ['source', 'binding', 'state']) {
    const { f, p } = await imageFixture({
      image: Buffer.concat([smallPNG, Buffer.alloc(70000, 88)]),
    });
    let current = await step(f, p);
    if (target === 'state') current = await step(f, current);
    const path =
        target === 'source'
          ? [...f.records.keys()].find((k) => k.startsWith(f.path + '/chunks/'))
          : rows(f, target === 'binding' ? 'image-binding-' : 'image-state')[0][0],
      old = f.records.get(path);
    await f.db.runTransaction((tx) =>
      tx.update(
        f.db.doc(path),
        target === 'source'
          ? { chunkBase64: 'corrupt' }
          : target === 'binding'
            ? { image: null }
            : { rawCheckpoint: { ...old.rawCheckpoint, part: 0 } },
      ),
    );
    const before = structuredClone([...f.records]);
    await assert.rejects(() => step(f, current));
    assert.deepEqual([...f.records], before);
  }
});

test('legal maximum Unicode captions and alternate text remain exact in private read state', async () => {
  const alt = '界'.repeat(1000),
    caption = '界'.repeat(4000),
    { f, p } = await imageFixture({
      alt,
      caption,
      image: Buffer.concat([smallPNG, Buffer.alloc(70000, 91)]),
    }),
    partial = await step(f, await step(f, p)),
    state = rows(f, 'image-state')[0][1];
  assert.equal(partial.staging.imagePending, true);
  assert.equal(state.binding.image.alt, alt);
  assert.equal(state.binding.image.caption, caption);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) <= 65536);
  const end = await finishImages(f, partial);
  assert.equal(end.staging.imageAssets, 1);
});

test('automatic transaction callback retry copies one frame and increments counters once', async () => {
  const { f, p } = await imageFixture(),
    at = await step(f, p),
    run = f.db.runTransaction.bind(f.db);
  let retried = false;
  f.db.runTransaction = async (cb) => {
    try {
      return await run((tx) =>
        cb({
          ...tx,
          update(ref, value) {
            if (ref.path === f.path && !retried) {
              retried = true;
              throw Error('RETRY_IMAGE');
            }
            return tx.update(ref, value);
          },
        }),
      );
    } catch (e) {
      if (e.message !== 'RETRY_IMAGE') throw e;
      return run(cb);
    }
  };
  const next = await step(f, at);
  assert.equal(retried, true);
  assert.equal(next.checkpoint, at.checkpoint + 1);
  assert.equal(next.staging.imageFrames, 1);
  assert.equal(rows(f, 'image-bytes-').length, 1);
});
test('cancellation winning during preparation prevents every new image artifact', async () => {
  const { f, p } = await imageFixture(),
    at = await step(f, p),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0,
    cancelled;
  f.db.runTransaction = async (cb) => {
    if (++calls === 2) {
      f.db.runTransaction = run;
      cancelled = (
        await f.api.cancelAdventureRestore(f.uid, mutation(at, 'image-cancel-race-0001'))
      ).progress;
    }
    return run(cb);
  };
  await assert.rejects(() => step(f, at));
  assert.equal(rows(f, 'image-bytes-').length, 0);
  assert.equal(rows(f, 'image-state').length, 0);
  assert.equal((await cleanup(f, cancelled, 50)).state, 'cancelled');
});
test('identical preexisting private frame is neither adopted nor removed during cancellation', async () => {
  const { f, p } = await imageFixture(),
    at = await step(f, p),
    binding = rows(f, 'image-binding-')[0][1],
    path = f.path + '/preparedRoot/image-bytes-' + binding.image.assetId + '-000000',
    { imageSHA } = await import('./helpers/adventureRestoreImageFixture.mjs'),
    value = {
      schemaVersion: 1,
      ownerId: f.uid,
      assetId: binding.image.assetId,
      index: 0,
      contentHash: imageSHA(smallPNG),
      bytes: Array.from(smallPNG),
    };
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  const before = structuredClone([...f.records]);
  await assert.rejects(() => step(f, at));
  assert.deepEqual([...f.records], before);
  await assert.rejects(() => cleanup(f, at, 50));
  assert.deepEqual(f.records.get(path), value);
});
