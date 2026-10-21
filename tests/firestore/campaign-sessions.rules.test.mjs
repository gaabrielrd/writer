import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, limit } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createCampaignSessionsService } from '../../functions/src/campaignSessions.mjs';
import { comparisonFixture, uid } from '../../functions/test/helpers/campaignComparison.mjs';
import { startDeletion, finishDeletion } from '../../functions/test/helpers/campaignDeletion.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-campaign-sessions-tests';
const op = (name) => 'campaign-session-sdk-' + name;
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
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
async function independent(name = 'table') {
  const studio = createStudioService({ db: admin }),
    service = createCampaignSessionsService({ db: admin });
  const campaign = await studio.createCampaign(uid, {
    operationId: op(name),
    title: 'Mesa privada ' + name,
  });
  const page = await service.listCampaignSessions(uid, { campaignId: campaign.id });
  return {
    studio,
    service,
    campaign,
    scope: { campaignId: campaign.id, campaignToken: page.campaignToken },
  };
}
function create(f, name, extra = {}) {
  const sessionId = op(name);
  return {
    ...f.scope,
    sessionId,
    operationId: sessionId,
    expectedRevision: 0,
    title: 'Sessão ' + name,
    scheduledDate: null,
    status: 'planned',
    summary: '  Preparação 🐉\nTexto literal <b>privado</b>  ',
    ...extra,
  };
}
const reason = (value) => ({ details: { reason: value } });
const sessionPath = (f, id) => `campaigns/${f.scope.campaignId}/sessions/${id}`;
const controlPath = (f) => `campaigns/${f.scope.campaignId}/sessionState/current`;

test('SDK sessões: autorização privada, regras diretas e token da encarnação sem consultar origem', async () => {
  const f = await independent(),
    request = create(f, 'private');
  await f.service.saveCampaignSession(uid, request);
  for (const identity of ['', 'other']) {
    await assert.rejects(f.service.listCampaignSessions(identity, { campaignId: f.campaign.id }));
    await assert.rejects(
      f.service.getCampaignSession(identity, { ...f.scope, sessionId: request.sessionId }),
    );
    await assert.rejects(f.service.saveCampaignSession(identity, request));
    await assert.rejects(
      f.service.moveCampaignSession(identity, {
        ...f.scope,
        sessionId: request.sessionId,
        operationId: op('foreign-move'),
        expectedRevision: 1,
        expectedCollectionRevision: 1,
        direction: 'up',
      }),
    );
    await assert.rejects(
      f.service.deleteCampaignSession(identity, {
        ...f.scope,
        sessionId: request.sessionId,
        operationId: op('foreign-delete'),
        expectedRevision: 1,
      }),
    );
  }
  for (const client of [
    environment.authenticatedContext(uid).firestore(),
    environment.authenticatedContext('other').firestore(),
    environment.unauthenticatedContext().firestore(),
  ]) {
    for (const path of [
      sessionPath(f, request.sessionId),
      controlPath(f),
      `users/${uid}/campaignSessionOperations/${request.operationId}`,
    ]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { ownerId: uid }));
    }
    for (const path of [
      `campaigns/${f.campaign.id}/sessions`,
      `campaigns/${f.campaign.id}/sessionState`,
      `users/${uid}/campaignSessionOperations`,
    ])
      await assertFails(getDocs(query(collection(client, path), limit(25))));
  }
  const before = (await admin.doc('campaigns/' + f.campaign.id).get()).data();
  await admin.doc('campaigns/' + f.campaign.id).delete();
  await admin.doc('campaigns/' + f.campaign.id).create(before);
  const fresh = await f.service
    .listCampaignSessions(uid, { campaignId: f.campaign.id })
    .catch((e) => e);
  assert.equal(
    fresh.details.reason,
    'campaign-changed',
    'o controle antigo não é adotado pela raiz recriada',
  );
  await assert.rejects(f.service.saveCampaignSession(uid, request), reason('campaign-changed'));
});

test('SDK sessões: ordem manual troca duas revisões, preserva texto e recusa draft vizinho antigo sem recibo parcial', async () => {
  const f = await independent(),
    a = create(f, 'a', { scheduledDate: '2000-02-29' }),
    b = create(f, 'b', { scheduledDate: '0001-01-01' });
  const first = await f.service.saveCampaignSession(uid, a),
    second = await f.service.saveCampaignSession(uid, b);
  const page = await f.service.listCampaignSessions(uid, { campaignId: f.campaign.id });
  assert.deepEqual(
    page.items.map((i) => i.id),
    [a.sessionId, b.sessionId],
  );
  assert.equal(
    page.items.some((i) => Object.hasOwn(i, 'summary')),
    false,
  );
  const movedInput = {
    ...f.scope,
    sessionId: b.sessionId,
    operationId: op('move-b-up'),
    expectedRevision: 1,
    expectedCollectionRevision: page.collectionRevision,
    direction: 'up',
  };
  const moved = await f.service.moveCampaignSession(uid, movedInput);
  assert.equal(moved.receipt.revision, 2);
  assert.equal(moved.receipt.collectionRevision, page.collectionRevision + 1);
  const after = await f.service.listCampaignSessions(uid, { campaignId: f.campaign.id });
  assert.deepEqual(
    after.items.map((i) => [i.id, i.revision]),
    [
      [b.sessionId, 2],
      [a.sessionId, 2],
    ],
  );
  for (const original of [first.session, second.session]) {
    const current = (
      await f.service.getCampaignSession(uid, { ...f.scope, sessionId: original.id })
    ).session;
    assert.equal(current.summary, original.summary);
    assert.equal(current.scheduledDate, original.scheduledDate);
  }
  const stale = {
    ...a,
    operationId: op('draft-after-neighbor-move'),
    expectedRevision: 1,
    summary: 'Rascunho antigo que não deve sobrescrever',
  };
  await assert.rejects(f.service.saveCampaignSession(uid, stale), reason('revision-conflict'));
  assert.equal(
    (await admin.doc(`users/${uid}/campaignSessionOperations/${stale.operationId}`).get()).exists,
    false,
  );
  const boundary = {
    ...movedInput,
    operationId: op('boundary'),
    expectedRevision: 2,
    expectedCollectionRevision: after.collectionRevision,
  };
  await assert.rejects(f.service.moveCampaignSession(uid, boundary), reason('order-boundary'));
  assert.equal(
    (await admin.doc(`users/${uid}/campaignSessionOperations/${boundary.operationId}`).get())
      .exists,
    false,
  );
  assert.deepEqual(await f.service.moveCampaignSession(uid, movedInput), moved);
});

test('SDK sessões: confirmação histórica conserva recibo, não devolve texto posterior e tombstone não recria ID', async () => {
  const f = await independent(),
    request = create(f, 'history'),
    initial = await f.service.saveCampaignSession(uid, request);
  const newer = await f.service.saveCampaignSession(uid, {
    ...request,
    operationId: op('edit-history'),
    expectedRevision: 1,
    summary: 'Versão posterior preservada',
    status: 'completed',
    scheduledDate: '0099-12-31',
  });
  const rawBefore = (await admin.doc(sessionPath(f, request.sessionId)).get()).data();
  const historical = await f.service.saveCampaignSession(uid, request);
  assert.deepEqual(historical.receipt, initial.receipt);
  assert.equal(historical.session, null);
  assert.equal(historical.collectionRevision, newer.collectionRevision);
  assert.deepEqual((await admin.doc(sessionPath(f, request.sessionId)).get()).data(), rawBefore);
  await assert.rejects(
    f.service.saveCampaignSession(uid, { ...request, summary: 'Pedido divergente' }),
    { code: 'invalid-argument' },
  );
  const receipt = (
    await admin.doc(`users/${uid}/campaignSessionOperations/${request.operationId}`).get()
  ).data();
  for (const field of ['title', 'summary', 'scheduledDate', 'request', 'result'])
    assert.equal(Object.hasOwn(receipt, field), false);
  const del = {
    ...f.scope,
    sessionId: request.sessionId,
    operationId: op('delete-history'),
    expectedRevision: 2,
  };
  const deleted = await f.service.deleteCampaignSession(uid, del);
  assert.equal(deleted.session, null);
  assert.equal(deleted.receipt.revision, 3);
  assert.deepEqual(await f.service.deleteCampaignSession(uid, del), deleted);
  const tombstone = (await admin.doc(sessionPath(f, request.sessionId)).get()).data();
  for (const field of ['title', 'summary', 'scheduledDate', 'status'])
    assert.equal(Object.hasOwn(tombstone, field), false);
  await assert.rejects(
    f.service.saveCampaignSession(uid, {
      ...request,
      operationId: op('resurrect'),
      expectedRevision: 3,
    }),
    { code: 'not-found' },
  );
  assert.equal(
    (await f.service.getCampaignSession(uid, { ...f.scope, sessionId: request.sessionId })).session,
    null,
  );
});

test('SDK sessões: cursor vinculado, calendário real, controle perdido e recibo corrompido falham sem escrita', async () => {
  const f = await independent(),
    other = await independent('other');
  const a = create(f, 'page-a'),
    b = create(f, 'page-b');
  await f.service.saveCampaignSession(uid, a);
  await f.service.saveCampaignSession(uid, b);
  const page = await f.service.listCampaignSessions(uid, { campaignId: f.campaign.id, limit: 1 });
  assert.ok(page.nextCursor);
  assert.equal(
    (await f.service.listCampaignSessions(uid, { ...f.scope, cursor: page.nextCursor, limit: 1 }))
      .items[0].id,
    b.sessionId,
  );
  await assert.rejects(
    f.service.listCampaignSessions(uid, { ...other.scope, cursor: page.nextCursor }),
    reason('cursor-invalidated'),
  );
  await f.service.saveCampaignSession(uid, {
    ...a,
    operationId: op('change-page'),
    expectedRevision: 1,
    title: 'Atualizada',
  });
  await assert.rejects(
    f.service.listCampaignSessions(uid, { ...f.scope, cursor: page.nextCursor }),
    reason('cursor-invalidated'),
  );
  for (const [index, patch] of [
    { scheduledDate: '1900-02-29' },
    { scheduledDate: '2026-04-31' },
    { scheduledDate: '0000-01-01' },
    { summary: '\ud800' },
    { status: 'running' },
  ].entries())
    await assert.rejects(f.service.saveCampaignSession(uid, create(f, 'invalid-' + index, patch)), {
      code: 'invalid-argument',
    });
  const receiptPath = `users/${uid}/campaignSessionOperations/${b.operationId}`;
  await admin.doc(receiptPath).update({ confirmationHash: '0'.repeat(64) });
  await assert.rejects(f.service.saveCampaignSession(uid, b), reason('session-inconsistent'));
  for (const [sessionId, expectedRevision] of [
    [a.sessionId, 2],
    [b.sessionId, 1],
  ])
    await f.service.deleteCampaignSession(uid, {
      ...f.scope,
      sessionId,
      operationId: op('only-tombstone-' + sessionId),
      expectedRevision,
    });
  assert.equal(
    (await admin.collection(`campaigns/${f.campaign.id}/sessions`).get()).docs.every(
      (doc) => doc.data().deleted,
    ),
    true,
  );
  await admin.doc(controlPath(f)).delete();
  await assert.rejects(
    f.service.listCampaignSessions(uid, { campaignId: f.campaign.id }),
    reason('session-inconsistent'),
  );
  await assert.rejects(
    f.service.saveCampaignSession(uid, create(f, 'no-control')),
    reason('session-inconsistent'),
  );
});

test('SDK sessões: preparação própria sobrevive origem revogada; C4 limpa mais25, saneia recibos e v1 permanece retomável', async () => {
  const captured = await comparisonFixture(admin),
    service = createCampaignSessionsService({ db: admin });
  const page = await service.listCampaignSessions(uid, { campaignId: captured.campaign.id });
  const f = { service, scope: { campaignId: page.campaignId, campaignToken: page.campaignToken } };
  const other = await independent('survivor'),
    otherRequest = create(other, 'surviving-session');
  await other.service.saveCampaignSession(uid, otherRequest);
  for (let i = 0; i < 27; i++) await service.saveCampaignSession(uid, create(f, 'cleanup-' + i));
  await admin.doc('adventures/' + captured.campaign.provenance.adventureId).delete();
  const visible = await service.listCampaignSessions(uid, { campaignId: f.scope.campaignId });
  assert.equal(visible.items.length, 25);
  assert.ok(visible.nextCursor);
  assert.equal(
    (await service.getCampaignSession(uid, { ...f.scope, sessionId: op('cleanup-0') })).session
      .summary,
    create(f, 'cleanup-0').summary,
  );
  const d = await startDeletion(admin, f.scope.campaignId, 'sessions-v2-delete');
  assert.equal(
    (await admin.doc(`users/${uid}/campaignDeletions/${d.result.progress.deletionId}`).get()).data()
      .cleanupVersion,
    4,
  );
  await assert.rejects(service.saveCampaignSession(uid, create(f, 'cleanup-0')), {
    code: 'failed-precondition',
  });
  await assert.rejects(service.listCampaignSessions(uid, { campaignId: f.scope.campaignId }), {
    code: 'failed-precondition',
  });
  await finishDeletion(d.service, d.result.progress, 'sessions-v2');
  for (const name of ['sessions', 'sessionState'])
    assert.equal(
      (await admin.collection(`campaigns/${f.scope.campaignId}/${name}`).limit(1).get()).empty,
      true,
    );
  const terminals = (
    await admin
      .collection(`users/${uid}/campaignSessionOperations`)
      .where('campaignId', '==', f.scope.campaignId)
      .get()
  ).docs;
  assert.equal(terminals.length, 27);
  for (const terminal of terminals)
    for (const field of ['summary', 'title', 'scheduledDate', 'receipt', 'request', 'result'])
      assert.equal(Object.hasOwn(terminal.data(), field), false);
  assert.equal(
    (
      await other.service.getCampaignSession(uid, {
        ...other.scope,
        sessionId: otherRequest.sessionId,
      })
    ).session.summary,
    otherRequest.summary,
  );
  const legacy = await independent('v1'),
    old = await startDeletion(admin, legacy.campaign.id, 'sessions-v1-delete');
  const ref = admin.doc(`users/${uid}/campaignDeletions/${old.result.progress.deletionId}`),
    row = (await ref.get()).data();
  delete row.cleanupVersion;
  await ref.set(row);
  await assert.rejects(legacy.service.saveCampaignSession(uid, create(legacy, 'v1-late')), {
    code: 'failed-precondition',
  });
  await finishDeletion(old.service, old.result.progress, 'sessions-v1');
  assert.equal((await admin.doc('campaigns/' + legacy.campaign.id).get()).exists, false);
});
