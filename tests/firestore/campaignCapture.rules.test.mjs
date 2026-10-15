import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, limit } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createNarrativePlanningService } from '../../functions/src/narrativePlanning.mjs';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { createCampaignCaptureService } from '../../functions/src/campaignCapture.mjs';
import { createCampaignBaseReadService } from '../../functions/src/campaignBaseRead.mjs';
import { createUniverseService } from '../../functions/src/universes.mjs';
import { createCampaignsService } from '../../functions/src/campaigns.mjs';
import { basePath, baseSourceKey, digest } from '../../functions/src/campaignBaseContracts.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-campaign-capture-tests',
  uid = 'author',
  adventureId = 'adventure-sdk-capture-001',
  target = { kind: 'adventure', id: adventureId },
  path = 'adventures/' + adventureId,
  previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, studio, scenes, narrative, blocks, api, reader, part, scene, generation;
const op = (name) => 'campaign-capture-sdk-' + name;
const assets = {
  metadata: async () => ({ generation, size: 4 }),
  readGeneration: async () => Buffer.from('webp'),
};
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
  studio = createStudioService({ db: admin });
  scenes = createScenesService({ db: admin });
  narrative = createNarrativePlanningService({ db: admin });
  blocks = createAdventureBlocksService({ db: admin });
  api = createCampaignCaptureService({ db: admin, assets });
  reader = createCampaignBaseReadService({
    db: admin,
    assets,
    deriveImage: async (bytes) => bytes,
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  generation = '12345678901234567890';
  await newUniverse();
  await studio.createAdventure(uid, {
    operationId: adventureId,
    title: 'Aventura SDK',
    synopsis: 'Sinopse privada',
    universeId: 'world',
  });
  part = await scenes.createSceneGroup(uid, {
    target,
    operationId: op('part'),
    title: 'Parte própria',
  });
  scene = (
    await scenes.createScene(uid, {
      target,
      operationId: op('scene'),
      title: 'Cena própria',
      parentId: part.id,
      content: '<p>Texto original 🐉</p>',
      planning: { objective: 'Objetivo autoral' },
    })
  ).scene;
});
async function newUniverse() {
  await createUniverseService({ db: admin }).createUniverse(uid, {
    creationId: 'world',
    name: 'Mundo',
    description: '',
  });
}
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const client = (user) =>
  user
    ? environment.authenticatedContext(user).firestore()
    : environment.unauthenticatedContext().firestore();
async function start(name = 'start') {
  const source = await api.getCampaignCaptureSource(uid, { adventureId });
  return api.startCampaignCapture(uid, {
    operationId: op(name),
    adventureId,
    expectedSourceToken: source.sourceToken,
    title: 'Mesa SDK',
    description: 'Notas próprias',
    universeId: 'world',
  });
}
const advance = (p, name = '') =>
  api.advanceCampaignCapture(uid, {
    captureId: p.captureId,
    operationId: digest({ id: p.captureId, checkpoint: p.checkpoint, name }),
    expectedCheckpoint: p.checkpoint,
  });
async function finish(p) {
  for (let i = 0; i < 200 && p.state === 'preparing'; i++) p = await advance(p);
  assert.equal(p.state, 'prepared');
  return p;
}
async function activate(p, name = 'activate') {
  return api.activateCampaignCapture(uid, {
    captureId: p.captureId,
    operationId: op(name),
    expectedCheckpoint: p.checkpoint,
  });
}
const source = (item) => ({
  kind: item.kind,
  id: item.id,
  ...(item.kind === 'milestone' ? { arcId: item.arcId } : {}),
});

test('SDK real writers capture narrative rank B, explicit scene/arc/milestone/event references, legacy parts and private immutable text', async () => {
  const universe = createUniverseService({ db: admin });
  await universe.saveUniverseLore(uid, {
    universeId: 'world',
    id: 'hero',
    create: true,
    input: {
      name: 'Heroína',
      aliases: [],
      category: 'character',
      summary: 'Resumo',
      details: 'Ficha privada',
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: [],
      isPublic: false,
    },
  });
  // Use current server writers for every source family; Admin only represents preserved legacy part prose.
  await admin.doc(path + '/parts/' + part.id).update({ content: '<p>Legado da parte</p>' });
  const arc = await narrative.createNarrativeItem(uid, {
      target,
      operationId: op('arc'),
      resource: { kind: 'arc' },
      title: 'Arco real',
      initialState: 'Começo',
      objective: 'Destino',
      plannedOutcome: 'Fim',
    }),
    milestone = await narrative.createNarrativeItem(uid, {
      target,
      operationId: op('milestone'),
      resource: { kind: 'milestone', arcId: arc.item.id },
      title: 'Marco real',
      notes: 'Nota preservada',
    }),
    event = await narrative.createNarrativeItem(uid, {
      target,
      operationId: op('event'),
      resource: { kind: 'event' },
      title: 'Evento real',
      description: 'Descrição temporal',
      dateLabel: '3º inverno',
    });
  const reference = { kind: 'universe', scopeId: 'world', entityId: 'hero' };
  await scenes.setSceneReference(uid, {
    target,
    sceneId: scene.id,
    operationId: op('scene-ref'),
    expectedRevision: scene.revision,
    reference,
  });
  for (const item of [arc.item, milestone.item, event.item])
    await narrative.setNarrativeReference(uid, {
      target,
      operationId: op('ref-' + item.kind),
      source: source(item),
      expectedRevision: item.revision,
      reference: { kind: 'lore', reference },
    });
  for (const resource of [
    { kind: 'arc' },
    { kind: 'milestone', arcId: arc.item.id },
    { kind: 'event' },
  ]) {
    let complete = false;
    for (let i = 0; i < 10 && !complete; i++)
      complete = (
        await narrative.rebalanceNarrativeRanks(uid, {
          target,
          resource,
          operationId: op('rebalance-' + resource.kind),
          limit: 1,
        })
      ).complete;
    assert.equal(complete, true);
  }
  const extra = await blocks.createAdventureBlock(uid, {
    adventureId,
    sceneId: scene.id,
    operationId: op('extra'),
    title: 'Pista real',
    content: '<p>Pista para a mesa</p>',
    audience: 'players',
  });
  assert.equal(extra.block.resource.kind, 'block');
  const p = await finish(await start()),
    result = await activate(p),
    campaignId = result.campaign.id,
    key = baseSourceKey({ adventureId, kind: 'arc', id: arc.item.id }),
    capturedArc = (
      await admin.doc(basePath(uid, result.campaign.activeBaseId) + '/items/' + key).get()
    ).data();
  assert.equal(
    capturedArc.orderKey,
    (await admin.doc(path + '/arcs/' + arc.item.id).get()).data().rankB,
  );
  assert.equal(p.counts.lore, 1);
  assert.equal(p.counts.reference, 1);
  for (const kind of ['part', 'scene', 'block', 'arc', 'milestone', 'event', 'lore']) {
    const page = await reader.listCampaignBaseItems(uid, { campaignId, kind });
    assert.ok(page.items.length > 0);
    const body = await reader.readCampaignBaseItem(uid, {
      campaignId,
      sourceKey: page.items[0].sourceKey,
    });
    assert.equal(body.item.kind, kind);
    if (kind === 'part') assert.equal(body.chunks[0].field, 'legacyContent');
  }
  const sceneKey = baseSourceKey({ adventureId, kind: 'scene', id: scene.id });
  assert.equal(
    (await reader.listCampaignBaseReferences(uid, { campaignId, sourceKey: sceneKey })).items[0]
      .available,
    true,
  );
  const latest = await scenes.getScene(uid, { target, sceneId: scene.id });
  await scenes.updateScene(uid, {
    target,
    sceneId: scene.id,
    expectedRevision: latest.revision,
    operationId: op('edit-source'),
    patch: { content: '<p>Original modificado</p>' },
  });
  const frozen = await reader.readCampaignBaseItem(uid, { campaignId, sourceKey: sceneKey });
  assert.equal(
    frozen.chunks.find((chunk) => chunk.field === 'content').content,
    '<p>Texto original 🐉</p>',
  );
  const prep = (await admin.doc('users/author/campaignPreparations/' + p.captureId).get()).data(),
    root = basePath(uid, prep.baseId);
  for (const user of [uid, 'other', null]) {
    await assertFails(getDoc(doc(client(user), root)));
    await assertFails(getDocs(query(collection(client(user), root + '/items'), limit(25))));
    await assertFails(setDoc(doc(client(user), root + '/items/forged'), { title: 'Forjado' }));
    await assertFails(
      getDoc(doc(client(user), 'users/author/campaignPreparations/' + p.captureId)),
    );
  }
  assert.equal((await activate(p)).kind, 'already-activated');
  await createCampaignsService({ db: admin }).updateCampaign(uid, {
    campaignId,
    operationId: op('metadata-after-activation'),
    expectedRevision: 1,
    patch: { title: 'Minha mesa renomeada' },
  });
  assert.equal((await activate(p)).kind, 'already-activated');
  await admin.doc('campaigns/' + campaignId).delete();
  await studio.createCampaign(uid, {
    operationId: campaignId,
    title: 'Outra campanha independente',
  });
  await assert.rejects(activate(p), { code: 'not-found' });
  assert.equal(
    (await admin.doc('campaigns/' + campaignId).get()).data().provenance.kind,
    'independent',
  );
});

test('SDK prepared source change aborts durably and cleanup remains possible after source removal', async () => {
  let p = await finish(await start());
  await scenes.updateScene(uid, {
    target,
    sceneId: scene.id,
    expectedRevision: scene.revision,
    operationId: op('changed-before-activate'),
    patch: { content: 'Outra versão' },
  });
  const input = {
      captureId: p.captureId,
      operationId: op('aborted-activate'),
      expectedCheckpoint: p.checkpoint,
    },
    result = await api.activateCampaignCapture(uid, input);
  assert.equal(result.kind, 'aborted');
  assert.equal((await api.activateCampaignCapture(uid, input)).kind, 'aborted');
  assert.equal((await admin.collection('campaigns').limit(1).get()).empty, true);
  assert.equal((await admin.doc('universes/world').get()).data().campaignCount, 0);
  await admin.doc(path).delete();
  p = await api.getCampaignCapture(uid, { captureId: p.captureId });
  assert.equal(p.counts, null);
  const baseId = (await admin.doc('users/author/campaignPreparations/' + p.captureId).get()).data()
    .baseId;
  for (let i = 0; i < 20 && p.state !== 'deleted'; i++)
    p = await api.cancelCampaignCapture(uid, {
      captureId: p.captureId,
      operationId: digest({ cleanup: p.captureId, checkpoint: p.checkpoint }),
      expectedCheckpoint: p.checkpoint,
    });
  assert.equal(p.state, 'deleted');
  assert.equal((await admin.doc(basePath(uid, baseId)).get()).exists, false);
});

test('SDK concurrent step CAS and operation replay cannot duplicate a captured resource or create a partial campaign', async () => {
  const p = await start(),
    input = {
      captureId: p.captureId,
      operationId: op('step-one'),
      expectedCheckpoint: p.checkpoint,
    },
    outcomes = await Promise.allSettled([
      api.advanceCampaignCapture(uid, input),
      advance(p, 'competing'),
    ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const latest = await api.getCampaignCapture(uid, { captureId: p.captureId });
  assert.equal(latest.counts.part, 1);
  const winner =
    outcomes[0].status === 'fulfilled'
      ? input
      : {
          captureId: p.captureId,
          operationId: digest({ id: p.captureId, checkpoint: p.checkpoint, name: 'competing' }),
          expectedCheckpoint: p.checkpoint,
        };
  assert.equal((await api.advanceCampaignCapture(uid, winner)).checkpoint, latest.checkpoint);
  await assert.rejects(api.advanceCampaignCapture('other', input), { code: 'not-found' });
  assert.equal((await admin.collection('campaigns').limit(1).get()).empty, true);
});

test('SDK capture pins library bytes independently of live block image and activation preserves one universe use', async () => {
  const imageId = 'library-capture-sdk-image';
  await admin
    .doc('users/author/imageLibrary/' + imageId)
    .set({ state: 'active', path: 'book-covers/author/image.png', name: 'Imagem', useCount: 0 });
  const linked = await blocks.setAdventureBlockImage(uid, {
    adventureId,
    resource: { kind: 'scene', id: scene.id },
    operationId: op('link-image'),
    expectedRevision: scene.revision,
    image: { imageId, alt: 'Dragão', caption: 'Legenda' },
  });
  const p = await finish(await start()),
    result = await activate(p),
    campaignId = result.campaign.id;
  assert.equal((await admin.doc('users/author/imageLibrary/' + imageId).get()).data().useCount, 2);
  await blocks.setAdventureBlockImage(uid, {
    adventureId,
    resource: { kind: 'scene', id: scene.id },
    operationId: op('unlink-image'),
    expectedRevision: linked.sceneRevision,
    image: null,
  });
  assert.equal((await admin.doc('users/author/imageLibrary/' + imageId).get()).data().useCount, 1);
  const imageKey = digest({ imageId }),
    media = await reader.readCampaignBaseImage(uid, { campaignId, imageKey });
  assert.match(media.dataUrl, /^data:image\/webp;base64,/);
  generation = '2';
  await assert.rejects(reader.readCampaignBaseImage(uid, { campaignId, imageKey }), {
    code: 'failed-precondition',
  });
  assert.equal((await admin.doc('universes/world').get()).data().campaignCount, 1);
});
