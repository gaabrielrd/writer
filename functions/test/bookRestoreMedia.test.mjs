import test from 'node:test';
import assert from 'node:assert/strict';
import { readyMedia, finishMedia, mediaState, uid } from './helpers/bookRestoreMediaFixture.mjs';
import { readActiveLibraryImage, createImageLibraryService } from '../src/imageLibrary.mjs';
import { createBookBackupCoverService } from '../src/bookBackupCoverRead.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupAssetStorage } from '../src/bookBackupAssetStorage.mjs';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { readyActivation } from './helpers/bookRestoreActivationFixture.mjs';

test('media completion activates the original library image and book URL atomically while preserving activation proofs and all bytes', async () => {
  const f = await readyMedia(),
    imageId = f.p.preparation.cover.imageId,
    imagePath = 'users/' + uid + '/imageLibrary/' + imageId,
    bookPath = 'books/' + f.p.bookId,
    immutable = [
      f.root,
      'bookRestoreReservations/' + f.p.bookId,
      'users/' + uid + '/bookRestoreOperations/' + f.request.operationId,
    ],
    before = immutable.map((path) => [
      path,
      structuredClone(f.records.get(path)),
      structuredClone(f.metadata.get(path)),
    ]),
    storageBefore = f.storage.events.length,
    imageBefore = structuredClone(f.records.get(imagePath)),
    pending = await mediaState(f),
    result = await finishMedia(f);
  assert.equal(pending.media.state, 'pending');
  assert.equal(pending.media.imageState, 'preparing');
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.media.state, 'ready');
  assert.equal(result.media.imageAvailable, true);
  const image = f.records.get(imagePath),
    book = f.records.get(bookPath),
    outcome = f.records.get(f.root + '/activationMedia/current'),
    receipt = f.records.get(
      'users/' + uid + '/bookRestoreMediaOperations/' + f.mediaRequest.operationId,
    );
  assert.equal(image.state, 'active');
  assert.match(image.url, /^https:\/\/firebasestorage.googleapis.com\//);
  assert.equal(book.coverUrl, image.url);
  assert.equal(image.useCount, imageBefore.useCount);
  assert.deepEqual(f.records.get(imagePath + '/uses/' + f.p.bookId), { bookId: f.p.bookId });
  for (const [path, value, metadata] of before) {
    assert.deepEqual(f.records.get(path), value);
    assert.deepEqual(f.metadata.get(path), metadata);
  }
  const changes = f.commits.findLast((writes) =>
    writes.some((w) => w.path === f.root + '/activationMedia/current'),
  );
  for (const path of [
    imagePath,
    bookPath,
    f.root + '/activationMedia/current',
    'users/' + uid + '/bookRestoreMediaOperations/' + f.mediaRequest.operationId,
  ])
    assert.ok(changes.some((w) => w.path === path));
  assert.equal(f.storage.events.slice(storageBefore).filter((e) => e.method === 'patch').length, 1);
  assert.equal(
    f.storage.events.slice(storageBefore).some((e) => ['save', 'delete'].includes(e.method)),
    false,
  );
  const text = JSON.stringify({ result, outcome, receipt });
  assert.equal(text.includes(image.url), false);
  assert.equal(text.includes(new URL(image.url).searchParams.get('token')), false);
  assert.deepEqual(await finishMedia(f), result);
  assert.equal((await mediaState(f)).media.imageAvailable, true);
  assert.ok(await f.db.runTransaction((tx) => readActiveLibraryImage(tx, f.db, uid, imageId)));
  assert.deepEqual(
    await f.factory().getBookRestore(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
    f.p,
  );
  assert.deepEqual(await f.factory().activateBookRestore(uid, f.request), f.activation);
});

test('a later operation returns already-complete without a second receipt, Storage call, or image rewrite', async () => {
  const f = await readyMedia(),
    first = await finishMedia(f),
    before = structuredClone([...f.records]),
    at = f.storage.events.length;
  const second = await f
    .factory()
    .finalizeBookRestoreMedia(uid, { ...f.mediaRequest, operationId: f.id + '-later-confirm' });
  assert.equal(second.kind, 'already-complete');
  assert.deepEqual(second.receipt, first.receipt);
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, at);
});
test('no-cover completion has no Storage I/O and leaves the book and activation proof intact', async () => {
  const f = await readyMedia({ none: true }),
    before = structuredClone(
      [...f.records].filter(([p]) => p !== f.root + '/activationMedia/current'),
    ),
    at = f.storage.events.length,
    result = await finishMedia(f);
  assert.equal(result.media.state, 'none');
  assert.equal(result.media.imageAvailable, false);
  assert.equal(f.storage.events.length, at);
  for (const [path, value] of before) assert.deepEqual(f.records.get(path), value);
  assert.deepEqual(await finishMedia(f), result);
});

test('finalization rejects wrong account, job token, conflicting operation and injected URL before changing either store', async () => {
  const f = await readyMedia(),
    before = structuredClone([...f.records]),
    at = f.storage.events.length;
  for (const [actor, patch] of [
    ['other', {}],
    [uid, { jobToken: 'a'.repeat(64) }],
    [uid, { url: 'https://forged.invalid' }],
    [uid, { expectedCheckpoint: 0 }],
  ])
    await assert.rejects(() =>
      f.factory().finalizeBookRestoreMedia(actor, { ...f.mediaRequest, ...patch }),
    );
  await assert.rejects(() => f.factory().getBookRestoreMediaState(uid, { ...f.mediaRequest }));
  assert.deepEqual([...f.records], before);
  assert.equal(f.storage.events.length, at);
  const ref = 'users/' + uid + '/bookRestoreMediaOperations/' + f.mediaRequest.operationId;
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(ref), {
      schemaVersion: 1,
      ownerId: uid,
      restoreId: 'another-restore01',
      jobToken: 'a'.repeat(64),
      operationId: f.mediaRequest.operationId,
      action: 'finalizeBookRestoreMedia',
      requestHash: 'a'.repeat(64),
      outcomeHash: 'b'.repeat(64),
    }),
  );
  const foreign = structuredClone(f.records.get(ref));
  await assert.rejects(() => finishMedia(f));
  assert.deepEqual(f.records.get(ref), foreign);
  assert.equal(f.storage.events.length, at);
});
test('unactivated preparation cannot offer media completion', async () => {
  const f = await readyActivation();
  await assert.rejects(() =>
    f.factory().finalizeBookRestoreMedia(uid, {
      restoreId: f.id,
      jobToken: f.p.jobToken,
      operationId: f.id + '-media-too-soon',
    }),
  );
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('lost external response leaves library pending and resumes from the accepted generation and original token', async () => {
  const f = await readyMedia(),
    before = structuredClone([...f.records]),
    path = 'book-covers/' + uid + '/' + f.p.preparation.cover.imageId + '.png';
  f.hooks.after = () => {
    throw Error('lost external response');
  };
  await assert.rejects(() => finishMedia(f), /lost external response/);
  assert.deepEqual([...f.records], before);
  const token = f.storage.version(path).metadata.metadata.firebaseStorageDownloadTokens;
  f.hooks.after = null;
  const answer = await finishMedia(f);
  assert.equal(answer.media.state, 'ready');
  assert.ok(f.records.get('books/' + f.p.bookId).coverUrl.endsWith(token));
  assert.equal(f.storage.events.filter((e) => e.method === 'patch').length, 1);
});
test('Firestore rollback and automatic callback retry preserve the accepted file and commit one completion', async () => {
  const f = await readyMedia(),
    before = structuredClone([...f.records]),
    outcome = f.root + '/activationMedia/current',
    run = f.db.runTransaction.bind(f.db),
    failure = Error('simulated commit failure');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run((tx) => {
        const create = tx.create.bind(tx);
        tx.create = (ref, ...args) => {
          if (inject && ref.path === outcome) throw failure;
          return create(ref, ...args);
        };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  await assert.rejects(
    () => finishMedia(f),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const answer = await finishMedia(f);
  assert.equal(answer.media.state, 'ready');
  assert.equal(f.storage.events.filter((e) => e.method === 'patch').length, 1);
  assert.equal(f.commits.filter((ws) => ws.some((w) => w.path === outcome)).length, 1);
});
test('lost Firestore response is confirmed from the immutable native outcome without rewriting image or job', async () => {
  const f = await readyMedia(),
    run = f.db.runTransaction.bind(f.db),
    outcome = f.root + '/activationMedia/current';
  let lost = true;
  f.db.runTransaction = async (op) => {
    const result = await run(op);
    if (lost && f.records.has(outcome)) {
      lost = false;
      throw Error('lost committed response');
    }
    return result;
  };
  const result = await finishMedia(f);
  assert.equal(result.media.state, 'ready');
  assert.equal(f.commits.filter((ws) => ws.some((w) => w.path === outcome)).length, 1);
});
for (const change of ['deleted', 'changed', 'recreated'])
  test(
    'a ' +
      change +
      ' root during external work is preserved while the own image completes independently',
    async () => {
      const f = await readyMedia(),
        rootPath = 'books/' + f.p.bookId,
        imageId = f.p.preparation.cover.imageId,
        library = createImageLibraryService({ db: f.db, assets: {} }),
        foreign = { authorId: 'other', coverImageId: imageId, coverUrl: null };
      f.hooks.after = async () => {
        if (change !== 'recreated') await library.detach(uid, f.p.bookId, imageId);
        await f.db.runTransaction((tx) => {
          if (change === 'changed')
            tx.update(f.db.doc(rootPath), {
              coverImageId: null,
              coverUrl: 'https://chosen.invalid/image',
            });
          else {
            tx.delete(f.db.doc(rootPath));
            if (change === 'recreated') tx.create(f.db.doc(rootPath), foreign);
          }
        });
      };
      const answer = await finishMedia(f),
        image = f.records.get('users/' + uid + '/imageLibrary/' + imageId);
      assert.equal(answer.media.imageAvailable, true);
      assert.equal(image.state, 'active');
      if (change === 'deleted') assert.equal(f.records.has(rootPath), false);
      if (change === 'changed')
        assert.equal(f.records.get(rootPath).coverUrl, 'https://chosen.invalid/image');
      if (change === 'recreated') assert.deepEqual(f.records.get(rootPath), foreign);
      assert.equal(f.records.get(f.root + '/activationMedia/current').rootUpdated, false);
    },
  );
test('deleting the own detached image during external work prevents resurrection or a false successful completion', async () => {
  const f = await readyMedia(),
    imageId = f.p.preparation.cover.imageId,
    library = createImageLibraryService({
      db: f.db,
      assets: {
        retireRestoreImage: f.assets.retire,
        remove: (path) => f.storage.bucket().file(path).delete({ ignoreNotFound: true }),
      },
    });
  f.hooks.after = async () => {
    await library.detach(uid, f.p.bookId, imageId);
    await library.remove(uid, { id: imageId });
  };
  await assert.rejects(() => finishMedia(f));
  const path = 'users/' + uid + '/imageLibrary/' + imageId;
  assert.equal(f.records.get(path).state, 'deleted');
  assert.equal((await mediaState(f)).media.imageState, 'unavailable');
  assert.equal(f.records.has(f.root + '/activationMedia/current'), false);
  assert.equal(f.records.get('books/' + f.p.bookId).coverUrl, null);
  f.hooks.after = null;
  const at = f.storage.events.length;
  const unavailable = await finishMedia(f);
  assert.equal(unavailable.media.state, 'unavailable');
  assert.equal(unavailable.media.imageAvailable, false);
  assert.equal(f.storage.events.length, at);
});
for (const dependency of ['image', 'definition', 'intent', 'use'])
  test(
    'a recreated original ' + dependency + ' blocks pending media and preserves uncertain data',
    async () => {
      const f = await readyMedia(),
        imageId = f.p.preparation.cover.imageId,
        path =
          dependency === 'image'
            ? 'users/' + uid + '/imageLibrary/' + imageId
            : dependency === 'use'
              ? 'users/' + uid + '/imageLibrary/' + imageId + '/uses/' + f.p.bookId
              : f.root +
                '/' +
                (dependency === 'definition' ? 'preparedCovers' : 'preparedCoverStorage') +
                '/current',
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const before = structuredClone([...f.records]),
        at = f.storage.events.length;
      await assert.rejects(() => finishMedia(f));
      assert.deepEqual([...f.records], before);
      assert.equal(f.storage.events.length, at);
    },
  );
for (const dependency of ['outcome', 'receipt'])
  test(
    'a recreated media ' + dependency + ' cannot confirm or replay the original completion',
    async () => {
      const f = await readyMedia();
      await finishMedia(f);
      const path =
          dependency === 'outcome'
            ? f.root + '/activationMedia/current'
            : 'users/' + uid + '/bookRestoreMediaOperations/' + f.mediaRequest.operationId,
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      const image = structuredClone(
        f.records.get('users/' + uid + '/imageLibrary/' + f.p.preparation.cover.imageId),
      );
      await assert.rejects(() => finishMedia(f));
      await assert.rejects(() => mediaState(f));
      assert.deepEqual(
        f.records.get('users/' + uid + '/imageLibrary/' + f.p.preparation.cover.imageId),
        image,
      );
    },
  );
test('foreign uses or counters are never repaired or adopted to finish a pending image', async () => {
  const f = await readyMedia(),
    imagePath = 'users/' + uid + '/imageLibrary/' + f.p.preparation.cover.imageId;
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(imagePath + '/uses/foreign'), { bookId: 'foreign' }),
  );
  const before = structuredClone([...f.records]);
  await assert.rejects(() => finishMedia(f));
  assert.deepEqual([...f.records], before);
});
test('bad adapter proof or URL cannot activate the library even after an external publish', async () => {
  for (const bad of ['proof', 'url']) {
    const f = await readyMedia(),
      before = structuredClone([...f.records]);
    f.hooks.after = (_f, value) => {
      if (bad === 'proof') value.proof = { generation: '1', metageneration: '2' };
      else value.url = 'https://foreign.invalid/file';
    };
    await assert.rejects(() => finishMedia(f));
    assert.deepEqual([...f.records], before);
    f.hooks.after = null;
    assert.equal((await finishMedia(f)).media.state, 'ready');
  }
});
test('normal cover backup captures the exact accepted bytes without copying download credentials', async () => {
  const f = await readyMedia();
  await finishMedia(f);
  const backup = createBookBackupCoverService({
      db: f.db,
      assets: createBookBackupAssetStorage(f.storage.bucket),
    }),
    source = await createBookBackupReadService({ db: f.db }).getBookBackupSource(uid, {
      bookId: f.p.bookId,
    }),
    pin = await backup.getBookBackupCover(uid, {
      bookId: f.p.bookId,
      sourceToken: source.sourceToken,
    }),
    pieces = [];
  for (let index = 0; index < pin.cover.chunkCount; index++) {
    const piece = await backup.readBookBackupCoverChunk(uid, {
      bookId: f.p.bookId,
      sourceToken: source.sourceToken,
      coverToken: pin.coverToken,
      index,
    });
    pieces.push(Buffer.from(piece.chunkBase64, 'base64'));
  }
  const stored = f.storage.version(
    'book-covers/' + uid + '/' + f.p.preparation.cover.imageId + '.png',
  );
  assert.deepEqual(Buffer.concat(pieces), stored.bytes);
  assert.equal(
    JSON.stringify(pin).includes(stored.metadata.metadata.firebaseStorageDownloadTokens),
    false,
  );
});
test('history remains usable after prepared cover definitions are cleaned and after normal library deletion', async () => {
  const f = await readyMedia(),
    first = await finishMedia(f),
    imageId = f.p.preparation.cover.imageId,
    library = createImageLibraryService({
      db: f.db,
      assets: {
        retireRestoreImage: f.assets.retire,
        remove: (path) => f.storage.bucket().file(path).delete({ ignoreNotFound: true }),
      },
    });
  await f.db.runTransaction((tx) => {
    tx.delete(f.db.doc(f.root + '/preparedCovers/current'));
    tx.delete(f.db.doc(f.root + '/preparedCoverStorage/current'));
  });
  assert.deepEqual(await finishMedia(f), first);
  await library.detach(uid, f.p.bookId, imageId);
  await library.remove(uid, { id: imageId });
  const at = f.storage.events.length,
    result = await finishMedia(f);
  assert.equal(result.media.state, 'ready');
  assert.equal(result.media.imageAvailable, false);
  assert.deepEqual(result.receipt, first.receipt);
  assert.equal(f.storage.events.length, at);
});
test('a missing adapter never falls back to a raw Storage or document write', async () => {
  const f = await readyMedia(),
    api = createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    before = structuredClone([...f.records]);
  await assert.rejects(() => api.finalizeBookRestoreMedia(uid, f.mediaRequest));
  assert.deepEqual([...f.records], before);
});

test('historical readiness never re-adopts a recreated active image or exposes its URL', async () => {
  const f = await readyMedia();
  await finishMedia(f);
  const path = 'users/' + uid + '/imageLibrary/' + f.p.preparation.cover.imageId,
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  const state = await mediaState(f),
    at = f.storage.events.length,
    answer = await finishMedia(f);
  assert.equal(state.media.state, 'ready');
  assert.equal(state.media.imageState, 'unavailable');
  assert.equal(answer.media.imageAvailable, false);
  assert.equal(f.storage.events.length, at);
  assert.equal(JSON.stringify(answer).includes(value.url), false);
  assert.deepEqual(f.records.get(path), value);
});

test('a confirmed original owner deletion completes media as unavailable without Storage I/O or reconstruction', async () => {
  const f = await readyMedia(),
    imageId = f.p.preparation.cover.imageId,
    library = createImageLibraryService({
      db: f.db,
      assets: {
        retireRestoreImage: f.assets.retire,
        remove: (path) => f.storage.bucket().file(path).delete({ ignoreNotFound: true }),
      },
    });
  await library.detach(uid, f.p.bookId, imageId);
  await library.remove(uid, { id: imageId });
  const before = structuredClone([...f.records]),
    at = f.storage.events.length,
    result = await finishMedia(f);
  assert.equal(result.media.state, 'unavailable');
  assert.equal(result.media.imageState, 'unavailable');
  assert.equal(f.storage.events.length, at);
  for (const [path, value] of before) assert.deepEqual(f.records.get(path), value);
  assert.deepEqual(await finishMedia(f), result);
});
test('a deleting or recreated deleted image is not treated as an original owner tombstone', async () => {
  for (const recreated of [false, true]) {
    const f = await readyMedia(),
      imageId = f.p.preparation.cover.imageId,
      path = 'users/' + uid + '/imageLibrary/' + imageId,
      library = createImageLibraryService({
        db: f.db,
        assets: {
          retireRestoreImage: f.assets.retire,
          remove: (p) => f.storage.bucket().file(p).delete({ ignoreNotFound: true }),
        },
      });
    await library.detach(uid, f.p.bookId, imageId);
    if (recreated) {
      await library.remove(uid, { id: imageId });
      const value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    } else await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { state: 'deleting' }));
    const before = structuredClone([...f.records]),
      at = f.storage.events.length;
    await assert.rejects(() => finishMedia(f));
    assert.deepEqual([...f.records], before);
    assert.equal(f.storage.events.length, at);
  }
});
