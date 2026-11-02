import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupResourceService } from '../src/adventureBackupResourceRead.mjs';
import { serializeAdventureBackupResource } from '../src/adventureBackupResources.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const uid = 'author',
  id = 'adventure-resources-0001',
  path = 'adventures/' + id;
const target = { kind: 'adventure', id };
const sceneId = 'resource-scene-000001',
  partId = 'resource-part-000001',
  blockId = 'resource-block-000001';
const scenePath = path + '/scenes/' + sceneId,
  blockPath = path + '/sceneBlocks/' + blockId;
async function fixture(count = 1) {
  const f = adventureImportDb({ nativeUpdates: true });
  await createStudioService({ db: f.db, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
    synopsis: 'Own synopsis',
  });
  const scenes = createScenesService({ db: f.db, now: () => 1100 });
  await scenes.createSceneGroup(uid, { target, operationId: partId, title: 'PRIVATE_PART' });
  for (let n = 1; n <= count; n++)
    await scenes.createScene(uid, {
      target,
      operationId: 'resource-scene-' + String(n).padStart(6, '0'),
      parentId: n === 1 ? partId : null,
      title: 'PRIVATE_SCENE_' + n,
      content: '<p>PRIVATE_BODY 🌙 ' + n + '</p>',
      planning: { objective: 'PRIVATE_OBJECTIVE', conflict: '', pointOfView: '' },
    });
  const blocks = createAdventureBlocksService({ db: f.db, now: () => 1200 });
  await blocks.createAdventureBlock(uid, {
    adventureId: id,
    sceneId,
    operationId: blockId,
    title: 'PRIVATE_BLOCK',
    narrativeType: 'clue',
    audience: 'gm',
    content: '<p>PRIVATE_CLUE 🌙</p>',
  });
  const pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  return { ...f, scenes, blocks, pin, api: createAdventureBackupResourceService(f) };
}
const listing = (f, kind, extra = {}, actor = uid) =>
  f.api.listAdventureBackupResources(actor, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    kind,
    ...extra,
  });
const request = (f, kind, row, parentId = null) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind,
  parentId,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});
async function readAll(f, input) {
  const chunks = [];
  let header;
  for (let index = 0; ; index++) {
    const result = await f.api.readAdventureBackupResource(uid, { ...input, index });
    header ??= result;
    assert.equal(result.contentHash, header.contentHash);
    assert.equal(result.byteLength, header.byteLength);
    assert.equal(result.chunkCount, header.chunkCount);
    const bytes = Buffer.from(result.chunkBase64, 'base64');
    assert.ok(bytes.length > 0 && bytes.length <= 65536);
    chunks.push(bytes);
    if (index + 1 === header.chunkCount) break;
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, header.byteLength);
  assert.equal(digest(bytes.toString('utf8')), header.contentHash);
  return { dto: JSON.parse(bytes.toString('utf8')), header };
}
async function resource(f, kind, parentId = null, resourceId = null) {
  const page = await listing(f, kind, { parentId });
  const row = resourceId ? page.items.find((r) => r.id === resourceId) : page.items[0];
  assert.ok(row, kind);
  return readAll(f, request(f, kind, row, parentId));
}
const update = (f, resourcePath, patch) =>
  f.db.runTransaction((tx) => tx.update(f.db.doc(resourcePath), patch));
const remove = (f, resourcePath) => f.db.runTransaction((tx) => tx.delete(f.db.doc(resourcePath)));

test('real scene and block producers retain all resource families without prose in lists or any writes', async () => {
  const f = await fixture();
  // A native reference is intentionally unresolved: its external origin is unavailable.
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(scenePath + '/references/native-ref'), {
      kind: 'universe',
      scopeId: 'unavailable-world',
      entityId: 'external-person',
      label: 'FORBIDDEN_GLOBAL_LABEL',
      content: 'FORBIDDEN_GLOBAL_BODY',
    }),
  );
  const before = structuredClone([...f.records]),
    start = f.commits.length;
  f.reads.length = 0;
  f.metadataReads.length = 0;
  for (const [kind, parentId] of [
    ['part-control', null],
    ['scene-control', null],
    ['scene', null],
    ['block', null],
    ['scene-body', sceneId],
    ['scene-planning', sceneId],
    ['scene-reference', sceneId],
    ['block-body', blockId],
  ]) {
    const page = await listing(f, kind, { parentId });
    assert.ok(page.items.length);
    assert.equal(JSON.stringify(page).includes('PRIVATE_'), false);
  }
  assert.ok(
    f.reads.every((r) => r.fields && !r.fields.includes('title') && !r.fields.includes('content')),
  );
  assert.ok(
    f.metadataReads.every((r) => !r.fields.includes('content') && !r.fields.includes('objective')),
  );
  const scene = (await resource(f, 'scene')).dto.data;
  assert.equal(scene.title, 'PRIVATE_SCENE_1');
  assert.equal(scene.parentId, partId);
  assert.ok(scene.rankA && scene.rankB);
  assert.equal((await resource(f, 'part-control')).dto.data.rankSlot, 'A');
  assert.equal(
    (await resource(f, 'scene-body', sceneId)).dto.data.content,
    '<p>PRIVATE_BODY 🌙 1</p>',
  );
  assert.deepEqual((await resource(f, 'scene-planning', sceneId)).dto.data, {
    objective: 'PRIVATE_OBJECTIVE',
    conflict: '',
    pointOfView: '',
  });
  assert.deepEqual((await resource(f, 'scene-reference', sceneId)).dto.data, {
    kind: 'universe',
    scopeId: 'unavailable-world',
    entityId: 'external-person',
  });
  const block = (await resource(f, 'block')).dto.data;
  assert.equal(block.sceneId, sceneId);
  assert.equal(block.narrativeType, 'clue');
  assert.equal(block.audience, 'gm');
  assert.equal(
    (await resource(f, 'block-body', blockId)).dto.data.content,
    '<p>PRIVATE_CLUE 🌙</p>',
  );
  for (const key of ['ownerId', 'wordCount', 'revision', 'blocksStructureRevision'])
    assert.equal(Object.hasOwn(scene, key), false);
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(start).every((writes) => writes.length === 0));
});

test('archive and real part removal retain text, prior part hint and the actual unassigned order', async () => {
  const f = await fixture(2);
  const original = f.records.get(scenePath + '/body/current').content;
  await f.scenes.archiveScene(uid, {
    target,
    sceneId,
    operationId: 'resource-archive-0001',
    expectedRevision: f.records.get(scenePath).revision,
    archived: true,
  });
  assert.equal(f.records.get(scenePath).formerParentId, partId);
  const input = {
    target,
    operationId: 'resource-delete-part-0001',
    parentId: partId,
    expectedUpdatedAt: f.records.get(path + '/parts/' + partId).updatedAt,
    limit: 1,
  };
  for (let n = 0; n < 5; n++) {
    if ((await f.scenes.deleteSceneGroup(uid, input)).complete) break;
  }
  assert.equal(f.records.has(path + '/parts/' + partId), false);
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  const scene = (await resource(f, 'scene', null, sceneId)).dto.data;
  assert.equal(scene.archived, true);
  assert.equal(scene.parentId, null);
  assert.equal(scene.formerParentId, partId);
  assert.equal((await resource(f, 'scene-body', sceneId)).dto.data.content, original);
  const control = (await resource(f, 'scene-control')).dto;
  assert.equal(control.present, true);
  assert.equal(
    scene['rank' + control.data.rankSlot],
    f.records.get(scenePath)['rank' + control.data.rankSlot],
  );
  assert.equal((await listing(f, 'part-control')).items.length, 0);
});

test('over fifty physical scenes page without dropping archived and unassigned records', async () => {
  const f = await fixture(53),
    a = await listing(f, 'scene', { limit: 50 }),
    b = await listing(f, 'scene', { cursor: a.nextCursor, limit: 50 });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 3);
  assert.equal(b.nextCursor, null);
  assert.equal(new Set([...a.items, ...b.items].map((r) => r.id)).size, 53);
  assert.ok(f.reads.slice(-2).every((r) => r.maximum === 51));
});

test('own image and persona metadata are neutral and old classification remains absent or null', async () => {
  const f = await fixture(),
    source = structuredClone(f.records.get(scenePath));
  for (const key of ['mainBlockTitle', 'mainBlockType', 'mainBlockAudience', 'mainBlockOrder'])
    delete source[key];
  await f.db.runTransaction((tx) =>
    tx.set(f.db.doc(scenePath), {
      ...source,
      mainBlockImage: { imageId: 'missing-image', alt: '', caption: '🌙', url: 'FORBIDDEN_URL' },
      personaComplement: {
        personaId: 'missing-persona',
        overrides: [{ traitId: 'old-trait', value: 23, secret: 'FORBIDDEN' }],
        key: 'FORBIDDEN',
      },
      blockCount: -99,
      wordCount: -10,
    }),
  );
  const scene = (await resource(f, 'scene')).dto.data;
  for (const key of ['mainBlockTitle', 'mainBlockType', 'mainBlockAudience', 'mainBlockOrder'])
    assert.equal(Object.hasOwn(scene, key), false);
  assert.deepEqual(scene.mainBlockImage, { imageId: 'missing-image', alt: '', caption: '🌙' });
  assert.deepEqual(scene.personaComplement, {
    personaId: 'missing-persona',
    overrides: [{ traitId: 'old-trait', value: 23 }],
  });
  await update(f, scenePath, {
    mainBlockAudience: null,
    mainBlockType: null,
    mainBlockTitle: null,
    mainBlockOrder: null,
    personaComplement: null,
  });
  const next = (await resource(f, 'scene')).dto.data;
  assert.equal(next.mainBlockAudience, null);
  assert.equal(next.mainBlockType, null);
  assert.equal(next.personaComplement, null);
});

test('large literal UTF-8 body survives chunk ranges and reopening without requiring equal head/body revisions', async () => {
  const f = await fixture(),
    content = '\ufeff🌙 " \\ \n'.repeat(24000),
    hash = digest(content);
  await update(f, scenePath, { bodyHash: hash, revision: 42 });
  await update(f, scenePath + '/body/current', { content, hash, revision: 1 });
  const row = (await listing(f, 'scene-body', { parentId: sceneId })).items[0],
    input = request(f, 'scene-body', row, sceneId);
  f.api = createAdventureBackupResourceService(f);
  const { dto, header } = await readAll(f, input);
  assert.equal(dto.data.content, content);
  assert.equal(dto.data.hash, hash);
  assert.ok(header.chunkCount > 3);
  await assert.rejects(
    f.api.readAdventureBackupResource(uid, { ...input, index: header.chunkCount }),
    { code: 'invalid-argument' },
  );
});

for (const [kind, resourcePath, parentId] of [
  ['scene-control', path + '/sceneControls/unassigned', null],
  ['scene-planning', scenePath + '/planning/current', sceneId],
])
  test(
    kind + ' absence is explicit, differs from empty and is pinned before recreation',
    async () => {
      const f = await fixture();
      if (f.records.has(resourcePath)) await remove(f, resourcePath);
      const row = (await listing(f, kind, { parentId })).items[0],
        input = request(f, kind, row, parentId);
      assert.equal(row.present, false);
      assert.deepEqual((await readAll(f, input)).dto, {
        schemaVersion: 1,
        kind,
        parentId,
        id: row.id,
        present: false,
        data: {},
      });
      await f.db.runTransaction((tx) =>
        tx.create(
          f.db.doc(resourcePath),
          kind === 'scene-control'
            ? { rankSlot: 'B' }
            : { objective: '', conflict: '', pointOfView: '' },
        ),
      );
      await assert.rejects(f.api.readAdventureBackupResource(uid, input), {
        code: 'failed-precondition',
      });
      const current = (await resource(f, kind, parentId)).dto;
      assert.equal(current.present, true);
      assert.ok(Object.keys(current.data).length > 0);
    },
  );

for (const [kind, parentId, resourcePath] of [
  ['scene', null, scenePath],
  ['scene-body', sceneId, scenePath + '/body/current'],
  ['scene-planning', sceneId, scenePath + '/planning/current'],
  ['block', null, blockPath],
  ['block-body', blockId, blockPath + '/body/current'],
  ['block-body', blockId, blockPath],
  ['block-body', blockId, scenePath],
])
  for (const mutation of ['change', 'recreate'])
    test(
      kind + ' pins native ' + resourcePath.split('/').slice(2).join('/') + ' against ' + mutation,
      async () => {
        const f = await fixture(),
          row = (await listing(f, kind, { parentId })).items[0],
          input = request(f, kind, row, parentId),
          ref = f.db.doc(resourcePath),
          value = structuredClone(f.records.get(resourcePath));
        if (mutation === 'change') await update(f, resourcePath, { ignoredControl: 99 });
        else {
          await remove(f, resourcePath);
          await f.db.runTransaction((tx) => tx.create(ref, value));
        }
        await assert.rejects(f.api.readAdventureBackupResource(uid, input), {
          code: 'failed-precondition',
        });
      },
    );

for (const [resourcePath, patch] of [
  [scenePath, { ownerId: 'other' }],
  [scenePath, { schemaVersion: 2 }],
  [scenePath, { deleting: true }],
  [scenePath, { rebalancing: true }],
  [blockPath, { sceneId: 'missing-scene' }],
  [blockPath, { ownerId: 'other' }],
  [blockPath, { bodyStorage: null }],
  [blockPath + '/body/current', { contentStorage: null }],
  [blockPath + '/body/current', { payloadStorage: { version: 2 } }],
  [blockPath + '/body/current', { hash: '0'.repeat(64) }],
])
  test(
    'inconsistent dependency refuses both metadata and reads: ' +
      resourcePath +
      JSON.stringify(patch),
    async () => {
      const f = await fixture(),
        row = (await listing(f, 'block-body', { parentId: blockId })).items[0];
      await update(f, resourcePath, patch);
      const before = structuredClone([...f.records]);
      await assert.rejects(listing(f, 'block-body', { parentId: blockId }), {
        code: 'failed-precondition',
      });
      await assert.rejects(
        f.api.readAdventureBackupResource(uid, request(f, 'block-body', row, blockId)),
        { code: 'failed-precondition' },
      );
      assert.deepEqual([...f.records], before);
    },
  );

for (const [kind, parentId, resourcePath] of [
  ['scene-body', sceneId, scenePath + '/body/current'],
  ['block-body', blockId, blockPath + '/body/current'],
])
  test('mandatory ' + kind + ' missing or tampered text never becomes an empty body', async () => {
    const f = await fixture(),
      row = (await listing(f, kind, { parentId })).items[0];
    await update(f, resourcePath, { content: 'tampered while retaining hashes' });
    await assert.rejects(f.api.readAdventureBackupResource(uid, request(f, kind, row, parentId)), {
      code: 'failed-precondition',
    });
    const fresh = (await listing(f, kind, { parentId })).items[0];
    await assert.rejects(
      f.api.readAdventureBackupResource(uid, request(f, kind, fresh, parentId)),
      { code: 'failed-precondition' },
    );
    await remove(f, resourcePath);
    await assert.rejects(listing(f, kind, { parentId }), { code: 'failed-precondition' });
  });

for (const actor of [null, 'other'])
  test('every resource operation reauthorizes actor ' + actor, async () => {
    const f = await fixture(),
      row = (await listing(f, 'scene')).items[0],
      code = actor ? 'not-found' : 'unauthenticated';
    await assert.rejects(listing(f, 'scene', {}, actor), { code });
    await assert.rejects(f.api.readAdventureBackupResource(actor, request(f, 'scene', row)), {
      code,
    });
  });

test('cursor and request cannot switch parent, kind, project, source or singleton address', async () => {
  const f = await fixture(2),
    page = await listing(f, 'scene', { limit: 1 }),
    cursor = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString());
  for (const patch of [
    { kind: 'block' },
    { parentId: sceneId },
    { adventureId: id + '-other' },
    { sourceToken: '0'.repeat(64) },
    { version: 2 },
    { extra: true },
  ]) {
    await assert.rejects(
      listing(f, 'scene', {
        cursor: Buffer.from(JSON.stringify({ ...cursor, ...patch })).toString('base64url'),
      }),
      { code: 'invalid-argument' },
    );
  }
  for (const extra of [
    { kind: 'unknown' },
    { parentId: sceneId },
    { limit: 51 },
    { limit: 0 },
    { injectedPath: 'users/other' },
  ])
    await assert.rejects(listing(f, 'scene', extra), { code: 'invalid-argument' });
  const row = (await listing(f, 'scene-body', { parentId: sceneId })).items[0],
    input = request(f, 'scene-body', row, sceneId);
  for (const patch of [{ id: 'other' }, { parentId: null }, { index: -1 }, { index: 0.5 }])
    await assert.rejects(f.api.readAdventureBackupResource(uid, { ...input, ...patch }), {
      code: 'invalid-argument',
    });
});

test('an async pause cannot change captured resource intent and a failed read can retry without writes', async () => {
  const f = await fixture(),
    row = (await listing(f, 'scene-body', { parentId: sceneId })).items[0],
    input = request(f, 'scene-body', row, sceneId),
    before = structuredClone([...f.records]);
  let paused = false;
  const port = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) => {
        if (!paused) {
          paused = true;
          Object.assign(input, {
            kind: 'block-body',
            parentId: blockId,
            id: 'other',
            index: 9,
            sourceToken: '0'.repeat(64),
          });
        }
        return op(tx);
      }),
  };
  const result = await createAdventureBackupResourceService({
    db: port,
  }).readAdventureBackupResource(uid, input);
  assert.equal(result.kind, 'scene-body');
  assert.equal(result.parentId, sceneId);
  assert.equal(result.index, 0);
  const failing = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          getAll(ref, options) {
            if (ref.path.endsWith('/body/current')) throw Error('injected read failure');
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  await assert.rejects(
    createAdventureBackupResourceService({ db: failing }).readAdventureBackupResource(
      uid,
      request(f, 'scene-body', row, sceneId),
    ),
    /injected read failure/,
  );
  assert.equal(
    (await resource(f, 'scene-body', sceneId)).dto.data.content,
    '<p>PRIVATE_BODY 🌙 1</p>',
  );
  assert.deepEqual([...f.records], before);
});

for (const value of ['', '\ufeff', '🌙\n'])
  test('body codec retains exact value ' + JSON.stringify(value), () => {
    const encoded = serializeAdventureBackupResource('scene-body', sceneId, 'current', {
      content: value,
      hash: digest(value),
      revision: 99,
    });
    assert.deepEqual(JSON.parse(encoded.json).data, { content: value, hash: digest(value) });
  });
for (const [kind, parentId, value] of [
  ['scene', null, { title: '\ud800' }],
  ['scene', null, { archived: 'true' }],
  ['scene', null, { createdAt: -1 }],
  ['scene', null, { rankA: '0' }],
  ['scene', null, { mainBlockAudience: 'public' }],
  [
    'scene',
    null,
    { personaComplement: { personaId: 'x', overrides: [{ traitId: 'a', value: Infinity }] } },
  ],
  ['scene-reference', sceneId, { kind: 'universe', scopeId: '../invalid', entityId: 'x' }],
  ['block', null, { sceneId, narrativeType: 'unknown', audience: 'gm' }],
  ['scene-body', sceneId, { content: '\ud800', hash: '0'.repeat(64) }],
])
  test('codec rejects nonrepresentable ' + kind + ' ' + JSON.stringify(value), () => {
    assert.throws(
      () =>
        serializeAdventureBackupResource(
          kind,
          parentId,
          kind.endsWith('body') ? 'current' : 'native',
          value,
        ),
      TypeError,
    );
  });

for (const [kind, resourcePath, patch] of [
  ['part-control', path + '/parts/' + partId, { contentStorage: null }],
  ['part-control', path + '/parts/' + partId, { rebalancing: true }],
  ['scene-control', path + '/sceneControls/unassigned', { schemaVersion: 2 }],
  ['scene-control', path + '/sceneControls/unassigned', { bodyStorage: null }],
])
  test(
    'control metadata and content reject unsupported state: ' + kind + JSON.stringify(patch),
    async () => {
      const f = await fixture(2),
        row = (await listing(f, kind)).items[0];
      await update(f, resourcePath, patch);
      await assert.rejects(listing(f, kind));
      await assert.rejects(f.api.readAdventureBackupResource(uid, request(f, kind, row)));
    },
  );

test('scene reference token pins both the native reference and its authorized scene', async () => {
  const f = await fixture(),
    refPath = scenePath + '/references/native-ref',
    reference = { kind: 'adventure', scopeId: id, entityId: 'own-lore-id' };
  await f.db.runTransaction((tx) => tx.create(f.db.doc(refPath), reference));
  for (const resourcePath of [refPath, scenePath]) {
    const row = (await listing(f, 'scene-reference', { parentId: sceneId })).items[0],
      before = structuredClone(f.records.get(resourcePath));
    await remove(f, resourcePath);
    await f.db.runTransaction((tx) => tx.create(f.db.doc(resourcePath), before));
    await assert.rejects(
      f.api.readAdventureBackupResource(uid, request(f, 'scene-reference', row, sceneId)),
      { code: 'failed-precondition' },
    );
  }
});
