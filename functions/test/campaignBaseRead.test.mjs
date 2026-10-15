import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createCampaignBaseReadService } from '../src/campaignBaseRead.mjs';
import {
  baseSourceKey,
  baseImageKey,
  baseImageUseKey,
  baseBodyKey,
  baseTextFields,
  digest,
  BASE_IMAGE_BYTES,
} from '../src/campaignBaseContracts.mjs';

const uid = 'owner',
  campaignId = 'campaign',
  baseId = 'base',
  adventureId = 'adventure',
  universeId = 'world';
const path = 'users/owner/campaignBases/base';
function fixture(options = {}) {
  const f = studioDb();
  f.records.set('campaigns/' + campaignId, {
    schemaVersion: 1,
    ownerId: uid,
    activeBaseId: baseId,
    universeId: 'organizational-world',
    provenance: { kind: 'original', adventureId, baseId },
  });
  f.records.set(path, {
    id: baseId,
    schemaVersion: 1,
    ownerId: uid,
    state: 'ready',
    campaignId,
    adventureId,
    universeId,
    sourceToken: digest('frozen'),
    createdAt: 1,
    capturedAt: 20,
    snapshot: { title: 'Frozen title', synopsis: 'Frozen synopsis', language: 'pt-BR' },
  });
  f.records.set('adventures/' + adventureId, {
    schemaVersion: 1,
    ownerId: uid,
    title: 'New title',
    universeId: null,
    updatedAt: 99,
  });
  f.records.set('universes/' + universeId, { authorId: uid, loreVersion: 1, privacyVersion: 1 });
  const assetCalls = [];
  const assets = {
    metadata: async (...args) => {
      assetCalls.push(['metadata', ...args]);
      return { generation: '9007199254740993', size: 4 };
    },
    readGeneration: async (...args) => {
      assetCalls.push(['readGeneration', ...args]);
      return Buffer.from('data');
    },
    ...options.assets,
  };
  const api = createCampaignBaseReadService({
    db: f.db,
    assets,
    deriveImage: options.deriveImage ?? (async () => Buffer.from('webp')),
  });
  function item(kind, id, extras = {}, fields = { content: 'Frozen text' }) {
    const origin = kind === 'lore' ? { kind, id, scopeId: universeId } : { adventureId, kind, id };
    const key = baseSourceKey(origin),
      text = baseTextFields(key, fields);
    const value = {
      sourceKey: key,
      origin,
      kind,
      parentKey: null,
      title: 'Frozen ' + id,
      archived: false,
      orderKey: id,
      fields: text.fields,
      structured: {},
      image: null,
      ...extras,
    };
    f.records.set(path + '/items/' + key, value);
    for (const chunk of text.bodies)
      f.records.set(path + '/bodies/' + baseBodyKey(key, chunk.field, chunk.index), chunk);
    if (kind === 'lore')
      f.records.set('universes/' + universeId + '/lore/' + id, { name: 'Current ' + id });
    return value;
  }
  function image() {
    const imageId = 'image',
      imageKey = baseImageKey(imageId),
      useKey = baseImageUseKey(baseId, imageId);
    const value = {
      imageKey,
      imageId,
      useKey,
      path: 'book-covers/owner/image.png',
      generation: '9007199254740993',
      state: 'ready',
    };
    f.records.set(path + '/images/' + imageKey, value);
    f.records.set('users/owner/imageLibrary/image', {
      state: 'active',
      useCount: 1,
      path: value.path,
      updatedAt: 77,
    });
    f.records.set('users/owner/imageLibrary/image/uses/' + useKey, {
      kind: 'campaign-base',
      campaignId,
      baseId,
    });
    return value;
  }
  return { ...f, api, item, image, assetCalls, assets };
}
const list = (f, kind, options = {}) =>
  f.api.listCampaignBaseItems(uid, { campaignId, kind, ...options });
const read = (f, item, options = {}) =>
  f.api.readCampaignBaseItem(uid, { campaignId, sourceKey: item.sourceKey, ...options });

test('ready metadata and bodies remain frozen after normal origin edits and organizational universe changes', async () => {
  const f = fixture(),
    scene = f.item('scene', 'scene', {
      structured: {
        wordCount: 2,
        mainWordCount: 2,
        blockWordCount: 0,
        blockCount: 0,
        capturedExtraWords: 99,
      },
    });
  const metadata = await f.api.getCampaignBase(uid, { campaignId });
  assert.equal(metadata.capturedAt, 20);
  assert.deepEqual(metadata.source, {
    adventureId,
    title: 'Frozen title',
    synopsis: 'Frozen synopsis',
    language: 'pt-BR',
  });
  f.records.get('adventures/adventure').title = 'Changed again';
  f.records.get('campaigns/campaign').universeId = 'other';
  assert.deepEqual(await f.api.getCampaignBase(uid, { campaignId }), metadata);
  const result = await read(f, scene);
  assert.equal(result.projectionToken, metadata.projectionToken);
  assert.equal((await list(f, 'scene')).projectionToken, metadata.projectionToken);
  assert.equal(result.chunks[0].content, 'Frozen text');
  assert.deepEqual(result.item.structured, {
    wordCount: 2,
    mainWordCount: 2,
    blockWordCount: 0,
    blockCount: 0,
  });
  assert.equal(JSON.stringify(result).includes('bodySourceKey'), false);
  assert.equal(JSON.stringify(result).includes('origin'), false);
  assert.equal(JSON.stringify(result).includes('capturedExtraWords'), false);
});

test('list projects only metadata, preserves archive/parent filters and cursor scopes with bounded raw windows', async () => {
  const f = fixture(),
    parent = baseSourceKey({ kind: 'part', id: 'part', adventureId });
  const a = f.item('scene', 'a', {
    parentKey: parent,
    stage: 'planned',
    structured: { secret: 'never' },
  });
  f.item('scene', 'b', { parentKey: parent });
  f.item('scene', 'c', { archived: true });
  const first = await list(f, 'scene', { parentKey: parent, limit: 1 });
  assert.deepEqual(
    first.items.map((i) => i.sourceKey),
    [a.sourceKey],
  );
  assert.equal(first.items[0].stage, 'planned');
  assert.ok(first.nextCursor);
  assert.equal(JSON.stringify(first).includes('Frozen text'), false);
  assert.equal(JSON.stringify(first).includes('structured'), false);
  assert.equal(
    (await list(f, 'scene', { parentKey: parent, limit: 1, cursor: first.nextCursor })).items
      .length,
    1,
  );
  await assert.rejects(list(f, 'scene', { archive: 'all', cursor: first.nextCursor }), {
    code: 'failed-precondition',
  });
  const cursor = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  assert.equal('order' in cursor, false);
  await assert.rejects(
    list(f, 'scene', {
      parentKey: parent,
      cursor: Buffer.from(JSON.stringify({ ...cursor, extra: 'forged' })).toString('base64url'),
    }),
    { code: 'invalid-argument' },
  );
  assert.equal((await list(f, 'scene', { archive: 'archived' })).items.length, 1);
  assert.equal((await list(f, 'scene', { parentKey: null })).items.length, 0);
  assert.ok(f.reads.every((q) => q.maximum <= 51));
});

test('unavailable lore raw window yields an opaque continuation without titles, aliases or origin IDs', async () => {
  const f = fixture();
  const unavailable = f.item(
    'lore',
    'PRIVATE-ORIGIN-ID',
    { orderKey: 'a', title: 'PRIVATE TITLE', structured: { aliases: ['PRIVATE ALIAS'] } },
    { details: 'PRIVATE BODY' },
  );
  f.item('lore', 'visible', { orderKey: 'b' }, { details: 'Allowed' });
  f.records.delete('universes/world/lore/PRIVATE-ORIGIN-ID');
  const first = await list(f, 'lore', { limit: 1 });
  assert.deepEqual(first.items, []);
  assert.ok(first.nextCursor);
  const encoded = JSON.stringify(first) + Buffer.from(first.nextCursor, 'base64url').toString();
  for (const secret of ['PRIVATE-ORIGIN-ID', 'PRIVATE TITLE', 'PRIVATE ALIAS', 'PRIVATE BODY'])
    assert.equal(encoded.includes(secret), false, secret);
  assert.equal(
    (await list(f, 'lore', { limit: 1, cursor: first.nextCursor })).items[0].title,
    'Frozen visible',
  );
  await assert.rejects(read(f, unavailable), { code: 'not-found' });
});

test('read verifies complete raw UTF8 hashes before chunk pagination and rejects corruption outside current page', async () => {
  const f = fixture(),
    content = 'á😀"\n'.repeat(40000);
  const item = f.item('block', 'large', {}, { content });
  let result = await read(f, item, { limit: 1 });
  const parts = [...result.chunks];
  while (result.nextCursor) {
    result = await read(f, item, { limit: 1, cursor: result.nextCursor });
    parts.push(...result.chunks);
  }
  assert.equal(parts.map((c) => c.content).join(''), content);
  assert.equal(result.item.fields[0].sha256, digest(content));
  assert.equal(result.item.fields[0].bytes, Buffer.byteLength(content));
  assert.ok(parts.every((c) => Buffer.byteLength(c.content) <= 65536 && !c.content.includes('�')));
  const manifest = item.fields[0];
  f.records.get(
    path + '/bodies/' + baseBodyKey(item.sourceKey, 'content', manifest.chunkCount - 1),
  ).content = 'tampered';
  await assert.rejects(read(f, item, { limit: 1 }), { code: 'failed-precondition' });
});

test('lore relations require captured and current targets; projection change invalidates existing body cursor', async () => {
  const f = fixture();
  const relation = (id) => ({
    targetEntityId: 'universe:world:' + id,
    relationType: 'Relação ' + id,
    description: 'Descrição ' + id,
  });
  const a = f.item(
    'lore',
    'a',
    {
      structured: {
        aliases: ['Frozen alias'],
        category: 'character',
        isPublic: false,
        relations: [relation('b'), relation('not-captured'), relation('revoked')],
      },
    },
    { details: 'x'.repeat(100000) },
  );
  const target = f.item('lore', 'b', {}, { details: 'B' });
  f.item('lore', 'revoked', {}, { details: 'C' });
  f.records.delete('universes/world/lore/revoked');
  const first = await read(f, a, { limit: 1 });
  assert.deepEqual(first.item.structured.relations, [
    {
      targetKey: target.sourceKey,
      title: 'Frozen b',
      relationType: 'Relação b',
      description: 'Descrição b',
    },
  ]);
  const serialized = JSON.stringify(first);
  for (const secret of ['not-captured', 'revoked', 'Descrição revoked'])
    assert.equal(serialized.includes(secret), false);
  f.records.delete('universes/world/lore/b');
  await assert.rejects(
    read(f, a, { cursor: first.nextCursor }),
    (error) => error.details?.reason === 'cursor-invalidated',
  );
  const refreshed = await read(f, a);
  assert.deepEqual(refreshed.item.structured.relations, []);
  f.records.get('universes/world').authorId = 'other';
  await assert.rejects(read(f, a), { code: 'not-found' });
});

test('reference DTO resolves only captured authorized targets and never returns raw unavailable identity', async () => {
  const f = fixture(),
    source = f.item('arc', 'arc', {}, { objective: 'Objetivo' });
  const target = f.item('lore', 'target', {}, { details: 'Lore' });
  const add = (name, reference, kind = 'narrative') =>
    f.records.set(path + '/links/' + digest(name), {
      kind,
      sourceKey: source.sourceKey,
      reference,
    });
  add('a', { kind: 'lore', reference: { kind: 'universe', scopeId: 'world', entityId: 'target' } });
  add('b', {
    kind: 'lore',
    reference: { kind: 'universe', scopeId: 'world', entityId: 'PRIVATE-MISSING-ID' },
  });
  const result = await f.api.listCampaignBaseReferences(uid, {
    campaignId,
    sourceKey: source.sourceKey,
  });
  assert.equal(result.items.filter((i) => i.available).length, 1);
  assert.equal(result.items.find((i) => i.available).targetKey, target.sourceKey);
  assert.equal(result.items.find((i) => !i.available).targetKey, null);
  assert.equal(JSON.stringify(result).includes('PRIVATE-MISSING-ID'), false);
});

test('all reader methods reject foreign accounts, closed input violations and revoked adventure/base roots', async () => {
  const f = fixture(),
    item = f.item('block', 'b'),
    image = f.image();
  const calls = [
    ['getCampaignBase', { campaignId }],
    ['listCampaignBaseItems', { campaignId, kind: 'block' }],
    ['listCampaignBaseReferences', { campaignId, sourceKey: item.sourceKey }],
    ['readCampaignBaseItem', { campaignId, sourceKey: item.sourceKey }],
    ['readCampaignBaseImage', { campaignId, imageKey: image.imageKey }],
  ];
  for (const [method, input] of calls) {
    await assert.rejects(f.api[method]('other', input), { code: 'not-found' });
    await assert.rejects(f.api[method](null, input), { code: 'unauthenticated' });
    await assert.rejects(f.api[method](uid, { ...input, ownerId: uid }), {
      code: 'invalid-argument',
    });
  }
  f.records.get('adventures/adventure').ownerId = 'other';
  for (const [method, input] of calls)
    await assert.rejects(f.api[method](uid, input), { code: 'not-found' });
  f.records.get('adventures/adventure').ownerId = uid;
  f.records.get(path).state = 'deleting';
  await assert.rejects(read(f, item), { code: 'not-found' });
});

test('media uses pinned generation, ignores live source and library updateTime, and returns only bounded authenticated bytes', async () => {
  const f = fixture(),
    image = f.image();
  const result = await f.api.readCampaignBaseImage(uid, { campaignId, imageKey: image.imageKey });
  assert.deepEqual(Object.keys(result).sort(), ['dataUrl', 'projectionToken']);
  assert.equal(result.dataUrl, 'data:image/webp;base64,' + Buffer.from('webp').toString('base64'));
  assert.equal(f.assetCalls.find((c) => c[0] === 'readGeneration')[2], '9007199254740993');
  f.records.get('users/owner/imageLibrary/image').updatedAt = 99999;
  assert.deepEqual(
    await f.api.readCampaignBaseImage(uid, { campaignId, imageKey: image.imageKey }),
    result,
  );
});

test('media rejects oversized input before bytes and missing pins or changed generation without substitution', async () => {
  let reads = 0;
  const f = fixture({
      assets: {
        metadata: async () => ({ generation: '9007199254740993', size: BASE_IMAGE_BYTES + 1 }),
        readGeneration: async () => {
          reads++;
          return Buffer.from('data');
        },
      },
    }),
    image = f.image();
  await assert.rejects(f.api.readCampaignBaseImage(uid, { campaignId, imageKey: image.imageKey }), {
    code: 'failed-precondition',
  });
  assert.equal(reads, 0);
  f.assets.metadata = async () => ({ generation: 'NEW', size: 4 });
  await assert.rejects(f.api.readCampaignBaseImage(uid, { campaignId, imageKey: image.imageKey }), {
    code: 'failed-precondition',
  });
  assert.equal(reads, 0);
  f.records.delete('users/owner/imageLibrary/image/uses/' + image.useKey);
  await assert.rejects(f.api.readCampaignBaseImage(uid, { campaignId, imageKey: image.imageKey }), {
    code: 'not-found',
  });
});

test('media reauthorizes after download and after derivation, suppressing revoked or replaced outputs', async () => {
  for (const phase of ['download', 'derive']) {
    const f = fixture({
      assets: {
        readGeneration: async () => {
          if (phase === 'download') f.records.get('adventures/adventure').deleting = true;
          return Buffer.from('data');
        },
      },
      deriveImage: async () => {
        if (phase === 'derive') f.records.get('users/owner/imageLibrary/image').state = 'deleted';
        return Buffer.from('webp');
      },
    });
    const image = f.image();
    await assert.rejects(
      f.api.readCampaignBaseImage(uid, { campaignId, imageKey: image.imageKey }),
      { code: 'not-found' },
    );
  }
});

test('reader refuses unsupported campaign, base and adventure schemas before bodies without a legacy fallback', async () => {
  for (const root of [path, 'campaigns/' + campaignId, 'adventures/' + adventureId]) {
    const f = fixture(),
      entry = f.item('block', 'block'),
      reads = [];
    const transaction = f.db.runTransaction;
    f.db.runTransaction = (work) =>
      transaction((tx) =>
        work({
          ...tx,
          get: (ref) => {
            reads.push(ref.path ?? ref.collectionPath);
            return tx.get(ref);
          },
        }),
      );
    f.records.get(root).schemaVersion = 2;
    await assert.rejects(read(f, entry), { code: 'failed-precondition' });
    assert.equal(
      reads.some((key) => key.includes('/bodies/')),
      false,
    );
  }
});
