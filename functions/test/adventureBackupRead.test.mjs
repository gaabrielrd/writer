import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createAdventureBackupReadService } from '../src/adventureBackupRead.mjs';
import { serializeAdventureBackupStructure } from '../src/adventureBackupStructure.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const uid = 'author',
  id = 'adventure-structure-0001',
  path = 'adventures/' + id;
async function fixture(count = 1) {
  const f = adventureImportDb({ nativeUpdates: true });
  await createStudioService({ db: f.db, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'Own 🌙',
    synopsis: 'PRIVATE_ROOT_PROSE',
  });
  const scenes = createScenesService({ db: f.db, now: () => 1000 });
  for (let n = 0; n < count; n++)
    await scenes.createSceneGroup(uid, {
      target: { kind: 'adventure', id },
      operationId: 'part-structure-' + String(n).padStart(6, '0'),
      title: 'Part ' + n,
    });
  const api = createAdventureBackupReadService(f),
    pin = await api.getAdventureBackupSource(uid, { adventureId: id });
  f.metadataReads.length = 0;
  f.reads.length = 0;
  return { ...f, api, pin };
}
const list = (f, extra = {}, actor = uid) =>
  f.api.listAdventureBackupStructure(actor, {
    adventureId: id,
    kind: 'part',
    sourceToken: f.pin.sourceToken,
    ...extra,
  });
const input = (f, row, extra = {}) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind: 'part',
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
  ...extra,
});
async function readAll(f, request) {
  const chunks = [];
  let first;
  for (let index = 0; ; index++) {
    const r = await f.api.readAdventureBackupStructure(uid, { ...request, index });
    first ??= r;
    assert.equal(r.contentHash, first.contentHash);
    assert.equal(r.byteLength, first.byteLength);
    assert.equal(r.chunkCount, first.chunkCount);
    const bytes = Buffer.from(r.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536 && bytes.length > 0);
    chunks.push(bytes);
    if (index + 1 === first.chunkCount) break;
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, first.byteLength);
  assert.equal(digest(bytes.toString('utf8')), first.contentHash);
  return { data: JSON.parse(bytes.toString('utf8')), first };
}
test('real Studio and part producers yield bounded metadata pages and exact private structure without writes', async () => {
  const f = await fixture(3),
    before = structuredClone([...f.records]),
    pages = [];
  let cursor = null;
  do {
    const page = await list(f, { limit: 1, cursor });
    pages.push(page);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(pages.length, 3);
  assert.equal(new Set(pages.flatMap((p) => p.items.map((i) => i.id))).size, 3);
  assert.equal(JSON.stringify(pages).includes('PRIVATE_ROOT_PROSE'), false);
  assert.ok(f.reads.every((r) => r.fields && !r.fields.includes('content')));
  assert.equal(f.reads[0].maximum, 2);
  const row = pages[0].items[0],
    part = await readAll(f, input(f, row));
  assert.deepEqual(part.data, {
    schemaVersion: 1,
    kind: 'part',
    data: {
      title: 'Part 0',
      order: 1,
      contentMode: 'scenes',
      createdAt: 1001,
      updatedAt: 1001,
    },
  });
  const root = await readAll(
    f,
    input(f, { id, itemToken: f.pin.sourceToken }, { kind: 'adventure' }),
  );
  assert.equal(root.data.data.title, 'Own 🌙');
  assert.equal(root.data.data.synopsis, 'PRIVATE_ROOT_PROSE');
  assert.deepEqual(root.data.data.origin, { kind: 'authored' });
  for (const key of ['ownerId', 'revision', 'wordCount', 'sceneRevision'])
    assert.equal(Object.hasOwn(root.data.data, key), false);
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(4).every((writes) => writes.length === 0));
});
test('paging beyond fifty original parts has no hidden selection cap', async () => {
  const f = await fixture(53),
    a = await list(f, { limit: 50 }),
    b = await list(f, { cursor: a.nextCursor, limit: 50 });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 3);
  assert.equal(b.nextCursor, null);
  assert.equal(new Set([...a.items, ...b.items].map((r) => r.id)).size, 53);
});
test('quoted Unicode and large legacy part prose survive byte chunks and a reopened service literally', async () => {
  const f = await fixture(),
    partId = 'part-structure-000000',
    content = '\ufeff🌙 "\\ \n PRIVATE_'.repeat(18000),
    title = ' \ufeff Part 🌙  ';
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(path + '/parts/' + partId), { content, title }),
  );
  const row = (await list(f)).items[0],
    request = input(f, row);
  f.api = createAdventureBackupReadService(f);
  const result = await readAll(f, request);
  assert.ok(result.first.chunkCount > 4);
  assert.equal(result.data.data.content, content);
  assert.equal(result.data.data.title, title);
  await assert.rejects(
    f.api.readAdventureBackupStructure(uid, { ...request, index: result.first.chunkCount }),
    { code: 'invalid-argument' },
  );
});
for (const content of [undefined, '', '\ufeff'])
  test('legacy part presence stays distinct: ' + String(content), async () => {
    const f = await fixture(),
      partId = 'part-structure-000000';
    if (content !== undefined)
      await f.db.runTransaction((tx) =>
        tx.update(f.db.doc(path + '/parts/' + partId), { content }),
      );
    const result = await readAll(f, input(f, (await list(f)).items[0]));
    assert.equal(Object.hasOwn(result.data.data, 'content'), content !== undefined);
    if (content !== undefined) assert.equal(result.data.data.content, content);
  });
for (const mutation of ['change', 'recreate', 'remove'])
  test('part ' + mutation + ' cannot continue an older native item token', async () => {
    const f = await fixture(),
      row = (await list(f)).items[0],
      ref = f.db.doc(path + '/parts/' + row.id),
      value = structuredClone(f.records.get(ref.path));
    if (mutation === 'change')
      await f.db.runTransaction((tx) => tx.update(ref, { title: 'Changed' }));
    else {
      await f.db.runTransaction((tx) => tx.delete(ref));
      if (mutation === 'recreate') await f.db.runTransaction((tx) => tx.create(ref, value));
    }
    await assert.rejects(f.api.readAdventureBackupStructure(uid, input(f, row)));
  });
for (const patch of [
  { ownerId: 'other' },
  { deleting: true },
  { rebalancing: true },
  { schemaVersion: 2 },
])
  test(
    'metadata page refuses an unavailable member without a partial response: ' +
      JSON.stringify(patch),
    async () => {
      const f = await fixture(2),
        ref = f.db.doc(path + '/parts/part-structure-000001');
      await f.db.runTransaction((tx) => tx.update(ref, patch));
      const before = structuredClone([...f.records]);
      await assert.rejects(list(f));
      assert.deepEqual([...f.records], before);
    },
  );
test('a legacy part with absent owner/schema keeps its own values under the authorized root', async () => {
  const f = await fixture(),
    ref = f.db.doc(path + '/parts/part-structure-000000'),
    data = structuredClone(f.records.get(ref.path));
  delete data.ownerId;
  delete data.schemaVersion;
  delete data.createdAt;
  await f.db.runTransaction((tx) => tx.set(ref, data));
  const result = await readAll(f, input(f, (await list(f)).items[0]));
  assert.equal(Object.hasOwn(result.data.data, 'createdAt'), false);
  assert.equal(result.data.data.title, data.title);
});
test('root or progress change blocks listing and ranges with the original source token', async () => {
  for (const target of ['root', 'progress']) {
    const f = await fixture(),
      row = (await list(f)).items[0];
    if (target === 'root')
      await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { synopsis: 'Changed' }));
    else
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(path + '/workProgress/current'), { schemaVersion: 1 }),
      );
    await assert.rejects(list(f), { code: 'failed-precondition' });
    await assert.rejects(f.api.readAdventureBackupStructure(uid, input(f, row)), {
      code: 'failed-precondition',
    });
  }
});
for (const actor of [null, 'other'])
  test('both structure operations reauthorize actor ' + actor, async () => {
    const f = await fixture(),
      row = (await list(f)).items[0],
      before = structuredClone([...f.records]);
    await assert.rejects(list(f, {}, actor), { code: actor ? 'not-found' : 'unauthenticated' });
    await assert.rejects(f.api.readAdventureBackupStructure(actor, input(f, row)), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
    assert.deepEqual([...f.records], before);
  });
test('cursor cannot switch kind, source, project, version or inject fields', async () => {
  const f = await fixture(2),
    a = await list(f, { limit: 1 }),
    cursor = JSON.parse(Buffer.from(a.nextCursor, 'base64url').toString());
  for (const patch of [
    { kind: 'adventure' },
    { sourceToken: '0'.repeat(64) },
    { adventureId: id + '-other' },
    { version: 2 },
    { ownerId: uid },
  ]) {
    await assert.rejects(
      list(f, {
        cursor: Buffer.from(JSON.stringify({ ...cursor, ...patch })).toString('base64url'),
      }),
      { code: 'invalid-argument' },
    );
  }
  await assert.rejects(list(f, { cursor: a.nextCursor + '=' }), { code: 'invalid-argument' });
});
for (const extra of [
  { kind: 'chapter' },
  { limit: 0 },
  { limit: 51 },
  { ownerId: uid },
  { cursor: 'invalid' },
])
  test('closed list request refuses ' + JSON.stringify(extra), async () => {
    const f = await fixture();
    await assert.rejects(list(f, extra), { code: 'invalid-argument' });
  });
test('read request rejects wrong root ID, item token, type and index without a grant from the source anchor', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0];
  for (const extra of [
    { kind: 'chapter' },
    { index: -1 },
    { index: 1.5 },
    { ownerId: uid },
    { kind: 'adventure', id: 'other' },
  ])
    await assert.rejects(f.api.readAdventureBackupStructure(uid, input(f, row, extra)), {
      code: 'invalid-argument',
    });
  await assert.rejects(
    f.api.readAdventureBackupStructure(uid, input(f, row, { itemToken: '0'.repeat(64) })),
    { code: 'failed-precondition' },
  );
});
for (const marker of ['contentStorage', 'payloadStorage'])
  test('unknown external part marker cannot fall back to inline text: ' + marker, async () => {
    const f = await fixture(),
      ref = f.db.doc(path + '/parts/part-structure-000000');
    await f.db.runTransaction((tx) =>
      tx.update(ref, { [marker]: null, content: 'MUST_NOT_FALLBACK' }),
    );
    await assert.rejects(
      f.api.readAdventureBackupStructure(uid, input(f, (await list(f)).items[0])),
      { code: 'failed-precondition' },
    );
  });
test('imported provenance keeps declared hashes but excludes operation IDs, URLs and unknown system fields', () => {
  const hash = 'a'.repeat(64),
    result = serializeAdventureBackupStructure('adventure', {
      title: 'Own',
      status: 'draft',
      ownerId: 'author',
      secret: 'NEVER_EXPORT',
      origin: {
        kind: 'imported',
        importId: 'PRIVATE_JOB',
        sourceMediaType: 'application/pdf',
        sourceHash: hash,
        reviewHash: hash,
        sourceUrl: 'https://invalid/?token=PRIVATE',
      },
    });
  const data = JSON.parse(result.json).data;
  assert.deepEqual(data.origin, {
    kind: 'imported',
    sourceMediaType: 'application/pdf',
    sourceHash: hash,
    reviewHash: hash,
  });
  for (const fragment of ['PRIVATE', 'NEVER_EXPORT', 'ownerId'])
    assert.equal(result.json.includes(fragment), false);
});
test('nonrepresentable metadata fails before producing a successful chunk or mutating its source', async () => {
  const f = await fixture(),
    ref = f.db.doc(path + '/parts/part-structure-000000');
  await f.db.runTransaction((tx) => tx.update(ref, { order: NaN }));
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.readAdventureBackupStructure(uid, input(f, (await list(f)).items[0])),
    { code: 'failed-precondition', details: { reason: 'adventure-backup-item-inconsistent' } },
  );
  assert.deepEqual([...f.records], before);
});

test('structure codec keeps zero dates, literal metadata, null bindings and absent values independently', () => {
  const value = {
    title: ' \ufeffOwn 🌙 ',
    synopsis: '',
    language: 'pt-BR',
    status: 'ready',
    editorialState: 'review',
    personaId: null,
    universeId: null,
    createdAt: 0,
  };
  const encoded = serializeAdventureBackupStructure('adventure', value);
  assert.deepEqual(JSON.parse(encoded.json), { schemaVersion: 1, kind: 'adventure', data: value });
  assert.equal(Object.hasOwn(JSON.parse(encoded.json).data, 'updatedAt'), false);
});
for (const [kind, value] of [
  ['adventure', { title: 'Own', status: 'published' }],
  ['adventure', { title: 'Own', status: 'draft', personaId: 'unsafe/path' }],
  ['adventure', { title: 'Own', status: 'draft', createdAt: new Date(0) }],
  [
    'adventure',
    {
      title: 'Own',
      status: 'draft',
      origin: {
        kind: 'imported',
        sourceMediaType: 'application/pdf',
        sourceHash: 42,
        reviewHash: 'a'.repeat(64),
      },
    },
  ],
  ['part', { title: 'Part', order: Infinity }],
  ['part', { title: 'Part', content: undefined }],
  ['part', { title: 'Part', contentMode: 'unknown' }],
])
  test(
    'structure codec refuses nonrepresentable ' + kind + ' metadata ' + JSON.stringify(value),
    () => {
      assert.throws(() => serializeAdventureBackupStructure(kind, value), TypeError);
    },
  );

test('request mutation during the first await cannot replace the original validated range or identity', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0],
    data = input(f, row),
    run = f.db.runTransaction.bind(f.db);
  let notify,
    release,
    blocked = false;
  const entered = new Promise((resolve) => {
      notify = resolve;
    }),
    gate = new Promise((resolve) => {
      release = resolve;
    });
  f.db.runTransaction = (operation) =>
    run((tx) =>
      operation({
        ...tx,
        async getAll(ref, options) {
          const result = await tx.getAll(ref, options);
          if (!blocked && ref.path === path) {
            blocked = true;
            notify();
            await gate;
          }
          return result;
        },
      }),
    );
  const pending = f.api.readAdventureBackupStructure(uid, data);
  await entered;
  data.index = -1;
  data.id = 'another-id';
  data.kind = 'chapter';
  data.itemToken = '0'.repeat(64);
  data.sourceToken = '0'.repeat(64);
  release();
  const result = await pending;
  assert.equal(result.index, 0);
  assert.equal(result.id, row.id);
  assert.equal(result.kind, 'part');
  assert.equal(result.itemToken, row.itemToken);
  assert.equal(
    JSON.parse(Buffer.from(result.chunkBase64, 'base64').toString()).data.title,
    'Part 0',
  );
});
