import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, limit } from 'firebase/firestore';
import { createCampaignSessionScenesService } from '../../functions/src/campaignSessionScenes.mjs';
import { createCampaignSessionReferencesService } from '../../functions/src/campaignSessionReferences.mjs';
import { createCampaignSessionsService } from '../../functions/src/campaignSessions.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import { prepareUniverseProjectLink } from '../../functions/src/universes.mjs';
import { prepareCampaignAuthorization } from '../../functions/src/campaignAuthorization.mjs';
import {
  adoptionFixture,
  uid,
  heroKey,
  entity,
} from '../../functions/test/helpers/campaignAdoption.mjs';
import { target } from '../../functions/test/helpers/campaignComparison.mjs';
import { baseSourceKey, digest } from '../../functions/src/campaignBaseContracts.mjs';
import { startDeletion, finishDeletion } from '../../functions/test/helpers/campaignDeletion.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-session-scenes-tests';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
const op = (name) => 'session-scenes-sdk-' + name;
const reason = (value) => (error) => error.details?.reason === value;
let environment, admin;
before(async () => {
  process.env.METADATA_SERVER_DETECTION = 'none';
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
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
async function sessions(campaignId) {
  const service = createCampaignSessionsService({ db: admin }),
    page = await service.listCampaignSessions(uid, { campaignId });
  const scope = { campaignId, campaignToken: page.campaignToken };
  const input = {
    ...scope,
    sessionId: op('session-' + digest(campaignId).slice(0, 24)),
    operationId: op('session-' + digest(campaignId).slice(0, 24)),
    expectedRevision: 0,
    title: 'Preparação própria',
    summary: ' Texto próprio 🐉\nNão é material derivado. ',
    scheduledDate: null,
    status: 'planned',
  };
  const saved = await service.saveCampaignSession(uid, input);
  return {
    service,
    scope,
    input,
    saved,
    referenceScope: { ...scope, sessionId: input.sessionId, expectedSessionRevision: 1 },
  };
}
async function fixture(beforeCapture) {
  const original = await adoptionFixture(admin, beforeCapture),
    own = await sessions(original.campaign.id);
  const api = createCampaignSessionReferencesService({ db: admin });
  return {
    ...original,
    own,
    api,
    referenceScope: own.referenceScope,
    sceneKey: baseSourceKey({ adventureId: target.id, kind: 'scene', id: original.scene.id }),
  };
}
const refs = (f, extra = {}) =>
  f.api.listCampaignSessionReferences(uid, { ...f.referenceScope, view: 'references', ...extra });
function add(f, page, name, sourceKey = heroKey) {
  const referenceId = op(name);
  return {
    ...f.referenceScope,
    referenceId,
    operationId: referenceId,
    expectedReferenceCollectionRevision: page.referenceCollectionRevision,
    sourceContext: page.sourceContext,
    target: { kind: 'lore', sourceKey },
  };
}
function read(f, page, row) {
  return {
    ...f.referenceScope,
    referenceId: row.id,
    expectedRevision: row.revision,
    expectedReferenceCollectionRevision: page.referenceCollectionRevision,
    sourceContext: page.sourceContext,
  };
}
// The receipt certifies the next collection CAS; material pages remain explicit reads.
function afterReceipt(page, outcome) {
  assert.equal(outcome.kind, 'confirmed');
  assert.equal(outcome.receipt.referenceCollectionRevision, page.referenceCollectionRevision + 1);
  return { ...page, referenceCollectionRevision: outcome.receipt.referenceCollectionRevision };
}
function remove(f, page, row, name = 'remove') {
  return {
    ...f.referenceScope,
    referenceId: row.id,
    operationId: op(name),
    expectedRevision: row.revision,
    expectedReferenceCollectionRevision: page.referenceCollectionRevision,
  };
}
async function adopted(f, candidate, name) {
  let progress = (await f.start(candidate, name)).result.progress;
  const decisions = await f.adoptions.listCampaignAdoptionDecisions(uid, {
    adoptionId: progress.adoptionId,
  });
  for (const row of decisions.items.filter((row) => row.required))
    progress = (
      await f.step('decideCampaignAdoption', progress, {
        sourceKey: row.sourceKey,
        expectedRevision: row.revision,
        choice: 'keep-local',
      })
    ).progress;
  progress = await f.finish(progress);
  await f.step('activateCampaignAdoption', progress);
  f.acceptCampaign((await admin.doc('campaigns/' + f.campaign.id).get()).data());
}
const rowPath = (f, id) => `campaigns/${f.referenceScope.campaignId}/sessionReferences/${id}`;
const statePath = (f) =>
  `campaigns/${f.referenceScope.campaignId}/sessionReferenceState/${f.referenceScope.sessionId}`;
function observedDb(db) {
  const bodies = [];
  const count = (ref, mask) => {
    if (
      ref.path &&
      /\/(bodies|loreVariantBodies)\//.test(ref.path) &&
      (!mask || mask.includes('content'))
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
                        count(ref);
                        return transaction.get(ref);
                      };
                    if (member === 'getAll')
                      return (...args) => {
                        const options = args.at(-1);
                        for (const ref of args.filter((value) => value?.path))
                          count(ref, options?.fieldMask);
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

const sceneRefs = (f, extra = {}) => refs(f, { kind: 'scene', ...extra });
function addScene(f, page, name, sourceKey = f.sceneKey) {
  return { ...add(f, page, name, sourceKey), target: { kind: 'scene', sourceKey } };
}
function sceneReader(db = admin, assets, deriveImage) {
  return createCampaignSessionScenesService({
    db,
    assets: assets ?? {
      metadata: async () => ({ generation: '12345678901234567890', size: 4 }),
      readGeneration: async () => Buffer.from('webp'),
    },
    deriveImage: deriveImage ?? (async () => Buffer.from('webp')),
  });
}
async function linkScene(f, name = 'scene-link') {
  const page = await sceneRefs(f);
  const request = addScene(f, page, name);
  const receipt = await f.api.addCampaignSessionReference(uid, request);
  const next = afterReceipt(page, receipt);
  return {
    request,
    page: next,
    row: { id: request.referenceId, revision: 1 },
    input: read(f, next, { id: request.referenceId, revision: 1 }),
  };
}
async function readAll(reader, input) {
  const chunks = [];
  let cursor;
  let first;
  for (let index = 0; index < 100; index++) {
    const page = await reader.readCampaignSessionSceneReference(uid, {
      ...input,
      ...(cursor ? { cursor } : {}),
      limit: 1,
    });
    assert.ok(page.material);
    first ??= page;
    assert.deepEqual(page.material.item, first.material.item);
    assert.equal(page.resourceKey, first.resourceKey);
    assert.equal(page.resourceKind, first.resourceKind);
    chunks.push(...page.material.chunks);
    cursor = page.material.nextCursor;
    if (!cursor) {
      const fields = {};
      for (const field of first.material.item.fields) {
        const selected = chunks.filter((c) => c.field === field.field);
        assert.deepEqual(
          selected.map((c) => c.index),
          Array.from({ length: field.chunkCount }, (_, i) => i),
        );
        const text = selected.map((c) => c.content).join('');
        assert.equal(Buffer.byteLength(text), field.bytes);
        assert.equal(digest(text), field.sha256);
        fields[field.field] = text;
      }
      assert.equal(
        chunks.length,
        first.material.item.fields.reduce((n, f) => n + f.chunkCount, 0),
      );
      return { ...first, fields, chunks };
    }
  }
  assert.fail('Leitura não terminou dentro do limite');
}

test('SDK cenas da sessão: kind opt-in preserva lore, CAS e cursores compartilhados e caminhos diretos fechados', async () => {
  const f = await fixture(),
    base = await refs(f),
    loreRequest = add(f, base, 'lore-original');
  let page = afterReceipt(base, await f.api.addCampaignSessionReference(uid, loreRequest));
  const sceneRequest = addScene(f, page, 'scene-original');
  page = afterReceipt(page, await f.api.addCampaignSessionReference(uid, sceneRequest));
  const lore = await refs(f),
    scenes = await sceneRefs(f);
  assert.equal(lore.items.length, 1);
  assert.equal(lore.items[0].target.kind, 'lore');
  assert.equal(scenes.items.length, 1);
  assert.equal(scenes.items[0].target.kind, 'scene');
  assert.deepEqual(Object.keys(lore).sort(), [
    'campaignId',
    'campaignToken',
    'items',
    'nextCursor',
    'ownerId',
    'referenceCollectionRevision',
    'schemaVersion',
    'sessionId',
    'sessionRevision',
    'sourceContext',
    'view',
  ]);
  assert.equal(lore.referenceCollectionRevision, scenes.referenceCollectionRevision);
  await assert.rejects(
    f.api.addCampaignSessionReference(uid, addScene(f, base, 'stale-cas')),
    reason('revision-conflict'),
  );
  await assert.rejects(
    f.api.readCampaignSessionLoreReference(uid, read(f, scenes, scenes.items[0])),
  );
  const candidates = await f.api.listCampaignSessionReferences(uid, {
    ...f.referenceScope,
    view: 'candidates',
    kind: 'scene',
    sourceContext: page.sourceContext,
    limit: 1,
  });
  assert.equal(candidates.items[0].kind, 'scene');
  assert.deepEqual(Object.keys(candidates.items[0]).sort(), [
    'archived',
    'kind',
    'sourceKey',
    'stage',
    'title',
  ]);
  // A cursor carrying a different closed scope must never be interpreted as a scene page.
  const cursor = Buffer.from(
    JSON.stringify({
      version: 1,
      scope: { ...lore, kind: 'lore' },
      key: lore.items[0].id,
      date: lore.items[0].createdAt,
    }),
  ).toString('base64url');
  await assert.rejects(sceneRefs(f, { cursor }));
  const reader = sceneReader(),
    input = read(f, scenes, scenes.items[0]);
  await assert.rejects(reader.listCampaignSessionSceneBlocks('other', input));
  await assert.rejects(reader.listCampaignSessionSceneBlocks(null, input));
  for (const client of [
    environment.authenticatedContext(uid).firestore(),
    environment.authenticatedContext('other').firestore(),
    environment.unauthenticatedContext().firestore(),
  ]) {
    for (const path of [
      rowPath(f, sceneRequest.referenceId),
      statePath(f),
      `users/${uid}/campaignSessionReferenceOperations/${sceneRequest.operationId}`,
    ]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { ownerId: uid }));
    }
    await assertFails(
      getDocs(query(collection(client, `campaigns/${f.campaign.id}/sessionReferences`), limit(1))),
    );
  }
  const own = await f.own.service.getCampaignSession(uid, {
    ...f.own.scope,
    sessionId: f.referenceScope.sessionId,
  });
  assert.equal(own.session.revision, 1);
  assert.equal(own.session.summary, f.own.input.summary);
});

test('SDK cenas da sessão: captura real separa plano, main compartilhado, Unicode paginado e arquivo explícito', async () => {
  const prose = '<p>' + 'Dragão 🐉 ação\n'.repeat(7500) + '</p>';
  const f = await fixture(async ({ scenes, blocks, scene }) => {
    const current = await scenes.getScene(uid, { target, sceneId: scene.id });
    await scenes.updateScene(uid, {
      target,
      sceneId: scene.id,
      operationId: op('large-main'),
      expectedRevision: current.revision,
      patch: {
        content: prose,
        planning: {
          objective: 'Objetivo 🐉',
          conflict: 'Conflito preservado',
          pointOfView: 'Mestre',
        },
      },
    });
    for (let n = 0; n < 26; n++)
      await blocks.createAdventureBlock(uid, {
        adventureId: target.id,
        sceneId: scene.id,
        operationId: op('extra-' + n),
        title: 'Adicional ' + n,
        content: '<p>EXTRA ' + n + '</p>',
        audience: n % 2 ? 'creator' : 'gm',
      });
    const existing = await blocks.getAdventureBlock(uid, {
      adventureId: target.id,
      resource: { kind: 'block', id: 'comparison-operation-block' },
    });
    await blocks.archiveAdventureBlock(uid, {
      adventureId: target.id,
      blockId: existing.resource.id,
      operationId: op('archive-additional'),
      expectedRevision: existing.revision,
      archived: true,
    });
    const state = await blocks.getAdventureBlock(uid, {
      adventureId: target.id,
      resource: { kind: 'scene', id: scene.id },
    });
    await blocks.moveAdventureBlock(uid, {
      adventureId: target.id,
      resource: { kind: 'scene', id: scene.id },
      operationId: op('main-after-additional'),
      expectedRevision: state.revision,
      expectedStructureRevision: state.structureRevision,
      direction: 'down',
    });
    const archived = (
      await scenes.createScene(uid, {
        target,
        operationId: op('archived-scene'),
        parentId: null,
        title: 'Cena em Arquivo',
        content: '<p>Arquivo principal</p>',
      })
    ).scene;
    await scenes.archiveScene(uid, {
      target,
      sceneId: archived.id,
      operationId: op('archive-scene'),
      expectedRevision: archived.revision,
      archived: true,
    });
  });
  const linked = await linkScene(f),
    observed = observedDb(admin),
    reader = sceneReader(observed.db);
  const plan = await readAll(reader, linked.input);
  assert.equal(plan.resourceKind, 'scene-plan');
  assert.equal(plan.resourceKey, f.sceneKey);
  assert.deepEqual(plan.fields, {
    objective: 'Objetivo 🐉',
    conflict: 'Conflito preservado',
    pointOfView: 'Mestre',
  });
  const manifest = (
    await admin
      .doc(`users/${uid}/campaignBases/${f.campaign.activeBaseId}/items/${f.sceneKey}`)
      .get()
  ).data();
  const mainDescriptor = manifest.fields.find((f) => f.field === 'content');
  const { baseBodyKey } = await import('../../functions/src/campaignBaseContracts.mjs');
  for (let n = 0; n < mainDescriptor.chunkCount; n++)
    assert.equal(
      observed.bodies.some((path) =>
        path.endsWith('/' + baseBodyKey(mainDescriptor.bodySourceKey, 'content', n)),
      ),
      false,
      'plano não carrega prosa principal',
    );
  observed.bodies.length = 0;
  const first = await reader.listCampaignSessionSceneBlocks(uid, linked.input);
  assert.equal(first.items.length, 25);
  assert.ok(first.nextCursor);
  const second = await reader.listCampaignSessionSceneBlocks(uid, {
    ...linked.input,
    cursor: first.nextCursor,
  });
  assert.equal(second.items.length, 2);
  assert.equal(second.nextCursor, null);
  const all = [...first.items, ...second.items];
  assert.equal(new Set(all.map((i) => i.sourceKey)).size, 27);
  assert.equal(all.filter((i) => i.role === 'main').length, 1);
  assert.equal(all[0].role, 'additional');
  assert.equal(all[1].role, 'main');
  assert.equal(observed.bodies.length, 0);
  const main = all.find((i) => i.role === 'main');
  assert.equal(main.ownArchived, null);
  const body = await readAll(reader, { ...linked.input, blockKey: main.sourceKey });
  assert.equal(body.fields.content, prose);
  assert.ok(body.chunks.length > 1);
  assert.equal(body.material.item.role, 'main');
  assert.deepEqual(Object.keys(body.fields), ['content']);
  for (const hidden of ['origin', 'bodySourceKey', 'binding', 'capturedExtra'])
    assert.equal(JSON.stringify(body.material).includes('"' + hidden), false);
  const archived = await reader.listCampaignSessionSceneBlocks(uid, {
    ...linked.input,
    archive: 'archived',
  });
  assert.equal(archived.items.length, 1);
  assert.equal(archived.items[0].ownArchived, true);
  await assert.rejects(
    reader.listCampaignSessionSceneBlocks(uid, {
      ...linked.input,
      archive: 'archived',
      cursor: first.nextCursor,
    }),
  );
  const candidateFirst = await f.api.listCampaignSessionReferences(uid, {
    ...f.referenceScope,
    view: 'candidates',
    kind: 'scene',
    sourceContext: linked.page.sourceContext,
    archive: 'all',
    limit: 1,
  });
  assert.ok(candidateFirst.nextCursor, 'cursor real de uma página com cena ativa e arquivada');
  const candidateNext = await f.api.listCampaignSessionReferences(uid, {
    ...f.referenceScope,
    view: 'candidates',
    kind: 'scene',
    sourceContext: linked.page.sourceContext,
    archive: 'all',
    limit: 1,
    cursor: candidateFirst.nextCursor,
  });
  assert.equal(candidateNext.items.length, 1);
  await assert.rejects(
    f.api.listCampaignSessionReferences(uid, {
      ...f.referenceScope,
      view: 'candidates',
      sourceContext: linked.page.sourceContext,
      cursor: candidateFirst.nextCursor,
    }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(sceneRefs(f, { cursor: candidateFirst.nextCursor }), {
    code: 'invalid-argument',
  });
  await assert.rejects(
    f.api.listCampaignSessionReferences(uid, {
      ...f.referenceScope,
      view: 'candidates',
      kind: 'scene',
      sourceContext: linked.page.sourceContext,
      archive: 'active',
      cursor: candidateFirst.nextCursor,
    }),
    reason('cursor-invalidated'),
  );
  const planFirst = await reader.readCampaignSessionSceneReference(uid, {
    ...linked.input,
    limit: 1,
  });
  assert.ok(planFirst.material.nextCursor);
  await assert.rejects(
    reader.readCampaignSessionSceneReference(uid, {
      ...linked.input,
      blockKey: main.sourceKey,
      cursor: planFirst.material.nextCursor,
    }),
    reason('cursor-invalidated'),
  );
  const candidates = await f.api.listCampaignSessionReferences(uid, {
    ...f.referenceScope,
    view: 'candidates',
    kind: 'scene',
    sourceContext: linked.page.sourceContext,
    archive: 'archived',
  });
  assert.equal(candidates.items.length, 1);
  assert.equal(candidates.items[0].archived, true);
  const next = afterReceipt(
    linked.page,
    await f.api.addCampaignSessionReference(
      uid,
      addScene(f, linked.page, 'archived-link', candidates.items[0].sourceKey),
    ),
  );
  const archivedInput = read(f, next, { id: op('archived-link'), revision: 1 });
  assert.deepEqual((await reader.listCampaignSessionSceneBlocks(uid, archivedInput)).items, []);
  const archiveBlocks = await reader.listCampaignSessionSceneBlocks(uid, {
    ...archivedInput,
    archive: 'archived',
  });
  assert.equal(archiveBlocks.items[0].archived, true);
  assert.equal(archiveBlocks.items[0].ownArchived, null);
});

test('SDK cenas da sessão: parent e sessão fechados, cena ausente após adoção não usa histórico e legado U1 independe de U2', async () => {
  let otherScene;
  const f = await fixture(async ({ scenes }) => {
    otherScene = (
      await scenes.createScene(uid, {
        target,
        operationId: op('wrong-parent-scene'),
        parentId: null,
        title: 'Outra cena',
        content: '<p>OUTRO CORPO PRIVADO</p>',
      })
    ).scene;
  });
  await f.save('legacy-for-scene', 0, entity({ details: 'LEGADO U1 PRESERVADO' }));
  const linked = await linkScene(f),
    reader = sceneReader(),
    observed = observedDb(admin),
    guarded = sceneReader(observed.db);
  const foreignKey = baseSourceKey({
    adventureId: target.id,
    kind: 'block',
    id: otherScene.id,
    role: 'main',
  });
  await assert.rejects(
    guarded.readCampaignSessionSceneReference(uid, { ...linked.input, blockKey: foreignKey }),
  );
  assert.equal(observed.bodies.length, 0);
  await assert.rejects(
    guarded.readCampaignSessionSceneReference(uid, {
      ...linked.input,
      sessionId: op('nonexistent-session'),
    }),
  );
  assert.equal(observed.bodies.length, 0);
  await f.removeReferences();
  await f.universe.createUniverse(uid, {
    creationId: 'world-current',
    name: 'U2',
    description: '',
  });
  await admin.runTransaction(async (tx) => {
    const root = (await tx.get(admin.doc('adventures/' + target.id))).data();
    const link = await prepareUniverseProjectLink(
      tx,
      admin,
      uid,
      target,
      root.universeId,
      'world-current',
      Date.now,
      { strict: true },
    );
    link.commit();
    tx.update(admin.doc('adventures/' + target.id), {
      universeId: 'world-current',
      revision: root.revision + 1,
      updatedAt: Date.now(),
    });
  });
  await adopted(f, await f.candidate('scene-u2'), 'scene-adopt-u2');
  await admin.runTransaction(async (tx) => {
    const gate = await prepareCampaignAuthorization(tx, admin, uid, { bump: true });
    await tx.get(admin.doc('universes/world-current'));
    gate.commit();
    tx.update(admin.doc('universes/world-current'), { deleting: true });
  });
  let page = await sceneRefs(f),
    current = read(f, page, page.items[0]);
  assert.ok((await reader.readCampaignSessionSceneReference(uid, current)).material);
  const lorePage = await refs(f),
    loreRequest = add(f, lorePage, 'legacy-after-u2');
  await f.api.addCampaignSessionReference(uid, loreRequest);
  const loreRows = await refs(f);
  assert.equal(loreRows.items[0].target.legacy, true);
  assert.equal(
    (await f.api.readCampaignSessionLoreReference(uid, read(f, loreRows, loreRows.items[0])))
      .material.entity.details,
    'LEGADO U1 PRESERVADO',
  );
  // Restore U2 only to prepare the next genuine candidate; no historical base is used by readers.
  await admin.doc('universes/world-current').update({ deleting: false });
  // Controlled external source disappearance; candidate/capture/adoption/read authorization remain real services.
  const sourceBlocks = await admin
    .collection('adventures/' + target.id + '/sceneBlocks')
    .where('sceneId', '==', f.scene.id)
    .get();
  for (const block of sourceBlocks.docs) await block.ref.delete();
  await admin.doc('adventures/' + target.id + '/scenes/' + f.scene.id).delete();
  await adopted(f, await f.candidate('scene-removed'), 'scene-adopt-removed');
  page = await sceneRefs(f);
  assert.equal(page.items[0].available, false);
  current = read(f, page, page.items[0]);
  observed.bodies.length = 0;
  const missing = await guarded.readCampaignSessionSceneReference(uid, current);
  assert.equal(missing.resourceKey, null);
  assert.equal(missing.material, null);
  assert.equal(observed.bodies.length, 0);
  await f.api.removeCampaignSessionReference(
    uid,
    remove(f, page, page.items[0], 'remove-unavailable-scene'),
  );
  assert.equal(
    (
      await f.own.service.getCampaignSession(uid, {
        ...f.own.scope,
        sessionId: f.referenceScope.sessionId,
      })
    ).session.summary,
    f.own.input.summary,
  );
});

test('SDK cenas da sessão: mídia reautoriza sessão, vínculo, C4 e pin após download e derivação', async () => {
  const f = await fixture();
  let afterRead = async () => {},
    afterDerive = async () => {};
  let generation = '12345678901234567890';
  let size = 4;
  let reads = 0;
  let derives = 0;
  const reader = sceneReader(
    admin,
    {
      metadata: async () => ({ generation, size }),
      readGeneration: async () => {
        reads++;
        await afterRead();
        return Buffer.from('webp');
      },
    },
    async () => {
      derives++;
      await afterDerive();
      return Buffer.from('webp');
    },
  );
  let linked = await linkScene(f);
  const blocks = await reader.listCampaignSessionSceneBlocks(uid, linked.input),
    main = blocks.items.find((i) => i.role === 'main');
  const imageInput = () => ({ ...linked.input, blockKey: main.sourceKey });
  const good = await reader.readCampaignSessionSceneImage(uid, imageInput());
  assert.ok(good.dataUrl.startsWith('data:image/webp;base64,'));
  assert.equal(typeof good.imageKey, 'string');
  generation = '12345678901234567891';
  await assert.rejects(reader.readCampaignSessionSceneImage(uid, imageInput()));
  generation = '12345678901234567890';
  size = 16 * 1024 * 1024 + 1;
  await assert.rejects(reader.readCampaignSessionSceneImage(uid, imageInput()));
  size = 4;
  const initialReads = reads;
  afterRead = async () => {
    await f.api.removeCampaignSessionReference(
      uid,
      remove(f, linked.page, linked.row, 'unlink-during-download'),
    );
  };
  await assert.rejects(reader.readCampaignSessionSceneImage(uid, imageInput()));
  assert.equal(reads, initialReads + 1);
  assert.equal(derives, 1);
  afterRead = async () => {};
  linked = await linkScene(f, 'relink-after-download');
  afterDerive = async () => {
    await f.own.service.deleteCampaignSession(uid, {
      ...f.own.scope,
      sessionId: f.referenceScope.sessionId,
      operationId: op('session-during-derive'),
      expectedRevision: 1,
    });
  };
  await assert.rejects(reader.readCampaignSessionSceneImage(uid, imageInput()));
  assert.equal(derives, 2);
  // A new own preparation gives C4 its independent post-derive gate; the old tombstone is not restored.
  const newId = op('media-second-session');
  await f.own.service.saveCampaignSession(uid, {
    ...f.own.input,
    sessionId: newId,
    operationId: newId,
  });
  f.referenceScope = { ...f.referenceScope, sessionId: newId };
  linked = await linkScene(f, 'link-before-c4');
  afterDerive = async () => {
    await startDeletion(admin, f.campaign.id, 'c4-during-scene-derive');
  };
  await assert.rejects(
    reader.readCampaignSessionSceneImage(uid, imageInput()),
    reason('campaign-deleting'),
  );
  assert.equal(derives, 3);
  assert.equal(
    Object.keys(good).some((key) => /path|binding|generation|url/i.test(key) && key !== 'dataUrl'),
    false,
  );
});

test('SDK cenas da sessão: replay histórico e fence sobrevivem tombstone e C4 limpa ambos kinds sem reinterpretar v1/v2', async () => {
  const f = await fixture(),
    linked = await linkScene(f),
    page = await refs(f);
  const loreInput = add(f, page, 'cleanup-lore');
  await f.api.addCampaignSessionReference(uid, loreInput);
  const latest = await sceneRefs(f),
    unknown = addScene(f, latest, 'unknown-scene');
  await f.own.service.deleteCampaignSession(uid, {
    ...f.own.scope,
    sessionId: f.referenceScope.sessionId,
    operationId: op('delete-historical-session'),
    expectedRevision: 1,
  });
  await admin.doc('adventures/' + target.id).delete();
  assert.deepEqual(
    await f.api.addCampaignSessionReference(uid, linked.request),
    await f.api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      intent: 'cancel',
      request: linked.request,
    }),
  );
  const canceled = await f.api.resolveCampaignSessionReferenceOperation(uid, {
    action: 'add',
    intent: 'cancel',
    request: unknown,
  });
  assert.equal(canceled.kind, 'canceled');
  assert.deepEqual(canceled.request, unknown);
  assert.equal((await f.api.addCampaignSessionReference(uid, unknown)).kind, 'canceled');
  const deletion = await startDeletion(admin, f.campaign.id, 'scene-cleanup-v3');
  assert.equal(
    (
      await admin.doc(`users/${uid}/campaignDeletions/${deletion.result.progress.deletionId}`).get()
    ).data().cleanupVersion,
    3,
  );
  await assert.rejects(
    sceneReader().readCampaignSessionSceneReference(uid, linked.input),
    reason('campaign-deleting'),
  );
  await finishDeletion(deletion.service, deletion.result.progress, 'scene-children-cleanup');
  for (const name of ['sessionReferences', 'sessionReferenceState'])
    assert.equal(
      (await admin.collection(`campaigns/${f.campaign.id}/${name}`).limit(1).get()).empty,
      true,
    );
  for (const name of ['campaignSessionReferenceOperations', 'campaignSessionReferenceFences']) {
    const rows = (
      await admin.collection(`users/${uid}/${name}`).where('campaignId', '==', f.campaign.id).get()
    ).docs;
    assert.ok(rows.length);
    for (const row of rows)
      for (const field of ['target', 'request', 'sourceContext', 'receipt', 'result', 'title'])
        assert.equal(Object.hasOwn(row.data(), field), false);
  }
  const studio = createStudioService({ db: admin });
  for (const version of [1, 2]) {
    const other = await studio.createCampaign(uid, {
      operationId: op('old-inventory-' + version),
      title: 'Mesa antiga ' + version,
    });
    if (version === 2) await sessions(other.id);
    const old = await startDeletion(admin, other.id, 'old-delete-' + version),
      ref = admin.doc(`users/${uid}/campaignDeletions/${old.result.progress.deletionId}`),
      record = (await ref.get()).data();
    if (version === 1) delete record.cleanupVersion;
    else record.cleanupVersion = 2;
    await ref.set(record);
    let progress = old.result.progress;
    const last = version === 1 ? 6 : 8;
    for (let n = 0; n < 100; n++) {
      if (progress.phase === 'campaign-children' && ((await ref.get()).data().part ?? 0) === last)
        break;
      progress = (
        await old.service.advanceCampaignDeletion(uid, {
          deletionId: progress.deletionId,
          operationId: op('old-step-' + version + '-' + progress.checkpoint),
          expectedCheckpoint: progress.checkpoint,
        })
      ).progress;
    }
    assert.equal(progress.phase, 'campaign-children');
    assert.equal((await ref.get()).data().part, last);
    for (let n = 0; n < 2; n++)
      progress = (
        await old.service.advanceCampaignDeletion(uid, {
          deletionId: progress.deletionId,
          operationId: op('old-boundary-' + version + '-' + n),
          expectedCheckpoint: progress.checkpoint,
        })
      ).progress;
    assert.equal(progress.phase, 'activity');
    await finishDeletion(old.service, progress, 'old-finish-' + version);
  }
});
