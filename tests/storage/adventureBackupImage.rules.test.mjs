import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { ref as storageRef, getBytes } from 'firebase/storage';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import { createAdventureBackupImageService } from '../../functions/src/adventureBackupImageRead.mjs';
import { createBookBackupAssetStorage } from '../../functions/src/bookBackupAssetStorage.mjs';
import { createImageLibraryService } from '../../functions/src/imageLibrary.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore'),
  { Storage } = requireFunctions('@google-cloud/storage'),
  sharp = requireFunctions('sharp');
import { activateBackupImportedAdventure } from '../../functions/test/helpers/adventureBackupImportFixture.mjs';
import { adventureImportIds } from '../../functions/src/adventureImportContracts.mjs';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { libraryImage } from '../../functions/src/imageLibrary.mjs';
import { adventureImageUseKey } from '../../functions/src/adventureBlockImages.mjs';
const projectId = 'demo-writer-backup-cover',
  uid = 'author',
  adventureId = adventureImportIds(uid, 'backup-import-source-0001').adventureId,
  sceneId = adventureImportIds(uid, 'backup-import-source-0001', 0).sceneId,
  blockId = 'adventure-image-block-0001',
  imageId = 'adventure-image-storage-0001',
  path = 'book-covers/' + uid + '/' + imageId + '.png',
  projectPath = 'adventures/' + adventureId,
  libraryPath = 'users/' + uid + '/imageLibrary/' + imageId,
  hash = (value) => createHash('sha256').update(value).digest('hex');
let environment, admin, bucket, bytes, root, api, assets, images;
const source = () => root.getAdventureBackupSource(uid, { adventureId });
const list = (pin, kind = 'scene') =>
  api.listAdventureBackupImageBindings(uid, { adventureId, sourceToken: pin.sourceToken, kind });
const request = (pin, row, kind = 'scene', extra = {}) => ({
  adventureId,
  sourceToken: pin.sourceToken,
  kind,
  id: row.id,
  bindingToken: row.bindingToken,
  ...extra,
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
  root = createAdventureBackupSourceService({ db: admin });
  assets = createBookBackupAssetStorage(() => bucket);
  api = createAdventureBackupImageService({ db: admin, assets });
  images = createImageLibraryService({
    db: admin,
    assets: { remove: (selected) => bucket.file(selected).delete({ ignoreNotFound: true }) },
    now: () => 1000,
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await saveFile();
  // The private library image legitimately predates this adventure.
  await admin.doc(libraryPath).create(
    libraryImage(
      imageId,
      {
        title: 'PRIVATE_IMAGE 🌙',
        coverUrl: 'https://example.invalid/?token=DO-NOT-COPY',
        path,
        acceptedAt: 100,
      },
      100,
    ),
  );
  await activateBackupImportedAdventure(admin);
  const rootBirth = (await admin.doc(projectPath).get()).createTime,
    sceneBirth = (await admin.doc(projectPath + '/scenes/' + sceneId).get()).createTime;
  assert.ok(sceneBirth.toMillis() <= rootBirth.toMillis());
  assert.equal(sceneBirth.isEqual(rootBirth), false);
  const blocks = createAdventureBlocksService({ db: admin, now: () => 1300 });
  await blocks.createAdventureBlock(uid, {
    adventureId,
    sceneId,
    operationId: blockId,
    title: 'PRIVATE_BLOCK',
    content: 'PRIVATE_PROSE',
  });
  for (const resource of [
    { kind: 'scene', id: sceneId },
    { kind: 'block', id: blockId },
  ]) {
    const p =
      projectPath + (resource.kind === 'scene' ? '/scenes/' : '/sceneBlocks/') + resource.id;
    await blocks.setAdventureBlockImage(uid, {
      adventureId,
      resource,
      operationId: 'sdk-attach-image-' + resource.kind,
      expectedRevision: (await admin.doc(p).get()).data().revision,
      image: { imageId, alt: ' own alt 🌙 ', caption: '' },
    });
  }
});
after(async () => {
  await bucket?.file(path).delete({ ignoreNotFound: true });
  await admin?.terminate();
  await environment?.cleanup();
});

test('SDK adventure image activated import and typed uses preserve PNG ranges without URLs or tokens', async () => {
  const pin = await source(),
    before = await admin.doc(libraryPath).get();
  for (const kind of ['scene', 'block']) {
    const row = (await list(pin, kind)).items[0],
      captured = await api.getAdventureBackupImage(uid, request(pin, row, kind)),
      chunks = [];
    assert.ok(captured.image.chunkCount > 2);
    assert.equal(captured.image.contentHash, hash(bytes));
    assert.equal(captured.image.byteLength, bytes.length);
    assert.equal(captured.image.alt, ' own alt 🌙 ');
    assert.equal(JSON.stringify(captured.image).includes('DO-NOT-COPY'), false);
    for (const key of ['path', 'url', 'generation', 'metageneration', 'useCount', 'ownerId'])
      assert.equal(Object.hasOwn(captured.image, key), false);
    for (let index = 0; index < captured.image.chunkCount; index++) {
      const r = await api.readAdventureBackupImageChunk(
          uid,
          request(pin, row, kind, { imageToken: captured.imageToken, index }),
        ),
        part = Buffer.from(r.chunkBase64, 'base64');
      assert.ok(part.length <= 65536);
      assert.equal(r.chunkHash, hash(part));
      chunks.push(part);
    }
    assert.deepEqual(Buffer.concat(chunks), bytes);
    await api.verifyAdventureBackupImage(
      uid,
      request(pin, row, kind, { imageToken: captured.imageToken }),
    );
  }
  assert.ok((await admin.doc(libraryPath).get()).updateTime.isEqual(before.updateTime));
  await assert.rejects(images.remove(uid, { id: imageId }), { code: 'failed-precondition' });
  for (const context of [
    environment.authenticatedContext('other'),
    environment.unauthenticatedContext(),
  ])
    await assertFails(getBytes(storageRef(context.storage('gs://' + bucket.name), path)));
  const own = environment.authenticatedContext(uid).storage('gs://' + bucket.name);
  assert.deepEqual(Buffer.from(await getBytes(storageRef(own, path))), bytes);
});

test('SDK adventure image object replacement and accepted/metageneration ABA invalidate old tokens', async () => {
  const pin = await source(),
    row = (await list(pin)).items[0],
    first = await api.getAdventureBackupImage(uid, request(pin, row)),
    initial = await assets.metadata(path);
  await saveFile();
  assert.notEqual((await assets.metadata(path)).generation, initial.generation);
  assert.deepEqual(await source(), pin);
  await assert.rejects(
    api.verifyAdventureBackupImage(
      uid,
      request(pin, row, 'scene', { imageToken: first.imageToken }),
    ),
    { code: 'failed-precondition' },
  );
  const fresh = await api.getAdventureBackupImage(uid, request(pin, row)),
    observed = await assets.metadata(path);
  await bucket.file(path).setMetadata({ metadata: { accepted: 'false' } });
  await assert.rejects(
    api.verifyAdventureBackupImage(
      uid,
      request(pin, row, 'scene', { imageToken: fresh.imageToken }),
    ),
    { code: 'failed-precondition' },
  );
  await bucket.file(path).setMetadata({ metadata: { accepted: 'true' } });
  assert.notEqual((await assets.metadata(path)).metageneration, observed.metageneration);
  await assert.rejects(
    api.verifyAdventureBackupImage(
      uid,
      request(pin, row, 'scene', { imageToken: fresh.imageToken }),
    ),
    { code: 'failed-precondition' },
  );
});

test('SDK adventure image revocation after a real range prevents successful bytes and retry remains read-only', async () => {
  const pin = await source(),
    row = (await list(pin, 'block')).items[0],
    first = await api.getAdventureBackupImage(uid, request(pin, row, 'block')),
    usePath =
      libraryPath + '/uses/' + adventureImageUseKey(adventureId, { kind: 'block', id: blockId }),
    use = await admin.doc(usePath).get(),
    raced = createAdventureBackupImageService({
      db: admin,
      assets: {
        ...assets,
        async readRange(...args) {
          const result = await assets.readRange(...args);
          await admin.doc(usePath).delete();
          return result;
        },
      },
    });
  await assert.rejects(
    raced.readAdventureBackupImageChunk(
      uid,
      request(pin, row, 'block', { imageToken: first.imageToken, index: 0 }),
    ),
    { code: 'failed-precondition' },
  );
  await admin.doc(usePath).create(use.data());
  const fresh = (await list(pin, 'block')).items[0],
    captured = await api.getAdventureBackupImage(uid, request(pin, fresh, 'block')),
    before = await admin.doc(usePath).get();
  await api.readAdventureBackupImageChunk(
    uid,
    request(pin, fresh, 'block', { imageToken: captured.imageToken, index: 0 }),
  );
  assert.ok((await admin.doc(usePath).get()).updateTime.isEqual(before.updateTime));
});
