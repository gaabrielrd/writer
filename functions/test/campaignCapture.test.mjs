import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createCampaignCaptureService } from '../src/campaignCapture.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import { createCampaignsService } from '../src/campaigns.mjs';
import { createCampaignBaseReadService } from '../src/campaignBaseRead.mjs';
import {
  basePath,
  baseSourceKey,
  baseBodyKey,
  baseTextFields,
  decodeBaseCursor,
  encodeBaseCursor,
  digest,
} from '../src/campaignBaseContracts.mjs';
const uid = 'author',
  adventureId = 'adventure-capture-0001',
  target = { kind: 'adventure', id: adventureId },
  path = 'adventures/' + adventureId;
const op = (name) => 'campaign-capture-operation-' + name;
async function fixture() {
  const f = studioDb(),
    studio = createStudioService({ db: f.db, now: () => 100 });
  f.records.set('universes/world', {
    authorId: uid,
    name: 'Mundo',
    campaignCount: 0,
    adventureCount: 0,
    loreVersion: 1,
    privacyVersion: 0,
    updatedAt: 1,
  });
  await studio.createAdventure(uid, {
    operationId: adventureId,
    title: 'Aventura original',
    synopsis: 'Sinopse congelada',
    universeId: 'world',
  });
  const scenes = createScenesService({ db: f.db, now: () => 200 }),
    part = await scenes.createSceneGroup(uid, {
      target,
      operationId: op('part'),
      title: 'Parte autoral',
    }),
    scene = await scenes.createScene(uid, {
      target,
      operationId: op('scene'),
      title: 'Cena original',
      parentId: part.id,
      content: '<p>Texto principal 🐉</p>',
      planning: { objective: 'Objetivo secreto' },
    });
  const blocks = createAdventureBlocksService({ db: f.db, now: () => 300 });
  const assets = { metadata: async () => ({ generation: '12345678901234567890', size: 100 }) };
  return {
    ...f,
    studio,
    scenes,
    part,
    sceneId: scene.scene.id,
    blocks,
    assets,
    api: createCampaignCaptureService({ db: f.db, assets, now: () => 400 }),
  };
}
async function start(f, name = 'start') {
  const source = await f.api.getCampaignCaptureSource(uid, { adventureId });
  return f.api.startCampaignCapture(uid, {
    operationId: op(name),
    adventureId,
    expectedSourceToken: source.sourceToken,
    title: 'Minha mesa',
    description: 'Minhas notas',
    universeId: 'world',
  });
}
async function advance(f, p, name = '') {
  return f.api.advanceCampaignCapture(uid, {
    captureId: p.captureId,
    operationId: digest({ captureId: p.captureId, checkpoint: p.checkpoint, name }),
    expectedCheckpoint: p.checkpoint,
  });
}
async function finish(f, p) {
  for (let i = 0; i < 150 && p.state === 'preparing'; i++) p = await advance(f, p);
  assert.equal(p.state, 'prepared');
  return p;
}
function stored(f, p) {
  return f.records.get('users/' + uid + '/campaignPreparations/' + p.captureId);
}
const conflict = (error) => error.details?.reason === 'revision-conflict';

test('capture preserves full authored structure and text; manual creation activates atomically and metadata retains provenance', async () => {
  const f = await fixture();
  await f.blocks.createAdventureBlock(uid, {
    adventureId,
    sceneId: f.sceneId,
    operationId: op('extra'),
    title: 'Pista',
    content: '<p>Texto adicional</p>',
    audience: 'players',
  });
  f.records.set(path + '/parts/' + f.part.id, {
    ...f.records.get(path + '/parts/' + f.part.id),
    content: '<p>Legado separado</p>',
  });
  f.records.set(path + '/arcs/arc', {
    id: 'arc',
    ownerId: uid,
    title: 'Arco',
    initialState: 'Começo',
    objective: 'Destino',
    plannedOutcome: 'Fim',
    rankA: 'a',
  });
  f.records.set(path + '/arcs/arc/milestones/milestone', {
    id: 'milestone',
    ownerId: uid,
    title: 'Marco',
    notes: 'Nota',
    rankA: 'a',
  });
  f.records.set(path + '/timelineEvents/event', {
    id: 'event',
    ownerId: uid,
    title: 'Evento',
    description: 'Tempo',
    dateLabel: '3º inverno',
    rankA: 'a',
  });
  f.records.set(path + '/workChecklist/task', { title: 'Não copiar' });
  const original = structuredClone([...f.records].filter(([key]) => key.startsWith(path))),
    p = await finish(f, await start(f));
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith('campaigns/')),
    false,
  );
  const prep = stored(f, p),
    prefix = basePath(uid, prep.baseId),
    items = [...f.records]
      .filter(([key]) => key.startsWith(prefix + '/items/'))
      .map(([, value]) => value);
  assert.equal(items.length, 7);
  assert.equal(p.counts.block, 2);
  const main = items.find((value) => value.role === 'main'),
    scene = items.find((value) => value.kind === 'scene');
  assert.equal(main.fields[0].bodySourceKey, scene.sourceKey);
  assert.equal(
    [...f.records.values()].some((value) => value.content === '<p>Legado separado</p>'),
    true,
  );
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith(prefix) && key.includes('workChecklist')),
    false,
  );
  const input = {
      captureId: p.captureId,
      operationId: op('activate'),
      expectedCheckpoint: p.checkpoint,
    },
    result = await f.api.activateCampaignCapture(uid, input);
  assert.equal(result.kind, 'activated');
  assert.equal(result.campaign.provenance.kind, 'original');
  assert.equal(f.records.get('universes/world').campaignCount, 1);
  const reader = createCampaignBaseReadService({ db: f.db, assets: f.assets });
  const meta = await reader.getCampaignBase(uid, { campaignId: result.campaign.id });
  assert.equal(meta.source.synopsis, 'Sinopse congelada');
  for (const item of items) {
    const page = await reader.readCampaignBaseItem(uid, {
      campaignId: result.campaign.id,
      sourceKey: item.sourceKey,
    });
    assert.equal(page.item.sourceKey, item.sourceKey);
    if (item.kind === 'part')
      assert.equal(
        page.chunks.find((chunk) => chunk.field === 'legacyContent').content,
        '<p>Legado separado</p>',
      );
  }
  assert.deepEqual(
    [...f.records].filter(([key]) => key.startsWith(path)),
    original,
  );
  assert.deepEqual(await f.api.activateCampaignCapture(uid, input), {
    kind: 'already-activated',
    campaignId: result.campaign.id,
  });
  const updated = await createCampaignsService({ db: f.db }).updateCampaign(uid, {
    campaignId: result.campaign.id,
    operationId: op('edit-own'),
    expectedRevision: 1,
    patch: { description: 'Nota particular' },
  });
  assert.deepEqual(updated.provenance, result.campaign.provenance);
  assert.equal(updated.activeBaseId, result.campaign.activeBaseId);
  assert.deepEqual(await f.api.activateCampaignCapture(uid, input), {
    kind: 'already-activated',
    campaignId: result.campaign.id,
  });
  assert.equal(
    (await f.studio.getCampaign(uid, { id: result.campaign.id })).activeBaseId,
    result.campaign.activeBaseId,
  );
  f.records.delete('campaigns/' + result.campaign.id);
  await assert.rejects(f.api.activateCampaignCapture(uid, input), { code: 'not-found' });
  await f.studio.createCampaign(uid, {
    operationId: result.campaign.id,
    title: 'Outra campanha independente',
  });
  await assert.rejects(f.api.activateCampaignCapture(uid, input), { code: 'not-found' });
});

test('explicit references deduplicate lore, preserve links and do not traverse entity relations or infer names', async () => {
  const f = await fixture(),
    reference = { kind: 'universe', scopeId: 'world', entityId: 'hero' };
  f.records.set(path + '/scenes/' + f.sceneId + '/references/ref', reference);
  f.records.set(path + '/arcs/arc', { ownerId: uid, title: 'Arco' });
  f.records.set(path + '/narrativeLinks/link', {
    source: { kind: 'arc', id: 'arc' },
    reference: { kind: 'lore', reference },
  });
  f.records.set('universes/world/lore/hero', {
    name: 'Heroína',
    category: 'character',
    summary: 'Ficha',
    details: 'Detalhes',
    aliases: ['H'],
    relations: [{ targetEntityId: 'universe:world:other', relationType: 'Aliada' }],
  });
  f.records.set('universes/world/lore/other', { name: 'Não capturar', category: 'other' });
  f.records.set(path + '/scenes/' + f.sceneId + '/references/orphan', {
    ...reference,
    entityId: 'missing',
  });
  const p = await finish(f, await start(f)),
    prefix = basePath(uid, stored(f, p).baseId),
    lore = [...f.records].filter(
      ([key, value]) => key.startsWith(prefix + '/items/') && value.kind === 'lore',
    );
  assert.equal(lore.length, 1);
  assert.equal(lore[0][1].title, 'Heroína');
  assert.equal(p.counts.reference, 2);
  assert.equal([...f.records.keys()].filter((key) => key.startsWith(prefix + '/links/')).length, 3);
  const chunks = [...f.records]
    .filter(([key]) => key.startsWith(prefix + '/bodies/'))
    .map(([, value]) => value.content)
    .join('');
  assert.equal(chunks.includes('targetEntityId'), false);
});

test('source token sees nanoseconds and source change aborts durably before a step or activation without partial campaign', async () => {
  const f = await fixture(),
    old = await f.api.getCampaignCaptureSource(uid, { adventureId });
  f.metadata.set(path, { updatedAt: 20, updatedAtNanoseconds: 99 });
  const fresh = await f.api.getCampaignCaptureSource(uid, { adventureId });
  assert.notEqual(old.sourceToken, fresh.sourceToken);
  await assert.rejects(
    f.api.startCampaignCapture(uid, {
      operationId: op('old-source'),
      adventureId,
      expectedSourceToken: old.sourceToken,
      title: 'Mesa',
      description: '',
      universeId: null,
    }),
    conflict,
  );
  let p = await start(f);
  f.metadata.set(path, { updatedAt: 20, updatedAtNanoseconds: 100 });
  p = await advance(f, p);
  assert.equal(p.state, 'aborted');
  assert.equal(stored(f, p).state, 'aborted');
  const ready = await finish(f, await start(f, 'new-start'));
  f.metadata.set(path, { updatedAt: 20, updatedAtNanoseconds: 101 });
  const input = {
      captureId: ready.captureId,
      operationId: op('aborted-activation'),
      expectedCheckpoint: ready.checkpoint,
    },
    aborted = await f.api.activateCampaignCapture(uid, input);
  assert.equal(aborted.kind, 'aborted');
  assert.equal(stored(f, ready).state, 'aborted');
  assert.equal((await f.api.activateCampaignCapture(uid, input)).kind, 'aborted');
  assert.equal(f.records.get('universes/world').campaignCount, 0);
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith('campaigns/')),
    false,
  );
});

test('step receipts and checkpoint CAS prevent duplicate work and tolerate reply loss', async () => {
  const f = await fixture(),
    p = await start(f),
    input = {
      captureId: p.captureId,
      operationId: op('same-step'),
      expectedCheckpoint: p.checkpoint,
    };
  const outcomes = await Promise.allSettled([
    f.api.advanceCampaignCapture(uid, input),
    advance(f, p, '-other'),
  ]);
  assert.equal(outcomes.filter((value) => value.status === 'fulfilled').length, 1);
  const after = await f.api.getCampaignCapture(uid, { captureId: p.captureId }),
    replay = await f.api.advanceCampaignCapture(uid, input);
  assert.equal(replay.checkpoint, after.checkpoint);
  assert.equal(after.counts.part, 1);
  await assert.rejects(f.api.advanceCampaignCapture(uid, { ...input, expectedCheckpoint: 99 }), {
    code: 'invalid-argument',
  });
  await assert.rejects(f.api.getCampaignCapture('other', { captureId: p.captureId }), {
    code: 'not-found',
  });
});

test('image pin survives original unlink; aborted capture cleans without source or recreating missing image', async () => {
  const f = await fixture(),
    imageId = 'library-image-capture-001';
  f.records.set('users/author/imageLibrary/' + imageId, {
    state: 'active',
    path: 'book-covers/author/image.png',
    useCount: 0,
  });
  const scene = f.records.get(path + '/scenes/' + f.sceneId);
  scene.mainBlockImage = { imageId, alt: 'Dragão', caption: 'Legenda própria' };
  let p = await finish(f, await start(f));
  const prep = stored(f, p),
    image = [...f.records].find(([key]) =>
      key.startsWith(basePath(uid, prep.baseId) + '/images/'),
    )[1];
  assert.equal(image.generation, '12345678901234567890');
  assert.equal(f.records.get('users/author/imageLibrary/' + imageId).useCount, 1);
  f.records.delete(path);
  f.records.delete('users/author/imageLibrary/' + imageId);
  const hidden = await f.api.getCampaignCapture(uid, { captureId: p.captureId });
  assert.equal(hidden.sourceAvailable, false);
  assert.equal(hidden.counts, null);
  for (let i = 0; i < 20 && p.state !== 'deleted'; i++)
    p = await f.api.cancelCampaignCapture(uid, {
      captureId: p.captureId,
      operationId: op('cleanup-' + p.checkpoint),
      expectedCheckpoint: p.checkpoint,
    });
  assert.equal(p.state, 'deleted');
  assert.equal(p.cleanupComplete, true);
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith(basePath(uid, prep.baseId))),
    false,
  );
  assert.equal(f.records.has('users/author/imageLibrary/' + imageId), false);
});

test('archive and unassigned states are frozen without composing archived extras; drift never becomes prepared', async () => {
  const f = await fixture();
  const unassigned = await f.scenes.createScene(uid, {
    target,
    operationId: op('unassigned'),
    parentId: null,
    title: 'Sem parte',
    content: 'Texto fora da composição',
  });
  await f.blocks.createAdventureBlock(uid, {
    adventureId,
    sceneId: f.sceneId,
    operationId: op('archived-extra'),
    title: 'Arquivo',
    content: 'Texto guardado',
  });
  const block = f.records.get(path + '/sceneBlocks/' + op('archived-extra'));
  block.archived = true;
  const scene = f.records.get(path + '/scenes/' + f.sceneId);
  scene.blockWordCount = 0;
  scene.blockCount = 0;
  scene.wordCount = scene.mainWordCount;
  scene.archived = true;
  const p = await finish(f, await start(f));
  assert.equal(
    [...f.records.values()].find(
      (value) => value.origin?.id === unassigned.scene.id && value.kind === 'scene',
    ).parentKey,
    null,
  );
  const blocks = [...f.records.values()].filter((value) => value.kind === 'block' && value.origin);
  assert.equal(
    blocks
      .filter(
        (value) => value.parentKey === baseSourceKey({ adventureId, kind: 'scene', id: f.sceneId }),
      )
      .every((value) => value.archived),
    true,
  );
  assert.equal(blocks.find((value) => value.origin.id === unassigned.scene.id).archived, false);
  scene.blockWordCount = 1;
  scene.wordCount = scene.mainWordCount + 1;
  let drifting = await start(f, 'drift');
  await assert.rejects(
    async () => {
      drifting = await finish(f, drifting);
    },
    { code: 'failed-precondition' },
  );
  assert.notEqual(stored(f, drifting).state, 'prepared');
  assert.equal(p.state, 'prepared');
});

test('raw UTF8 fields round trip Unicode, quotes and newlines, and malformed cursors fail explicitly', () => {
  const content = '🐉 "texto"\n\t'.repeat(12000),
    value = baseTextFields('source', { content }),
    manifest = value.fields[0];
  assert.equal(manifest.sha256, createHash('sha256').update(content, 'utf8').digest('hex'));
  assert.equal(manifest.bytes, Buffer.byteLength(content));
  assert.equal(value.bodies.map((body) => body.content).join(''), content);
  assert.ok(value.bodies.every((body) => Buffer.byteLength(body.content) <= 65536));
  assert.equal(
    baseBodyKey('source', 'content', 0),
    digest({ sourceKey: 'source', field: 'content', index: 0 }),
  );
  for (const malformed of [
    {},
    [],
    { version: 1, scope: null, key: 'x' },
    { version: 1, scope: {}, key: 1 },
    { version: 1, scope: {} },
  ])
    assert.throws(() => decodeBaseCursor(encodeBaseCursor(malformed), {}), {
      code: 'invalid-argument',
    });
  assert.throws(
    () =>
      decodeBaseCursor(encodeBaseCursor({ version: 1, scope: { uid: 'other' }, key: 'x' }), {
        uid,
      }),
    { code: 'failed-precondition' },
  );
  assert.equal(baseSourceKey({ kind: 'lore', id: 'x', scopeId: 'world' }).length, 64);
});

test('large saved prose captures once and reads paginated fields with raw UTF8 hashes intact', async () => {
  const f = await fixture(),
    content = '<p>' + '🐉 "fala"\n'.repeat(50000) + '</p>';
  await f.scenes.updateScene(uid, {
    target,
    sceneId: f.sceneId,
    expectedRevision: 1,
    operationId: op('large-prose'),
    patch: { content },
  });
  const p = await finish(f, await start(f)),
    result = await f.api.activateCampaignCapture(uid, {
      captureId: p.captureId,
      operationId: op('large-activate'),
      expectedCheckpoint: p.checkpoint,
    }),
    reader = createCampaignBaseReadService({ db: f.db, assets: f.assets }),
    sourceKey = baseSourceKey({ adventureId, kind: 'scene', id: f.sceneId });
  let cursor = null,
    text = '',
    pages = 0,
    manifest;
  do {
    const page = await reader.readCampaignBaseItem(uid, {
      campaignId: result.campaign.id,
      sourceKey,
      cursor,
      limit: 1,
    });
    text += page.chunks
      .filter((chunk) => chunk.field === 'content')
      .map((chunk) => chunk.content)
      .join('');
    manifest = page.item.fields.find((field) => field.field === 'content');
    cursor = page.nextCursor;
    pages++;
  } while (cursor && pages < 30);
  assert.equal(cursor, null);
  assert.ok(pages > 4);
  assert.equal(text, content);
  assert.equal(manifest.sha256, createHash('sha256').update(content).digest('hex'));
  assert.equal(manifest.bytes, Buffer.byteLength(content));
  assert.equal('bodySourceKey' in manifest, false);
  assert.ok(f.reads.every((read) => read.maximum <= 51));
});

test('reserved base and campaign identities remain stable across replay, checkpoints and unavailable origin without creating a campaign', async () => {
  const f = await fixture(),
    p = await start(f, 'reserved');
  assert.equal(p.campaignId, null);
  assert.match(p.reserved.baseId, /^[a-f0-9]{64}$/);
  assert.match(p.reserved.campaignId, /^[a-f0-9]{64}$/);
  assert.notEqual(p.reserved.baseId, p.captureId);
  assert.notEqual(p.reserved.campaignId, p.captureId);
  assert.notEqual(p.reserved.baseId, p.reserved.campaignId);
  const next = await advance(f, p),
    replay = await start(f, 'reserved');
  assert.deepEqual(next.reserved, p.reserved);
  assert.deepEqual(replay.reserved, p.reserved);
  assert.equal(replay.checkpoint, next.checkpoint);
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith('campaigns/')),
    false,
  );
  f.records.delete(path);
  const unavailable = await f.api.getCampaignCapture(uid, { captureId: p.captureId });
  assert.equal(unavailable.counts, null);
  assert.deepEqual(unavailable.reserved, p.reserved);
  stored(f, p).baseId = 'forged';
  await assert.rejects(f.api.getCampaignCapture(uid, { captureId: p.captureId }), {
    code: 'failed-precondition',
  });
});

test('future adventure schemas never yield capture data and cannot strand cleanup of an existing preparation', async () => {
  const f = await fixture(),
    p = await start(f, 'future-schema');
  f.records.get(path).schemaVersion = 2;
  assert.equal(await f.api.getCampaignCaptureSource(uid, { adventureId }), null);
  const aborted = await advance(f, p);
  assert.equal(aborted.state, 'aborted');
  assert.equal(aborted.reason, 'source-unavailable');
  assert.equal(aborted.counts, null);
  const cancelled = await f.api.cancelCampaignCapture(uid, {
    captureId: p.captureId,
    expectedCheckpoint: aborted.checkpoint,
    operationId: op('cleanup-future'),
  });
  assert.equal(cancelled.state, 'deleting');
});

test('pending controls paginate independently of device and redact derived counts after original universe authorization is lost', async () => {
  const f = await fixture(),
    first = await start(f, 'pending-first');
  await start(f, 'pending-second');
  const page = await f.api.listCampaignCaptures(uid, { limit: 1 });
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  const second = await f.api.listCampaignCaptures(uid, { limit: 1, cursor: page.nextCursor });
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0].captureId, page.items[0].captureId);
  assert.equal(second.nextCursor, null);
  await assert.rejects(f.api.listCampaignCaptures('other', { cursor: page.nextCursor }), {
    code: 'failed-precondition',
  });
  f.records.set('universes/other-world', { authorId: uid, loreVersion: 0, privacyVersion: 0 });
  f.records.get(path).universeId = 'other-world';
  f.records.get('universes/world').authorId = 'someone-else';
  const unavailable = await f.api.getCampaignCapture(uid, { captureId: first.captureId });
  assert.equal(unavailable.sourceAvailable, false);
  assert.equal(unavailable.counts, null);
  assert.equal(unavailable.processed, 0);
  const control = stored(f, first);
  control.schemaVersion = 2;
  await assert.rejects(f.api.getCampaignCapture(uid, { captureId: first.captureId }), {
    code: 'failed-precondition',
  });
  const originalInput = {
    operationId: first.captureId,
    adventureId,
    expectedSourceToken: control.sourceToken,
    title: 'Minha mesa',
    description: 'Minhas notas',
    universeId: 'world',
  };
  await assert.rejects(f.api.startCampaignCapture(uid, originalInput), {
    code: 'failed-precondition',
  });
});
