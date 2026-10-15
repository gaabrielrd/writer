import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { createAdventurePreviewService } from '../../functions/src/adventurePreview.mjs';
import { previewImageKey, PREVIEW_BYTES } from '../../functions/src/adventurePreviewContracts.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createImageLibraryService } from '../../functions/src/imageLibrary.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-preview-tests',
  target = { kind: 'adventure', id: 'adventure' },
  path = 'adventures/adventure',
  imageId = 'preview-sdk-image-0001',
  imagePath = 'users/author/imageLibrary/' + imageId,
  op = (name) => 'preview-sdk-operation-' + name.replaceAll(/[^a-zA-Z0-9-]/g, '-'),
  previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, api, scenes, preview, library, sceneId, assets;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  process.env.METADATA_SERVER_DETECTION = 'none';
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  api = createAdventureBlocksService({ db: admin });
  scenes = createScenesService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin
    .doc(path)
    .set({ ownerId: 'author', title: 'PRIVATE ADVENTURE', createdAt: 1, updatedAt: 100 });
  const group = await scenes.createSceneGroup('author', {
    target,
    operationId: op('group'),
    title: 'PRIVATE PART',
  });
  const created = await scenes.createScene('author', {
    target,
    operationId: op('scene'),
    parentId: group.id,
    title: 'PRIVATE SCENE',
    content: 'MAIN SECRET',
  });
  sceneId = created.scene.id;
  await admin.doc(imagePath).set({
    state: 'active',
    useCount: 0,
    name: 'Ilustração',
    path: 'book-covers/author/private.png',
    url: 'https://storage.invalid?token=PRIVATE TOKEN',
  });
  assets = { read: async () => Buffer.from('source'), remove: async () => {} };
  preview = createAdventurePreviewService({
    db: admin,
    assets,
    deriveImage: async () => Buffer.from('safe-webp'),
  });
  library = createImageLibraryService({ db: admin, assets });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const client = (uid) =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
const create = (name, audience = 'creator', content = 'Texto adicional') =>
  api.createAdventureBlock('author', {
    adventureId: target.id,
    sceneId,
    operationId: op(name),
    title: name,
    audience,
    content,
  });
const set = (resource, revision, name, image = { imageId, alt: 'Descrição', caption: 'Legenda' }) =>
  api.setAdventureBlockImage('author', {
    adventureId: target.id,
    resource,
    expectedRevision: revision,
    operationId: op(name),
    image,
  });
const page = (audience, extras = {}) =>
  preview.readAdventureScenePreview('author', {
    adventureId: target.id,
    sceneId,
    audience,
    ...extras,
  });

test('SDK typed image uses are atomic across concurrent blocks, replay, duplication and deletion; clients cannot forge them', async () => {
  const a = await create('a', 'players'),
    b = await create('b', 'gm');
  const results = await Promise.all([
    set(a.block.resource, 1, 'link-a'),
    set(b.block.resource, 1, 'link-b'),
  ]);
  assert.equal((await admin.doc(imagePath).get()).data().useCount, 2);
  const usages = await admin.collection(imagePath + '/uses').get();
  assert.equal(usages.size, 2);
  for (const usage of usages.docs) {
    assert.equal(usage.data().kind, 'adventure-block');
    assert.equal(usage.data().adventureId, target.id);
    for (const uid of ['author', 'other', null]) {
      await assertFails(getDoc(doc(client(uid), usage.ref.path)));
      await assertFails(setDoc(doc(client(uid), usage.ref.path), { bookId: 'forged' }));
      await assertFails(deleteDoc(doc(client(uid), usage.ref.path)));
    }
  }
  for (const uid of ['author', 'other', null]) {
    await assertFails(updateDoc(doc(client(uid), imagePath), { useCount: 0 }));
    await assertFails(
      updateDoc(doc(client(uid), path + '/sceneBlocks/' + a.block.resource.id), {
        image: { imageId },
      }),
    );
    await assertFails(
      updateDoc(doc(client(uid), path + '/scenes/' + sceneId), { mainBlockImage: { imageId } }),
    );
  }
  // A changed scene makes an old receipt a conflict rather than a stale base for the principal.
  await api.updateAdventureBlock('author', {
    adventureId: target.id,
    resource: b.block.resource,
    expectedRevision: 2,
    operationId: op('later-metadata'),
    patch: { title: 'Revisado' },
  });
  await assert.rejects(
    set(a.block.resource, 1, 'link-a'),
    (error) => error.details?.reason === 'revision-conflict',
  );
  const copied = await api.duplicateAdventureBlock('author', {
    adventureId: target.id,
    resource: a.block.resource,
    operationId: op('copy'),
    expectedRevision: 2,
  });
  assert.equal((await admin.doc(imagePath).get()).data().useCount, 3);
  await assert.rejects(library.remove('author', { id: imageId }), { code: 'failed-precondition' });
  const request = {
    adventureId: target.id,
    blockId: copied.block.resource.id,
    operationId: op('delete-copy'),
    expectedRevision: 1,
  };
  const removed = await api.deleteAdventureBlock('author', request);
  assert.equal(removed.complete, true);
  assert.deepEqual(await api.deleteAdventureBlock('author', request), removed);
  assert.equal((await admin.doc(imagePath).get()).data().useCount, 2);
  assert.equal(results[0].block.revision, 2);
});

test('SDK image linking racing library removal either preserves active use or rejects before adding a block reference', async () => {
  const a = await create('a');
  const results = await Promise.allSettled([
    set(a.block.resource, 1, 'link-race'),
    library.remove('author', { id: imageId }),
  ]);
  const image = (await admin.doc(imagePath).get()).data(),
    block = (await admin.doc(path + '/sceneBlocks/' + a.block.resource.id).get()).data();
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  if (results[0].status === 'fulfilled') {
    assert.equal(image.state, 'active');
    assert.equal(image.useCount, 1);
    assert.equal(block.image.imageId, imageId);
  } else {
    assert.equal(image.state, 'deleted');
    assert.equal(image.useCount, 0);
    assert.equal(block.image, undefined);
  }
});

test('SDK projected modes omit secrets and stale/forged media is reauthorized after image I/O', async () => {
  await create('PRIVATE AUTHOR', 'creator', 'AUTHOR SECRET');
  const gm = await create('PRIVATE GM', 'gm', 'GM SECRET');
  const a = await create(
    'Jogadores',
    'players',
    '<p><span data-lore-id="PRIVATE LORE">Literal</span><a href="https://private.invalid?token=PRIVATE TOKEN">Link</a><img src="https://private.invalid"><script>PRIVATE SCRIPT</script></p>',
  );
  await set(a.block.resource, 1, 'link');
  const players = await page('players');
  assert.equal(players.items.length, 1);
  for (const secret of [
    'PRIVATE',
    'MAIN SECRET',
    'AUTHOR SECRET',
    'GM SECRET',
    imageId,
    'token=',
    'data-lore',
    'href=',
    'src=',
  ])
    assert.equal(JSON.stringify(players).includes(secret), false, secret);
  assert.equal((await page('gm')).items.length, 2);
  assert.equal((await page('creator')).items.length, 4);
  const request = {
    adventureId: target.id,
    sceneId,
    audience: 'players',
    projectionToken: players.projectionToken,
    imageKey: players.items[0].image.imageKey,
  };
  assert.deepEqual(await preview.readAdventurePreviewImage('author', request), {
    dataUrl: 'data:image/webp;base64,' + Buffer.from('safe-webp').toString('base64'),
  });
  await assert.rejects(
    preview.readAdventurePreviewImage('author', {
      ...request,
      imageKey: previewImageKey(players.projectionToken, gm.block.resource),
    }),
    { code: 'not-found' },
  );
  await assert.rejects(preview.readAdventurePreviewImage('other', request), { code: 'not-found' });
  assets.read = async () => {
    await admin.doc(imagePath).update({ state: 'deleting' });
    return Buffer.from('source');
  };
  await assert.rejects(preview.readAdventurePreviewImage('author', request), { code: 'not-found' });
  await admin.doc(imagePath).update({ state: 'active' });
  const before = (await admin.doc(path + '/scenes/' + sceneId).get()).data();
  await api.updateAdventureBlock('author', {
    adventureId: target.id,
    resource: a.block.resource,
    operationId: op('private-now'),
    expectedRevision: 2,
    patch: { audience: 'creator' },
  });
  await assert.rejects(preview.readAdventurePreviewImage('author', request), {
    code: 'failed-precondition',
  });
  assert.ok((await admin.doc(path + '/scenes/' + sceneId).get()).data().revision > before.revision);
});

test('SDK 4 MiB pagination retains the next full permitted block without secret cursor positions or truncated text', async () => {
  await create('PRIVATE-BEFORE', 'creator', 'SECRET');
  await create('A', 'players', '&'.repeat(800000));
  await create('B', 'players', '&'.repeat(800000));
  const first = await page('players');
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].title, 'A');
  assert.ok(Buffer.byteLength(JSON.stringify(first)) <= PREVIEW_BYTES);
  assert.equal(first.items[0].html, '&amp;'.repeat(800000));
  const second = await page('players', { cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].title, 'B');
  assert.equal(second.nextCursor, null);
  await assert.rejects(page('gm', { cursor: first.nextCursor }), { code: 'invalid-argument' });
});
