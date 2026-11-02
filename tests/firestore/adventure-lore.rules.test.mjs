import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, limit } from 'firebase/firestore';
import { createAdventureLoreService } from '../../functions/src/adventureLore.mjs';
import {
  adventureLoreRequestHash,
  mutationInput,
} from '../../functions/src/adventureLoreContracts.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import {
  createUniverseService,
  prepareUniverseProjectLink,
} from '../../functions/src/universes.mjs';
import { prepareCampaignAuthorization } from '../../functions/src/campaignAuthorization.mjs';
import { createCampaignCaptureService } from '../../functions/src/campaignCapture.mjs';
import { createCampaignBaseReadService } from '../../functions/src/campaignBaseRead.mjs';
import { createCampaignSessionsService } from '../../functions/src/campaignSessions.mjs';
import { createCampaignSessionReferencesService } from '../../functions/src/campaignSessionReferences.mjs';
import { createCampaignPreparationService } from '../../functions/src/campaignPreparation.mjs';
import { baseSourceKey } from '../../functions/src/campaignBaseContracts.mjs';
import {
  adoptionFixture,
  uid,
  heroKey,
  entity,
} from '../../functions/test/helpers/campaignAdoption.mjs';
import { target } from '../../functions/test/helpers/campaignComparison.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-adventure-lore-tests';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
const op = (name) => 'adventure-lore-sdk-' + name;
const reason = (value) => (error) => error.details?.reason === value;
const prose = '  Lore particular 🐉\nLinha com ação e café.\n<strong>literal</strong>  ';
let environment, admin;
before(async () => {
  process.env.METADATA_SERVER_DETECTION = 'none';
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw Error('Use somente emulador demo.');
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
});
beforeEach(() => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const localEntity = (extra = {}) => ({
  name: 'Ficha particular',
  aliases: ['Vigia'],
  category: 'character',
  summary: 'Resumo particular',
  details: prose,
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
  isPublic: false,
  ...extra,
});
async function setup(name = 'own', adventureId) {
  const studio = createStudioService({ db: admin });
  if (!adventureId)
    adventureId = (
      await studio.createAdventure(uid, { operationId: op(name), title: 'Aventura ' + name })
    ).id;
  const api = createAdventureLoreService({ db: admin });
  const page = await api.listAdventureLore(uid, { adventureId, scope: 'adventure' });
  return {
    api,
    studio,
    scope: { adventureId, adventureToken: page.adventureToken },
    revision: page.collectionRevision,
  };
}
function input(f, name, extra = {}) {
  return {
    ...f.scope,
    entityId: op(name),
    operationId: op(name),
    expectedRevision: 0,
    expectedCollectionRevision: f.revision,
    entity: localEntity(),
    ...extra,
  };
}
async function save(f, name, extra = {}) {
  const request = input(f, name, extra);
  const result = await f.api.saveAdventureLore(uid, request);
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.receipt.collectionRevision, f.revision + 1);
  f.revision = result.receipt.collectionRevision;
  return { request, result };
}
const list = (f, extra = {}) =>
  f.api.listAdventureLore(uid, { ...f.scope, scope: 'adventure', ...extra });
async function full(f, entityId, scope = 'adventure') {
  let cursor;
  for (let n = 0; n < 100; n++) {
    const page = await list(f, { scope, ...(cursor ? { cursor } : {}) });
    const row = page.items.find((item) => item.reference.entityId === entityId);
    if (row)
      return f.api.getAdventureLore(uid, {
        ...f.scope,
        reference: row.reference,
        expectedContextToken: page.contextToken,
        expectedEntityToken: row.entityToken,
      });
    cursor = page.nextCursor;
    if (!cursor) throw Error('Ficha esperada ausente: ' + entityId);
  }
  throw Error('Paginação não terminou');
}
function observedDb(db) {
  const bodies = [];
  const observe = (ref, mask) => {
    if (
      ref?.path &&
      /\/(loreBodies|bodies|loreVariantBodies)\//.test(ref.path) &&
      (!mask ||
        mask.some((field) =>
          ['details', 'structuredDetails', 'relations', 'content'].includes(field),
        ))
    )
      bodies.push(ref.path);
  };
  return {
    bodies,
    db: new Proxy(db, {
      get(target, property) {
        if (property === 'runTransaction')
          return (work) =>
            target.runTransaction((tx) =>
              work(
                new Proxy(tx, {
                  get(transaction, member) {
                    if (member === 'get')
                      return (ref) => {
                        observe(ref);
                        return transaction.get(ref);
                      };
                    if (member === 'getAll')
                      return (...args) => {
                        for (const ref of args.filter((value) => value?.path))
                          observe(ref, args.at(-1)?.fieldMask);
                        return transaction.getAll(...args);
                      };
                    const value = Reflect.get(transaction, member);
                    return typeof value === 'function' ? value.bind(transaction) : value;
                  },
                }),
              ),
            );
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
}
async function captureAgain(f, name) {
  const api = createCampaignCaptureService({ db: admin, assets: f.assets });
  let progress = await api.startCampaignCapture(uid, {
    operationId: op('capture-' + name),
    adventureId: target.id,
    expectedSourceToken: (await api.getCampaignCaptureSource(uid, { adventureId: target.id }))
      .sourceToken,
    title: 'Outra mesa ' + name,
    description: 'Consequências independentes',
    universeId: 'world',
  });
  for (let n = 0; n < 250 && progress.state === 'preparing'; n++)
    progress = await api.advanceCampaignCapture(uid, {
      captureId: progress.captureId,
      operationId: op('capture-' + name + '-' + n),
      expectedCheckpoint: progress.checkpoint,
    });
  assert.equal(progress.state, 'prepared');
  const result = await api.activateCampaignCapture(uid, {
    captureId: progress.captureId,
    operationId: op('activate-' + name),
    expectedCheckpoint: progress.checkpoint,
  });
  assert.equal(result.kind, 'activated');
  return result.campaign;
}
async function mixedFixture() {
  let own, local;
  const f = await adoptionFixture(admin, async ({ scenes, scene, narrative, arc }) => {
    own = await setup('mixed', target.id);
    local = await save(own, 'captured-local', {
      entity: localEntity({
        name: 'Heroína local',
        aliases: ['Cartógrafa'],
        relations: [
          {
            targetEntityId: 'universe:world:hero',
            relationType: 'Conhece',
            description: 'Relação própria',
          },
        ],
      }),
    });
    await save(own, 'not-referenced', {
      entity: localEntity({ name: 'Ficha local fora da captura' }),
    });
    const reference = { kind: 'adventure', scopeId: target.id, entityId: local.request.entityId };
    const current = await scenes.getScene(uid, { target, sceneId: scene.id });
    await scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      reference,
      operationId: op('scene-local'),
      expectedRevision: current.revision,
    });
    const item = await narrative.getNarrativeItem(uid, {
      target,
      source: { kind: 'arc', id: arc.item.id },
    });
    await narrative.setNarrativeReference(uid, {
      target,
      source: { kind: 'arc', id: arc.item.id },
      reference: { kind: 'lore', reference },
      operationId: op('narrative-local'),
      expectedRevision: item.revision,
    });
  });
  return {
    ...f,
    own,
    local,
    localKey: baseSourceKey({
      kind: 'adventure-lore',
      adventureId: target.id,
      id: local.request.entityId,
    }),
  };
}
async function sessionReference(f) {
  const sessions = createCampaignSessionsService({ db: admin });
  const references = createCampaignSessionReferencesService({ db: admin });
  const first = await sessions.listCampaignSessions(uid, { campaignId: f.campaign.id });
  const scope = { campaignId: f.campaign.id, campaignToken: first.campaignToken };
  const id = op('own-session');
  await sessions.saveCampaignSession(uid, {
    ...scope,
    sessionId: id,
    operationId: id,
    expectedRevision: 0,
    title: 'Sessão própria',
    summary: 'PREPARAÇÃO PRÓPRIA INDEPENDENTE',
    scheduledDate: null,
    status: 'planned',
  });
  const referenceScope = { ...scope, sessionId: id, expectedSessionRevision: 1 };
  const page = await references.listCampaignSessionReferences(uid, {
    ...referenceScope,
    view: 'references',
  });
  await references.addCampaignSessionReference(uid, {
    ...referenceScope,
    referenceId: op('s2-local'),
    operationId: op('s2-local'),
    expectedReferenceCollectionRevision: page.referenceCollectionRevision,
    sourceContext: page.sourceContext,
    target: { kind: 'lore', sourceKey: f.localKey },
  });
  return { references, referenceScope, sessions, scope, id };
}
async function referenceMaterial(s) {
  const page = await s.references.listCampaignSessionReferences(uid, {
    ...s.referenceScope,
    view: 'references',
  });
  assert.equal(page.items.length, 1);
  const row = page.items[0];
  const material = await s.references.readCampaignSessionLoreReference(uid, {
    ...s.referenceScope,
    referenceId: row.id,
    expectedRevision: row.revision,
    expectedReferenceCollectionRevision: page.referenceCollectionRevision,
    sourceContext: page.sourceContext,
  });
  return { page, row, material };
}

test('SDK lore aventura: CRUD privado, CAS, paginação completa, recibos/fences e quatro fronteiras diretas fechadas', async () => {
  const f = await setup('catalogue');
  let first;
  for (let n = 0; n < 27; n++) {
    const created = await save(f, 'catalogue-' + n, {
      entity: localEntity({ name: 'Ficha ' + String(n).padStart(2, '0'), aliases: ['Alias ' + n] }),
    });
    first ??= created;
  }
  const observed = observedDb(admin);
  const reader = createAdventureLoreService({ db: observed.db });
  const page = await reader.listAdventureLore(uid, { ...f.scope, scope: 'adventure' });
  assert.equal(page.items.length, 25);
  assert.ok(page.nextCursor);
  assert.equal(observed.bodies.length, 0);
  assert.equal(
    page.items.some((row) =>
      ['details', 'structuredDetails', 'relations'].some((key) => key in row),
    ),
    false,
  );
  const tail = await list(f, { cursor: page.nextCursor });
  assert.equal(tail.items.length, 2);
  assert.equal(tail.nextCursor, null);
  assert.ok(tail.items.some((row) => row.aliases.includes('Alias 26')));
  assert.equal(new Set([...page.items, ...tail.items].map((row) => row.id)).size, 27);
  for (const extra of [{ scope: 'universe' }, { category: 'character' }])
    await assert.rejects(
      list(f, { cursor: page.nextCursor, ...extra }),
      reason('cursor-invalidated'),
    );
  const other = await setup('cursor-other');
  await assert.rejects(list(other, { cursor: page.nextCursor }), reason('cursor-invalidated'));
  const row = page.items[0];
  const getRequest = {
    ...f.scope,
    reference: row.reference,
    expectedContextToken: page.contextToken,
    expectedEntityToken: row.entityToken,
  };
  for (const actor of ['', 'intruder']) {
    await assert.rejects(reader.listAdventureLore(actor, { ...f.scope, scope: 'adventure' }));
    await assert.rejects(reader.getAdventureLore(actor, getRequest));
    await assert.rejects(f.api.saveAdventureLore(actor, first.request));
  }
  assert.equal(observed.bodies.length, 0);
  const material = await reader.getAdventureLore(uid, getRequest);
  assert.equal(material.item.details, prose);
  assert.ok(observed.bodies.length, 'controle positivo consultou o corpo local real');
  assert.equal(material.item.isPublic, false);
  const revised = await save(f, 'edit', {
    entityId: row.reference.entityId,
    expectedRevision: row.revision,
    entity: localEntity({ name: '  Nome normalizado  ', details: prose + '\nREVISÃO' }),
  });
  assert.deepEqual(await f.api.saveAdventureLore(uid, revised.request), revised.result);
  await assert.rejects(
    f.api.saveAdventureLore(uid, {
      ...revised.request,
      entity: localEntity({ name: 'Outro pedido' }),
    }),
  );
  await assert.rejects(reader.getAdventureLore(uid, getRequest), reason('cursor-invalidated'));
  await assert.rejects(
    f.api.saveAdventureLore(
      uid,
      input(f, 'stale', {
        entityId: row.reference.entityId,
        expectedRevision: row.revision,
      }),
    ),
    reason('revision-conflict'),
  );
  const beforeInvalid = await admin.doc('adventures/' + f.scope.adventureId).get();
  await assert.rejects(
    f.api.saveAdventureLore(
      uid,
      input(f, 'too-large', {
        entity: localEntity({ details: 'x'.repeat(150001) }),
      }),
    ),
  );
  assert.deepEqual(
    (await admin.doc('adventures/' + f.scope.adventureId).get()).data(),
    beforeInvalid.data(),
  );
  const removed = {
    ...f.scope,
    entityId: row.reference.entityId,
    operationId: op('delete'),
    expectedRevision: 2,
    expectedCollectionRevision: f.revision,
  };
  const deletion = await f.api.deleteAdventureLore(uid, removed);
  f.revision = deletion.receipt.collectionRevision;
  assert.deepEqual(await f.api.saveAdventureLore(uid, first.request), first.result);
  const tombstone = (
    await admin.doc(`adventures/${f.scope.adventureId}/lore/${row.reference.entityId}`).get()
  ).data();
  assert.equal(tombstone.deleted, true);
  assert.equal(
    ['name', 'aliases', 'summary', 'details', 'relations'].some((key) => key in tombstone),
    false,
  );
  assert.equal(
    (
      await admin
        .doc(`adventures/${f.scope.adventureId}/loreBodies/${row.reference.entityId}`)
        .get()
    ).exists,
    false,
  );
  const unknown = input(f, 'cancel-before-send');
  const fence = {
    ...f.scope,
    entityId: unknown.entityId,
    operationId: unknown.operationId,
    action: 'save',
    expectedRevision: 0,
    expectedCollectionRevision: f.revision,
    requestHash: adventureLoreRequestHash('save', mutationInput(uid, unknown, 'save')),
    intent: 'cancel',
  };
  assert.equal((await f.api.resolveAdventureLoreOperation(uid, fence)).kind, 'canceled');
  assert.equal((await f.api.saveAdventureLore(uid, unknown)).kind, 'canceled');
  const namespaces = [
    `adventures/${f.scope.adventureId}/lore`,
    `adventures/${f.scope.adventureId}/loreBodies`,
    `users/${uid}/adventureLoreOperations`,
    `users/${uid}/adventureLoreFences`,
  ];
  for (const sdk of [
    environment.authenticatedContext(uid).firestore(),
    environment.authenticatedContext('intruder').firestore(),
    environment.unauthenticatedContext().firestore(),
  ])
    for (const path of namespaces) {
      const id = path.endsWith('adventureLoreFences')
        ? unknown.operationId
        : first.request.entityId;
      await assertFails(getDoc(doc(sdk, path + '/' + id)));
      await assertFails(getDocs(query(collection(sdk, path), limit(1))));
      await assertFails(setDoc(doc(sdk, path + '/' + id), { bypass: true }));
    }
  const receipts = await admin.collection(`users/${uid}/adventureLoreOperations`).get();
  for (const record of receipts.docs)
    assert.equal(JSON.stringify(record.data()).includes(prose), false);
});

test('SDK lore aventura: globais legados e janelas vazias continuam, referências explícitas capturam somente origens válidas', async () => {
  const f = await mixedFixture();
  const worlds = createUniverseService({ db: admin });
  for (let n = 0; n < 28; n++) {
    const id = 'page-' + String(n).padStart(2, '0');
    await worlds.saveUniverseLore(uid, {
      universeId: 'world',
      id,
      create: true,
      input: localEntity({
        name: 'A global ' + String(n).padStart(2, '0'),
        aliases: ['Alias global ' + n],
      }),
    });
    if (n < 25) await admin.doc('universes/world/lore/' + id).update({ deleted: true });
  }
  const globals = await list(f.own, { scope: 'universe' });
  assert.equal(globals.items.length, 0);
  assert.ok(globals.nextCursor, 'janela vazia não significa coleção completa');
  const remainder = await list(f.own, { scope: 'universe', cursor: globals.nextCursor });
  assert.ok(remainder.items.some((row) => row.aliases.includes('Alias global 27')));
  assert.ok(remainder.items.some((row) => row.reference.entityId === 'hero'));
  assert.equal(remainder.nextCursor, null);
  const global = await full(f.own, 'hero', 'universe');
  assert.equal(global.item.details, 'Ficha 🐉');
  assert.equal('revision' in global.item, false);
  const reader = createCampaignBaseReadService({ db: admin, assets: f.assets });
  const captured = await reader.listCampaignBaseItems(uid, {
    campaignId: f.campaign.id,
    kind: 'lore',
  });
  assert.deepEqual(
    new Set(captured.items.map((row) => row.sourceKey)),
    new Set([heroKey, f.localKey]),
  );
  assert.equal(
    baseSourceKey({ kind: 'lore', scopeId: 'universe-legacy', id: 'entity-legacy' }),
    'f3e9ef5637f3386e12b3e315900c6a3355ec478f066260ad0361c4ddc78ebf8f',
  );
  assert.equal(
    baseSourceKey({
      kind: 'adventure-lore',
      adventureId: 'adventure-lore-fixture',
      id: 'adventure-lore-operation',
    }),
    '00f550362a6a3e14ca673ecb1f29de15896ee13261b44bda476b48559f5f44b7',
  );
  const old = (
    await admin.doc(`users/${uid}/campaignBases/${f.campaign.activeBaseId}/items/${heroKey}`).get()
  ).data();
  assert.deepEqual(old.origin, { kind: 'lore', scopeId: 'world', id: 'hero' });
  const local = await reader.readCampaignBaseItem(uid, {
    campaignId: f.campaign.id,
    sourceKey: f.localKey,
  });
  assert.equal(local.item.kind, 'lore');
  assert.equal(local.item.structured.isPublic, false);
  assert.ok(local.chunks.some((chunk) => chunk.content === prose));
  assert.equal(JSON.stringify(local).includes('Ficha local fora da captura'), false);
  const references = await reader.listCampaignBaseReferences(uid, {
    campaignId: f.campaign.id,
    sourceKey: baseSourceKey({ adventureId: target.id, kind: 'scene', id: f.scene.id }),
  });
  assert.ok(references.items.length >= 2);
  assert.ok(references.items.some((link) => JSON.stringify(link).includes(f.localKey)));
  await assert.rejects(
    f.scenes.setSceneReference(uid, {
      target,
      sceneId: f.scene.id,
      operationId: op('foreign-local-reference'),
      expectedRevision: (await f.scenes.getScene(uid, { target, sceneId: f.scene.id })).revision,
      reference: {
        kind: 'adventure',
        scopeId: op('other-adventure'),
        entityId: f.local.request.entityId,
      },
    }),
  );
  const clock = (await admin.doc(`users/${uid}/campaignAuthorization/current`).get()).data();
  await save(f.own, 'invalidate-global-cursor');
  const nextClock = (await admin.doc(`users/${uid}/campaignAuthorization/current`).get()).data();
  assert.equal(nextClock.token, clock.token);
  assert.equal(nextClock.epoch, clock.epoch + 1);
  await assert.rejects(
    list(f.own, { scope: 'universe', cursor: globals.nextCursor }),
    reason('cursor-invalidated'),
  );
});

test('SDK lore aventura: duas mesas, C2/C3/S2 e adoção mantêm origem local legada sem alterar a base global antiga', async () => {
  const f = await mixedFixture();
  const other = await captureAgain(f, 'other');
  const otherScope = { campaignId: other.id, baseId: other.activeBaseId };
  const own = await f.save(
    'local-variant',
    0,
    entity({ name: 'Variante local da mesa', details: 'VARIANTE PARTICULAR' }),
    f.localKey,
  );
  assert.equal(own.result.item.entity.details, 'VARIANTE PARTICULAR');
  assert.equal(
    (
      await f.lore.getCampaignLore(uid, {
        ...otherScope,
        campaignToken: (await f.lore.listCampaignLore(uid, otherScope)).campaignToken,
        sourceKey: f.localKey,
      })
    ).item.entity.details,
    prose,
  );
  const s = await sessionReference(f);
  assert.equal(
    (await referenceMaterial(s)).material.material.entity.details,
    'VARIANTE PARTICULAR',
  );
  const localReference = {
    kind: 'adventure',
    scopeId: target.id,
    entityId: f.local.request.entityId,
  };
  const scene = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
  await f.scenes.setSceneReference(uid, {
    target,
    sceneId: f.scene.id,
    reference: localReference,
    remove: true,
    expectedRevision: scene.revision,
    operationId: op('remove-scene-local'),
  });
  const source = { kind: 'arc', id: f.arc.item.id };
  const arc = await f.narrative.getNarrativeItem(uid, { target, source });
  await f.narrative.setNarrativeReference(uid, {
    target,
    source,
    reference: { kind: 'lore', reference: localReference },
    remove: true,
    expectedRevision: arc.revision,
    operationId: op('remove-narrative-local'),
  });
  const oldGlobal = (
    await admin.doc(`users/${uid}/campaignBases/${f.campaign.activeBaseId}/items/${heroKey}`).get()
  ).data();
  const candidate = await f.candidate('without-local');
  let progress = (await f.start(candidate, 'keep-local-origin')).result.progress;
  const decisions = await f.adoptions.listCampaignAdoptionDecisions(uid, {
    adoptionId: progress.adoptionId,
  });
  const decision = decisions.items.find((row) => row.sourceKey === f.localKey);
  assert.equal(decision.candidate.present, false);
  progress = (
    await f.step('decideCampaignAdoption', progress, {
      sourceKey: f.localKey,
      expectedRevision: decision.revision,
      choice: 'keep-local',
    })
  ).progress;
  progress = await f.finish(progress);
  await f.step('activateCampaignAdoption', progress);
  f.acceptCampaign((await admin.doc('campaigns/' + f.campaign.id).get()).data());
  const legacy = await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: f.localKey });
  assert.equal(legacy.item.legacy, true);
  assert.equal(legacy.item.entity.details, 'VARIANTE PARTICULAR');
  assert.equal((await referenceMaterial(s)).material.material.legacy, true);
  assert.deepEqual(
    (
      await admin.doc(`users/${uid}/campaignBases/${other.activeBaseId}/items/${heroKey}`).get()
    ).data(),
    oldGlobal,
  );
  const neutral = await f.lore.discardCampaignLoreVariant(uid, {
    ...f.scope(),
    sourceKey: f.localKey,
    expectedRevision: legacy.item.revision,
    operationId: op('discard-local-override'),
  });
  assert.equal(neutral.item.legacy, true);
  assert.equal(neutral.item.entity.details, prose);
});

test('SDK lore aventura: relações indisponíveis, revogação e encarnação bloqueiam derivados sem apagar próprios', async () => {
  const f = await mixedFixture();
  const s = await sessionReference(f);
  const preparation = createCampaignPreparationService({ db: admin });
  const catalogue = await preparation.listCampaignPreparationItems(uid, {
    ...s.scope,
    kind: 'clue',
    view: 'all',
  });
  const clue = {
    ...s.scope,
    itemId: op('own-clue'),
    operationId: op('own-clue'),
    expectedRevision: 0,
    expectedItemCollectionRevision: catalogue.itemCollectionRevision,
    kind: 'clue',
    title: 'Pista independente',
    status: 'pending',
    body: { text: 'PISTA PRÓPRIA INDEPENDENTE', condition: '', recipient: '' },
  };
  await preparation.saveCampaignPreparationItem(uid, clue);
  const material = await full(f.own, f.local.request.entityId);
  assert.equal(material.item.relations[0].available, true);
  // Simulate the existing composed server unlink, not a raw timestamp-only revocation.
  await admin.runTransaction(async (tx) => {
    const root = admin.doc('adventures/' + target.id);
    const current = (await tx.get(root)).data();
    const link = await prepareUniverseProjectLink(tx, admin, uid, target, 'world', null);
    const clock = await prepareCampaignAuthorization(tx, admin, uid, { bump: true });
    link.commit();
    clock.commit();
    tx.update(root, { universeId: null, updatedAt: Math.max(Date.now(), current.updatedAt + 1) });
  });
  const unavailable = await full(f.own, f.local.request.entityId);
  assert.deepEqual(unavailable.item.relations, [
    {
      targetEntityId: 'universe:world:hero',
      relationType: 'Conhece',
      description: 'Relação própria',
      available: false,
    },
  ]);
  assert.equal(JSON.stringify(unavailable.item.relations).includes('Heroína'), false);
  const preserved = localEntity({
    name: unavailable.item.name,
    aliases: unavailable.item.aliases,
    category: unavailable.item.category,
    summary: unavailable.item.summary,
    structuredDetails: unavailable.item.structuredDetails,
    details: prose + '\nEDITÁVEL SEM UNIVERSO',
    relations: unavailable.item.relations.map(({ targetEntityId, relationType, description }) => ({
      targetEntityId,
      relationType,
      description,
    })),
  });
  const edit = await save(f.own, 'preserve-unavailable', {
    entityId: f.local.request.entityId,
    expectedRevision: unavailable.item.revision,
    entity: preserved,
  });
  await assert.rejects(
    f.own.api.saveAdventureLore(
      uid,
      input(f.own, 'duplicate-unavailable', {
        entityId: f.local.request.entityId,
        expectedRevision: edit.result.receipt.revision,
        entity: { ...preserved, relations: [...preserved.relations, ...preserved.relations] },
      }),
    ),
  );
  await assert.rejects(
    f.own.api.saveAdventureLore(
      uid,
      input(f.own, 'alter-unavailable', {
        entityId: f.local.request.entityId,
        expectedRevision: edit.result.receipt.revision,
        entity: {
          ...preserved,
          relations: preserved.relations.map((row) => ({
            ...row,
            description: 'Nova descrição exige alvo disponível',
          })),
        },
      }),
    ),
  );
  const before = (await admin.doc(`users/${uid}/campaignAuthorization/current`).get()).data();
  await f.own.api.deleteAdventureLore(uid, {
    ...f.own.scope,
    entityId: f.local.request.entityId,
    operationId: op('revoke-local'),
    expectedRevision: edit.result.receipt.revision,
    expectedCollectionRevision: f.own.revision,
  });
  const after = (await admin.doc(`users/${uid}/campaignAuthorization/current`).get()).data();
  assert.equal(after.epoch, before.epoch + 1);
  assert.equal(
    (await f.lore.getCampaignLore(uid, { ...f.scope(), sourceKey: f.localKey })).item,
    null,
  );
  assert.equal((await referenceMaterial(s)).material.material, null);
  assert.equal(
    (await s.sessions.getCampaignSession(uid, { ...s.scope, sessionId: s.id })).session.summary,
    'PREPARAÇÃO PRÓPRIA INDEPENDENTE',
  );
  assert.equal(
    (
      await preparation.getCampaignPreparationItem(uid, {
        ...s.scope,
        itemId: clue.itemId,
        expectedRevision: 1,
      })
    ).item.body.text,
    'PISTA PRÓPRIA INDEPENDENTE',
  );
  const root = admin.doc('adventures/' + target.id);
  const savedRoot = (await root.get()).data();
  await root.update({ deleting: true });
  await assert.rejects(list(f.own));
  await root.delete();
  await assert.rejects(list(f.own));
  await root.create(savedRoot);
  await assert.rejects(list(f.own));

  // A separate live-child precondition prevents the preceding tombstone from
  // masking a missing incarnation gate in B/C2/C3/S2. No source child is removed.
  await environment.clearFirestore();
  const live = await mixedFixture();
  const liveSession = await sessionReference(live);
  await live.save(
    'live-incarnation-variant',
    0,
    entity({ details: 'VARIANTE DA INCARNAÇÃO ANTERIOR' }),
    live.localKey,
  );
  const candidate = await live.candidate('before-root-recreation');
  const base = createCampaignBaseReadService({ db: admin, assets: live.assets });
  assert.ok(
    (
      await base.readCampaignBaseItem(uid, {
        campaignId: live.campaign.id,
        sourceKey: live.localKey,
      })
    ).chunks.length,
  );
  assert.equal(
    (await referenceMaterial(liveSession)).material.material.entity.details,
    'VARIANTE DA INCARNAÇÃO ANTERIOR',
  );
  const rootRef = admin.doc('adventures/' + target.id);
  const beforeRoot = await rootRef.get();
  const childRef = admin.doc(`adventures/${target.id}/lore/${live.local.request.entityId}`);
  const bodyRef = admin.doc(`adventures/${target.id}/loreBodies/${live.local.request.entityId}`);
  const child = (await childRef.get()).data(),
    body = (await bodyRef.get()).data();
  await rootRef.delete();
  await rootRef.create(beforeRoot.data());
  const afterRoot = await rootRef.get();
  assert.notDeepEqual(afterRoot.createTime, beforeRoot.createTime);
  assert.deepEqual(
    afterRoot.data(),
    beforeRoot.data(),
    'mesmos campos não equivalem à mesma encarnação',
  );
  assert.deepEqual((await childRef.get()).data(), child);
  assert.deepEqual((await bodyRef.get()).data(), body);
  const observed = observedDb(admin);
  const gatedBase = createCampaignBaseReadService({ db: observed.db, assets: live.assets });
  await assert.rejects(
    gatedBase.readCampaignBaseItem(uid, { campaignId: live.campaign.id, sourceKey: live.localKey }),
    { code: 'not-found' },
  );
  assert.equal(observed.bodies.length, 0);
  const liveUnavailable = await live.lore.getCampaignLore(uid, {
    ...live.scope(),
    sourceKey: live.localKey,
  });
  assert.equal(liveUnavailable.item, null);
  assert.equal((await referenceMaterial(liveSession)).material.material, null);
  const comparison = await live.reader.listCampaignComparisonChanges(uid, {
    comparisonId: candidate.comparisonId,
    group: 'items',
    kind: 'lore',
  });
  const pair = comparison.items.find((row) => row.key === live.localKey);
  const projected = JSON.stringify(pair ?? {});
  for (const sentinel of [
    'Heroína local',
    'Guardião da mesa',
    'VARIANTE DA INCARNAÇÃO ANTERIOR',
    prose,
  ])
    assert.equal(projected.includes(sentinel), false);
  await assert.rejects(
    live.reader.readCampaignComparisonItem(uid, {
      comparisonId: candidate.comparisonId,
      sourceKey: live.localKey,
      side: 'current',
    }),
    { code: 'not-found' },
  );
  assert.equal(
    (
      await liveSession.sessions.getCampaignSession(uid, {
        ...liveSession.scope,
        sessionId: liveSession.id,
      })
    ).session.summary,
    'PREPARAÇÃO PRÓPRIA INDEPENDENTE',
  );
});
