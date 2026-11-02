import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { ref as storageRef, getBytes } from 'firebase/storage';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookBackupCoverService } from '../../functions/src/bookBackupCoverRead.mjs';
import { createBookBackupAssetStorage } from '../../functions/src/bookBackupAssetStorage.mjs';
import { createImageLibraryService } from '../../functions/src/imageLibrary.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore'),
  { Storage } = requireFunctions('@google-cloud/storage'),
  sharp = requireFunctions('sharp');
const projectId = 'demo-writer-backup-cover',
  bookId = 'book-cover-capture-0001',
  imageId = 'cover-capture-image-0001',
  path = 'book-covers/author/' + imageId + '.png',
  hash = (value) => createHash('sha256').update(value).digest('hex');
let environment, admin, bucket, bytes, root, api, assets, images;
const source = () => root.getBookBackupSource('author', { bookId });
const cover = (pin, extra = {}, uid = 'author') =>
  api.getBookBackupCover(uid, { bookId, sourceToken: pin.sourceToken, ...extra });
const verify = (pin, token) =>
  api.verifyBookBackupCover('author', { bookId, sourceToken: pin.sourceToken, coverToken: token });
const read = (pin, token, index = 0) =>
  api.readBookBackupCoverChunk('author', {
    bookId,
    sourceToken: pin.sourceToken,
    coverToken: token,
    index,
  });
const saveFile = () =>
  bucket.file(path).save(bytes, {
    resumable: false,
    metadata: {
      contentType: 'image/png',
      metadata: { accepted: 'true', firebaseStorageDownloadTokens: 'emulator-private-token' },
    },
  });
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST,
    storage = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (
    !/^127\.0\.0\.1:\d+$/.test(address ?? '') ||
    !/^127\.0\.0\.1:\d+$/.test(storage ?? '') ||
    process.env.WRITER_COVER_STORAGE_BUCKET !== projectId + '.appspot.com' ||
    (process.env.STORAGE_EMULATOR_HOST !== undefined &&
      process.env.STORAGE_EMULATOR_HOST !== 'http://' + storage)
  )
    throw new Error('Dedicated demo Firestore/Storage required.');
  const [host, port] = address.split(':'),
    [storageHost, storagePort] = storage.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
    storage: {
      host: storageHost,
      port: Number(storagePort),
      rules: await readFile(new URL('../../storage.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  bucket = new Storage({
    projectId,
    apiEndpoint: 'http://' + storage,
    useAuthWithCustomEndpoint: false,
    retryOptions: { autoRetry: false },
  }).bucket(process.env.WRITER_COVER_STORAGE_BUCKET);
  const raw = Buffer.alloc(1200 * 1800 * 3);
  let seed = 17;
  for (let i = 0; i < 1200 * 100 * 3; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    raw[i] = seed >>> 24;
  }
  bytes = await sharp(raw, { raw: { width: 1200, height: 1800, channels: 3 } })
    .png()
    .toBuffer();
  root = createBookBackupReadService({ db: admin });
  assets = createBookBackupAssetStorage(() => bucket);
  api = createBookBackupCoverService({ db: admin, assets });
  images = createImageLibraryService({
    db: admin,
    assets: { remove: (selected) => bucket.file(selected).delete({ ignoreNotFound: true }) },
    now: () => 1000,
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await saveFile();
  await admin.doc('books/' + bookId).set({
    authorId: 'author',
    title: 'Book',
    status: 'draft',
    createdAt: 1,
    updatedAt: 2,
    localLoreVersion: 0,
    wordCount: 0,
  });
  await admin.doc('users/author/imageLibrary/' + imageId).set({
    id: imageId,
    name: 'Own cover',
    state: 'active',
    useCount: 0,
    path,
    url: 'https://example.invalid/?token=DO-NOT-COPY',
    createdAt: 3,
    updatedAt: 4,
  });
  await images.saveBook('author', { bookId, coverImageId: imageId });
});
after(async () => {
  await bucket?.file(path).delete({ ignoreNotFound: true });
  await admin?.terminate();
  await environment?.cleanup();
});
test('real library writer and Storage SDK preserve PNG/hash/ranges without exposing path/download token', async () => {
  const pin = await source(),
    value = await cover(pin),
    parts = [];
  assert.equal(value.cover.contentHash, hash(bytes));
  assert.equal(value.cover.byteLength, bytes.length);
  assert.ok(value.cover.chunkCount > 2);
  assert.equal(JSON.stringify(value.cover).includes('DO-NOT-COPY'), false);
  assert.equal(Object.hasOwn(value.cover, 'path'), false);
  for (let index = 0; index < value.cover.chunkCount; index++) {
    const chunk = await read(pin, value.coverToken, index),
      part = Buffer.from(chunk.chunkBase64, 'base64');
    assert.ok(part.length <= 65536);
    assert.equal(chunk.chunkHash, hash(part));
    parts.push(part);
  }
  assert.deepEqual(Buffer.concat(parts), bytes);
  await verify(pin, value.coverToken);
  assert.equal((await admin.doc('users/author/imageLibrary/' + imageId).get()).data().useCount, 1);
  const own = environment.authenticatedContext('author').storage('gs://' + bucket.name);
  assert.deepEqual(Buffer.from(await getBytes(storageRef(own, path))), bytes);
});
test('real object replacement and accepted/metageneration ABA invalidate old token with book unchanged', async () => {
  const pin = await source(),
    first = await cover(pin),
    initial = await assets.metadata(path);
  await saveFile();
  const replaced = await assets.metadata(path);
  assert.notEqual(replaced.generation, initial.generation);
  assert.deepEqual(await source(), pin);
  await assert.rejects(verify(pin, first.coverToken), { code: 'failed-precondition' });
  const fresh = await cover(pin),
    meta = await assets.metadata(path);
  await bucket.file(path).setMetadata({ metadata: { accepted: 'false' } });
  await assert.rejects(verify(pin, fresh.coverToken), { code: 'failed-precondition' });
  const own = environment.authenticatedContext('author').storage('gs://' + bucket.name);
  await assertFails(getBytes(storageRef(own, path)));
  await bucket.file(path).setMetadata({ metadata: { accepted: 'true' } });
  const restored = await assets.metadata(path);
  assert.notEqual(restored.metageneration, meta.metageneration);
  await assert.rejects(verify(pin, fresh.coverToken), { code: 'failed-precondition' });
});
test('Storage Rules and root authorization deny other/anonymous readers and arbitrary paths', async () => {
  const pin = await source(),
    other = environment.authenticatedContext('other').storage('gs://' + bucket.name),
    anonymous = environment.unauthenticatedContext().storage('gs://' + bucket.name);
  await assertFails(getBytes(storageRef(other, path)));
  await assertFails(getBytes(storageRef(anonymous, path)));
  await assert.rejects(cover(pin, {}, 'other'), { code: 'not-found' });
  await assert.rejects(cover(pin, { path: 'book-covers/other/x.png' }), {
    code: 'invalid-argument',
  });
});
test('active use prevents normal removal; real unlink/delete writers invalidate source and preserve absence', async () => {
  const pin = await source(),
    first = await cover(pin);
  await assert.rejects(images.remove('author', { id: imageId }), { code: 'failed-precondition' });
  await images.saveBook('author', { bookId, coverImageId: null, coverUrl: null });
  await assert.rejects(read(pin, first.coverToken), { code: 'failed-precondition' });
  await images.remove('author', { id: imageId });
  assert.equal((await bucket.file(path).exists())[0], false);
  assert.deepEqual((await cover(await source())).cover, { kind: 'none' });
});
test('revocation after real range read blocks bytes before response', async () => {
  const pin = await source(),
    first = await cover(pin),
    raced = createBookBackupCoverService({
      db: admin,
      assets: {
        ...assets,
        async readRange(...args) {
          const result = await assets.readRange(...args);
          await admin.doc('books/' + bookId).update({ deleting: true });
          return result;
        },
      },
    });
  await assert.rejects(
    raced.readBookBackupCoverChunk('author', {
      bookId,
      sourceToken: pin.sourceToken,
      coverToken: first.coverToken,
      index: 0,
    }),
    { code: 'not-found' },
  );
});
