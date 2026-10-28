import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  imageStorageFixture,
  storageRequest,
  storageRows,
  storageStep,
  finishImageStorage,
} from './helpers/adventureRestoreImageStorageFixture.mjs';
import { cleanup, mutation } from './helpers/adventureRestoreTransferFixture.mjs';
import { createAdventureRestoreTransferService } from '../src/adventureRestoreTransfer.mjs';
const privatePath = (f, id) => 'book-covers/' + f.uid + '/' + id + '.png';
test('durable image intent precedes every Storage write and exact PNG stays private without activating root or library', async () => {
  const { f, p } = await imageStorageFixture(),
    before = structuredClone([...f.records].filter(([k]) => k.startsWith('adventures/'))),
    reserved = await storageStep(f, p),
    [[intentPath, intent]] = storageRows(f);
  assert.equal(reserved.staging.storagePending, true);
  assert.equal(reserved.staging.storageIntents, 1);
  assert.equal(intent.state, 'reserved');
  assert.equal(f.storage.events.length, 0);
  assert.equal(reserved.staging.artifactCount, p.staging.artifactCount + 1);
  const prepared = await storageStep(f, reserved),
    id = intent.asset.imageId,
    path = privatePath(f, id);
  assert.equal(prepared.staging.storagePrepared, 1);
  assert.equal(prepared.staging.storagePending, false);
  assert.equal(f.records.get(intentPath).state, 'prepared');
  assert.deepEqual(f.storage.version(path).bytes, f.png);
  assert.equal(f.storage.version(path).metadata.metadata.accepted, 'false');
  assert.equal(f.storage.version(path).metadata.metadata.firebaseStorageDownloadTokens, undefined);
  assert.equal(f.storage.version(path).metadata.cacheControl, 'private, no-store');
  const end = await finishImageStorage(f, prepared);
  assert.equal(end.staging.phase, 'image-storage-ready');
  assert.equal(end.staging.storageBindings, 1);
  assert.deepEqual(
    [...f.records].filter(([k]) => k.startsWith('adventures/')),
    before,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.includes('/imageLibrary/')),
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(end.staging),
    /image-storage-[a-f0-9]|"(?:storageAssetId|storageIndex|storageFenceAfter|sourceIndex)"|PRIVATE_|generation/,
  );
});
test('null bindings finish without intent, adapter I/O or synthetic media', async () => {
  const { f, p } = await imageStorageFixture({ nullImage: true }),
    end = await finishImageStorage(f, p);
  assert.equal(end.staging.storageBindings, 1);
  assert.equal(end.staging.storageIntents, 0);
  assert.equal(end.staging.storagePrepared, 0);
  assert.equal(storageRows(f).length, 0);
  assert.equal(f.storage.events.length, 0);
  assert.equal((await cleanup(f, end, 50)).state, 'cancelled');
});
test('same operation replays reserve and upload before any additional Storage call or duplicate counters', async () => {
  const { f, p } = await imageStorageFixture(),
    input = storageRequest(p),
    [a, b] = await Promise.all([
      f.api.advanceAdventureRestoreImageStorage(f.uid, input),
      f.api.advanceAdventureRestoreImageStorage(f.uid, input),
    ]);
  assert.deepEqual(a, b);
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreImageStorage(f.uid, mutation(p, 'other-storage-operation')),
  );
  const upload = storageRequest(a.progress),
    one = await f.api.advanceAdventureRestoreImageStorage(f.uid, upload),
    at = f.storage.events.length,
    again = await f.api.advanceAdventureRestoreImageStorage(f.uid, upload);
  assert.deepEqual(again, one);
  assert.equal(f.storage.events.length, at);
  assert.equal(storageRows(f).length, 1);
  assert.equal(one.progress.staging.storagePrepared, 1);
});
test('lost Storage ACK leaves the reserved intent and resumes at the same private generation without rewriting bytes', async () => {
  const { f, p } = await imageStorageFixture(),
    reserved = await storageStep(f, p),
    input = storageRequest(reserved);
  let once = true;
  f.storage.hooks.afterSave = (_path, v) => {
    if (v.bytes.length && once) {
      once = false;
      throw Error('lost image ACK');
    }
  };
  await assert.rejects(
    () => f.api.advanceAdventureRestoreImageStorage(f.uid, input),
    /lost image ACK/,
  );
  assert.equal(storageRows(f)[0][1].state, 'reserved');
  const marker = [...f.storage.current.values()][0];
  const answer = await f.api.advanceAdventureRestoreImageStorage(f.uid, input);
  assert.equal(answer.progress.staging.storagePrepared, 1);
  assert.equal([...f.storage.current.values()][0], marker);
  assert.equal(f.storage.events.filter((e) => e.method === 'save').length, 1);
});
test('final Firestore rollback keeps the durable intent and retries the existing verified private image', async () => {
  const { f, p } = await imageStorageFixture(),
    reserved = await storageStep(f, p),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db),
    error = Error('image ACK rollback');
  let once = true;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        update(ref, v) {
          if (ref.path === f.path && v.staging?.storagePrepared === 1 && once) {
            once = false;
            throw error;
          }
          return tx.update(ref, v);
        },
      }),
    );
  await assert.rejects(
    () => storageStep(f, reserved),
    (e) => e === error,
  );
  assert.deepEqual([...f.records], before);
  const generation = [...f.storage.current.values()][0],
    prepared = await storageStep(f, reserved);
  assert.equal(prepared.staging.storagePrepared, 1);
  assert.equal([...f.storage.current.values()][0], generation);
});
test('cleanup revokes personas then fences the private image before deleting any source, descriptor or frame', async () => {
  const { f, p } = await imageStorageFixture(),
    end = await finishImageStorage(f, p),
    chunks = [...f.records].filter(([k]) => k.startsWith(f.path + '/chunks/')),
    cancelling = (await f.api.cancelAdventureRestore(f.uid, mutation(end, 'storage-cancel-0001')))
      .progress,
    revoked = (
      await f.api.advanceAdventureRestoreCleanup(
        f.uid,
        mutation(cancelling, 'storage-revoke-0001', { limit: 50 }),
      )
    ).progress;
  assert.equal(revoked.staging.personaLibraryRevoked, true);
  assert.equal(revoked.staging.storageFenced, 0);
  const fenced = (
      await f.api.advanceAdventureRestoreCleanup(
        f.uid,
        mutation(revoked, 'storage-fence-0001', { limit: 50 }),
      )
    ).progress,
    value = storageRows(f)[0][1],
    path = privatePath(f, value.asset.imageId);
  assert.equal(fenced.staging.storageFenced, 1);
  assert.equal(fenced.cleanupPhase, cancelling.cleanupPhase);
  assert.equal(value.state, 'fenced');
  assert.equal(f.storage.version(path).bytes.length, 0);
  for (const [k, v] of chunks) assert.deepEqual(f.records.get(k), v);
  const cancelled = await cleanup(f, fenced, 50),
    generation = f.storage.current.get(path);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(f.storage.version(path).bytes.length, 0);
  assert.equal(f.storage.versions.get(path).size, 1);
  assert.equal(f.storage.current.get(path), generation);
});
for (const pause of ['before', 'after'])
  test(
    'cancellation ' +
      pause +
      ' the external upload keeps a permanent fence that rejects the held request',
    async () => {
      const { f, p } = await imageStorageFixture(),
        reserved = await storageStep(f, p),
        stage = f.assets.stage;
      let enter, release;
      const entered = new Promise((r) => (enter = r)),
        gate = new Promise((r) => (release = r));
      f.assets.stage = async (...args) => {
        let proof;
        if (pause === 'after') proof = await stage(...args);
        enter();
        await gate;
        return pause === 'after' ? proof : stage(...args);
      };
      const pending = storageStep(f, reserved),
        rejected = assert.rejects(() => pending);
      await entered;
      let end;
      try {
        end = await cleanup(f, reserved, 50);
      } finally {
        release();
      }
      await rejected;
      assert.equal(end.state, 'cancelled');
      const path = [...f.storage.current.keys()][0];
      assert.equal(f.storage.version(path).bytes.length, 0);
      assert.equal(f.storage.versions.get(path).size, 1);
    },
  );
test('truncated and signature-only PNGs are refused before Storage while keeping a cleanable intent', async () => {
  const valid = await sharp({
    create: { width: 20, height: 20, channels: 4, background: '#123456' },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  for (const image of [
    Buffer.from('89504e470d0a1a0a', 'hex'),
    valid.subarray(0, valid.length - 30),
  ]) {
    const { f, p } = await imageStorageFixture({ image }),
      reserved = await storageStep(f, p);
    await assert.rejects(() => storageStep(f, reserved));
    assert.equal(f.storage.events.length, 0);
    assert.equal(storageRows(f)[0][1].state, 'reserved');
    assert.equal((await cleanup(f, reserved, 50)).state, 'cancelled');
    assert.equal([...f.storage.current.keys()].length, 1);
    assert.equal(f.storage.version([...f.storage.current.keys()][0]).bytes.length, 0);
  }
});
test('missing adapter fails without publishing or consuming the reserved intent', async () => {
  const { f, p } = await imageStorageFixture(),
    reserved = await storageStep(f, p),
    api = createAdventureRestoreTransferService({ db: f.db }),
    before = structuredClone([...f.records]);
  await assert.rejects(() =>
    api.advanceAdventureRestoreImageStorage(f.uid, storageRequest(reserved)),
  );
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, 0);
});
test('a foreign Storage object blocks upload and cancellation without discarding source proofs or deleting its bytes', async () => {
  const { f, p } = await imageStorageFixture(),
    reserved = await storageStep(f, p),
    v = storageRows(f)[0][1],
    path = privatePath(f, v.asset.imageId);
  f.storage.put(path, Buffer.from('foreign'), { metadata: { ownerId: 'other' } });
  await assert.rejects(() => storageStep(f, reserved));
  await assert.rejects(() => cleanup(f, reserved, 50));
  assert.equal(f.storage.version(path).bytes.toString(), 'foreign');
  assert.ok([...f.records.keys()].some((k) => k.startsWith(f.path + '/chunks/')));
  assert.equal(f.records.get(f.path).staging.storageFenced, 0);
});

test('prepared read proofs are revalidated before external I/O after source, frame, intent or head changes', async () => {
  for (const target of ['source', 'frame', 'intent', 'head']) {
    const { f, p } = await imageStorageFixture(),
      reserved = await storageStep(f, p),
      run = f.db.runTransaction.bind(f.db);
    let injected = false;
    f.db.runTransaction = async (cb) => {
      const result = await run(cb);
      if (!injected && Array.isArray(result?.data?.bytes)) {
        injected = true;
        const path =
          target === 'source'
            ? [...f.records.keys()].find((k) => k.startsWith(f.path + '/chunks/'))
            : target === 'frame'
              ? [...f.records.keys()].find((k) =>
                  k.startsWith(f.path + '/preparedRoot/image-bytes-'),
                )
              : target === 'intent'
                ? storageRows(f)[0][0]
                : [...f.records.keys()].find(
                    (k) =>
                      k.startsWith('adventures/' + p.adventureId + '/scenes/') &&
                      k.split('/').length === 4,
                  );
        await run((tx) =>
          tx.update(
            f.db.doc(path),
            target === 'source'
              ? { chunkBase64: 'corrupt' }
              : target === 'frame'
                ? { bytes: [1] }
                : target === 'intent'
                  ? { kind: 'foreign' }
                  : { mainBlockImage: null },
          ),
        );
      }
      return result;
    };
    await assert.rejects(() => storageStep(f, reserved));
    assert.equal(injected, true);
    assert.equal(f.storage.events.length, 0);
    assert.equal(f.records.get(f.path).checkpoint, reserved.checkpoint);
  }
});
test('lost Firestore reply is resolved from its immutable receipt without another upload or byte read', async () => {
  const { f, p } = await imageStorageFixture(),
    reserved = await storageStep(f, p),
    run = f.db.runTransaction.bind(f.db),
    input = storageRequest(reserved);
  let once = true;
  f.db.runTransaction = async (cb) => {
    const result = await run(cb);
    if (once && result?.progress?.staging?.storagePrepared === 1) {
      once = false;
      throw Error('lost Firestore ACK');
    }
    return result;
  };
  await assert.rejects(
    () => f.api.advanceAdventureRestoreImageStorage(f.uid, input),
    /lost Firestore ACK/,
  );
  const at = f.storage.events.length,
    answer = await f.api.advanceAdventureRestoreImageStorage(f.uid, input);
  assert.equal(answer.progress.staging.storagePrepared, 1);
  assert.equal(f.storage.events.length, at);
  assert.equal(f.records.get(f.path).checkpoint, reserved.checkpoint + 1);
});
test('fence response loss preserves all source proofs and resumes the same permanent marker before normal cleanup', async () => {
  const { f, p } = await imageStorageFixture(),
    end = await finishImageStorage(f, p),
    cancelling = (
      await f.api.cancelAdventureRestore(f.uid, mutation(end, 'lost-fence-cancel-0001'))
    ).progress,
    revoked = (
      await f.api.advanceAdventureRestoreCleanup(
        f.uid,
        mutation(cancelling, 'lost-fence-revoke-0001', { limit: 50 }),
      )
    ).progress,
    fence = f.assets.fence,
    input = mutation(revoked, 'lost-fence-retry-0001', { limit: 50 });
  let once = true;
  f.assets.fence = async (...args) => {
    const proof = await fence(...args);
    if (once) {
      once = false;
      throw Error('lost fence ACK');
    }
    return proof;
  };
  await assert.rejects(() => f.api.advanceAdventureRestoreCleanup(f.uid, input), /lost fence ACK/);
  const generation = [...f.storage.current.values()][0];
  assert.equal(f.records.get(f.path).staging.storageFenced, 0);
  assert.ok([...f.records.keys()].some((k) => k.startsWith(f.path + '/chunks/')));
  const fenced = (await f.api.advanceAdventureRestoreCleanup(f.uid, input)).progress;
  assert.equal(fenced.staging.storageFenced, 1);
  assert.equal([...f.storage.current.values()][0], generation);
  assert.equal((await cleanup(f, fenced, 50)).state, 'cancelled');
});
test('recreated native intent or frame cannot be materialized or adopted for cleanup', async () => {
  for (const target of ['intent', 'frame']) {
    const { f, p } = await imageStorageFixture(),
      reserved = await storageStep(f, p),
      path =
        target === 'intent'
          ? storageRows(f)[0][0]
          : [...f.records.keys()].find((k) => k.startsWith(f.path + '/preparedRoot/image-bytes-')),
      value = f.records.get(path);
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => storageStep(f, reserved));
    assert.equal(f.storage.events.length, 0);
    await assert.rejects(() => cleanup(f, reserved, 50));
    assert.deepEqual(f.records.get(path), value);
  }
});
test('storage cursor, counts and identities remain private and client injections cannot alter reservations', async () => {
  const { f, p } = await imageStorageFixture(),
    input = storageRequest(p),
    before = structuredClone([...f.records]);
  for (const extra of [
    { storageIndex: 0 },
    { imageId: 'x' },
    { storagePrepared: 1 },
    { path: 'outside' },
  ])
    await assert.rejects(() =>
      f.api.advanceAdventureRestoreImageStorage(f.uid, { ...input, ...extra }),
    );
  await assert.rejects(() => f.api.advanceAdventureRestoreImageStorage('other', input));
  assert.deepEqual([...f.records], before);
  const reserved = await storageStep(f, p),
    job = f.records.get(f.path),
    { validAdventureStagingMeta, validAdventureStagingView } =
      await import('../src/adventureRestoreStagingMeta.mjs');
  for (const patch of [
    { storageIndex: 0 },
    { storagePrepared: 2 },
    { storageIntents: 0 },
    { storageAssetId: null },
    { storageFenced: 1 },
    { storagePending: false },
    { phase: 'image-bytes-ready' },
  ])
    assert.equal(
      validAdventureStagingMeta({ ...job.staging, ...patch }, job),
      false,
      JSON.stringify(patch),
    );
  assert.equal(
    validAdventureStagingView({ ...reserved.staging, storageAssetId: job.staging.storageAssetId }),
    false,
  );
});
