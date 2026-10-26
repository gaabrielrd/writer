import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import { libraryImage } from '../src/imageLibrary.mjs';
import { adventureImageUseKey } from '../src/adventureBlockImages.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupImageService } from '../src/adventureBackupImageRead.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';

const uid = 'author',
  id = 'adventure-image-backup-0001',
  path = 'adventures/' + id,
  target = { kind: 'adventure', id },
  sceneId = 'image-backup-scene-0001',
  blockId = 'image-backup-block-0001',
  imageId = 'adventure-private-image-0001',
  libraryPath = 'users/' + uid + '/imageLibrary/' + imageId,
  filePath = 'book-covers/' + uid + '/' + imageId + '.png',
  scenePath = path + '/scenes/' + sceneId,
  blockPath = path + '/sceneBlocks/' + blockId;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const usage = (resource) => libraryPath + '/uses/' + adventureImageUseKey(id, resource);
async function fixture(count = 1) {
  const f = adventureImportDb({ nativeUpdates: true }),
    io = [],
    hook = { metadata: null, hash: null, range: null },
    bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(140000, 7)]),
    meta = {
      generation: '12',
      metageneration: '3',
      size: bytes.length,
      contentType: 'image/png',
      accepted: true,
    };
  await f.db.runTransaction((tx) =>
    tx.create(
      f.db.doc(libraryPath),
      libraryImage(
        imageId,
        {
          title: 'PRIVATE_IMAGE 🌙',
          coverUrl: 'DO_NOT_COPY_URL',
          path: filePath,
          acceptedAt: 1100,
        },
        1100,
      ),
    ),
  );
  await createStudioService({ db: f.db, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
  });
  const scenes = createScenesService({ db: f.db, now: () => 1200 });
  for (let n = 0; n < count; n++)
    await scenes.createScene(uid, {
      target,
      operationId: n === 0 ? sceneId : 'image-backup-extra-' + String(n).padStart(4, '0'),
      title: 'PRIVATE_SCENE',
      content: 'PRIVATE_PROSE',
    });
  const blocks = createAdventureBlocksService({ db: f.db, now: () => 1300 });
  await blocks.createAdventureBlock(uid, {
    adventureId: id,
    sceneId,
    operationId: blockId,
    title: 'PRIVATE_BLOCK',
    content: 'PRIVATE_BLOCK_PROSE',
  });
  for (const resource of [
    { kind: 'scene', id: sceneId },
    { kind: 'block', id: blockId },
  ]) {
    await blocks.setAdventureBlockImage(uid, {
      adventureId: id,
      resource,
      operationId: 'attach-private-image-' + resource.kind,
      expectedRevision: f.records.get(resource.kind === 'scene' ? scenePath : blockPath).revision,
      image: { imageId, alt: '  own alt 🌙  ', caption: '' },
    });
  }
  const assets = {
    async metadata(p) {
      io.push(['metadata', p]);
      await hook.metadata?.();
      return { ...meta };
    },
    async hashGeneration(p, generation, max) {
      io.push(['hash', p, generation, max]);
      await hook.hash?.();
      return {
        byteLength: bytes.length,
        contentHash: hash(bytes),
        signature: bytes.subarray(0, 8).toString('hex'),
      };
    },
    async readRange(p, generation, start, end) {
      io.push(['range', p, generation, start, end]);
      const result = Buffer.from(bytes.subarray(start, end + 1));
      await hook.range?.();
      return result;
    },
  };
  const pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  return {
    ...f,
    scenes,
    blocks,
    bytes,
    meta,
    io,
    hook,
    assets,
    pin,
    api: createAdventureBackupImageService({ db: f.db, assets }),
  };
}
const list = (f, kind = 'scene', extra = {}, actor = uid) =>
  f.api.listAdventureBackupImageBindings(actor, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    kind,
    ...extra,
  });
const request = (f, row, kind = 'scene', extra = {}) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind,
  id: row.id,
  bindingToken: row.bindingToken,
  ...extra,
});
const get = (f, row, kind = 'scene') => f.api.getAdventureBackupImage(uid, request(f, row, kind));
const update = (f, p, patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(p), patch));
const remove = (f, p) => f.db.runTransaction((tx) => tx.delete(f.db.doc(p)));

test('real main/additional image uses preserve exact authorized PNG bytes and omit paths/URLs/operation data', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    start = f.commits.length;
  f.reads.length = 0;
  f.metadataReads.length = 0;
  for (const kind of ['scene', 'block']) {
    const row = (await list(f, kind)).items[0],
      captured = await get(f, row, kind),
      chunks = [];
    assert.equal(captured.image.imageId, imageId);
    assert.equal(captured.image.name, 'PRIVATE_IMAGE 🌙');
    assert.equal(captured.image.alt, '  own alt 🌙  ');
    assert.equal(captured.image.caption, '');
    assert.equal(JSON.stringify(captured).includes('DO_NOT_COPY'), false);
    for (const key of ['path', 'url', 'generation', 'metageneration', 'useCount', 'ownerId'])
      assert.equal(Object.hasOwn(captured.image, key), false);
    for (let index = 0; index < captured.image.chunkCount; index++) {
      const r = await f.api.readAdventureBackupImageChunk(
          uid,
          request(f, row, kind, { imageToken: captured.imageToken, index }),
        ),
        bytes = Buffer.from(r.chunkBase64, 'base64');
      assert.ok(bytes.length <= 65536);
      assert.equal(r.chunkHash, hash(bytes));
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    assert.deepEqual(bytes, f.bytes);
    assert.equal(hash(bytes), captured.image.contentHash);
    await f.api.verifyAdventureBackupImage(
      uid,
      request(f, row, kind, { imageToken: captured.imageToken }),
    );
  }
  assert.ok(f.reads.every((r) => !r.fields.includes('title') && !r.fields.includes('content')));
  assert.ok(
    f.metadataReads.every((r) => !r.fields.includes('url') && !r.fields.includes('content')),
  );
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(start).every((w) => w.length === 0));
  assert.ok(f.io.filter((r) => r[0] === 'range').every((r) => r[1] === filePath && r[2] === '12'));
});

test('archived/unassigned source and additional block retain their own image bindings', async () => {
  const f = await fixture();
  await f.blocks.archiveAdventureBlock(uid, {
    adventureId: id,
    blockId,
    operationId: 'archive-image-block-0001',
    expectedRevision: f.records.get(blockPath).revision,
    archived: true,
  });
  await f.scenes.archiveScene(uid, {
    target,
    sceneId,
    operationId: 'archive-image-scene-0001',
    expectedRevision: f.records.get(scenePath).revision,
    archived: true,
  });
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  for (const kind of ['scene', 'block'])
    assert.equal((await get(f, (await list(f, kind)).items[0], kind)).image.imageId, imageId);
});

test('fifty-three metadata bindings include absence without fetching storage or whole library', async () => {
  const f = await fixture(53),
    a = await list(f, 'scene', { limit: 50 }),
    b = await list(f, 'scene', { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 3);
  assert.equal(b.nextCursor, null);
  assert.equal(f.io.length, 0);
  const none = [...a.items, ...b.items].find((r) => r.imageId === null),
    captured = await get(f, none);
  assert.deepEqual(captured.image, { kind: 'none' });
  assert.equal(f.io.length, 0);
  await assert.rejects(
    f.api.readAdventureBackupImageChunk(
      uid,
      request(f, none, 'scene', { imageToken: captured.imageToken, index: 0 }),
    ),
    { code: 'failed-precondition' },
  );
});

test('extracted typed-use key retains the exact native producer address', () => {
  assert.equal(
    adventureImageUseKey(id, { kind: 'block', id: blockId }),
    'adventure-block:98100354ecabbfb9c3ca70863150f6c9b6aec6c160aca236fffaf07d1dd02d34',
  );
});

for (const [p, patch] of [
  [scenePath, { ownerId: 'other' }],
  [blockPath, { schemaVersion: 2 }],
  [blockPath, { sceneId: 'missing-scene' }],
  [scenePath, { deleting: true }],
  [libraryPath, { state: 'deleting' }],
  [libraryPath, { useCount: 0 }],
  [libraryPath, { path: 'book-covers/other/' + imageId + '.png' }],
  [usage({ kind: 'block', id: blockId }), { adventureId: 'other' }],
  [usage({ kind: 'block', id: blockId }), { resource: { kind: 'scene', id: sceneId } }],
])
  test(
    'invalid image authority fails before storage bytes ' + p + JSON.stringify(patch),
    async () => {
      const f = await fixture();
      await update(f, p, patch);
      await assert.rejects(list(f, 'block'));
      assert.equal(f.io.length, 0);
    },
  );

for (const p of [scenePath, blockPath, libraryPath, usage({ kind: 'block', id: blockId })])
  test('native recreation invalidates image binding ' + p, async () => {
    const f = await fixture(),
      row = (await list(f, 'block')).items[0],
      value = structuredClone(f.records.get(p));
    await remove(f, p);
    await f.db.runTransaction((tx) => tx.create(f.db.doc(p), value));
    await assert.rejects(get(f, row, 'block'), { code: 'failed-precondition' });
    assert.equal(f.io.length, 0);
  });

for (const stage of ['metadata', 'hash', 'range'])
  test('revoked typed use during ' + stage + ' I/O cannot return successful bytes', async () => {
    const f = await fixture(),
      row = (await list(f, 'block')).items[0],
      captured = stage === 'range' ? await get(f, row, 'block') : null;
    f.hook[stage] = async () => {
      f.hook[stage] = null;
      await remove(f, usage({ kind: 'block', id: blockId }));
    };
    await assert.rejects(
      stage === 'range'
        ? f.api.readAdventureBackupImageChunk(
            uid,
            request(f, row, 'block', { imageToken: captured.imageToken, index: 0 }),
          )
        : get(f, row, 'block'),
      { code: 'failed-precondition' },
    );
  });

for (const patch of [
  { generation: '0' },
  { metageneration: 'bad' },
  { size: 7 },
  { size: 16777217 },
  { contentType: 'image/jpeg' },
  { accepted: false },
])
  test(
    'invalid Storage metadata never proceeds to byte hashing ' + JSON.stringify(patch),
    async () => {
      const f = await fixture(),
        row = (await list(f)).items[0];
      Object.assign(f.meta, patch);
      await assert.rejects(get(f, row), { code: 'failed-precondition' });
      assert.equal(
        f.io.some((r) => r[0] === 'hash'),
        false,
      );
    },
  );

for (const patch of [
  { signature: '0000000000000000' },
  { contentHash: 'invalid' },
  { byteLength: 4 },
])
  test('captured bytes must satisfy the full PNG descriptor ' + JSON.stringify(patch), async () => {
    const f = await fixture(),
      row = (await list(f)).items[0],
      original = f.assets.hashGeneration;
    f.assets.hashGeneration = async (...args) => ({ ...(await original(...args)), ...patch });
    await assert.rejects(get(f, row), { code: 'failed-precondition' });
  });

for (const key of ['generation', 'metageneration'])
  test(
    'Storage ' + key + ' changes during a range invalidate its observed image token',
    async () => {
      const f = await fixture(),
        row = (await list(f)).items[0],
        captured = await get(f, row);
      f.hook.range = async () => {
        f.hook.range = null;
        f.meta[key] = '44';
      };
      await assert.rejects(
        f.api.readAdventureBackupImageChunk(
          uid,
          request(f, row, 'scene', { imageToken: captured.imageToken, index: 0 }),
        ),
        { code: 'failed-precondition' },
      );
    },
  );

test('invalid range length, fixed request intent and failed read retry leave origins untouched', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0],
    captured = await get(f, row),
    input = request(f, row, 'scene', { imageToken: captured.imageToken, index: 0 }),
    before = structuredClone([...f.records]),
    original = f.assets.readRange;
  f.hook.metadata = async () => {
    f.hook.metadata = null;
    Object.assign(input, {
      id: blockId,
      kind: 'block',
      index: 2,
      imageToken: '0'.repeat(64),
      bindingToken: '0'.repeat(64),
    });
  };
  const result = await f.api.readAdventureBackupImageChunk(uid, input);
  assert.equal(result.index, 0);
  assert.deepEqual(Buffer.from(result.chunkBase64, 'base64'), f.bytes.subarray(0, 65536));
  f.assets.readRange = async () => Buffer.alloc(3);
  await assert.rejects(
    f.api.readAdventureBackupImageChunk(
      uid,
      request(f, row, 'scene', { imageToken: captured.imageToken, index: 0 }),
    ),
    { code: 'failed-precondition' },
  );
  f.assets.readRange = async () => {
    throw Error('injected bytes failure');
  };
  await assert.rejects(
    f.api.readAdventureBackupImageChunk(
      uid,
      request(f, row, 'scene', { imageToken: captured.imageToken, index: 0 }),
    ),
    { code: 'not-found' },
  );
  f.assets.readRange = original;
  await f.api.readAdventureBackupImageChunk(
    uid,
    request(f, row, 'scene', { imageToken: captured.imageToken, index: 0 }),
  );
  assert.deepEqual([...f.records], before);
});

test('recreated root cannot adopt older image uses or source heads', async () => {
  const f = await fixture(),
    original = structuredClone(f.records.get(path));
  await remove(f, path);
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), original));
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  await assert.rejects(list(f), { code: 'failed-precondition' });
  assert.equal(f.io.length, 0);
});

test('image cursor, account and input cannot select an arbitrary library asset or storage path', async () => {
  const f = await fixture(2),
    a = await list(f, 'scene', { limit: 1 }),
    parsed = JSON.parse(Buffer.from(a.nextCursor, 'base64url').toString()),
    row = a.items[0];
  for (const patch of [
    { kind: 'block' },
    { adventureId: 'other' },
    { sourceToken: '0'.repeat(64) },
    { version: 2 },
    { path: 'arbitrary' },
  ])
    await assert.rejects(
      list(f, 'scene', {
        cursor: Buffer.from(JSON.stringify({ ...parsed, ...patch })).toString('base64url'),
      }),
      { code: 'invalid-argument' },
    );
  for (const actor of [null, 'other']) {
    await assert.rejects(list(f, 'scene', {}, actor), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
    await assert.rejects(f.api.getAdventureBackupImage(actor, request(f, row)), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
  }
  for (const patch of [{ path: filePath }, { imageId }, { kind: 'library' }])
    await assert.rejects(f.api.getAdventureBackupImage(uid, { ...request(f, row), ...patch }), {
      code: 'invalid-argument',
    });
  for (const index of [-1, 0.5, 256])
    await assert.rejects(
      f.api.readAdventureBackupImageChunk(
        uid,
        request(f, row, 'scene', { imageToken: '0'.repeat(64), index }),
      ),
      { code: 'invalid-argument' },
    );
});

test('unrepresentable image captions are refused before any storage lookup', async () => {
  const f = await fixture();
  await update(f, scenePath, { mainBlockImage: { imageId, alt: '\ud800', caption: '' } });
  await assert.rejects(list(f), { code: 'failed-precondition' });
  assert.equal(f.io.length, 0);
});
