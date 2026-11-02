import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureDeletionDb } from './helpers/adventureDeletionDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import { createAdventureDeletionService } from '../src/adventureDeletion.mjs';
import { adventureImageUseKey } from '../src/adventureBlockImages.mjs';
import { ADVENTURE_DELETION_LAYOUT as layout } from '../src/adventureDeletionInventory.mjs';
import {
  archiveCleanupFixture,
  finishArchiveCleanup,
} from './helpers/adventureRestoreArchiveCleanupFixture.mjs';
const uid = 'author',
  id = 'cleanup-adventure-project-0001',
  imageId = 'cleanup-shared-image-0001';
const imagePath = 'users/' + uid + '/imageLibrary/' + imageId;
const step = (p) => ({
  deletionId: p.deletionId,
  deletionToken: p.deletionToken,
  expectedCheckpoint: p.checkpoint,
  operationId: 'cleanup-adventure-step-' + String(p.checkpoint).padStart(8, '0'),
});
const stored = (f, p) => f.records.get('users/' + uid + '/adventureDeletions/' + p.deletionId);
async function fixture() {
  const f = adventureDeletionDb(),
    studio = createStudioService({ db: f.db, now: () => 1000 });
  await studio.createAdventure(uid, {
    operationId: id,
    title: 'Own project',
    synopsis: 'PRIVATE_OWN_SYNOPSIS',
  });
  f.records.set(imagePath, {
    id: imageId,
    state: 'active',
    useCount: 0,
    name: 'Own independent image',
    url: 'https://example.test/image.png',
    path: 'book-covers/author/own.png',
  });
  return { ...f, studio, target: { kind: 'adventure', id } };
}
async function begin(f, adventureId = id) {
  const api = createAdventureDeletionService({
    db: f.db,
    assets: {
      retire: () => {
        throw Error('Unexpected Storage operation');
      },
    },
    now: () => 9000,
  });
  const s = await api.getAdventureDeletionSource(uid, { adventureId });
  const p = (
    await api.startAdventureDeletion(uid, {
      adventureId,
      adventureToken: s.adventureToken,
      sourceToken: s.sourceToken,
      expectedRevision: s.revision,
      operationId: 'cleanup-adventure-start-0001',
    })
  ).progress;
  return { api, p };
}
async function until(f, api, p, phase) {
  for (let n = 0; p.phase !== phase; n++) {
    assert.ok(n < 500);
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  }
  return p;
}
function seedUse(f, resource, adventureId = id, path = imagePath) {
  const key = adventureImageUseKey(adventureId, resource);
  f.records.set(path + '/uses/' + key, { kind: 'adventure-block', adventureId, resource });
  const image = f.records.get(path);
  if (image) image.useCount++;
  return path + '/uses/' + key;
}
async function attach(f, adventureId, number) {
  const scenes = createScenesService({ db: f.db, now: () => 2000 }),
    blocks = createAdventureBlocksService({ db: f.db, now: () => 3000 });
  const scene = (
    await scenes.createScene(uid, {
      target: { kind: 'adventure', id: adventureId },
      operationId: 'cleanup-attach-scene-' + number,
      parentId: null,
      title: 'Scene',
      content: 'PRIVATE_BODY_' + number,
    })
  ).scene;
  await blocks.setAdventureBlockImage(uid, {
    adventureId,
    resource: { kind: 'scene', id: scene.id },
    expectedRevision: scene.revision,
    operationId: 'cleanup-attach-image-' + number,
    image: { imageId, alt: 'Own alt', caption: 'Own caption' },
  });
  return scene;
}

test('normal shared image uses are detached in aggregate while other projects, legacy uses, library bytes and root marker remain', async () => {
  const f = await fixture(),
    neighbor = id + '-neighbor';
  await f.studio.createAdventure(uid, { operationId: neighbor, title: 'Neighbor' });
  for (let n = 0; n < 3; n++) await attach(f, id, n);
  await attach(f, neighbor, 100);
  const legacyPath = imagePath + '/uses/legacy-book-0001';
  f.records.set(legacyPath, { bookId: 'legacy-book-0001' });
  f.records.get(imagePath).useCount++;
  const keptImage = structuredClone(f.records.get(imagePath));
  const b = await begin(f),
    root = await f.db.doc('adventures/' + id).get();
  let p = await until(f, b.api, b.p, 'images');
  const first = await b.api.advanceAdventureDeletion(uid, step(p));
  assert.equal(first.progress.deletedDocuments - p.deletedDocuments, 3);
  assert.deepEqual(f.records.get(imagePath), { ...keptImage, useCount: 2 });
  const before = structuredClone(f.records);
  assert.deepEqual(await b.api.advanceAdventureDeletion(uid, step(p)), first);
  assert.deepEqual(f.records, before);
  p = await until(f, b.api, first.progress, 'controls');
  assert.deepEqual(stored(f, p).certified, ['quiescence', 'media', 'images', 'children']);
  assert.ok(f.records.has(legacyPath));
  assert.ok(
    [...f.records].some(([key, value]) => key.includes('/uses/') && value.adventureId === neighbor),
  );
  assert.ok([...f.records.keys()].some((key) => key.startsWith('adventures/' + neighbor + '/')));
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith('adventures/' + id + '/')),
    false,
  );
  const afterStamp = (await f.db.doc('adventures/' + id).get()).updateTime;
  assert.equal(afterStamp.seconds, root.updateTime.seconds);
  assert.equal(afterStamp.nanoseconds, root.updateTime.nanoseconds);
  assert.equal(f.records.get('adventures/' + id).deleting, true);
});

test('usage pages remove 25/25/3/0 and preserve the remaining count of a shared image', async () => {
  const f = await fixture();
  for (let n = 0; n < 53; n++) seedUse(f, { kind: 'scene', id: 'missing-scene-' + n });
  const neighbor = seedUse(f, { kind: 'scene', id: 'other-scene' }, id + '-other');
  const b = await begin(f);
  let p = await until(f, b.api, b.p, 'images');
  const sizes = [];
  for (let n = 0; n < 4; n++) {
    const before = p.deletedDocuments;
    p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
    sizes.push(p.deletedDocuments - before);
  }
  assert.deepEqual(sizes, [25, 25, 3, 0]);
  assert.equal(p.phase, 'children');
  assert.equal(f.records.get(imagePath).useCount, 1);
  assert.ok(f.records.has(neighbor));
  assert.ok(
    f.groupReads
      .filter((r) => r.group === 'uses')
      .every((r) => r.maximum === 25 && !r.fields.includes('url') && !r.fields.includes('content')),
  );
});

test('an orphan image use is retired with its image and project heads absent without creating counters or touching another account', async () => {
  const f = await fixture(),
    usage = seedUse(f, { kind: 'block', id: 'orphan-block' }),
    foreign =
      'users/other/imageLibrary/' +
      imageId +
      '/uses/' +
      adventureImageUseKey(id, { kind: 'scene', id: 'other' });
  f.records.set(foreign, {
    kind: 'adventure-block',
    adventureId: id,
    resource: { kind: 'scene', id: 'other' },
  });
  f.records.delete(imagePath);
  const b = await begin(f);
  let p = await until(f, b.api, b.p, 'images');
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('adventures/' + id)));
  p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(f.records.has(usage), false);
  assert.equal(f.records.has(imagePath), false);
  assert.ok(f.records.has(foreign));
  assert.equal(f.records.has('adventures/' + id), false);
  assert.equal(p.deletedDocuments, 1);
});

for (const corrupt of [
  'key',
  'kind',
  'resource',
  'owner',
  'image-owner',
  'counter',
  'inactive-image',
  'unexpected-path',
])
  test('inconsistent ' + corrupt + ' preserves all image uses and their checkpoint', async () => {
    const f = await fixture(),
      usage = seedUse(f, { kind: 'scene', id: 'first-scene' });
    seedUse(f, { kind: 'block', id: 'second-block' });
    if (corrupt === 'key') {
      f.records.set(imagePath + '/uses/wrong-key', f.records.get(usage));
      f.records.delete(usage);
    }
    if (corrupt === 'kind') f.records.get(usage).kind = 'book';
    if (corrupt === 'resource') f.records.get(usage).resource.kind = 'chapter';
    if (corrupt === 'owner') f.records.get(usage).ownerId = 'other';
    if (corrupt === 'image-owner') f.records.get(imagePath).ownerId = 'other';
    if (corrupt === 'counter') f.records.get(imagePath).useCount = 1;
    if (corrupt === 'inactive-image') f.records.get(imagePath).state = 'deleted';
    if (corrupt === 'unexpected-path') {
      f.records.set(
        imagePath + '/unexpected/path/uses/' + usage.split('/').at(-1),
        f.records.get(usage),
      );
      f.records.delete(usage);
    }
    const b = await begin(f),
      p = await until(f, b.api, b.p, 'images'),
      before = structuredClone(f.records);
    await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(p)), {
      code: 'failed-precondition',
    });
    assert.deepEqual(f.records, before);
  });

for (const boundary of ['use', 'counter', 'job', 'receipt'])
  test(
    'image page rollback at ' + boundary + ' leaves counts and receipts recoverable',
    async () => {
      const f = await fixture();
      seedUse(f, { kind: 'scene', id: 'first-scene' });
      seedUse(f, { kind: 'block', id: 'second-block' });
      const b = await begin(f),
        p = await until(f, b.api, b.p, 'images'),
        original = f.db.runTransaction.bind(f.db),
        before = structuredClone(f.records);
      let failed = false;
      f.db.runTransaction = (callback) =>
        original((tx) =>
          callback(
            new Proxy(tx, {
              get(target, key) {
                if (!['delete', 'set', 'update', 'create'].includes(key)) return target[key];
                return (ref, ...args) => {
                  const fail =
                    boundary === 'use'
                      ? ref.path.includes('/uses/')
                      : boundary === 'counter'
                        ? ref.path === imagePath
                        : boundary === 'job'
                          ? ref.path.includes('/adventureDeletions/')
                          : ref.path.includes('/adventureDeletionOperations/');
                  if (fail) {
                    failed = true;
                    throw Error('Image page rollback');
                  }
                  return target[key](ref, ...args);
                };
              },
            }),
          ),
        );
      await assert.rejects(
        () => b.api.advanceAdventureDeletion(uid, step(p)),
        /Image page rollback/,
      );
      assert.equal(failed, true);
      assert.deepEqual(f.records, before);
      f.db.runTransaction = original;
      const first = await b.api.advanceAdventureDeletion(uid, step(p));
      assert.equal(first.progress.deletedDocuments - p.deletedDocuments, 2);
      assert.equal(f.records.get(imagePath).useCount, 0);
    },
  );

test('lost image-page acknowledgement replays its original receipt without decrementing twice', async () => {
  const f = await fixture();
  seedUse(f, { kind: 'scene', id: 'first-scene' });
  const b = await begin(f),
    p = await until(f, b.api, b.p, 'images'),
    original = f.db.runTransaction.bind(f.db);
  let lose = true;
  f.db.runTransaction = async (callback) => {
    const result = await original(callback);
    if (lose) {
      lose = false;
      throw Error('Lost image checkpoint acknowledgement');
    }
    return result;
  };
  const request = step(p);
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, request), /Lost image checkpoint/);
  const before = structuredClone(f.records),
    replay = await b.api.advanceAdventureDeletion(uid, request);
  assert.equal(replay.progress.deletedDocuments - p.deletedDocuments, 1);
  assert.deepEqual(f.records, before);
  assert.equal(f.records.get(imagePath).useCount, 0);
});

test('all physical families and 54 parentless bodies are removed by metadata pages before the controls phase', async () => {
  const f = await fixture(),
    root = 'adventures/' + id;
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
    f.records.set(path, {
      ownerId: uid,
      adventureId: id,
      content: 'DO_NOT_READ_PRIVATE_BODY',
      ...(family.collection === 'workVersions' ? { target: { kind: 'adventure', id } } : {}),
    });
  }
  for (let n = 0; n < 54; n++)
    f.records.set(root + '/scenes/orphan-' + n + '/body/current', { content: 'DO_NOT_READ_' + n });
  const kept = root + '-other/scenes/orphan/body/current';
  f.records.set(kept, { content: 'KEEP_OTHER' });
  const b = await begin(f),
    p = await until(f, b.api, b.p, 'controls');
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith(root + '/')),
    false,
  );
  assert.ok(f.records.has(kept));
  assert.ok(f.records.has(root));
  assert.equal(p.complete, false);
  assert.ok(p.deletedDocuments >= 77);
  assert.ok(f.metadataReads.every((r) => !r.fields.includes('content')));
  assert.ok(f.groupReads.every((r) => !r.fields.includes('content')));
});

test('a body that reappears behind the family cursor prevents the final empty certificate', async () => {
  const f = await fixture(),
    b = await begin(f);
  let p = await until(f, b.api, b.p, 'children');
  p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(stored(f, p).part, 1);
  const orphan = 'adventures/' + id + '/scenes/missing/body/current';
  f.records.set(orphan, { content: 'DO_NOT_SKIP' });
  for (let n = 0; stored(f, p).part < layout.length; n++)
    p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
  const resumed = await b.api.advanceAdventureDeletion(uid, step(p));
  assert.equal(resumed.progress.phase, 'children');
  assert.equal(stored(f, resumed.progress).part, 0);
  assert.ok(f.records.has(orphan));
  assert.equal(stored(f, resumed.progress).certified.includes('children'), false);
  const confirmed = await until(f, b.api, resumed.progress, 'controls');
  assert.equal(confirmed.phase, 'controls');
  assert.equal(f.records.has(orphan), false);
});

test('remaining preparing media or a late recovery key blocks the media gate without publication or source mutation', async () => {
  for (const kind of ['image', 'key']) {
    const f = await fixture(),
      b = await begin(f),
      p = await until(f, b.api, b.p, 'media');
    if (kind === 'image')
      f.records.set('users/' + uid + '/imageLibrary/orphan-pending-image-0001', {
        state: 'preparing',
        restoreOrigin: { target: { kind: 'adventure', id } },
      });
    else
      f.records.set('users/' + uid + '/adventureRestoreRecoveryKeys/orphan-key-0001', {
        adventureId: id,
        keyBase64: 'DO_NOT_READ',
      });
    const before = structuredClone(f.records);
    await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(p)), {
      code: 'failed-precondition',
    });
    assert.deepEqual(f.records, before);
  }
});

test('a restored adventure reaches empty authorship while its active library copy and frozen restore job remain', async () => {
  const { f, p: source, progress } = await archiveCleanupFixture();
  await finishArchiveCleanup(f, source, progress);
  adventureDeletionDb(f);
  const image = [...f.records].find(
    ([key]) => key.startsWith('users/' + uid + '/imageLibrary/') && !key.includes('/uses/'),
  );
  const originalImage = structuredClone(image[1]),
    parent = structuredClone(f.records.get(f.path));
  const b = await begin(f, source.adventureId),
    p = await until(f, b.api, b.p, 'controls');
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith('adventures/' + source.adventureId + '/')),
    false,
  );
  assert.deepEqual(f.records.get(image[0]), { ...originalImage, useCount: 0 });
  assert.deepEqual(f.records.get(f.path), parent);
  assert.equal(p.complete, false);
});

for (const boundary of ['body', 'receipt'])
  test(
    'body page rollback at ' +
      boundary +
      ' preserves every text and retries its original checkpoint',
    async () => {
      const f = await fixture();
      const bodyPaths = [0, 1].map(
        (n) => 'adventures/' + id + '/scenes/missing-' + n + '/body/current',
      );
      bodyPaths.forEach((path) => f.records.set(path, { content: 'PRIVATE_EXACT_TEXT' }));
      const b = await begin(f),
        p = await until(f, b.api, b.p, 'children'),
        original = f.db.runTransaction.bind(f.db),
        before = structuredClone(f.records);
      let failed = false;
      f.db.runTransaction = (callback) =>
        original((tx) =>
          callback(
            new Proxy(tx, {
              get(target, key) {
                if (!['delete', 'create'].includes(key)) return target[key];
                return (ref, ...args) => {
                  if (
                    (boundary === 'body' && ref.path.includes('/body/')) ||
                    (boundary === 'receipt' && ref.path.includes('/adventureDeletionOperations/'))
                  ) {
                    failed = true;
                    throw Error('Body page rollback');
                  }
                  return target[key](ref, ...args);
                };
              },
            }),
          ),
        );
      await assert.rejects(
        () => b.api.advanceAdventureDeletion(uid, step(p)),
        /Body page rollback/,
      );
      assert.equal(failed, true);
      assert.deepEqual(f.records, before);
      f.db.runTransaction = original;
      const next = await b.api.advanceAdventureDeletion(uid, step(p));
      assert.equal(next.progress.deletedDocuments - p.deletedDocuments, 2);
      assert.ok(bodyPaths.every((path) => !f.records.has(path)));
    },
  );
