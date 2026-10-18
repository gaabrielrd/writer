import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import {
  seedLoreRecords,
  uid,
  campaignId,
  campaignPath,
  basePath,
  baseId,
  adventureId,
  op,
} from './helpers/campaignLore.mjs';
import {
  baseSourceKey,
  baseTextFields,
  baseBodyKey,
  baseImageKey,
  baseImageUseKey,
  digest,
} from '../src/campaignBaseContracts.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createCampaignSessionScenesService } from '../src/campaignSessionScenes.mjs';

const sceneOrigin = { adventureId, kind: 'scene', id: 'captured-scene-first' },
  sceneKey = baseSourceKey(sceneOrigin);
const mainOrigin = { adventureId, kind: 'block', id: sceneOrigin.id, role: 'main' },
  mainKey = baseSourceKey(mainOrigin);
const extraOrigin = { adventureId, kind: 'block', id: 'captured-extra-first', role: 'additional' },
  extraKey = baseSourceKey(extraOrigin);
const archivedOrigin = { ...extraOrigin, id: 'captured-extra-archive' },
  archivedKey = baseSourceKey(archivedOrigin);
const otherOrigin = { adventureId, kind: 'scene', id: 'captured-scene-other' },
  otherKey = baseSourceKey(otherOrigin);
const otherBlockOrigin = { ...extraOrigin, id: 'captured-extra-other' },
  otherBlockKey = baseSourceKey(otherBlockOrigin);
const imageId = 'captured-image-first',
  imageKey = baseImageKey(imageId),
  imagePath = 'private/pinned.webp';
const reason = (value) => (error) => error.details?.reason === value;
async function fixture() {
  const f = studioDb();
  for (const [path, value] of seedLoreRecords()) f.records.set(path, value);
  const bodyReads = [],
    queries = f.reads,
    db = {
      ...f.db,
      runTransaction: (fn) =>
        f.db.runTransaction((tx) =>
          fn({
            ...tx,
            get: (ref) => {
              if (ref.path) bodyReads.push(ref.path);
              return tx.get(ref);
            },
          }),
        ),
    };
  const put = (origin, metadata, texts, structured = {}) => {
    const sourceKey = baseSourceKey(origin),
      text = baseTextFields(sourceKey, texts);
    const item = {
      sourceKey,
      kind: origin.kind,
      origin,
      title: 'Título ' + origin.id,
      parentKey: null,
      archived: false,
      orderKey: '10',
      ...metadata,
      fields: text.fields,
      structured,
    };
    f.records.set(basePath + '/items/' + sourceKey, item);
    for (const body of text.bodies)
      f.records.set(
        basePath + '/bodies/' + baseBodyKey(body.sourceKey, body.field, body.index),
        body,
      );
    return item;
  };
  const scene = put(
    sceneOrigin,
    {},
    {
      content: 'Principal 🐉',
      objective: 'Objetivo próprio',
      conflict: 'Conflito',
      pointOfView: 'Ponto de vista',
    },
  );
  const main = {
    sourceKey: mainKey,
    kind: 'block',
    origin: mainOrigin,
    parentKey: sceneKey,
    title: 'Principal',
    archived: false,
    orderKey: '20',
    type: 'scene',
    audience: 'creator',
    role: 'main',
    fields: scene.fields.filter((field) => field.field === 'content'),
    structured: { wordCount: 2 },
  };
  f.records.set(basePath + '/items/' + mainKey, main);
  const extra = put(
    extraOrigin,
    {
      parentKey: sceneKey,
      title: 'Adicional',
      orderKey: '10',
      type: 'clue',
      audience: 'players',
      role: 'additional',
    },
    { content: '  Extra\n🌕  ' },
    { ownArchived: false },
  );
  put(
    archivedOrigin,
    {
      parentKey: sceneKey,
      title: 'Arquivado',
      orderKey: '30',
      type: 'preparation',
      audience: 'gm',
      role: 'additional',
      archived: true,
    },
    { content: 'Texto arquivado' },
    { ownArchived: true },
  );
  put(
    otherOrigin,
    { orderKey: '11', stage: 'ready' },
    { content: 'Outra cena', objective: 'Outro plano' },
  );
  put(
    otherBlockOrigin,
    {
      parentKey: otherKey,
      title: 'Outro bloco',
      type: 'scene',
      audience: 'creator',
      role: 'additional',
    },
    { content: 'Não ler por vínculo errado' },
    { ownArchived: false },
  );
  extra.image = { imageKey, alt: 'Alt privado', caption: 'Legenda privada' };
  const useKey = baseImageUseKey(baseId, imageId);
  f.records.set(basePath + '/images/' + imageKey, {
    imageKey,
    imageId,
    state: 'ready',
    path: imagePath,
    generation: '7',
    size: 3,
    useKey,
  });
  f.records.set(`users/${uid}/imageLibrary/${imageId}`, {
    state: 'active',
    path: imagePath,
    useCount: 1,
  });
  f.records.set(`users/${uid}/imageLibrary/${imageId}/uses/${useKey}`, {
    kind: 'campaign-base',
    campaignId,
    baseId,
  });
  const sessions = createCampaignSessionsService({ db, now: () => 100 }),
    start = await sessions.listCampaignSessions(uid, { campaignId });
  const save = {
    campaignId,
    campaignToken: start.campaignToken,
    sessionId: op('s2b-session'),
    operationId: op('s2b-session'),
    expectedRevision: 0,
    title: 'Sessão',
    summary: 'Rascunho próprio preservado',
    status: 'planned',
    scheduledDate: null,
  };
  await sessions.saveCampaignSession(uid, save);
  const scope = {
    campaignId,
    campaignToken: start.campaignToken,
    sessionId: save.sessionId,
    expectedSessionRevision: 1,
  };
  const refs = createCampaignSessionReferencesService({ db, now: () => 200 });
  const sourceContext = (
    await refs.listCampaignSessionReferences(uid, { ...scope, view: 'references' })
  ).sourceContext;
  const add = {
    ...scope,
    referenceId: op('s2b-reference'),
    operationId: op('s2b-reference'),
    expectedReferenceCollectionRevision: 0,
    sourceContext,
    target: { kind: 'scene', sourceKey: sceneKey },
  };
  await refs.addCampaignSessionReference(uid, add);
  const input = {
    ...scope,
    referenceId: add.referenceId,
    expectedRevision: 1,
    expectedReferenceCollectionRevision: 1,
    sourceContext,
  };
  let download = async () => Buffer.from('raw'),
    derive = async () => Buffer.from('webp');
  const assets = {
    metadata: async () => ({ generation: '7', size: 3 }),
    readGeneration: async (...args) => download(...args),
  };
  const api = createCampaignSessionScenesService({
    db,
    assets,
    deriveImage: (...args) => derive(...args),
  });
  return {
    ...f,
    db,
    queries,
    bodyReads,
    put,
    scene,
    main,
    extra,
    refs,
    sessions,
    save,
    scope,
    add,
    input,
    api,
    assets,
    setDownload: (fn) => (download = fn),
    setDerive: (fn) => (derive = fn),
  };
}
const noBodies = (f) =>
  assert.equal(
    f.bodyReads.some((path) => path.includes('/bodies/')),
    false,
  );

test('kind opt-in isolates legacy lore DTOs, orders scene candidates and shares collection CAS and historical fences', async () => {
  const f = await fixture();
  assert.deepEqual(
    (await f.refs.listCampaignSessionReferences(uid, { ...f.scope, view: 'references' })).items,
    [],
  );
  const scenes = await f.refs.listCampaignSessionReferences(uid, {
    ...f.scope,
    view: 'references',
    kind: 'scene',
  });
  assert.equal(scenes.items[0].target.kind, 'scene');
  assert.equal(scenes.items[0].target.stage, null);
  const candidates = {
    ...f.scope,
    view: 'candidates',
    kind: 'scene',
    sourceContext: f.input.sourceContext,
    limit: 1,
  };
  const first = await f.refs.listCampaignSessionReferences(uid, candidates),
    last = await f.refs.listCampaignSessionReferences(uid, {
      ...candidates,
      cursor: first.nextCursor,
    });
  assert.equal(first.items[0].sourceKey, sceneKey);
  assert.equal(last.items[0].sourceKey, otherKey);
  assert.equal(last.nextCursor, null);
  await assert.rejects(f.refs.readCampaignSessionLoreReference(uid, f.input), {
    code: 'invalid-argument',
  });
  await assert.rejects(
    f.refs.addCampaignSessionReference(uid, {
      ...f.add,
      referenceId: op('duplicate'),
      operationId: op('duplicate'),
      expectedReferenceCollectionRevision: 1,
    }),
    reason('reference-already-linked'),
  );
  for (const value of [
    { ...f.scope, view: 'references', archive: 'all' },
    { ...f.scope, view: 'candidates', sourceContext: f.input.sourceContext, archive: 'all' },
    { ...f.scope, view: 'references', kind: 'block' },
  ])
    await assert.rejects(f.refs.listCampaignSessionReferences(uid, value), {
      code: 'invalid-argument',
    });
  const old = JSON.parse(Buffer.from(first.nextCursor, 'base64url'));
  delete old.scope.kind;
  await assert.rejects(
    f.refs.listCampaignSessionReferences(uid, {
      ...candidates,
      cursor: Buffer.from(JSON.stringify(old)).toString('base64url'),
    }),
    reason('cursor-invalidated'),
  );
  await f.sessions.deleteCampaignSession(uid, {
    campaignId,
    campaignToken: f.scope.campaignToken,
    sessionId: f.scope.sessionId,
    operationId: op('remove-session'),
    expectedRevision: 1,
  });
  assert.equal((await f.refs.addCampaignSessionReference(uid, f.add)).kind, 'confirmed');
  const unknown = { ...f.add, referenceId: op('never'), operationId: op('never') };
  const cancel = { action: 'add', request: unknown, intent: 'cancel' };
  assert.equal(
    (await f.refs.resolveCampaignSessionReferenceOperation(uid, cancel)).kind,
    'canceled',
  );
  assert.equal((await f.refs.addCampaignSessionReference(uid, unknown)).kind, 'canceled');
});

test('plan omits principal bytes; main/additional are separate ordered blocks with explicit archive and exact projected DTOs', async () => {
  const f = await fixture(),
    original = structuredClone([...f.records]);
  f.bodyReads.length = 0;
  const plan = await f.api.readCampaignSessionSceneReference(uid, f.input);
  assert.equal(plan.resourceKind, 'scene-plan');
  assert.equal(plan.blockKey, null);
  assert.equal(plan.resourceKey, sceneKey);
  assert.deepEqual(
    plan.material.item.fields.map((field) => field.field),
    ['objective', 'conflict', 'pointOfView'],
  );
  assert.equal(
    plan.material.chunks.map((chunk) => chunk.content).join('|'),
    'Objetivo próprio|Conflito|Ponto de vista',
  );
  assert.equal(
    f.bodyReads.includes(basePath + '/bodies/' + baseBodyKey(sceneKey, 'content', 0)),
    false,
  );
  f.bodyReads.length = 0;
  const first = await f.api.listCampaignSessionSceneBlocks(uid, { ...f.input, limit: 1 }),
    second = await f.api.listCampaignSessionSceneBlocks(uid, {
      ...f.input,
      limit: 1,
      cursor: first.nextCursor,
    });
  assert.equal(first.items[0].sourceKey, extraKey);
  assert.equal(first.items[0].ownArchived, false);
  assert.equal(second.items[0].sourceKey, mainKey);
  assert.equal(second.items[0].ownArchived, null);
  assert.equal(second.nextCursor, null);
  noBodies(f);
  const archive = await f.api.listCampaignSessionSceneBlocks(uid, {
    ...f.input,
    archive: 'archived',
  });
  assert.equal(archive.items[0].sourceKey, archivedKey);
  assert.equal(archive.items[0].ownArchived, true);
  const main = await f.api.readCampaignSessionSceneReference(uid, {
    ...f.input,
    blockKey: mainKey,
  });
  assert.equal(main.material.chunks[0].content, 'Principal 🐉');
  assert.equal(main.material.item.kind, 'block');
  assert.equal(main.material.item.role, 'main');
  const extra = await f.api.readCampaignSessionSceneReference(uid, {
    ...f.input,
    blockKey: extraKey,
  });
  assert.equal(extra.material.chunks[0].content, '  Extra\n🌕  ');
  assert.deepEqual(extra.material.item.image, {
    imageKey,
    alt: 'Alt privado',
    caption: 'Legenda privada',
  });
  for (const result of [plan, first, second, archive, main, extra])
    for (const forbidden of [
      'bodySourceKey',
      'capturedExtra',
      '"origin"',
      '"bodyBinding"',
      'private/pinned',
    ])
      assert.equal(JSON.stringify(result).includes(forbidden), false);
  assert.deepEqual([...f.records], original);
});

test('archived scene moves all children into explicit archive without inventing ownArchived for main', async () => {
  const f = await fixture();
  f.scene.archived = true;
  for (const value of f.records.values())
    if (value.kind === 'block' && value.parentKey === sceneKey) value.archived = true;
  assert.deepEqual((await f.api.listCampaignSessionSceneBlocks(uid, f.input)).items, []);
  const archived = await f.api.listCampaignSessionSceneBlocks(uid, {
    ...f.input,
    archive: 'archived',
  });
  assert.equal(archived.scene.archived, true);
  assert.equal(archived.items.length, 3);
  assert.equal(archived.items.find((item) => item.role === 'main').ownArchived, null);
  const candidates = await f.refs.listCampaignSessionReferences(uid, {
    ...f.scope,
    view: 'candidates',
    kind: 'scene',
    sourceContext: f.input.sourceContext,
    archive: 'archived',
  });
  assert.equal(candidates.items[0].sourceKey, sceneKey);
});

test('full descriptor validation precedes plan I/O, main binding rejects another scene and wrong-parent reads never fetch bodies', async () => {
  const f = await fixture(),
    saved = structuredClone(f.scene.fields);
  f.bodyReads.length = 0;
  for (const mutate of [
    (fields) => (fields[0].sha256 = 'bad'),
    (fields) => (fields[0].bodySourceKey = otherKey),
    (fields) => fields.push({ ...fields[0] }),
    (fields) => (fields[0].bytes = 2 * 1024 * 1024 + 1),
  ]) {
    f.scene.fields = structuredClone(saved);
    mutate(f.scene.fields);
    await assert.rejects(f.api.readCampaignSessionSceneReference(uid, f.input), {
      code: 'failed-precondition',
    });
    noBodies(f);
  }
  f.scene.fields = saved;
  await assert.rejects(
    f.api.readCampaignSessionSceneReference(uid, { ...f.input, blockKey: otherBlockKey }),
    reason('scene-material-inconsistent'),
  );
  noBodies(f);
  await assert.rejects(
    f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: otherBlockKey }),
    reason('scene-material-inconsistent'),
  );
  noBodies(f);
  f.main.fields = [{ ...f.main.fields[0], bodySourceKey: otherKey }];
  await assert.rejects(
    f.api.readCampaignSessionSceneReference(uid, { ...f.input, blockKey: mainKey }),
    reason('scene-material-inconsistent'),
  );
  noBodies(f);
  f.main.fields = saved.filter((field) => field.field === 'content');
  f.records.get(basePath + '/bodies/' + baseBodyKey(sceneKey, 'content', 0)).content = 'Corrompido';
  assert.equal(
    (await f.api.readCampaignSessionSceneReference(uid, f.input)).resourceKind,
    'scene-plan',
  );
  await assert.rejects(
    f.api.readCampaignSessionSceneReference(uid, { ...f.input, blockKey: mainKey }),
    { code: 'failed-precondition' },
  );
});

test('chunk windows preserve Unicode and complete hashes; cursor cannot cross resource, archive, actor or source context', async () => {
  const f = await fixture(),
    text = '🐉'.repeat(70000) + '\n  fim';
  f.put(
    extraOrigin,
    {
      parentKey: sceneKey,
      title: 'Adicional',
      orderKey: '10',
      type: 'clue',
      audience: 'players',
      role: 'additional',
    },
    { content: text },
    { ownArchived: false },
  );
  let cursor, first;
  const parts = [];
  do {
    const page = await f.api.readCampaignSessionSceneReference(uid, {
      ...f.input,
      blockKey: extraKey,
      limit: 1,
      ...(cursor ? { cursor } : {}),
    });
    first ??= page;
    parts.push(...page.material.chunks.map((chunk) => chunk.content));
    cursor = page.material.nextCursor;
  } while (cursor);
  assert.equal(parts.join(''), text);
  assert.equal(digest(parts.join('')), first.material.item.fields[0].sha256);
  await assert.rejects(
    f.api.readCampaignSessionSceneReference(uid, { ...f.input, cursor: first.material.nextCursor }),
    reason('cursor-invalidated'),
  );
  await assert.rejects(
    f.api.readCampaignSessionSceneReference('other', { ...f.input, blockKey: extraKey }),
    { code: 'not-found' },
  );
  const list = await f.api.listCampaignSessionSceneBlocks(uid, { ...f.input, limit: 1 });
  await assert.rejects(
    f.api.listCampaignSessionSceneBlocks(uid, {
      ...f.input,
      archive: 'all',
      cursor: list.nextCursor,
    }),
    reason('cursor-invalidated'),
  );
  f.records.get('universes/world').privacyVersion++;
  f.bodyReads.length = 0;
  await assert.rejects(
    f.api.readCampaignSessionSceneReference(uid, { ...f.input, blockKey: extraKey }),
    reason('source-context-changed'),
  );
  noBodies(f);
});

test('scene disappearance has no historical fallback; root absence returns neutral DTOs and own session survives', async () => {
  const f = await fixture();
  f.records.delete(basePath + '/items/' + sceneKey);
  f.bodyReads.length = 0;
  const rows = await f.refs.listCampaignSessionReferences(uid, {
    ...f.scope,
    view: 'references',
    kind: 'scene',
  });
  assert.deepEqual(rows.items[0], {
    id: f.add.referenceId,
    revision: 1,
    createdAt: 200,
    updatedAt: 200,
    available: false,
  });
  const plan = await f.api.readCampaignSessionSceneReference(uid, f.input);
  assert.equal(plan.material, null);
  assert.equal(plan.resourceKey, null);
  assert.deepEqual((await f.api.listCampaignSessionSceneBlocks(uid, f.input)).items, []);
  assert.equal(
    (await f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey })).dataUrl,
    null,
  );
  noBodies(f);
  f.records.delete('adventures/' + adventureId);
  assert.equal((await f.api.readCampaignSessionSceneReference(uid, f.input)).sourceContext, null);
  const own = await f.sessions.getCampaignSession(uid, {
    campaignId,
    campaignToken: f.scope.campaignToken,
    sessionId: f.scope.sessionId,
  });
  assert.equal(own.session.summary, 'Rascunho próprio preservado');
});

test('scene, session, reference revision and collection gates precede every body or media access', async () => {
  const f = await fixture();
  f.bodyReads.length = 0;
  for (const patch of [
    { expectedSessionRevision: 2 },
    { expectedRevision: 2 },
    { expectedReferenceCollectionRevision: 0 },
  ])
    await assert.rejects(
      f.api.readCampaignSessionSceneReference(uid, { ...f.input, ...patch }),
      reason('revision-conflict'),
    );
  noBodies(f);
  await f.refs.removeCampaignSessionReference(uid, {
    ...f.scope,
    referenceId: f.add.referenceId,
    operationId: op('s2b-remove'),
    expectedRevision: 1,
    expectedReferenceCollectionRevision: 1,
  });
  await assert.rejects(
    f.api.listCampaignSessionSceneBlocks(uid, {
      ...f.input,
      expectedReferenceCollectionRevision: 2,
    }),
    { code: 'not-found' },
  );
  noBodies(f);
});

test('media derives only selected pinned image and reauthorizes after download and derivation, including C4', async () => {
  const f = await fixture();
  const media = await f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey });
  assert.equal(media.imageKey, imageKey);
  assert.equal(media.dataUrl, 'data:image/webp;base64,d2VicA==');
  assert.equal(JSON.stringify(media).includes(imagePath), false);
  assert.equal(
    (await f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: mainKey })).dataUrl,
    null,
  );
  f.setDownload(async () => {
    f.records.get(campaignPath + '/sessions/' + f.scope.sessionId).deleted = true;
    return Buffer.from('raw');
  });
  await assert.rejects(
    f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey }),
    reason('session-unavailable'),
  );
  f.records.get(campaignPath + '/sessions/' + f.scope.sessionId).deleted = false;
  f.setDownload(async () => Buffer.from('raw'));
  f.setDerive(async () => {
    f.records.set('campaignDeletionReservations/' + campaignId, {
      schemaVersion: 1,
      ownerId: uid,
      campaignId,
      campaignToken: f.scope.campaignToken,
      deletionId: op('deletion'),
      state: 'deleting',
      createdAt: 1,
      updatedAt: 1,
    });
    return Buffer.from('webp');
  });
  await assert.rejects(
    f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey }),
    reason('campaign-deleting'),
  );
});

test('media rejects missing pins, replaced generation, oversized output and malformed/extra inputs without accepting paths', async () => {
  const f = await fixture(),
    usePath = `users/${uid}/imageLibrary/${imageId}/uses/${baseImageUseKey(baseId, imageId)}`,
    pin = f.records.get(usePath);
  f.records.delete(usePath);
  await assert.rejects(
    f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey }),
    { code: 'not-found' },
  );
  f.records.set(usePath, pin);
  f.assets.metadata = async () => ({ generation: '8', size: 3 });
  await assert.rejects(
    f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey }),
    { code: 'failed-precondition' },
  );
  f.assets.metadata = async () => ({ generation: '7', size: 3 });
  f.setDerive(async () => Buffer.alloc(0));
  await assert.rejects(
    f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey }),
    reason('scene-material-inconsistent'),
  );
  f.setDerive(async () => Buffer.alloc(1.5 * 1024 * 1024 + 1));
  await assert.rejects(
    f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey }),
    reason('scene-material-inconsistent'),
  );
  for (const patch of [{ path: imagePath }, { imageKey }, { blockKey: 'short' }])
    await assert.rejects(
      f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey, ...patch }),
      { code: 'invalid-argument' },
    );
  for (const patch of [{ limit: 9 }, { blockKey: null }, { cursor: '!' }])
    await assert.rejects(f.api.readCampaignSessionSceneReference(uid, { ...f.input, ...patch }), {
      code: 'invalid-argument',
    });
});

test('missing current universe preserves scene access; adoption without scene never searches old base', async () => {
  const f = await fixture();
  f.records.delete('universes/world');
  const page = await f.refs.listCampaignSessionReferences(uid, {
    ...f.scope,
    view: 'references',
    kind: 'scene',
  });
  assert.equal(page.items[0].available, true);
  assert.ok(page.sourceContext);
  const current = { ...f.input, sourceContext: page.sourceContext };
  assert.equal((await f.api.readCampaignSessionSceneReference(uid, current)).resourceKey, sceneKey);
  const nextId = digest('adopted-base-without-scene'),
    nextPath = `users/${uid}/campaignBases/${nextId}`;
  f.records.set(nextPath, { ...f.records.get(basePath), id: nextId });
  const campaign = f.records.get(campaignPath);
  campaign.activeBaseId = nextId;
  campaign.provenance.baseId = nextId;
  f.bodyReads.length = 0;
  await assert.rejects(
    f.api.readCampaignSessionSceneReference(uid, current),
    reason('source-context-changed'),
  );
  noBodies(f);
  const next = await f.refs.listCampaignSessionReferences(uid, {
    ...f.scope,
    view: 'references',
    kind: 'scene',
  });
  assert.equal(next.items[0].available, false);
  const result = await f.api.readCampaignSessionSceneReference(uid, {
    ...current,
    sourceContext: next.sourceContext,
  });
  assert.equal(result.resourceKey, null);
  assert.equal(result.material, null);
  noBodies(f);
  assert.ok(f.records.has(basePath + '/items/' + sceneKey));
});

test('media suppresses response if reference changes during download or projection changes during derivation', async () => {
  const f = await fixture();
  let derived = 0;
  f.setDerive(async () => {
    derived++;
    return Buffer.from('webp');
  });
  f.setDownload(async () => {
    await f.refs.removeCampaignSessionReference(uid, {
      ...f.scope,
      referenceId: f.add.referenceId,
      operationId: op('remove-during-image'),
      expectedRevision: 1,
      expectedReferenceCollectionRevision: 1,
    });
    return Buffer.from('raw');
  });
  await assert.rejects(
    f.api.readCampaignSessionSceneImage(uid, { ...f.input, blockKey: extraKey }),
    reason('revision-conflict'),
  );
  assert.equal(derived, 0);
  const g = await fixture();
  g.setDerive(async () => {
    g.records.get('universes/world').privacyVersion++;
    return Buffer.from('webp');
  });
  await assert.rejects(
    g.api.readCampaignSessionSceneImage(uid, { ...g.input, blockKey: extraKey }),
    reason('source-context-changed'),
  );
});
