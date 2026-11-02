import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mediaFixture,
  mediaRequest,
  finishMedia,
} from './helpers/adventureRestoreMediaFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
test('a single native image becomes active with an immutable outcome and keeps the activated parent frozen', async () => {
  const { f, p, media } = await mediaFixture(),
    parent = structuredClone(f.records.get(f.path)),
    root = structuredClone(f.records.get('adventures/' + p.adventureId)),
    request = mediaRequest(p, media);
  const first = await f.api.advanceAdventureRestoreMedia(f.uid, request);
  assert.equal(first.media.ready, 1);
  assert.equal(first.media.processed, 1);
  assert.equal(first.media.complete, false);
  const image = [...f.records].find(
    ([k]) => k.startsWith('users/' + f.uid + '/imageLibrary/') && !k.includes('/uses/'),
  );
  assert.equal(image[1].state, 'active');
  assert.match(image[1].url, /^https:\/\/firebasestorage.googleapis.com/);
  assert.equal(
    image[1].restoreStorage.publishedProof.generation,
    image[1].restoreStorage.proof.generation,
  );
  const after = structuredClone([...f.records]),
    io = f.storage.events.length;
  assert.deepEqual(await f.api.advanceAdventureRestoreMedia(f.uid, request), first);
  assert.equal(f.storage.events.length, io);
  assert.deepEqual([...f.records], after);
  const done = await finishMedia(f, p, first.media);
  assert.equal(done.complete, true);
  assert.equal(done.checkpoint, 2);
  assert.deepEqual(f.records.get(f.path), parent);
  assert.deepEqual(f.records.get('adventures/' + p.adventureId), root);
  assert.equal(f.storage.events.filter((e) => e.method === 'patch').length, 1);
});
test('zero images complete by an empty unit without a Storage adapter or fabricated outcomes', async () => {
  const { f, p, media } = await mediaFixture(await emptyAdventureArchive());
  const done = await finishMedia(f, p, media);
  assert.equal(done.total, 0);
  assert.equal(done.complete, true);
  assert.equal(done.checkpoint, 1);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(f.path + '/activationMediaItems/')),
    false,
  );
});

const imageEntry = (f) =>
  [...f.records].find(
    ([k]) => k.startsWith('users/' + f.uid + '/imageLibrary/') && !k.includes('/uses/'),
  );
async function detach(f, p) {
  const { createAdventureBlocksService } = await import('../src/adventureBlocks.mjs');
  const [path] = imageEntry(f),
    [, usage] = [...f.records].find(([k]) => k.startsWith(path + '/uses/')),
    resource = usage.resource,
    head = f.records.get(
      'adventures/' +
        p.adventureId +
        '/' +
        (resource.kind === 'scene' ? 'scenes/' : 'sceneBlocks/') +
        resource.id,
    );
  await createAdventureBlocksService({ db: f.db, now: () => 9000 }).setAdventureBlockImage(f.uid, {
    adventureId: p.adventureId,
    resource,
    operationId: 'native-detach-before-media-0001',
    expectedRevision: head.revision,
    image: null,
  });
  return path;
}
test('a real authoring detach is preserved while its own library copy becomes usable independently', async () => {
  const { f, p, media } = await mediaFixture(),
    path = await detach(f, p),
    before = structuredClone([...f.records].filter(([k]) => k.startsWith('adventures/')));
  assert.equal(f.records.get(path).useCount, 0);
  await finishMedia(f, p, media);
  assert.equal(f.records.get(path).state, 'active');
  assert.equal(f.records.get(path).useCount, 0);
  assert.deepEqual(
    [...f.records].filter(([k]) => k.startsWith('adventures/')),
    before,
  );
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(path + '/uses/')),
    false,
  );
});
test('normal permanent removal of a detached pending image is finalized as unavailable without republishing', async () => {
  const { createImageLibraryService } = await import('../src/imageLibrary.mjs');
  const { f, p, media } = await mediaFixture(),
    path = await detach(f, p);
  const library = createImageLibraryService({
    db: f.db,
    assets: { retireRestoreImage: f.assets.retire },
  });
  await library.remove(f.uid, { id: f.records.get(path).id });
  assert.equal(f.records.get(path).state, 'deleted');
  const patches = f.storage.events.filter((e) => e.method === 'patch').length;
  const done = await finishMedia(f, p, media);
  assert.equal(done.unavailable, 1);
  assert.equal(done.ready, 0);
  assert.equal(f.records.get(path).state, 'deleted');
  assert.equal(f.storage.events.filter((e) => e.method === 'patch').length, patches);
  assert.equal(f.storage.version(f.records.get(path).path).bytes.length, 0);
});
test('every Firestore media write rolls back and retry recovers the same accepted Storage generation', async () => {
  for (let stop = 1; stop <= 4; stop++) {
    const { f, p, media } = await mediaFixture(),
      request = mediaRequest(p, media),
      before = structuredClone([...f.records]),
      run = f.db.runTransaction;
    f.db.runTransaction = (cb) =>
      run((tx) => {
        let n = 0;
        return cb(
          new Proxy(tx, {
            get(object, key) {
              if (['create', 'update', 'set'].includes(key))
                return (...args) => {
                  if (++n === stop) throw Error('media rollback');
                  return object[key](...args);
                };
              return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
            },
          }),
        );
      });
    await assert.rejects(
      () => f.api.advanceAdventureRestoreMedia(f.uid, request),
      /media rollback/,
    );
    assert.deepEqual([...f.records], before);
    f.db.runTransaction = run;
    assert.equal((await f.api.advanceAdventureRestoreMedia(f.uid, request)).media.ready, 1);
    assert.equal(f.storage.events.filter((e) => e.method === 'patch').length, 1);
  }
});
test('a lost Storage PATCH acknowledgement keeps the checkpoint and safely resumes without a second PATCH', async () => {
  const { f, p, media } = await mediaFixture(),
    request = mediaRequest(p, media),
    before = structuredClone([...f.records]);
  let once = true;
  f.storage.hooks.afterPatch = () => {
    if (once) {
      once = false;
      throw Error('lost PATCH ACK');
    }
  };
  await assert.rejects(() => f.api.advanceAdventureRestoreMedia(f.uid, request), /lost PATCH ACK/);
  assert.deepEqual([...f.records], before);
  const done = await f.api.advanceAdventureRestoreMedia(f.uid, request);
  assert.equal(done.media.ready, 1);
  assert.equal(f.storage.events.filter((e) => e.method === 'patch').length, 1);
});
test('lost Firestore acknowledgement is resolved from the immutable sidecar receipt', async () => {
  const { f, p, media } = await mediaFixture(),
    run = f.db.runTransaction,
    request = mediaRequest(p, media);
  let once = true;
  f.db.runTransaction = async (cb) => {
    const result = await run(cb);
    if (once && result?.receipt?.action === 'advanceAdventureRestoreMedia') {
      once = false;
      throw Error('lost media ACK');
    }
    return result;
  };
  const done = await f.api.advanceAdventureRestoreMedia(f.uid, request);
  assert.equal(done.media.ready, 1);
  const before = structuredClone([...f.records]),
    io = f.storage.events.length;
  assert.deepEqual(await f.api.advanceAdventureRestoreMedia(f.uid, request), done);
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, io);
});
test('foreign account, stale token, parent checkpoint and caller-supplied paths cannot publish an image', async () => {
  const { f, p, media } = await mediaFixture(),
    request = mediaRequest(p, media),
    before = structuredClone([...f.records]),
    io = f.storage.events.length;
  for (const [uid, patch] of [
    [null, {}],
    ['other', {}],
    [f.uid, { jobToken: 'c'.repeat(64) }],
    [f.uid, { expectedCheckpoint: p.checkpoint }],
    [f.uid, { path: 'outside' }],
  ]) {
    await assert.rejects(() => f.api.advanceAdventureRestoreMedia(uid, { ...request, ...patch }));
    assert.deepEqual([...f.records], before);
    assert.equal(f.storage.events.length, io);
  }
});
test('missing, recreated or altered library provenance is never adopted or overwritten', async () => {
  for (const kind of ['missing', 'recreated', 'origin', 'storage', 'use']) {
    const { f, p, media } = await mediaFixture(),
      [path, image] = imageEntry(f);
    if (kind === 'missing') f.records.delete(path);
    if (kind === 'recreated') f.metadata.get(path).createdAtNanoseconds += 50000;
    if (kind === 'origin')
      f.records.set(path, {
        ...image,
        restoreOrigin: { ...image.restoreOrigin, assetId: 'a'.repeat(64) },
      });
    if (kind === 'storage')
      f.records.set(path, {
        ...image,
        restoreStorage: { ...image.restoreStorage, contentHash: 'b'.repeat(64) },
      });
    if (kind === 'use') {
      const use = [...f.records.keys()].find((k) => k.startsWith(path + '/uses/'));
      f.metadata.get(use).createdAtNanoseconds += 40000;
    }
    const before = structuredClone([...f.records]),
      io = f.storage.events.length;
    await assert.rejects(() => f.api.advanceAdventureRestoreMedia(f.uid, mediaRequest(p, media)));
    assert.deepEqual([...f.records], before);
    assert.equal(f.storage.events.length, io);
  }
});
test('sidecar and receipt recreations invalidate status instead of trusting their copied counters', async () => {
  for (const kind of ['control', 'receipt']) {
    const { f, p, media } = await mediaFixture(),
      request = mediaRequest(p, media);
    await f.api.advanceAdventureRestoreMedia(f.uid, request);
    const path =
      kind === 'control'
        ? f.path + '/activationMedia/current'
        : 'users/' + f.uid + '/adventureRestoreMediaOperations/' + request.operationId;
    f.metadata.get(path).createdAtNanoseconds += 60000;
    const before = structuredClone([...f.records]);
    await assert.rejects(() =>
      f.api.getAdventureRestoreMediaState(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
    );
    assert.deepEqual([...f.records], before);
  }
});
test('historical replay survives rename, removal and origin-root deletion without resurrecting anything', async () => {
  const { createImageLibraryService } = await import('../src/imageLibrary.mjs');
  const { f, p, media } = await mediaFixture(),
    request = mediaRequest(p, media),
    first = await f.api.advanceAdventureRestoreMedia(f.uid, request),
    [path, image] = imageEntry(f),
    library = createImageLibraryService({
      db: f.db,
      assets: { retireRestoreImage: f.assets.retire },
    });
  await library.rename(f.uid, { id: image.id, name: 'Renamed after acceptance' });
  await detach(f, p);
  await library.remove(f.uid, { id: image.id });
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('adventures/' + p.adventureId)));
  const before = structuredClone([...f.records]),
    io = f.storage.events.length;
  assert.deepEqual(await f.api.advanceAdventureRestoreMedia(f.uid, request), first);
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, io);
  assert.equal(f.records.get(path).state, 'deleted');
});
test('a removal racing a held acceptance wins permanently and the retry records unavailable', async () => {
  const { createImageLibraryService } = await import('../src/imageLibrary.mjs');
  const { f, p, media } = await mediaFixture(),
    request = mediaRequest(p, media),
    accept = f.assets.accept;
  let release, entered;
  const hold = new Promise((resolve) => {
      release = resolve;
    }),
    paused = new Promise((resolve) => {
      entered = resolve;
    });
  f.assets.accept = async (...args) => {
    entered();
    await hold;
    return accept(...args);
  };
  const pending = f.api.advanceAdventureRestoreMedia(f.uid, request);
  await paused;
  const path = await detach(f, p);
  await createImageLibraryService({
    db: f.db,
    assets: { retireRestoreImage: f.assets.retire },
  }).remove(f.uid, { id: f.records.get(path).id });
  release();
  await assert.rejects(() => pending);
  const end = await f.api.advanceAdventureRestoreMedia(f.uid, request);
  assert.equal(end.media.unavailable, 1);
  assert.equal(f.records.get(path).state, 'deleted');
  assert.equal(f.storage.version(f.records.get(path).path).bytes.length, 0);
});
test('competing media decisions cannot consume the same asset or checkpoint twice', async () => {
  const { f, p, media } = await mediaFixture(),
    request = mediaRequest(p, media);
  const results = await Promise.allSettled([
    f.api.advanceAdventureRestoreMedia(f.uid, request),
    f.api.advanceAdventureRestoreMedia(f.uid, {
      ...request,
      operationId: 'competing-media-op-0001',
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  assert.equal(f.storage.events.filter((e) => e.method === 'patch').length, 1);
  assert.equal(f.records.get(f.path + '/activationMedia/current').processed, 1);
});

test('a removed or recreated outcome cannot certify an existing media control', async () => {
  for (const remove of [false, true]) {
    const { f, p, media } = await mediaFixture();
    await f.api.advanceAdventureRestoreMedia(f.uid, mediaRequest(p, media));
    const path = [...f.records.keys()].find((k) => k.startsWith(f.path + '/activationMediaItems/'));
    if (remove) f.records.delete(path);
    else f.metadata.get(path).createdAtNanoseconds += 50000;
    await assert.rejects(() =>
      f.api.getAdventureRestoreMediaState(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
    );
  }
});

test('media cannot begin before the explicit adventure activation', async () => {
  const { activationFixture } = await import('./helpers/adventureRestoreActivationFixture.mjs');
  const { f, p } = await activationFixture(await emptyAdventureArchive()),
    before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.api.getAdventureRestoreMediaState(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
  );
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreMedia(f.uid, mediaRequest(p, { checkpoint: 0 })),
  );
  assert.deepEqual([...f.records], before);
});
test('a foreign current Storage generation is preserved without advancing the media checkpoint', async () => {
  const { f, p, media } = await mediaFixture(),
    [, image] = imageEntry(f),
    original = f.storage.version(image.path);
  const foreign = f.storage.put(image.path, original.bytes, original.metadata);
  const before = structuredClone([...f.records]);
  await assert.rejects(() => f.api.advanceAdventureRestoreMedia(f.uid, mediaRequest(p, media)));
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.current.get(image.path), foreign.metadata.generation);
  assert.equal(f.storage.events.filter((e) => e.method === 'patch').length, 0);
});
test('an image recreated while Storage accepts cannot be adopted by the final acknowledgement', async () => {
  const { f, p, media } = await mediaFixture(),
    [path, image] = imageEntry(f),
    accept = f.assets.accept;
  let entered, release;
  const paused = new Promise((resolve) => {
      entered = resolve;
    }),
    hold = new Promise((resolve) => {
      release = resolve;
    });
  f.assets.accept = async (...args) => {
    const result = await accept(...args);
    entered();
    await hold;
    return result;
  };
  const pending = f.api.advanceAdventureRestoreMedia(f.uid, mediaRequest(p, media));
  await paused;
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), image));
  const before = structuredClone([...f.records]);
  release();
  await assert.rejects(() => pending);
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.get(path).state, 'preparing');
});
test('a removal still waiting on Storage is physically retired before unavailable is acknowledged', async () => {
  const { createImageLibraryService } = await import('../src/imageLibrary.mjs');
  const { f, p, media } = await mediaFixture(),
    path = await detach(f, p);
  let entered, release;
  const paused = new Promise((resolve) => {
      entered = resolve;
    }),
    hold = new Promise((resolve) => {
      release = resolve;
    });
  const library = createImageLibraryService({
    db: f.db,
    assets: {
      retireRestoreImage: async (...args) => {
        entered();
        await hold;
        return f.assets.retire(...args);
      },
    },
  });
  const removing = library.remove(f.uid, { id: f.records.get(path).id });
  await paused;
  assert.equal(f.records.get(path).state, 'deleting');
  const done = await f.api.advanceAdventureRestoreMedia(f.uid, mediaRequest(p, media));
  assert.equal(done.media.unavailable, 1);
  assert.equal(f.storage.version(f.records.get(path).path).bytes.length, 0);
  release();
  await removing;
  assert.equal(f.records.get(path).state, 'deleted');
});
