import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { createAdventureDeletionService } from '../../functions/src/adventureDeletion.mjs';
import { adventureImageUseKey } from '../../functions/src/adventureBlockImages.mjs';
import { ADVENTURE_DELETION_LAYOUT as layout } from '../../functions/src/adventureDeletionInventory.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = require('firebase-admin/firestore');
const uid = 'author',
  id = 'native-cleanup-adventure-0001',
  imageId = 'native-cleanup-image-0001',
  root = 'adventures/' + id,
  imagePath = 'users/' + uid + '/imageLibrary/' + imageId,
  projectId = 'demo-writer-adventure-cleanup';
let env, db, api, studio;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? '')) throw Error('Local demo emulator only');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  db = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  studio = createStudioService({ db });
  api = createAdventureDeletionService({
    db,
    assets: {
      retire: () => {
        throw Error('Independent active library copy must not be retired');
      },
    },
  });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await db?.terminate();
  await env?.cleanup();
});
const step = (p) => ({
  deletionId: p.deletionId,
  deletionToken: p.deletionToken,
  operationId: 'native-cleanup-step-' + String(p.checkpoint).padStart(8, '0'),
  expectedCheckpoint: p.checkpoint,
});
const stateRef = (p) => db.doc('users/' + uid + '/adventureDeletions/' + p.deletionId);
async function begin() {
  const s = await api.getAdventureDeletionSource(uid, { adventureId: id });
  return (
    await api.startAdventureDeletion(uid, {
      adventureId: id,
      adventureToken: s.adventureToken,
      sourceToken: s.sourceToken,
      expectedRevision: s.revision,
      operationId: 'native-cleanup-start-0001',
    })
  ).progress;
}
async function until(p, phase) {
  for (let n = 0; p.phase !== phase; n++) {
    assert.ok(n < 300);
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  }
  return p;
}
async function attach(adventureId, n) {
  const scene = (
    await createScenesService({ db }).createScene(uid, {
      target: { kind: 'adventure', id: adventureId },
      operationId: 'native-cleanup-scene-' + n,
      parentId: null,
      title: 'Own scene',
      content: '<p>PRIVATE_BODY_' + n + '</p>',
    })
  ).scene;
  await createAdventureBlocksService({ db }).setAdventureBlockImage(uid, {
    adventureId,
    resource: { kind: 'scene', id: scene.id },
    expectedRevision: scene.revision,
    operationId: 'native-cleanup-binding-' + n,
    image: { imageId, alt: 'Own alt', caption: 'Own caption' },
  });
}

test('native group bounds detach 25/25/3/0 own uses with one atomic counter per image and preserve other projects/accounts', async () => {
  await studio.createAdventure(uid, { operationId: id, title: 'Own project' });
  await studio.createAdventure(uid, { operationId: id + '-neighbor', title: 'Neighbor' });
  await db.doc(imagePath).create({
    id: imageId,
    state: 'active',
    useCount: 0,
    name: 'Own copy',
    url: 'https://example.test/own.png',
    path: 'book-covers/author/own.png',
    extra: 'KEEP_LIBRARY_METADATA',
  });
  for (let n = 0; n < 3; n++) await attach(id, n);
  await attach(id + '-neighbor', 100);
  const batch = db.batch();
  for (let n = 0; n < 50; n++) {
    const resource = { kind: 'block', id: 'missing-block-' + n };
    batch.create(db.doc(imagePath + '/uses/' + adventureImageUseKey(id, resource)), {
      kind: 'adventure-block',
      adventureId: id,
      resource,
    });
  }
  batch.update(db.doc(imagePath), { useCount: 54 });
  const foreign =
    'users/other/imageLibrary/' +
    imageId +
    '/uses/' +
    adventureImageUseKey(id, { kind: 'scene', id: 'foreign' });
  batch.create(db.doc(foreign), {
    kind: 'adventure-block',
    adventureId: id,
    resource: { kind: 'scene', id: 'foreign' },
  });
  await batch.commit();
  let p = await begin();
  const marked = await db.doc(root).get(),
    library = (await db.doc(imagePath).get()).data();
  p = await until(p, 'images');
  const firstRequest = step(p),
    before = p.deletedDocuments;
  const [first, same] = await Promise.all([
    api.advanceAdventureDeletion(uid, firstRequest),
    api.advanceAdventureDeletion(uid, firstRequest),
  ]);
  assert.deepEqual(first, same);
  p = first.progress;
  const sizes = [p.deletedDocuments - before];
  const counter = await db.doc(imagePath).get(),
    checkpoint = await stateRef(p).get(),
    receipt = await db
      .doc('users/' + uid + '/adventureDeletionOperations/' + firstRequest.operationId)
      .get();
  assert.equal(counter.data().useCount, 29);
  assert.ok(counter.updateTime.isEqual(checkpoint.updateTime));
  assert.ok(counter.updateTime.isEqual(receipt.createTime));
  for (let n = 0; n < 3; n++) {
    const before = p.deletedDocuments;
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
    sizes.push(p.deletedDocuments - before);
  }
  assert.deepEqual(sizes, [25, 25, 3, 0]);
  assert.equal(p.phase, 'children');
  assert.deepEqual((await db.doc(imagePath).get()).data(), { ...library, useCount: 1 });
  assert.equal((await db.doc(foreign).get()).exists, true);
  assert.equal((await db.collection(imagePath + '/uses').get()).size, 1);
  p = await until(p, 'controls');
  assert.equal((await db.doc(root + '-neighbor').get()).exists, true);
  assert.ok((await db.doc(root).get()).updateTime.isEqual(marked.updateTime));
  assert.deepEqual((await stateRef(p).get()).data().certified, [
    'quiescence',
    'media',
    'images',
    'children',
  ]);
  assert.equal(p.complete, false);
});

test('native child inventory finds headless descendants with root absent and reopens a family that reappears before certification', async () => {
  await studio.createAdventure(uid, { operationId: id, title: 'Own project' });
  const batch = db.batch();
  for (const family of layout) {
    const path =
      family.scope === 'root'
        ? root + '/' + family.collection + '/fixture-document'
        : root +
          '/' +
          family.parents[0] +
          '/missing-parent/' +
          family.collection +
          '/fixture-child';
    batch.create(db.doc(path), {
      ownerId: uid,
      adventureId: id,
      content: 'DO_NOT_HYDRATE',
      ...(family.collection === 'workVersions' ? { target: { kind: 'adventure', id } } : {}),
    });
  }
  for (let n = 0; n < 53; n++)
    batch.create(db.doc(root + '/scenes/missing-' + String(n).padStart(3, '0') + '/body/current'), {
      content: 'PRIVATE_ORPHAN_' + n,
    });
  const foreign = root + '-neighbor/scenes/missing/body/current';
  batch.create(db.doc(foreign), { content: 'KEEP_OTHER' });
  await batch.commit();
  let p = await begin();
  await db.doc(root).delete();
  p = await until(p, 'children');
  const sizes = [];
  while ((await stateRef(p).get()).data().part === 0) {
    const before = p.deletedDocuments;
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
    sizes.push(p.deletedDocuments - before);
  }
  assert.deepEqual(sizes, [25, 25, 4, 0]);
  const reappeared = root + '/sceneBlocks/missing/body/current';
  await db.doc(reappeared).create({ content: 'RETIRE_BEFORE_CERTIFY' });
  for (let n = 0; (await stateRef(p).get()).data().part < layout.length; n++)
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  const reopened = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(reopened.phase, 'children');
  assert.equal((await stateRef(reopened).get()).data().part, 0);
  assert.equal((await db.doc(reappeared).get()).exists, true);
  p = await until(reopened, 'controls');
  assert.equal((await db.doc(reappeared).get()).exists, false);
  assert.equal((await db.doc(foreign).get()).data().content, 'KEEP_OTHER');
  assert.equal((await db.doc(root).get()).exists, false);
  for (const family of layout.filter((f) => f.scope === 'root'))
    assert.equal(
      (
        await db
          .collection(root + '/' + family.collection)
          .limit(1)
          .get()
      ).empty,
      true,
    );
  assert.equal(p.complete, false);
});

test('native orphan library use is removed with library and adventure heads absent while a foreign account stays untouched', async () => {
  await studio.createAdventure(uid, { operationId: id, title: 'Own project' });
  const orphanImage = 'native-orphan-image-0001',
    resource = { kind: 'block', id: 'missing-block' },
    own =
      'users/' +
      uid +
      '/imageLibrary/' +
      orphanImage +
      '/uses/' +
      adventureImageUseKey(id, resource),
    other =
      'users/other/imageLibrary/' + orphanImage + '/uses/' + adventureImageUseKey(id, resource);
  const batch = db.batch(),
    value = { kind: 'adventure-block', adventureId: id, resource };
  batch.create(db.doc(own), value);
  batch.create(db.doc(other), value);
  await batch.commit();
  let p = await begin();
  await db.doc(root).delete();
  p = await until(p, 'images');
  const next = await api.advanceAdventureDeletion(uid, step(p));
  assert.equal(next.progress.deletedDocuments - p.deletedDocuments, 1);
  assert.equal((await db.doc(own).get()).exists, false);
  assert.equal((await db.doc(other).get()).exists, true);
  assert.equal((await db.doc('users/' + uid + '/imageLibrary/' + orphanImage).get()).exists, false);
  assert.equal((await db.doc(root).get()).exists, false);
});
