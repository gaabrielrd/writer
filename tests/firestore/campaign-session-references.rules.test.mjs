import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, limit } from 'firebase/firestore';
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
const projectId = 'demo-writer-session-references-tests';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
const op = (name) => 'session-reference-sdk-' + name;
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
  return { ...original, own, api, referenceScope: own.referenceScope };
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

test('SDK referências: sessão e dono conferidos antes do corpo, contexto independente e fronteiras diretas fechadas', async () => {
  const f = await fixture(),
    first = await refs(f),
    request = add(f, first, 'private-reference');
  await f.api.addCampaignSessionReference(uid, request);
  const page = await refs(f),
    row = page.items[0],
    observed = observedDb(admin),
    reader = createCampaignSessionReferencesService({ db: observed.db });
  const material = await reader.readCampaignSessionLoreReference(uid, read(f, page, row));
  assert.equal(material.referenceId, row.id);
  assert.equal(material.referenceRevision, row.revision);
  assert.ok(observed.bodies.length, 'o controle positivo leu material realmente capturado');
  observed.bodies.length = 0;
  for (const actor of ['', 'other']) {
    await assert.rejects(
      reader.listCampaignSessionReferences(actor, { ...f.referenceScope, view: 'references' }),
    );
    await assert.rejects(
      reader.listCampaignSessionReferences(actor, {
        ...f.referenceScope,
        view: 'candidates',
        sourceContext: page.sourceContext,
      }),
    );
    await assert.rejects(reader.readCampaignSessionLoreReference(actor, read(f, page, row)));
    await assert.rejects(reader.addCampaignSessionReference(actor, request));
    await assert.rejects(reader.removeCampaignSessionReference(actor, remove(f, page, row)));
    await assert.rejects(
      reader.resolveCampaignSessionReferenceOperation(actor, {
        action: 'add',
        request,
        intent: 'cancel',
      }),
    );
  }
  assert.equal(observed.bodies.length, 0);
  const other = await f.own.service.saveCampaignSession(uid, {
    ...f.own.input,
    sessionId: op('other-session'),
    operationId: op('other-session'),
  });
  await assert.rejects(
    reader.readCampaignSessionLoreReference(uid, {
      ...read(f, page, row),
      sessionId: other.session.id,
    }),
  );
  await f.own.service.deleteCampaignSession(uid, {
    ...f.own.scope,
    sessionId: f.referenceScope.sessionId,
    operationId: op('delete-session'),
    expectedRevision: 1,
  });
  await assert.rejects(reader.readCampaignSessionLoreReference(uid, read(f, page, row)));
  await assert.rejects(
    reader.listCampaignSessionReferences(uid, {
      ...f.referenceScope,
      view: 'candidates',
      sourceContext: page.sourceContext,
    }),
  );
  assert.equal(observed.bodies.length, 0);
  const paths = [
    rowPath(f, row.id),
    statePath(f),
    `users/${uid}/campaignSessionReferenceOperations/${request.operationId}`,
    `users/${uid}/campaignSessionReferenceFences/${op('fence')}`,
  ];
  for (const client of [
    environment.authenticatedContext(uid).firestore(),
    environment.authenticatedContext('other').firestore(),
    environment.unauthenticatedContext().firestore(),
  ]) {
    for (const path of paths) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { ownerId: uid }));
    }
    for (const path of [
      `campaigns/${f.campaign.id}/sessionReferences`,
      `campaigns/${f.campaign.id}/sessionReferenceState`,
      `users/${uid}/campaignSessionReferenceOperations`,
      `users/${uid}/campaignSessionReferenceFences`,
    ])
      await assertFails(getDocs(query(collection(client, path), limit(25))));
  }
  const studio = createStudioService({ db: admin }),
    independent = await studio.createCampaign(uid, {
      operationId: op('independent'),
      title: 'Mesa independente',
    }),
    own = await sessions(independent.id);
  const independentPage = await f.api.listCampaignSessionReferences(uid, {
    ...own.referenceScope,
    view: 'references',
  });
  assert.equal(independentPage.sourceContext, null);
  assert.deepEqual(independentPage.items, []);
});

test('SDK referências: variante e legado real continuam projetados sob gate independente de U2 e relações revogadas não vazam', async () => {
  const allyKey = baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'ally' });
  const f = await fixture(async ({ universe, scenes, scene }) => {
    await universe.saveUniverseLore(uid, {
      universeId: 'world',
      id: 'ally',
      create: true,
      input: {
        name: 'Aliada privada',
        category: 'character',
        summary: 'Resumo privado',
        isPublic: false,
      },
    });
    await scenes.setSceneReference(uid, {
      target,
      sceneId: scene.id,
      expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
      reference: { kind: 'universe', scopeId: 'world', entityId: 'ally' },
      operationId: op('ally-reference'),
    });
  });
  const variant = entity({
    details: 'Ficha integral 🐉\nCom whitespace preservado  ',
    relations: [
      { targetKey: allyKey, relationType: 'Conhece', description: 'DESCRIÇÃO RELACIONADA PRIVADA' },
    ],
  });
  await f.save('reference-ally-variant', 0, entity({ name: 'Aliada privada' }), allyKey);
  await f.save('reference-variant', 0, variant);
  await f.removeReferences();
  const scene = await f.scenes.getScene(uid, { target, sceneId: f.scene.id });
  await f.scenes.setSceneReference(uid, {
    target,
    sceneId: scene.id,
    operationId: op('remove-ally-reference'),
    expectedRevision: scene.revision,
    reference: { kind: 'universe', scopeId: 'world', entityId: 'ally' },
    remove: true,
  });
  await f.universe.createUniverse(uid, {
    creationId: 'world-current',
    name: 'Universo atual',
    description: '',
  });
  // Controlled source edit uses the real universe link write plan; capture/variant/adoption below are real services.
  await admin.runTransaction(async (tx) => {
    const root = (await tx.get(admin.doc('adventures/' + target.id))).data();
    assert.equal(root.ownerId, uid);
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
  await adopted(f, await f.candidate('reference-legacy'), 'reference-adoption');
  const initial = await refs(f),
    request = add(f, initial, 'legacy-reference');
  await f.api.addCampaignSessionReference(uid, request);
  let page = await refs(f),
    row = page.items[0];
  assert.equal(row.target.legacy, true);
  assert.equal(row.target.mode, 'override');
  let body = await f.api.readCampaignSessionLoreReference(uid, read(f, page, row));
  assert.equal(body.material.entity.details, variant.details);
  assert.equal(body.material.entity.relations[0].targetName, 'Aliada privada');
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'ally' });
  // Model a normal external unavailability of U2, preserving the persistent authorization epoch.
  await admin.runTransaction(async (tx) => {
    const authorization = await prepareCampaignAuthorization(tx, admin, uid, { bump: true });
    await tx.get(admin.doc('universes/world-current'));
    authorization.commit();
    tx.update(admin.doc('universes/world-current'), { deleting: true });
  });
  page = await refs(f);
  row = page.items[0];
  assert.ok(page.sourceContext);
  assert.equal(row.available, true);
  const candidates = await f.api.listCampaignSessionReferences(uid, {
    ...f.referenceScope,
    view: 'candidates',
    sourceContext: page.sourceContext,
  });
  assert.equal(
    candidates.items.some((item) => item.sourceKey === heroKey && item.legacy),
    true,
  );
  body = await f.api.readCampaignSessionLoreReference(uid, read(f, page, row));
  assert.equal(body.material.entity.details, variant.details);
  assert.deepEqual(body.material.entity.relations, []);
  for (const forbidden of [
    'entityHash',
    'descriptor',
    'anchor',
    'manifest',
    'bodyBinding',
    'DESCRIÇÃO RELACIONADA PRIVADA',
    'Aliada privada',
  ])
    assert.equal(JSON.stringify(body).includes(forbidden), false);
  assert.deepEqual(Object.keys(body.material).sort(), [
    'entity',
    'kind',
    'legacy',
    'mode',
    'revision',
    'sourceKey',
  ]);
  const before = (
    await f.own.service.getCampaignSession(uid, {
      ...f.own.scope,
      sessionId: f.referenceScope.sessionId,
    })
  ).session;
  await f.api.removeCampaignSessionReference(uid, remove(f, page, row));
  assert.deepEqual(
    (
      await f.own.service.getCampaignSession(uid, {
        ...f.own.scope,
        sessionId: f.referenceScope.sessionId,
      })
    ).session,
    before,
  );
  const originRef = admin.doc('adventures/' + target.id),
    origin = (await originRef.get()).data();
  await originRef.delete();
  const unavailable = await refs(f);
  assert.equal(unavailable.sourceContext, null);
  assert.equal(
    (
      await f.api.listCampaignSessionReferences(uid, {
        ...f.referenceScope,
        view: 'candidates',
        sourceContext: page.sourceContext,
      })
    ).items.length,
    0,
  );
  await originRef.create({ ...origin, schemaVersion: 99 });
  await assert.rejects(refs(f), { code: 'failed-precondition' });
});

test('SDK referências: duplicata atômica, paginação metadata-only, projeção e controle de tombstones não rebaseiam S1', async () => {
  const f = await fixture(async ({ universe, scenes, scene }) => {
    for (let index = 0; index < 26; index++) {
      const id = 'paged-' + index;
      await universe.saveUniverseLore(uid, {
        universeId: 'world',
        id,
        create: true,
        input: {
          name: 'Candidata ' + index,
          category: 'character',
          summary: 'Sem ler este corpo na lista',
          isPublic: false,
        },
      });
      await scenes.setSceneReference(uid, {
        target,
        sceneId: scene.id,
        operationId: op('paged-ref-' + index),
        expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
        reference: { kind: 'universe', scopeId: 'world', entityId: id },
      });
    }
  });
  const observed = observedDb(admin),
    api = createCampaignSessionReferencesService({ db: observed.db });
  f.api = api;
  let page = await refs(f);
  const firstRequest = add(f, page, 'duplicate-a');
  const raced = await Promise.allSettled([
    api.addCampaignSessionReference(uid, firstRequest),
    api.addCampaignSessionReference(uid, add(f, page, 'duplicate-b')),
  ]);
  assert.equal(raced.filter((result) => result.status === 'fulfilled').length, 1);
  page = await refs(f);
  assert.equal(page.items.length, 1);
  await assert.rejects(api.addCampaignSessionReference(uid, add(f, page, 'duplicate-c')));
  for (let index = 0; index < 26; index++) {
    const result = await api.addCampaignSessionReference(
      uid,
      add(
        f,
        page,
        'paged-add-' + index,
        baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'paged-' + index }),
      ),
    );
    page = afterReceipt(page, result);
  }
  observed.bodies.length = 0;
  page = await refs(f);
  assert.equal(page.items.length, 25);
  assert.ok(page.nextCursor);
  const next = await refs(f, { cursor: page.nextCursor });
  assert.equal(next.items.length, 2);
  const all = [...page.items, ...next.items];
  assert.equal(new Set(all.map((item) => item.id)).size, 27);
  assert.equal(observed.bodies.length, 0);
  const candidates = await api.listCampaignSessionReferences(uid, {
    ...f.referenceScope,
    view: 'candidates',
    sourceContext: page.sourceContext,
    limit: 1,
  });
  assert.ok(candidates.nextCursor);
  assert.equal(observed.bodies.length, 0);
  await assert.rejects(refs(f, { cursor: candidates.nextCursor }));
  const oldContext = page.sourceContext;
  await f.save('invalidate-projection', 0, entity());
  await assert.rejects(refs(f, { cursor: page.nextCursor }));
  await assert.rejects(
    api.readCampaignSessionLoreReference(uid, read(f, page, page.items[0])),
    reason('source-context-changed'),
  );
  await assert.rejects(
    api.listCampaignSessionReferences(uid, {
      ...f.referenceScope,
      view: 'candidates',
      sourceContext: oldContext,
    }),
    reason('source-context-changed'),
  );
  const own = (
    await f.own.service.getCampaignSession(uid, {
      ...f.own.scope,
      sessionId: f.referenceScope.sessionId,
    })
  ).session;
  assert.equal(own.revision, 1);
  assert.equal(own.summary, f.own.input.summary);
  const current = await refs(f, { limit: 50 });
  let removalPage = current;
  for (const row of current.items)
    removalPage = afterReceipt(
      removalPage,
      await api.removeCampaignSessionReference(
        uid,
        remove(f, removalPage, row, 'tombstone-' + row.id),
      ),
    );
  const empty = await refs(f);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.referenceCollectionRevision, removalPage.referenceCollectionRevision);
  assert.equal(
    (await admin.collection(`campaigns/${f.campaign.id}/sessionReferences`).get()).docs.every(
      (doc) => doc.data().deleted,
    ),
    true,
  );
  await admin.doc(statePath(f)).delete();
  await assert.rejects(refs(f));
  await assert.rejects(api.addCampaignSessionReference(uid, add(f, current, 'missing-control')));
});

test('SDK referências: recibo histórico e fence exatos continuam após revogação e sessão tombstonada sem resolver alvo', async () => {
  const f = await fixture(),
    first = await refs(f),
    committed = add(f, first, 'committed');
  const result = await f.api.addCampaignSessionReference(uid, committed);
  const after = await refs(f),
    unknown = add(f, after, 'never-received');
  await f.universe.deleteUniverseLore(uid, { universeId: 'world', id: 'hero' });
  await f.own.service.deleteCampaignSession(uid, {
    ...f.own.scope,
    sessionId: f.referenceScope.sessionId,
    operationId: op('delete-history-session'),
    expectedRevision: 1,
  });
  const observed = observedDb(admin),
    api = createCampaignSessionReferencesService({ db: observed.db });
  assert.deepEqual(await api.addCampaignSessionReference(uid, committed), result);
  assert.deepEqual(
    await api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      request: committed,
      intent: 'cancel',
    }),
    result,
  );
  const canceled = await api.resolveCampaignSessionReferenceOperation(uid, {
    action: 'add',
    request: unknown,
    intent: 'cancel',
  });
  assert.equal(canceled.kind, 'canceled');
  assert.deepEqual(canceled.request, unknown);
  assert.deepEqual(
    await api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      request: unknown,
      intent: 'cancel',
    }),
    canceled,
  );
  assert.deepEqual(await api.addCampaignSessionReference(uid, unknown), canceled);
  assert.equal((await admin.doc(rowPath(f, unknown.referenceId)).get()).exists, false);
  await assert.rejects(
    api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      request: { ...unknown, target: { kind: 'lore', sourceKey: '0'.repeat(64) } },
      intent: 'cancel',
    }),
  );
  assert.equal(observed.bodies.length, 0);
  for (const path of [
    `users/${uid}/campaignSessionReferenceOperations/${committed.operationId}`,
    `users/${uid}/campaignSessionReferenceFences/${unknown.operationId}`,
  ]) {
    const stored = (await admin.doc(path).get()).data();
    for (const field of [
      'request',
      'target',
      'sourceContext',
      'entity',
      'name',
      'summary',
      'descriptor',
      'key',
    ])
      assert.equal(Object.hasOwn(stored, field), false);
  }
  const root = (await admin.doc('campaigns/' + f.campaign.id).get()).data();
  await admin.doc('campaigns/' + f.campaign.id).delete();
  await admin.doc('campaigns/' + f.campaign.id).create(root);
  await assert.rejects(
    api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      request: unknown,
      intent: 'cancel',
    }),
    reason('campaign-changed'),
  );
});

test('SDK referências: C4 v3 limpa mais25 vínculos e recibos/fences, preserva outra mesa e retoma inventários v1/v2', async () => {
  const f = await fixture(),
    first = await refs(f);
  let page = first;
  // Repeated unlink/relink creates real tombstones without duplicating an active target.
  for (let index = 0; index < 27; index++) {
    const input = add(f, page, 'cleanup-reference-' + index);
    const added = await f.api.addCampaignSessionReference(uid, input);
    page = afterReceipt(page, added);
    const removed = await f.api.removeCampaignSessionReference(
      uid,
      remove(
        f,
        page,
        { id: added.receipt.referenceId, revision: added.receipt.revision },
        'cleanup-remove-' + index,
      ),
    );
    page = afterReceipt(page, removed);
  }
  const currentReferences = await refs(f);
  assert.deepEqual(currentReferences.items, []);
  assert.equal(currentReferences.referenceCollectionRevision, 54);
  const fenced = add(f, page, 'cleanup-fence');
  await f.api.resolveCampaignSessionReferenceOperation(uid, {
    action: 'add',
    request: fenced,
    intent: 'cancel',
  });
  const studio = createStudioService({ db: admin }),
    other = await studio.createCampaign(uid, {
      operationId: op('other-table'),
      title: 'Outra mesa preservada',
    }),
    otherOwn = await sessions(other.id);
  const deletion = await startDeletion(admin, f.campaign.id, 'reference-delete-v3');
  assert.equal(
    (
      await admin.doc(`users/${uid}/campaignDeletions/${deletion.result.progress.deletionId}`).get()
    ).data().cleanupVersion,
    3,
  );
  await assert.rejects(
    f.api.addCampaignSessionReference(uid, add(f, page, 'late-after-c4')),
    (error) =>
      error.code === 'failed-precondition' &&
      error.details?.reason === 'campaign-deleting' &&
      error.details.campaignId === f.campaign.id &&
      error.details.deletionId === deletion.result.progress.deletionId,
  );
  await assert.rejects(
    f.api.resolveCampaignSessionReferenceOperation(uid, {
      action: 'add',
      request: fenced,
      intent: 'cancel',
    }),
  );
  await finishDeletion(deletion.service, deletion.result.progress, 'references-cleanup');
  for (const collectionName of [
    'sessions',
    'sessionState',
    'sessionReferences',
    'sessionReferenceState',
  ])
    assert.equal(
      (await admin.collection(`campaigns/${f.campaign.id}/${collectionName}`).limit(1).get()).empty,
      true,
    );
  for (const name of ['campaignSessionReferenceOperations', 'campaignSessionReferenceFences']) {
    const rows = (
      await admin.collection(`users/${uid}/${name}`).where('campaignId', '==', f.campaign.id).get()
    ).docs;
    assert.ok(rows.length);
    for (const row of rows)
      for (const field of [
        'request',
        'target',
        'sourceContext',
        'receipt',
        'name',
        'summary',
        'result',
      ])
        assert.equal(Object.hasOwn(row.data(), field), false);
  }
  assert.equal(
    (
      await otherOwn.service.getCampaignSession(uid, {
        ...otherOwn.scope,
        sessionId: otherOwn.input.sessionId,
      })
    ).session.summary,
    otherOwn.input.summary,
  );
  for (const version of [1, 2]) {
    const old = await studio.createCampaign(uid, {
      operationId: op('legacy-v' + version),
      title: 'Limpeza antiga v' + version,
    });
    if (version === 2) await sessions(old.id);
    const started = await startDeletion(admin, old.id, 'reference-old-v' + version),
      ref = admin.doc(`users/${uid}/campaignDeletions/${started.result.progress.deletionId}`),
      record = (await ref.get()).data();
    if (version === 1) delete record.cleanupVersion;
    else record.cleanupVersion = 2;
    await ref.set(record);
    let p = started.result.progress;
    const lastPart = version === 1 ? 6 : 8;
    for (let count = 0; count < 100; count++) {
      const internal = (await ref.get()).data();
      if (p.phase === 'campaign-children' && (internal.part ?? 0) === lastPart) break;
      p = (
        await started.service.advanceCampaignDeletion(uid, {
          deletionId: p.deletionId,
          operationId: op('legacy-to-part-v' + version + '-' + p.checkpoint),
          expectedCheckpoint: p.checkpoint,
        })
      ).progress;
    }
    assert.equal(p.phase, 'campaign-children');
    assert.equal((await ref.get()).data().part, lastPart);
    for (let index = 0; index < 2; index++)
      p = (
        await started.service.advanceCampaignDeletion(uid, {
          deletionId: p.deletionId,
          operationId: op('legacy-last-v' + version + '-' + index),
          expectedCheckpoint: p.checkpoint,
        })
      ).progress;
    assert.equal(
      p.phase,
      'activity',
      'o último part antigo não foi reinterpretado pelo inventário v3',
    );
    await finishDeletion(started.service, p, 'reference-resume-v' + version);
    assert.equal((await admin.doc('campaigns/' + old.id).get()).exists, false);
  }
});
