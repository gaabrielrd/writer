import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignPreparationService } from '../src/campaignPreparation.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignDeletionService } from '../src/campaignDeletion.mjs';
import { validBody, statuses } from '../src/campaignPreparationContracts.mjs';
const uid = 'author',
  campaignId = 'campaign-preparation-independent',
  path = 'campaigns/' + campaignId;
const op = (name) => 'preparation-operation-' + name;
const reason = (name) => (error) => error.details?.reason === name;
async function fixture() {
  const f = studioDb();
  const studio = createStudioService({ db: f.db, now: () => 100 });
  await studio.createCampaign(uid, { operationId: campaignId, title: 'Mesa' });
  const api = createCampaignPreparationService({ db: f.db, now: () => 200 });
  const initial = await api.listCampaignPreparationItems(uid, {
    campaignId,
    kind: 'clue',
    view: 'all',
  });
  const scope = { campaignId, campaignToken: initial.campaignToken };
  const sessions = createCampaignSessionsService({ db: f.db, now: () => 150 });
  async function session(name) {
    const id = op('session-' + name);
    await sessions.saveCampaignSession(uid, {
      ...scope,
      sessionId: id,
      operationId: id,
      expectedRevision: 0,
      title: 'Sessão',
      scheduledDate: null,
      status: 'planned',
      summary: 'Preparação S1 própria',
    });
    return { ...scope, sessionId: id, expectedSessionRevision: 1 };
  }
  return { ...f, api, studio, scope, sessions, session };
}
const saveInput = (f, name, collection = 0, extra = {}) => ({
  ...f.scope,
  operationId: op(name),
  itemId: op(name),
  expectedRevision: 0,
  expectedItemCollectionRevision: collection,
  kind: 'clue',
  title: '  Minha pista  ',
  status: 'pending',
  body: { text: '  Segredo 🐉\n', condition: 'Ao investigar', recipient: 'Anotação particular' },
  ...extra,
});
const save = (f, name, collection = 0, extra) =>
  f.api.saveCampaignPreparationItem(uid, saveInput(f, name, collection, extra));
const list = (f, extra) =>
  f.api.listCampaignPreparationItems(uid, { ...f.scope, kind: 'clue', view: 'all', ...extra });
const get = (f, itemId, expectedRevision = 1) =>
  f.api.getCampaignPreparationItem(uid, { ...f.scope, itemId, expectedRevision });
const addInput = (f, session, name, itemId, collection = 0, expectedItemRevision = 1) => ({
  ...session,
  operationId: op(name),
  linkId: op(name),
  expectedRevision: 0,
  expectedLinkCollectionRevision: collection,
  itemId,
  expectedItemRevision,
});
const add = (f, session, name, itemId, collection, revision) =>
  f.api.addCampaignSessionPreparationLink(
    uid,
    addInput(f, session, name, itemId, collection, revision),
  );
const links = (f, session, extra) =>
  f.api.listCampaignSessionPreparationLinks(uid, { ...session, ...extra });

test('own text is exact, lists and receipts omit prose, bootstrap and historical replay remain metadata-only', async () => {
  const f = await fixture(),
    request = saveInput(f, 'first');
  const result = await f.api.saveCampaignPreparationItem(uid, request);
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.receipt.itemCollectionRevision, 1);
  assert.deepEqual((await get(f, request.itemId)).item.body, request.body);
  assert.equal((await get(f, request.itemId)).item.title, 'Minha pista');
  assert.deepEqual(
    await f.api.saveCampaignPreparationItem(uid, {
      ...request,
      body: {
        recipient: request.body.recipient,
        text: request.body.text,
        condition: request.body.condition,
      },
    }),
    result,
  );
  const before = structuredClone([...f.records]);
  const page = await list(f);
  assert.equal(page.items.length, 1);
  assert.deepEqual(Object.keys(page.items[0]), [
    'id',
    'kind',
    'revision',
    'order',
    'title',
    'status',
    'createdAt',
    'updatedAt',
  ]);
  assert.equal(JSON.stringify(page).includes('Segredo'), false);
  assert.equal(JSON.stringify(result).includes('Segredo'), false);
  assert.deepEqual([...f.records], before);
  await save(f, 'edit', 1, {
    itemId: request.itemId,
    expectedRevision: 1,
    status: 'handled',
    body: { text: 'Reescrita', condition: '', recipient: '' },
  });
  assert.deepEqual(await f.api.saveCampaignPreparationItem(uid, request), result);
  assert.deepEqual(
    await f.api.resolveCampaignPreparationOperation(uid, {
      action: 'save-item',
      request,
      intent: 'cancel',
    }),
    result,
  );
  assert.equal((await get(f, request.itemId, 2)).item.body.text, 'Reescrita');
  await assert.rejects(get(f, request.itemId), reason('revision-conflict'));
});

test('all quest states and clue handling derive pending filters, type cannot change and create starts explicitly', async () => {
  const f = await fixture();
  const input = saveInput(f, 'quest', 0, {
    kind: 'quest',
    status: 'available',
    body: { description: 'Missão', consequences: 'Consequências possíveis' },
  });
  await f.api.saveCampaignPreparationItem(uid, input);
  for (let n = 0; n < statuses.quest.length; n++) {
    const status = statuses.quest[n];
    if (n)
      await save(f, 'quest-edit-' + n, n, {
        itemId: input.itemId,
        expectedRevision: n,
        kind: 'quest',
        status,
        body: input.body,
      });
    const pending = await list(f, { kind: 'quest', view: 'pending' });
    assert.equal(pending.items.length, ['available', 'active'].includes(status) ? 1 : 0);
  }
  await save(f, 'quest-reopen', 5, {
    itemId: input.itemId,
    expectedRevision: 5,
    kind: 'quest',
    status: 'available',
    body: input.body,
  });
  assert.equal((await list(f, { kind: 'quest', view: 'pending' })).items.length, 1);
  await assert.rejects(save(f, 'change-kind', 6, { itemId: input.itemId, expectedRevision: 6 }), {
    code: 'invalid-argument',
  });
  await assert.rejects(save(f, 'bad-initial', 6, { status: 'handled' }), {
    code: 'invalid-argument',
  });
});

test('catalog ordering stays within kind, updates both revisions and keeps body headers exact without copying prose', async () => {
  const f = await fixture();
  await save(f, 'a');
  await save(f, 'quest', 1, {
    kind: 'quest',
    status: 'available',
    body: { description: 'Não mover', consequences: '' },
  });
  await save(f, 'b', 2);
  const result = await f.api.moveCampaignPreparationItem(uid, {
    ...f.scope,
    operationId: op('move-b'),
    itemId: op('b'),
    expectedRevision: 1,
    expectedItemCollectionRevision: 3,
    direction: 'up',
  });
  assert.equal(result.receipt.itemCollectionRevision, 4);
  assert.deepEqual(
    (await list(f)).items.map((x) => [x.id, x.order, x.revision]),
    [
      [op('b'), 1, 2],
      [op('a'), 3, 2],
    ],
  );
  assert.equal((await get(f, op('a'), 2)).item.body.text, '  Segredo 🐉\n');
  assert.equal((await get(f, op('b'), 2)).item.body.text, '  Segredo 🐉\n');
  assert.equal((await list(f, { kind: 'quest' })).items[0].order, 2);
  await assert.rejects(
    f.api.moveCampaignPreparationItem(uid, {
      ...f.scope,
      operationId: op('boundary'),
      itemId: op('b'),
      expectedRevision: 2,
      expectedItemCollectionRevision: 4,
      direction: 'up',
    }),
    reason('order-boundary'),
  );
});

test('bounded paginated metadata, kind/filter/collection cursors and global CAS reject stale edits without body reads', async () => {
  const f = await fixture();
  for (let n = 0; n < 27; n++) await save(f, 'page-' + n, n);
  const first = await list(f),
    second = await list(f, { cursor: first.nextCursor });
  assert.equal(first.items.length, 25);
  assert.equal(second.items.length, 2);
  assert.equal(second.nextCursor, null);
  assert.ok(f.reads.every((q) => q.maximum <= 51 && Array.isArray(q.fields)));
  assert.ok(f.reads.every((q) => !q.fields.includes('body')));
  for (const extra of [{ kind: 'quest' }, { view: 'pending' }])
    await assert.rejects(
      list(f, { ...extra, cursor: first.nextCursor }),
      reason('cursor-invalidated'),
    );
  const id = first.items[0].id;
  const stale = saveInput(f, 'stale', 0, { itemId: id, expectedRevision: 1 });
  const before = structuredClone([...f.records]);
  await assert.rejects(f.api.saveCampaignPreparationItem(uid, stale), reason('revision-conflict'));
  assert.deepEqual([...f.records], before);
  await save(f, 'new', 27);
  await assert.rejects(list(f, { cursor: first.nextCursor }), reason('cursor-invalidated'));
  const deniedReads = [];
  const api = createCampaignPreparationService({
    db: {
      ...f.db,
      runTransaction: (fn) =>
        f.db.runTransaction((tx) =>
          fn({
            ...tx,
            get: (ref) => {
              deniedReads.push(ref.path);
              return tx.get(ref);
            },
          }),
        ),
    },
  });
  await assert.rejects(
    api.getCampaignPreparationItem(uid, { ...f.scope, itemId: id, expectedRevision: 99 }),
    reason('revision-conflict'),
  );
  assert.equal(
    deniedReads.some((p) => p?.includes('/preparationBodies/')),
    false,
  );
});

test('campaign items are shared through independently ordered mixed links, with duplicate and stale selection guards', async () => {
  const f = await fixture(),
    a = await f.session('a'),
    b = await f.session('b');
  await save(f, 'clue');
  await save(f, 'quest', 1, {
    kind: 'quest',
    status: 'available',
    body: { description: 'Missão', consequences: '' },
  });
  const source = structuredClone(f.records.get(path + '/sessions/' + a.sessionId));
  await add(f, a, 'link-a', op('clue'));
  await add(f, a, 'link-quest', op('quest'), 1);
  await add(f, b, 'link-b', op('clue'));
  await assert.rejects(add(f, a, 'duplicate', op('clue'), 2), reason('preparation-already-linked'));
  await assert.rejects(add(f, b, 'stale-item', op('quest'), 1, 2), reason('revision-conflict'));
  await f.api.moveCampaignSessionPreparationLink(uid, {
    ...a,
    operationId: op('move-link'),
    linkId: op('link-quest'),
    expectedRevision: 1,
    expectedLinkCollectionRevision: 2,
    direction: 'up',
  });
  assert.deepEqual(
    (await links(f, a)).items.map((x) => [x.target.kind, x.revision]),
    [
      ['quest', 2],
      ['clue', 2],
    ],
  );
  assert.equal((await links(f, b)).items[0].revision, 1);
  await save(f, 'handle', 2, { itemId: op('clue'), expectedRevision: 1, status: 'handled' });
  assert.equal((await links(f, a)).items[1].target.status, 'handled');
  assert.equal((await links(f, b)).items[0].target.status, 'handled');
  assert.deepEqual(f.records.get(path + '/sessions/' + a.sessionId), source);
});

test('links bind both revision streams, deleted items are neutral/removable and deleted sessions preserve catalog text', async () => {
  const f = await fixture(),
    s = await f.session('a');
  await save(f, 'a');
  await save(f, 'b', 1);
  const request = addInput(f, s, 'link-a', op('a'));
  const receipt = await f.api.addCampaignSessionPreparationLink(uid, request);
  await add(f, s, 'link-b', op('b'), 1);
  const page = await links(f, s, { limit: 1 });
  await save(f, 'change', 2, { itemId: op('a'), expectedRevision: 1, status: 'handled' });
  await assert.rejects(links(f, s, { cursor: page.nextCursor }), reason('cursor-invalidated'));
  await f.api.deleteCampaignPreparationItem(uid, {
    ...f.scope,
    operationId: op('delete-a'),
    itemId: op('a'),
    expectedRevision: 2,
    expectedItemCollectionRevision: 3,
  });
  const row = (await links(f, s)).items[0];
  assert.deepEqual(row, {
    id: op('link-a'),
    revision: 1,
    order: 1,
    createdAt: 200,
    updatedAt: 200,
    available: false,
  });
  assert.equal(f.records.has(path + '/preparationBodies/' + op('a')), false);
  await f.api.removeCampaignSessionPreparationLink(uid, {
    ...s,
    operationId: op('unlink'),
    linkId: row.id,
    expectedRevision: row.revision,
    expectedLinkCollectionRevision: 2,
  });
  assert.equal((await links(f, s)).items.length, 1);
  await f.sessions.deleteCampaignSession(uid, {
    ...f.scope,
    sessionId: s.sessionId,
    operationId: op('delete-session'),
    expectedRevision: 1,
  });
  assert.equal((await get(f, op('b'))).item.body.text, '  Segredo 🐉\n');
  await assert.rejects(links(f, s), reason('session-unavailable'));
  assert.deepEqual(await f.api.addCampaignSessionPreparationLink(uid, request), receipt);
  assert.deepEqual(
    await f.api.resolveCampaignPreparationOperation(uid, {
      action: 'add-link',
      request,
      intent: 'cancel',
    }),
    receipt,
  );
});

test('unknown own-prose operations are fenced before target or session access, mismatch never overwrites and cancellation never echoes text', async () => {
  const f = await fixture(),
    request = saveInput(f, 'lost');
  const canceled = await f.api.resolveCampaignPreparationOperation(uid, {
    action: 'save-item',
    request,
    intent: 'cancel',
  });
  assert.deepEqual(Object.keys(canceled), [
    'schemaVersion',
    'ownerId',
    'campaignId',
    'campaignToken',
    'kind',
    'action',
    'operationId',
  ]);
  assert.equal(JSON.stringify(canceled).includes('Segredo'), false);
  assert.deepEqual(await f.api.saveCampaignPreparationItem(uid, request), canceled);
  assert.equal((await list(f)).items.length, 0);
  await assert.rejects(
    f.api.saveCampaignPreparationItem(uid, {
      ...request,
      body: { ...request.body, text: 'Outro texto' },
    }),
    { code: 'invalid-argument' },
  );
  const linkRequest = addInput(
    f,
    { ...f.scope, sessionId: op('missing-session'), expectedSessionRevision: 42 },
    'late-link',
    op('missing-item'),
  );
  const resolution = await f.api.resolveCampaignPreparationOperation(uid, {
    action: 'add-link',
    request: linkRequest,
    intent: 'cancel',
  });
  assert.deepEqual(await f.api.addCampaignSessionPreparationLink(uid, linkRequest), resolution);
  assert.equal(
    [...f.records.keys()].some((p) => p.includes('/sessionPreparationLinks/')),
    false,
  );
});

test('closed forms validate UTF-8, aggregate size, finite revisions and future fields before any write', async () => {
  const f = await fixture();
  assert.equal(
    validBody('clue', {
      text: '🐉'.repeat(50000),
      condition: '🐉'.repeat(50000),
      recipient: '🐉'.repeat(50000),
    }),
    false,
  );
  for (const extra of [
    { body: { text: '\ud800', condition: '', recipient: '' } },
    { body: { text: 'x'.repeat(150001), condition: '', recipient: '' } },
    { body: { text: 'ok', condition: '', recipient: '', extra: true } },
    { kind: 'constructor' },
    { title: '\ud800' },
    { status: 'completed' },
    { unexpected: true },
    { expectedRevision: -1 },
    { expectedRevision: NaN },
    { expectedRevision: undefined },
    { expectedItemCollectionRevision: -1 },
    { expectedItemCollectionRevision: Infinity },
  ]) {
    const before = structuredClone([...f.records]);
    await assert.rejects(save(f, 'invalid', 0, extra), { code: 'invalid-argument' });
    assert.deepEqual([...f.records], before);
  }
  await assert.rejects(
    f.api.listCampaignPreparationItems(uid, { ...f.scope, kind: 'clue', view: 'all', limit: 51 }),
    { code: 'invalid-argument' },
  );
});

test('own gates, corruption, missing controls including tombstones, duplicate receipts and overflow fail closed', async () => {
  const f = await fixture(),
    request = saveInput(f, 'one');
  await f.api.saveCampaignPreparationItem(uid, request);
  await assert.rejects(
    f.api.listCampaignPreparationItems('', { campaignId, kind: 'clue', view: 'all' }),
    { code: 'unauthenticated' },
  );
  await assert.rejects(
    f.api.getCampaignPreparationItem('other', {
      ...f.scope,
      itemId: request.itemId,
      expectedRevision: 1,
    }),
    { code: 'not-found' },
  );
  await assert.rejects(
    get({ ...f, scope: { ...f.scope, campaignToken: 'a'.repeat(64) } }, request.itemId),
    reason('campaign-changed'),
  );
  const bodyPath = path + '/preparationBodies/' + request.itemId;
  const originalBody = structuredClone(f.records.get(bodyPath));
  for (const patch of [
    { revision: 2 },
    { ownerId: 'other' },
    { body: { text: 'bad' } },
    { extra: 'private' },
  ]) {
    f.records.set(bodyPath, { ...originalBody, ...patch });
    await assert.rejects(get(f, request.itemId), reason('preparation-inconsistent'));
  }
  f.records.set(bodyPath, originalBody);
  const receiptPath = 'users/' + uid + '/campaignPreparationOperations/' + request.operationId;
  const originalReceipt = structuredClone(f.records.get(receiptPath));
  f.records.get(receiptPath).receipt.revision = 4;
  await assert.rejects(
    f.api.saveCampaignPreparationItem(uid, request),
    reason('preparation-inconsistent'),
  );
  f.records.set(receiptPath, originalReceipt);
  await f.api.deleteCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: request.itemId,
    operationId: op('delete'),
    expectedRevision: 1,
    expectedItemCollectionRevision: 1,
  });
  f.records.delete(path + '/preparationState/current');
  await assert.rejects(list(f), reason('preparation-inconsistent'));
  f.records.set(path + '/preparationState/current', {
    ...f.scope,
    schemaVersion: 1,
    ownerId: uid,
    revision: Number.MAX_SAFE_INTEGER,
    nextOrder: 2,
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    save(f, 'overflow', Number.MAX_SAFE_INTEGER),
    reason('preparation-inconsistent'),
  );
  assert.deepEqual([...f.records], before);
});

test('permanent C4 reservation gates fresh, historical and cancellation calls before own prose is read', async () => {
  const f = await fixture(),
    request = saveInput(f, 'reserved');
  await f.api.saveCampaignPreparationItem(uid, request);
  const deletion = createCampaignDeletionService({ db: f.db });
  const source = await deletion.getCampaignDeletionSource(uid, { campaignId });
  await deletion.startCampaignDeletion(uid, {
    ...f.scope,
    expectedRevision: source.revision,
    operationId: op('delete-campaign'),
  });
  for (const action of [
    () => list(f),
    () => get(f, request.itemId),
    () => f.api.saveCampaignPreparationItem(uid, request),
    () =>
      f.api.resolveCampaignPreparationOperation(uid, {
        action: 'save-item',
        request,
        intent: 'cancel',
      }),
  ])
    await assert.rejects(action(), reason('campaign-deleting'));
});

test('competing frozen saves and link additions have one CAS winner without partial bodies or duplicate links', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([save(f, 'race-a'), save(f, 'race-b')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'revision-conflict',
  );
  const item = (await list(f)).items[0];
  assert.equal([...f.records.keys()].filter((p) => p.includes('/preparationBodies/')).length, 1);
  const session = await f.session('race');
  const linking = await Promise.allSettled([
    add(f, session, 'race-link-a', item.id),
    add(f, session, 'race-link-b', item.id),
  ]);
  assert.equal(linking.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    linking.find((r) => r.status === 'rejected').reason.details.reason,
    'revision-conflict',
  );
  assert.equal((await links(f, session)).items.length, 1);
});

test('orphan body and missing linked metadata fail closed; link tombstones prevent fabricated revision zero', async () => {
  const f = await fixture();
  const request = saveInput(f, 'orphan');
  f.records.set(path + '/preparationBodies/' + request.itemId, { secret: 'Do not replace' });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.saveCampaignPreparationItem(uid, request),
    reason('preparation-inconsistent'),
  );
  assert.deepEqual([...f.records], before);
  f.records.delete(path + '/preparationBodies/' + request.itemId);
  await f.api.saveCampaignPreparationItem(uid, request);
  const s = await f.session('corruption');
  await add(f, s, 'link-corrupt', request.itemId);
  const itemPath = path + '/preparationItems/' + request.itemId;
  const metadata = structuredClone(f.records.get(itemPath));
  f.records.delete(itemPath);
  await assert.rejects(links(f, s), reason('preparation-inconsistent'));
  f.records.set(itemPath, metadata);
  await f.api.removeCampaignSessionPreparationLink(uid, {
    ...s,
    linkId: op('link-corrupt'),
    operationId: op('remove-corrupt'),
    expectedRevision: 1,
    expectedLinkCollectionRevision: 1,
  });
  f.records.delete(path + '/sessionPreparationState/' + s.sessionId);
  await assert.rejects(links(f, s), reason('preparation-inconsistent'));
});
