import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, limit } from 'firebase/firestore';
import { createCampaignPreparationService } from '../../functions/src/campaignPreparation.mjs';
import { createCampaignSessionsService } from '../../functions/src/campaignSessions.mjs';
import { createCampaignSessionReferencesService } from '../../functions/src/campaignSessionReferences.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import { adoptionFixture, uid, heroKey } from '../../functions/test/helpers/campaignAdoption.mjs';
import { target } from '../../functions/test/helpers/campaignComparison.mjs';
import { startDeletion, finishDeletion } from '../../functions/test/helpers/campaignDeletion.mjs';
import { deletionPhases, owned } from '../../functions/src/campaignDeletionContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-campaign-preparation-tests';
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
const op = (value) => 'preparation-sdk-' + value;
const reason = (value) => (error) => error.details?.reason === value;
let environment, admin;
before(async () => {
  process.env.METADATA_SERVER_DETECTION = 'none';
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente emulador demo.');
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
async function setup(name = 'own', campaignId) {
  const studio = createStudioService({ db: admin });
  if (!campaignId)
    campaignId = (
      await studio.createCampaign(uid, {
        operationId: op('campaign-' + name),
        title: 'Mesa própria ' + name,
      })
    ).id;
  const api = createCampaignPreparationService({ db: admin }),
    page = await api.listCampaignPreparationItems(uid, { campaignId, kind: 'clue', view: 'all' });
  return {
    api,
    scope: { campaignId, campaignToken: page.campaignToken },
    revision: page.itemCollectionRevision,
    sessions: createCampaignSessionsService({ db: admin }),
  };
}
function saveInput(f, name, kind = 'clue', patch = {}) {
  const id = op(name);
  return {
    ...f.scope,
    operationId: id,
    itemId: id,
    expectedRevision: 0,
    expectedItemCollectionRevision: f.revision,
    kind,
    title: 'Item ' + name,
    status: kind === 'clue' ? 'pending' : 'available',
    body:
      kind === 'clue'
        ? {
            text: '  TEXTO PRÓPRIO 🐉\n intacto  ',
            condition: 'Se examinar a gaveta',
            recipient: 'Grupo inteiro',
          }
        : { description: 'MISSÃO PRÓPRIA', consequences: 'A vila pode recuperar a luz' },
    ...patch,
  };
}
async function save(f, name, kind = 'clue', patch = {}) {
  const input = saveInput(f, name, kind, patch),
    outcome = await f.api.saveCampaignPreparationItem(uid, input);
  assert.equal(outcome.kind, 'confirmed');
  assert.equal(outcome.receipt.itemCollectionRevision, f.revision + 1);
  f.revision = outcome.receipt.itemCollectionRevision;
  return { input, outcome };
}
const items = (f, extra = {}) =>
  f.api.listCampaignPreparationItems(uid, { ...f.scope, kind: 'clue', view: 'all', ...extra });
const get = (f, itemId, expectedRevision) =>
  f.api.getCampaignPreparationItem(uid, { ...f.scope, itemId, expectedRevision });
async function session(f, name) {
  const id = op('session-' + name);
  await f.sessions.saveCampaignSession(uid, {
    ...f.scope,
    operationId: id,
    sessionId: id,
    expectedRevision: 0,
    title: 'Sessão ' + name,
    summary: ' PREPARAÇÃO S1 INTACTA ',
    scheduledDate: null,
    status: 'planned',
  });
  return { ...f.scope, sessionId: id, expectedSessionRevision: 1 };
}
const links = (f, s, extra = {}) =>
  f.api.listCampaignSessionPreparationLinks(uid, { ...s, ...extra });
async function link(f, s, item, name, expectedRevision = 1) {
  const page = await links(f, s),
    id = op('link-' + name),
    input = {
      ...s,
      operationId: id,
      linkId: id,
      expectedRevision: 0,
      expectedLinkCollectionRevision: page.linkCollectionRevision,
      itemId: item,
      expectedItemRevision: expectedRevision,
    };
  return { input, outcome: await f.api.addCampaignSessionPreparationLink(uid, input) };
}
function observedDb(db) {
  const bodies = [];
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
                        if (ref.path?.includes('/preparationBodies/')) bodies.push(ref.path);
                        return transaction.get(ref);
                      };
                    if (member === 'getAll')
                      return (...args) => {
                        for (const ref of args)
                          if (ref?.path?.includes('/preparationBodies/')) bodies.push(ref.path);
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

test('SDK preparação: gates, SDK direto fechado, páginas metadata-only e cursores presos ao tipo e coleções', async () => {
  const f = await setup('identity');
  let first;
  for (let n = 0; n < 27; n++) {
    const result = await save(f, 'page-' + n);
    first ??= result;
  }
  const spy = observedDb(admin),
    api = createCampaignPreparationService({ db: spy.db }),
    page = await api.listCampaignPreparationItems(uid, { ...f.scope, kind: 'clue', view: 'all' });
  assert.equal(page.items.length, 25);
  assert.ok(page.nextCursor);
  assert.equal(spy.bodies.length, 0);
  assert.equal(
    page.items.some((r) => 'body' in r || 'condition' in r || 'text' in r),
    false,
  );
  const last = await api.listCampaignPreparationItems(uid, {
    ...f.scope,
    kind: 'clue',
    view: 'all',
    cursor: page.nextCursor,
  });
  assert.equal(last.items.length, 2);
  assert.equal(last.nextCursor, null);
  await assert.rejects(
    api.listCampaignPreparationItems(uid, {
      ...f.scope,
      kind: 'quest',
      view: 'all',
      cursor: page.nextCursor,
    }),
    reason('cursor-invalidated'),
  );
  await assert.rejects(
    api.listCampaignPreparationItems(uid, {
      ...f.scope,
      kind: 'clue',
      view: 'pending',
      cursor: page.nextCursor,
    }),
    reason('cursor-invalidated'),
  );
  await assert.rejects(
    api.getCampaignPreparationItem('intruder', {
      ...f.scope,
      itemId: first.input.itemId,
      expectedRevision: 1,
    }),
  );
  await assert.rejects(
    api.getCampaignPreparationItem('', {
      ...f.scope,
      itemId: first.input.itemId,
      expectedRevision: 1,
    }),
  );
  await assert.rejects(
    api.getCampaignPreparationItem(uid, {
      ...f.scope,
      campaignToken: 'f'.repeat(64),
      itemId: first.input.itemId,
      expectedRevision: 1,
    }),
  );
  await assert.rejects(
    api.getCampaignPreparationItem(uid, {
      ...f.scope,
      itemId: first.input.itemId,
      expectedRevision: 2,
    }),
    reason('revision-conflict'),
  );
  assert.equal(spy.bodies.length, 0);
  const s = await session(f, 'pages');
  const linked = await link(f, s, first.input.itemId, 'pages');
  const lp = await api.listCampaignSessionPreparationLinks(uid, { ...s, limit: 1 });
  assert.equal(lp.items[0].available, true);
  assert.equal(spy.bodies.length, 0);
  const own = await api.getCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: first.input.itemId,
    expectedRevision: 1,
  });
  assert.equal(own.item.body.text, first.input.body.text);
  assert.equal(spy.bodies.length, 1);
  const paths = [
    `campaigns/${f.scope.campaignId}/preparationItems/${first.input.itemId}`,
    `campaigns/${f.scope.campaignId}/preparationBodies/${first.input.itemId}`,
    `campaigns/${f.scope.campaignId}/preparationState/current`,
    `campaigns/${f.scope.campaignId}/sessionPreparationLinks/${linked.input.linkId}`,
    `campaigns/${f.scope.campaignId}/sessionPreparationState/${s.sessionId}`,
    `users/${uid}/campaignPreparationOperations/${first.input.operationId}`,
    `users/${uid}/campaignPreparationFences/unknown`,
  ];
  for (const actor of [uid, 'intruder', null]) {
    const sdk = actor
      ? environment.authenticatedContext(actor).firestore()
      : environment.unauthenticatedContext().firestore();
    for (const path of paths) {
      await assertFails(getDoc(doc(sdk, path)));
      await assertFails(setDoc(doc(sdk, path), { forged: true }));
      await assertFails(
        getDocs(query(collection(sdk, path.slice(0, path.lastIndexOf('/'))), limit(1))),
      );
    }
  }
  await save(f, 'changed-page');
  await assert.rejects(items(f, { cursor: page.nextCursor }), reason('cursor-invalidated'));
  await startDeletion(admin, f.scope.campaignId, 'preparation-identity-deletion');
  await assert.rejects(
    api.getCampaignPreparationItem(uid, {
      ...f.scope,
      itemId: first.input.itemId,
      expectedRevision: 1,
    }),
    reason('campaign-deleting'),
  );
  assert.equal(spy.bodies.length, 1);
});

test('SDK preparação: CAS real, ordens por tipo e sessão mista, estado compartilhado e exclusões sem perda de prosa', async () => {
  const f = await setup('lifecycle'),
    a = await save(f, 'clue-a'),
    b = await save(f, 'quest-b', 'quest'),
    c = await save(f, 'clue-c');
  const scope = f.scope;
  const qp = await items(f, { kind: 'quest' });
  await f.api.moveCampaignPreparationItem(uid, {
    ...scope,
    itemId: c.input.itemId,
    operationId: op('move-c'),
    expectedRevision: 1,
    expectedItemCollectionRevision: f.revision,
    direction: 'up',
  });
  f.revision++;
  const cp = await items(f);
  assert.deepEqual(
    cp.items.map((r) => r.id),
    [c.input.itemId, a.input.itemId],
  );
  assert.equal(cp.items[0].revision, 2);
  assert.equal(cp.items[1].revision, 2);
  assert.deepEqual((await items(f, { kind: 'quest' })).items, qp.items);
  const current = (await get(f, a.input.itemId, 2)).item,
    one = {
      ...scope,
      operationId: op('race-one'),
      itemId: current.id,
      expectedRevision: 2,
      expectedItemCollectionRevision: f.revision,
      kind: 'clue',
      title: current.title,
      status: 'pending',
      body: current.body,
    },
    two = {
      ...one,
      operationId: op('race-two'),
      body: { ...current.body, text: 'VENCEDOR ALTERNATIVO' },
    };
  const raced = await Promise.allSettled([
    f.api.saveCampaignPreparationItem(uid, one),
    f.api.saveCampaignPreparationItem(uid, two),
  ]);
  assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(raced.filter((r) => r.status === 'rejected').length, 1);
  f.revision++;
  const s1 = await session(f, 'first'),
    s2 = await session(f, 'second');
  const la = await link(f, s1, a.input.itemId, 'a', 3),
    lb = await link(f, s1, b.input.itemId, 'b'),
    lc = await link(f, s1, c.input.itemId, 'c', 2);
  await link(f, s2, b.input.itemId, 'shared-b');
  let lp = await links(f, s1);
  assert.deepEqual(
    lp.items.map((r) => r.target.kind),
    ['clue', 'quest', 'clue'],
  );
  const moved = {
    ...s1,
    linkId: lb.input.linkId,
    operationId: op('move-mixed-link'),
    expectedRevision: 1,
    expectedLinkCollectionRevision: lp.linkCollectionRevision,
    direction: 'up',
  };
  await f.api.moveCampaignSessionPreparationLink(uid, moved);
  lp = await links(f, s1);
  assert.deepEqual(
    lp.items.map((r) => r.target.kind),
    ['quest', 'clue', 'clue'],
  );
  assert.equal(lp.items[0].revision, 2);
  assert.equal(lp.items[1].revision, 2);
  assert.deepEqual(await f.api.addCampaignSessionPreparationLink(uid, lb.input), lb.outcome);
  const duplicate = {
    ...lb.input,
    linkId: op('duplicate-b'),
    operationId: op('duplicate-b'),
    expectedLinkCollectionRevision: lp.linkCollectionRevision,
  };
  await assert.rejects(
    f.api.addCampaignSessionPreparationLink(uid, duplicate),
    reason('preparation-already-linked'),
  );
  const beforeCursor = await links(f, s1, { limit: 1 });
  assert.ok(beforeCursor.nextCursor);
  await assert.rejects(
    links(f, s2, { cursor: beforeCursor.nextCursor }),
    reason('cursor-invalidated'),
  );
  const itemWindow = await items(f, { limit: 1 });
  assert.ok(itemWindow.nextCursor);
  const otherScope = await setup('cross-cursor');
  await assert.rejects(
    f.api.listCampaignPreparationItems(uid, {
      ...otherScope.scope,
      kind: 'clue',
      view: 'all',
      cursor: itemWindow.nextCursor,
    }),
    reason('cursor-invalidated'),
  );
  await save(f, 'quest-active', 'quest', {
    itemId: b.input.itemId,
    expectedRevision: 1,
    status: 'active',
    title: 'Salvar o farol agora',
    body: { description: 'CORPO COMPARTILHADO', consequences: 'SEM AUTOMAÇÃO' },
  });
  await assert.rejects(
    links(f, s1, { cursor: beforeCursor.nextCursor }),
    reason('cursor-invalidated'),
  );
  for (const s of [s1, s2]) {
    const p = await links(f, s);
    const row = p.items.find((r) => r.available && r.target.id === b.input.itemId);
    assert.equal(row.target.status, 'active');
    assert.equal(row.target.title, 'Salvar o farol agora');
  }
  assert.equal((await items(f, { kind: 'quest', view: 'pending' })).items.length, 1);
  await save(f, 'quest-completed', 'quest', {
    itemId: b.input.itemId,
    expectedRevision: 2,
    status: 'completed',
    title: 'Farol salvo',
    body: { description: 'CORPO COMPARTILHADO', consequences: 'SEM AUTOMAÇÃO' },
  });
  assert.equal((await items(f, { kind: 'quest', view: 'pending' })).items.length, 0);
  await f.sessions.deleteCampaignSession(uid, {
    ...scope,
    sessionId: s1.sessionId,
    operationId: op('delete-session-one'),
    expectedRevision: 1,
  });
  await assert.rejects(links(f, s1));
  assert.equal((await get(f, b.input.itemId, 3)).item.body.description, 'CORPO COMPARTILHADO');
  assert.equal((await links(f, s2)).items.length, 1);
  const frozen = await get(f, b.input.itemId, 3);
  await f.api.deleteCampaignPreparationItem(uid, {
    ...scope,
    itemId: b.input.itemId,
    operationId: op('delete-item-b'),
    expectedRevision: 3,
    expectedItemCollectionRevision: f.revision,
  });
  f.revision++;
  const stored = (
    await admin.doc(`campaigns/${scope.campaignId}/preparationItems/${b.input.itemId}`).get()
  ).data();
  assert.equal(stored.deleted, true);
  assert.equal('title' in stored, false);
  assert.equal('status' in stored, false);
  assert.equal(
    (await admin.doc(`campaigns/${scope.campaignId}/preparationBodies/${b.input.itemId}`).get())
      .exists,
    false,
  );
  const neutral = await links(f, s2);
  assert.deepEqual(Object.keys(neutral.items[0]).sort(), [
    'available',
    'createdAt',
    'id',
    'order',
    'revision',
    'updatedAt',
  ]);
  assert.equal(neutral.items[0].available, false);
  await f.api.removeCampaignSessionPreparationLink(uid, {
    ...s2,
    operationId: op('remove-neutral'),
    linkId: neutral.items[0].id,
    expectedRevision: neutral.items[0].revision,
    expectedLinkCollectionRevision: neutral.linkCollectionRevision,
  });
  assert.equal((await links(f, s2)).items.length, 0);
  assert.equal(frozen.item.body.description, 'CORPO COMPARTILHADO');
  assert.equal(
    (
      await admin
        .doc(`campaigns/${scope.campaignId}/sessionPreparationLinks/${la.input.linkId}`)
        .get()
    ).exists,
    true,
  );
  assert.equal(
    (
      await admin
        .doc(`campaigns/${scope.campaignId}/sessionPreparationLinks/${lc.input.linkId}`)
        .get()
    ).exists,
    true,
  );
});

test('SDK preparação: adoção e origem revogada retiram apoio S2 preservando texto próprio sem cópia nem mutação do original', async () => {
  const source = await adoptionFixture(admin),
    f = await setup('source', source.campaign.id),
    own = await save(f, 'source-own'),
    s = await session(f, 'source'),
    refs = createCampaignSessionReferencesService({ db: admin });
  const rp = await refs.listCampaignSessionReferences(uid, { ...s, view: 'references' }),
    referenceId = op('source-lore-link'),
    request = {
      ...s,
      referenceId,
      operationId: referenceId,
      expectedReferenceCollectionRevision: rp.referenceCollectionRevision,
      sourceContext: rp.sourceContext,
      target: { kind: 'lore', sourceKey: heroKey },
    };
  await refs.addCampaignSessionReference(uid, request);
  await source.removeReferences();
  const candidate = await source.candidate('preparation-source-absence');
  let progress = (await source.start(candidate, 'preparation-source-adoption')).result.progress;
  progress = await source.finish(progress);
  await source.step('activateCampaignAdoption', progress);
  const unavailable = await refs.listCampaignSessionReferences(uid, { ...s, view: 'references' });
  assert.equal(unavailable.items[0].available, false);
  const rootBefore = (await admin.doc('adventures/' + target.id).get()).data(),
    other = await setup('preserved-other'),
    otherBefore = (await admin.doc('campaigns/' + other.scope.campaignId).get()).data();
  const read = await get(f, own.input.itemId, 1);
  assert.deepEqual(read.item.body, own.input.body);
  await save(f, 'own-after-adoption', 'clue', {
    itemId: own.input.itemId,
    expectedRevision: 1,
    title: 'Própria após adoção',
    body: { ...own.input.body, text: 'PROSA INDEPENDENTE' },
  });
  assert.deepEqual((await admin.doc('adventures/' + target.id).get()).data(), rootBefore);
  assert.deepEqual(
    (await admin.doc('campaigns/' + other.scope.campaignId).get()).data(),
    otherBefore,
  );
  await admin.doc('adventures/' + target.id).delete();
  assert.equal((await get(f, own.input.itemId, 2)).item.body.text, 'PROSA INDEPENDENTE');
  await save(f, 'own-after-source-delete', 'clue', {
    itemId: own.input.itemId,
    expectedRevision: 2,
    title: 'Própria sem origem',
    body: { ...own.input.body, text: 'CONTINUA EDITÁVEL' },
  });
  assert.equal((await get(f, own.input.itemId, 3)).item.body.text, 'CONTINUA EDITÁVEL');
  assert.equal((await items(f)).items.length, 1);
});

test('SDK preparação: histórico e cancel fence sem prosa, C4 v4 paginado e fronteiras antigas 1/2/3 preservadas', async () => {
  const f = await setup('recovery'),
    saved = await save(f, 'history'),
    s = await session(f, 'history'),
    linked = await link(f, s, saved.input.itemId, 'history');
  await save(f, 'newer-history', 'clue', {
    itemId: saved.input.itemId,
    expectedRevision: 1,
    title: 'Título posterior',
    body: { text: 'TEXTO POSTERIOR', condition: '', recipient: '' },
  });
  await f.sessions.deleteCampaignSession(uid, {
    ...f.scope,
    sessionId: s.sessionId,
    operationId: op('history-session-delete'),
    expectedRevision: 1,
  });
  assert.deepEqual(await f.api.saveCampaignPreparationItem(uid, saved.input), saved.outcome);
  assert.deepEqual(
    await f.api.addCampaignSessionPreparationLink(uid, linked.input),
    linked.outcome,
  );
  assert.deepEqual(
    await f.api.resolveCampaignPreparationOperation(uid, {
      action: 'save-item',
      request: saved.input,
      intent: 'cancel',
    }),
    saved.outcome,
  );
  await assert.rejects(
    f.api.saveCampaignPreparationItem(uid, { ...saved.input, title: 'OUTRO PEDIDO' }),
    { code: 'invalid-argument' },
  );
  const unknown = saveInput(f, 'unknown-canceled'),
    canceled = await f.api.resolveCampaignPreparationOperation(uid, {
      action: 'save-item',
      request: unknown,
      intent: 'cancel',
    });
  assert.equal(canceled.kind, 'canceled');
  assert.deepEqual(Object.keys(canceled).sort(), [
    'action',
    'campaignId',
    'campaignToken',
    'kind',
    'operationId',
    'ownerId',
    'schemaVersion',
  ]);
  assert.equal(JSON.stringify(canceled).includes(unknown.body.text), false);
  assert.deepEqual(await f.api.saveCampaignPreparationItem(uid, unknown), canceled);
  assert.equal(
    (await admin.doc(`campaigns/${f.scope.campaignId}/preparationBodies/${unknown.itemId}`).get())
      .exists,
    false,
  );
  const children = [
      'preparationItems',
      'preparationBodies',
      'preparationState',
      'sessionPreparationLinks',
      'sessionPreparationState',
    ],
    recovery = ['campaignPreparationOperations', 'campaignPreparationFences'];
  const batch = admin.batch();
  for (const name of children)
    for (let n = 0; n < 27; n++)
      batch.set(admin.doc(`campaigns/${f.scope.campaignId}/${name}/cleanup-${n}`), {
        ownerId: uid,
        campaignId: f.scope.campaignId,
        secret: 'PRIVATE CLEANUP TEXT',
      });
  for (const name of recovery)
    for (let n = 0; n < 27; n++)
      batch.set(admin.doc(`users/${uid}/${name}/cleanup-${n}`), {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: f.scope.campaignId,
        fingerprint: 'PRIVATE HASH',
        request: { body: 'PRIVATE BODY' },
      });
  await batch.commit();
  const other = await setup('cleanup-other');
  const otherItem = await save(other, 'cleanup-other-item');
  const deletion = await startDeletion(admin, f.scope.campaignId, 'preparation-v4'),
    path = `users/${uid}/campaignDeletions/${deletion.result.progress.deletionId}`;
  assert.equal((await admin.doc(path).get()).data().cleanupVersion, 4);
  await assert.rejects(
    f.api.saveCampaignPreparationItem(uid, saved.input),
    reason('campaign-deleting'),
  );
  await finishDeletion(deletion.service, deletion.result.progress, 'preparation-cleanup');
  for (const name of children)
    assert.equal(
      (await admin.collection(`campaigns/${f.scope.campaignId}/${name}`).limit(1).get()).empty,
      true,
    );
  for (const name of recovery) {
    const rows = (
      await admin
        .collection(`users/${uid}/${name}`)
        .where('campaignId', '==', f.scope.campaignId)
        .get()
    ).docs;
    assert.ok(rows.length >= 27);
    for (const row of rows)
      assert.deepEqual(row.data(), {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: f.scope.campaignId,
        deletionId: deletion.result.progress.deletionId,
        state: 'deleted-campaign',
      });
  }
  assert.equal(
    (await get(other, otherItem.input.itemId, 1)).item.body.text,
    otherItem.input.body.text,
  );
  assert.equal('cleanupVersion' in (await admin.doc(path).get()).data(), false);
  for (const [version, recoveryMaximum, childrenMaximum] of [
    [1, 3, 7],
    [2, 4, 9],
    [3, 6, 11],
  ]) {
    const old = await setup('legacy-' + version),
      start = await startDeletion(admin, old.scope.campaignId, 'legacy-delete-' + version),
      ref = admin.doc(`users/${uid}/campaignDeletions/${start.result.progress.deletionId}`),
      record = (await ref.get()).data();
    for (const [phase, maximum] of [
      ['recovery', recoveryMaximum],
      ['campaign-children', childrenMaximum],
    ]) {
      const checkpoint = {
        ...record,
        cleanupVersion: version,
        phase,
        part: maximum,
        certified: deletionPhases.slice(0, deletionPhases.indexOf(phase)),
      };
      assert.equal(owned(checkpoint, uid, record.deletionId).part, maximum);
      assert.throws(() => owned({ ...checkpoint, part: maximum + 1 }, uid, record.deletionId));
    }
    const marker = admin.doc(`campaigns/${old.scope.campaignId}/preparationItems/v4-only`);
    await marker.set({ v4Only: true });
    record.cleanupVersion = version;
    if (version === 1) delete record.cleanupVersion;
    await ref.set(record);
    await finishDeletion(start.service, start.result.progress, 'legacy-finish-' + version);
    assert.deepEqual((await marker.get()).data(), { v4Only: true });
  }
});
