import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignBackupSourceService } from '../src/campaignBackupSource.mjs';
import { createCampaignBackupInventoryService } from '../src/campaignBackupInventory.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../src/campaignPreparation.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createCampaignCaptureService } from '../src/campaignCapture.mjs';
import { createCampaignDeletionService } from '../src/campaignDeletion.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { baseSourceKey, digest } from '../src/campaignBaseContracts.mjs';

const uid = 'author',
  op = (name) => 'campaign-inventory-operation-' + name;
const reason = (value) => (error) => error.details?.reason === value;
const pageChanged = reason('campaign-backup-page-changed'),
  sourceChanged = reason('campaign-backup-source-changed'),
  inconsistent = reason('campaign-backup-item-inconsistent');
const families = [
  'note',
  'session',
  'checklist',
  'preparation-item',
  'preparation-body',
  'session-reference',
  'session-reference-state',
  'session-preparation-link',
  'session-preparation-state',
];
const secretFields = [
  'title',
  'description',
  'content',
  'summary',
  'body',
  'target',
  'keyBase64',
  'url',
];
function readonly(f) {
  const forbidden = () => assert.fail('Inventory must not read full documents or write');
  return {
    doc: (path) => {
      assert.ok(
        path.startsWith(f.path + '/') ||
          path === f.path ||
          path === 'campaignDeletionReservations/' + f.id,
      );
      return { path, id: path.split('/').at(-1) };
    },
    collection: (path) => {
      assert.ok(path.startsWith(f.path + '/') && !path.slice(f.path.length + 1).includes('/'));
      return f.db.collection(path);
    },
    runTransaction: (cb) =>
      f.db.runTransaction((tx) =>
        cb({
          ...tx,
          get: (query) => {
            assert.ok(query.collectionPath, 'No full document get');
            assert.ok(query.maximum <= 26 && query.maximum >= 2);
            assert.ok(Array.isArray(query.fields) && query.fields.length > 0);
            assert.equal(query.filters.length, 0, 'Tombstones must be observed');
            assert.equal(query.orders.length, 1);
            assert.equal(query.orders[0][0], '__name__');
            for (const field of secretFields) assert.equal(query.fields.includes(field), false);
            return tx.get(query);
          },
          getAll: (...args) => {
            for (const field of secretFields)
              assert.equal(args.at(-1).fieldMask.includes(field), false);
            return tx.getAll(...args);
          },
          create: forbidden,
          update: forbidden,
          set: forbidden,
          delete: forbidden,
        }),
      ),
  };
}
async function fixture(original = false) {
  const f = studioDb();
  f.id = op('campaign');
  f.studio = createStudioService({ db: f.db, now: () => 100 });
  if (!original) await f.studio.createCampaign(uid, { operationId: f.id, title: 'PRIVATE ROOT' });
  else {
    f.adventureId = op('adventure');
    await f.studio.createAdventure(uid, {
      operationId: f.adventureId,
      title: 'PRIVATE ORIGINAL',
      universeId: null,
    });
    const scenes = createScenesService({ db: f.db, now: () => 150 }),
      scene = await scenes.createScene(uid, {
        target: { kind: 'adventure', id: f.adventureId },
        operationId: op('scene'),
        title: 'PRIVATE SCENE',
        parentId: null,
        content: '<p>PRIVATE CONTENT</p>',
        planning: { objective: 'PRIVATE OBJECTIVE' },
      });
    f.sceneKey = baseSourceKey({ kind: 'scene', adventureId: f.adventureId, id: scene.scene.id });
    const capture = createCampaignCaptureService({ db: f.db, assets: {}, now: () => 200 }),
      source = await capture.getCampaignCaptureSource(uid, { adventureId: f.adventureId });
    let p = await capture.startCampaignCapture(uid, {
      operationId: op('capture'),
      adventureId: f.adventureId,
      expectedSourceToken: source.sourceToken,
      title: 'PRIVATE TABLE',
      description: '',
      universeId: null,
    });
    for (let count = 0; p.state === 'preparing' && count < 100; count++)
      p = await capture.advanceCampaignCapture(uid, {
        captureId: p.captureId,
        expectedCheckpoint: p.checkpoint,
        operationId: digest({ captureId: p.captureId, checkpoint: p.checkpoint }),
      });
    assert.equal(p.state, 'prepared');
    const active = await capture.activateCampaignCapture(uid, {
      captureId: p.captureId,
      expectedCheckpoint: p.checkpoint,
      operationId: op('activate'),
    });
    assert.equal(active.kind, 'activated');
    f.id = active.campaign.id;
  }
  f.path = 'campaigns/' + f.id;
  f.notes = createCampaignNotesService({ db: f.db, now: () => 300 });
  f.sessions = createCampaignSessionsService({ db: f.db, now: () => 300 });
  f.preparation = createCampaignPreparationService({ db: f.db, now: () => 300 });
  f.references = createCampaignSessionReferencesService({ db: f.db, now: () => 300 });
  f.progress = createWorkProgressService({ db: f.db, now: () => 300 });
  const initial = await f.sessions.listCampaignSessions(uid, { campaignId: f.id });
  f.scope = { campaignId: f.id, campaignToken: initial.campaignToken };
  const db = readonly(f);
  f.source = createCampaignBackupSourceService({ db });
  f.api = createCampaignBackupInventoryService({ db });
  await refresh(f);
  return f;
}
async function refresh(f) {
  f.sourceToken = (await f.source.getCampaignBackupSource(uid, { campaignId: f.id })).sourceToken;
}
const request = (f, family, extra = {}) => ({
  campaignId: f.id,
  sourceToken: f.sourceToken,
  family,
  ...extra,
});
const list = (f, family, extra = {}) =>
  f.api.listCampaignBackupOwnInventory(uid, request(f, family, extra));
async function note(f, name) {
  const id = op(name);
  await f.notes.saveCampaignNote(uid, {
    ...f.scope,
    noteId: id,
    operationId: id,
    expectedRevision: 0,
    title: 'PRIVATE NOTE',
    content: 'PRIVATE OWN TEXT 🐉\n  ',
  });
  return id;
}
async function session(f, name) {
  const id = op(name);
  await f.sessions.saveCampaignSession(uid, {
    ...f.scope,
    sessionId: id,
    operationId: id,
    expectedRevision: 0,
    title: 'PRIVATE SESSION',
    summary: 'PRIVATE SUMMARY',
    status: 'planned',
    scheduledDate: null,
  });
  return id;
}
async function preparation(f, name, kind = 'clue') {
  const id = op(name);
  await f.preparation.saveCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: id,
    operationId: id,
    expectedRevision: 0,
    expectedItemCollectionRevision:
      f.records.get(f.path + '/preparationState/current')?.revision ?? 0,
    kind,
    title: 'PRIVATE ITEM',
    status: kind === 'clue' ? 'pending' : 'available',
    body:
      kind === 'clue'
        ? { text: 'PRIVATE CLUE', condition: 'PRIVATE CONDITION', recipient: 'PRIVATE RECIPIENT' }
        : { description: 'PRIVATE QUEST', consequences: 'PRIVATE CONSEQUENCES' },
  });
  return id;
}
async function link(f, name, sessionId, itemId) {
  const id = op(name);
  await f.preparation.addCampaignSessionPreparationLink(uid, {
    ...f.scope,
    sessionId,
    expectedSessionRevision: 1,
    linkId: id,
    operationId: id,
    expectedRevision: 0,
    expectedLinkCollectionRevision:
      f.records.get(f.path + '/sessionPreparationState/' + sessionId)?.revision ?? 0,
    itemId,
    expectedItemRevision: f.records.get(f.path + '/preparationItems/' + itemId).revision,
  });
  return id;
}
async function reference(f, name, sessionId) {
  const scope = { ...f.scope, sessionId, expectedSessionRevision: 1 },
    view = await f.references.listCampaignSessionReferences(uid, { ...scope, view: 'references' }),
    id = op(name);
  await f.references.addCampaignSessionReference(uid, {
    ...scope,
    referenceId: id,
    operationId: id,
    expectedReferenceCollectionRevision: view.referenceCollectionRevision,
    sourceContext: view.sourceContext,
    target: { kind: 'scene', sourceKey: f.sceneKey },
  });
  return id;
}
async function richFixture() {
  const f = await fixture(true);
  f.noteId = await note(f, 'note');
  f.sessionId = await session(f, 'session');
  f.itemId = await preparation(f, 'clue');
  f.questId = await preparation(f, 'quest', 'quest');
  f.linkId = await link(f, 'link', f.sessionId, f.itemId);
  f.referenceId = await reference(f, 'reference', f.sessionId);
  await f.progress.createWorkChecklistItem(uid, {
    target: { kind: 'campaign', id: f.id },
    operationId: op('checklist'),
    title: 'PRIVATE TASK',
  });
  await refresh(f);
  return f;
}

test('rich native campaign inventories all nine families, without prose or writes and with closed responses', async () => {
  const f = await richFixture(),
    before = structuredClone([...f.records]);
  f.reads.length = 0;
  f.metadataReads.length = 0;
  const expected = {
    note: 1,
    session: 1,
    checklist: 1,
    'preparation-item': 2,
    'preparation-body': 2,
    'session-reference': 1,
    'session-reference-state': 1,
    'session-preparation-link': 1,
    'session-preparation-state': 1,
  };
  for (const family of families) {
    const result = await list(f, family);
    assert.deepEqual(Object.keys(result).sort(), [
      'campaignId',
      'family',
      'items',
      'nextCursor',
      'pageToken',
      'schemaVersion',
      'sourceToken',
    ]);
    assert.equal(result.family, family);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.items.length, expected[family]);
    assert.equal(result.nextCursor, null);
    assert.match(result.pageToken, /^[a-f0-9]{64}$/);
    for (const item of result.items) {
      assert.deepEqual(Object.keys(item).sort(), ['id', 'itemToken']);
      assert.match(item.itemToken, /^[a-f0-9]{64}$/);
    }
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.deepEqual(await list(f, family, { expectedPageToken: result.pageToken }), result);
  }
  assert.deepEqual([...f.records], before);
  assert.equal(f.reads.length, 18);
  assert.ok(f.reads.every((q) => q.maximum === 26 && q.filters === undefined));
});

test('empty independent campaign has canonical terminal pages without creating absent controls', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  for (const family of families) {
    const page = await list(f, family, { limit: 1 });
    assert.deepEqual(page.items, []);
    assert.equal(page.nextCursor, null);
    assert.deepEqual(await list(f, family, { limit: 1, expectedPageToken: page.pageToken }), page);
  }
  assert.deepEqual([...f.records], before);
});

test('61 native notes paginate without a project-size cap, duplicates, prose or unbounded query', async () => {
  const f = await fixture();
  for (let index = 0; index < 61; index++) await note(f, 'note-' + String(index).padStart(3, '0'));
  await refresh(f);
  f.reads.length = 0;
  const ids = [],
    cursors = new Set();
  let cursor = null,
    pages = 0;
  do {
    const page = await list(f, 'note', { limit: 3, cursor });
    ids.push(...page.items.map((item) => item.id));
    pages++;
    if (page.nextCursor) {
      assert.equal(cursors.has(page.nextCursor), false);
      cursors.add(page.nextCursor);
    }
    cursor = page.nextCursor;
  } while (cursor !== null);
  assert.equal(ids.length, 61);
  assert.equal(new Set(ids).size, 61);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(pages, 21);
  assert.ok(f.reads.every((q) => q.maximum === 4 && Array.isArray(q.fields)));
});

test('closed requests reject invalid families, limits, hashes, cursors and callers before any I/O', async () => {
  let calls = 0;
  const fail = () => {
    calls++;
    assert.fail('Invalid input reached a database port');
  };
  const api = createCampaignBackupInventoryService({
    db: { doc: fail, collection: fail, runTransaction: fail },
  });
  const base = { campaignId: op('campaign'), sourceToken: 'a'.repeat(64), family: 'note' };
  for (const patch of [
    { family: '__proto__' },
    { family: 'notes' },
    { family: '../notes' },
    { family: null },
    { limit: 0 },
    { limit: 26 },
    { limit: 1.5 },
    { limit: '2' },
    { limit: undefined },
    { sourceToken: 'A'.repeat(64) },
    { sourceToken: undefined },
    { expectedPageToken: null },
    { expectedPageToken: undefined },
    { extra: true },
    { cursor: '' },
    { cursor: [] },
    { cursor: '!!!' },
    { cursor: 'e30' },
    { cursor: Buffer.from('null').toString('base64url') },
    { cursor: 'a'.repeat(24577) },
  ])
    await assert.rejects(api.listCampaignBackupOwnInventory(uid, { ...base, ...patch }), {
      code: 'invalid-argument',
    });
  for (const actor of ['', null, 42, {}])
    await assert.rejects(api.listCampaignBackupOwnInventory(actor, base), {
      code: 'unauthenticated',
    });
  assert.equal(calls, 0);
});

test('cursor binds caller, campaign, source, family, page size and canonical encoding', async () => {
  const f = await fixture();
  await note(f, 'a');
  await note(f, 'b');
  await refresh(f);
  const first = await list(f, 'note', { limit: 1 }),
    parsed = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  for (const patch of [
    { uid: 'other' },
    { campaignId: 'other' },
    { sourceToken: 'b'.repeat(64) },
    { family: 'session' },
    { limit: 2 },
    { version: 2 },
    { after: '../other' },
    { extra: true },
  ]) {
    const cursor = Buffer.from(JSON.stringify({ ...parsed, ...patch })).toString('base64url');
    f.metadataReads.length = 0;
    f.reads.length = 0;
    await assert.rejects(list(f, 'note', { limit: 1, cursor }), { code: 'invalid-argument' });
    assert.equal(f.reads.length + f.metadataReads.length, 0);
  }
  await assert.rejects(list(f, 'note', { limit: 1, cursor: first.nextCursor + '=' }), {
    code: 'invalid-argument',
  });
  const second = await list(f, 'note', { limit: 1, cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.notEqual(first.items[0].itemToken, second.items[0].itemToken);
});

test('long native identifiers survive cursor encoding without reducing the root or item ID contract', async () => {
  const f = await fixture(),
    campaignId = '\\'.repeat(1500),
    idA = 'a'.repeat(1500),
    idB = 'b'.repeat(1500);
  f.records.set('campaigns/' + campaignId, structuredClone(f.records.get(f.path)));
  const notes = createCampaignNotesService({ db: f.db }),
    state = await notes.listCampaignNotes(uid, { campaignId });
  f.id = campaignId;
  f.path = 'campaigns/' + campaignId;
  for (const id of [idA, idB])
    f.records.set(f.path + '/notes/' + id, {
      schemaVersion: 1,
      ownerId: uid,
      campaignId,
      campaignToken: state.campaignToken,
      id,
      revision: 1,
      deleted: false,
      createdAt: 1,
      updatedAt: 1,
    });
  f.records.set(f.path + '/noteState/current', {
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
    campaignToken: state.campaignToken,
    revision: 1,
  });
  await refresh(f);
  const first = await list(f, 'note', { limit: 1 });
  assert.equal(first.items[0].id, idA);
  const next = await list(f, 'note', { limit: 1, cursor: first.nextCursor });
  assert.equal(next.items[0].id, idB);
  assert.equal(next.nextCursor, null);
});

test('actual S2 reference invalidates session and reference-page proofs while the fixed source stays identical', async () => {
  const f = await fixture(true),
    sessionId = await session(f, 's2-session');
  await refresh(f);
  const sessions = await list(f, 'session'),
    references = await list(f, 'session-reference'),
    states = await list(f, 'session-reference-state'),
    sourceToken = f.sourceToken;
  await reference(f, 's2-reference', sessionId);
  await refresh(f);
  assert.equal(f.sourceToken, sourceToken);
  for (const [family, page] of [
    ['session', sessions],
    ['session-reference', references],
    ['session-reference-state', states],
  ])
    await assert.rejects(list(f, family, { expectedPageToken: page.pageToken }), pageChanged);
  const next = await list(f, 'session');
  assert.notEqual(next.items[0].itemToken, sessions.items[0].itemToken);
});

test('actual S3 link addition, removal and new insertion invalidate per-session proofs without changing the global anchor', async () => {
  const f = await fixture(),
    sessionId = await session(f, 's3-session'),
    itemId = await preparation(f, 's3-clue');
  await refresh(f);
  const sessions = await list(f, 'session'),
    oldLinks = await list(f, 'session-preparation-link'),
    oldStates = await list(f, 'session-preparation-state'),
    sourceToken = f.sourceToken;
  const linkId = await link(f, 's3-link', sessionId, itemId);
  await refresh(f);
  assert.equal(f.sourceToken, sourceToken);
  for (const [family, page] of [
    ['session', sessions],
    ['session-preparation-link', oldLinks],
    ['session-preparation-state', oldStates],
  ])
    await assert.rejects(list(f, family, { expectedPageToken: page.pageToken }), pageChanged);
  const linked = await list(f, 'session-preparation-link');
  await f.preparation.removeCampaignSessionPreparationLink(uid, {
    ...f.scope,
    sessionId,
    expectedSessionRevision: 1,
    linkId,
    operationId: op('remove-link'),
    expectedRevision: 1,
    expectedLinkCollectionRevision: 1,
  });
  await assert.rejects(
    list(f, 'session-preparation-link', { expectedPageToken: linked.pageToken }),
    pageChanged,
  );
  assert.equal(
    (await list(f, 'session-preparation-link')).items.length,
    1,
    'Removed link remains a tombstone',
  );
});

test('deleted session and item keep their native links and controls inventory-visible without reading any origin', async () => {
  const f = await richFixture();
  await f.sessions.deleteCampaignSession(uid, {
    ...f.scope,
    sessionId: f.sessionId,
    expectedRevision: 1,
    operationId: op('delete-session'),
  });
  await f.preparation.deleteCampaignPreparationItem(uid, {
    ...f.scope,
    itemId: f.itemId,
    expectedRevision: 1,
    expectedItemCollectionRevision: 2,
    operationId: op('delete-clue'),
  });
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('adventures/' + f.adventureId)));
  await refresh(f);
  assert.equal((await list(f, 'session')).items.length, 1);
  assert.equal((await list(f, 'session-reference')).items.length, 1);
  assert.equal((await list(f, 'session-reference-state')).items.length, 1);
  assert.equal((await list(f, 'session-preparation-link')).items.length, 1);
  assert.equal((await list(f, 'session-preparation-state')).items.length, 1);
  assert.equal((await list(f, 'preparation-item')).items.length, 2);
  assert.equal(
    (await list(f, 'preparation-body')).items.length,
    1,
    'Deleted clue body was removed; quest preserved',
  );
});

test('same-data child rewrite and recreation change native proofs without relying on logical dates', async () => {
  const f = await fixture(),
    sessionId = await session(f, 'native-session'),
    itemId = await preparation(f, 'native-clue'),
    linkId = await link(f, 'native-link', sessionId, itemId);
  await refresh(f);
  const ref = f.db.doc(f.path + '/sessionPreparationLinks/' + linkId),
    value = structuredClone(f.records.get(ref.path));
  let old = await list(f, 'session-preparation-link');
  await f.db.runTransaction(async (tx) => tx.set(ref, value));
  await assert.rejects(
    list(f, 'session-preparation-link', { expectedPageToken: old.pageToken }),
    pageChanged,
  );
  old = await list(f, 'session-preparation-link');
  await f.db.runTransaction(async (tx) => tx.delete(ref));
  await f.db.runTransaction(async (tx) => tx.set(ref, value));
  await assert.rejects(
    list(f, 'session-preparation-link', { expectedPageToken: old.pageToken }),
    pageChanged,
  );
  assert.deepEqual(f.records.get(ref.path), value);
});

test('page proof covers lookahead native identity and a final empty range', async () => {
  const f = await fixture(),
    sessionId = await session(f, 'look-session'),
    itemA = await preparation(f, 'look-a'),
    itemB = await preparation(f, 'look-b');
  await link(f, 'look-link-a', sessionId, itemA);
  const linkB = await link(f, 'look-link-b', sessionId, itemB);
  await refresh(f);
  const first = await list(f, 'session-preparation-link', { limit: 1 }),
    second = await list(f, 'session-preparation-link', { limit: 1, cursor: first.nextCursor });
  assert.equal(second.nextCursor, null);
  const ref = f.db.doc(f.path + '/sessionPreparationLinks/' + linkB);
  await f.db.runTransaction(async (tx) => tx.set(ref, f.records.get(ref.path)));
  await assert.rejects(
    list(f, 'session-preparation-link', { limit: 1, expectedPageToken: first.pageToken }),
    pageChanged,
  );
  const cursorData = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  cursorData.after = op('zzzz-final-range');
  const cursor = Buffer.from(JSON.stringify(cursorData)).toString('base64url'),
    empty = await list(f, 'session-preparation-link', { limit: 1, cursor });
  assert.deepEqual(empty.items, []);
  assert.equal(empty.nextCursor, null);
  assert.deepEqual(
    await list(f, 'session-preparation-link', {
      limit: 1,
      cursor,
      expectedPageToken: empty.pageToken,
    }),
    empty,
  );
});

test('insertion behind an old cursor requires full replay and invalidates previously observed pages', async () => {
  const f = await fixture(),
    sessionId = await session(f, 'insert-session'),
    itemA = await preparation(f, 'insert-a'),
    itemB = await preparation(f, 'insert-b'),
    itemC = await preparation(f, 'insert-c');
  await link(f, 'insert-link-b', sessionId, itemB);
  await link(f, 'insert-link-c', sessionId, itemC);
  await refresh(f);
  const first = await list(f, 'session-preparation-link', { limit: 1 });
  await link(f, 'insert-link-a', sessionId, itemA);
  const following = await list(f, 'session-preparation-link', {
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(following.items[0].id, op('insert-link-c'));
  await assert.rejects(
    list(f, 'session-preparation-link', { limit: 1, expectedPageToken: first.pageToken }),
    pageChanged,
  );
  assert.equal(
    (await list(f, 'session-preparation-link', { limit: 1 })).items[0].id,
    op('insert-link-a'),
  );
});

test('wrong scope, missing parents or controls and inconsistent body headers fail explicitly without mutations', async () => {
  const cases = [
    ['note', 'notes/', { ownerId: 'foreign' }],
    ['session', 'sessions/', { campaignToken: 'b'.repeat(64) }],
    ['preparation-item', 'preparationItems/', { kind: 'foreign' }],
    ['preparation-body', 'preparationBodies/', { revision: 99 }],
    ['session-reference', 'sessionReferences/', { sessionId: 'missing' }],
    ['session-reference-state', 'sessionReferenceState/', { sessionId: 'wrong' }],
    ['session-preparation-link', 'sessionPreparationLinks/', { itemId: 'missing' }],
    ['session-preparation-state', 'sessionPreparationState/', { nextOrder: 0 }],
    ['checklist', 'workChecklist/', { completed: 'yes' }],
  ];
  for (const [family, prefix, patch] of cases) {
    const f = await richFixture(),
      row = [...f.records.keys()].find((key) => key.startsWith(f.path + '/' + prefix));
    Object.assign(f.records.get(row), patch);
    const before = structuredClone([...f.records]);
    await assert.rejects(list(f, family), inconsistent);
    assert.deepEqual([...f.records], before);
  }
  const f = await richFixture();
  f.records.delete(f.path + '/sessionReferenceState/' + f.sessionId);
  await assert.rejects(list(f, 'session-reference'), inconsistent);
  f.records.delete(f.path + '/preparationBodies/' + f.itemId);
  await assert.rejects(list(f, 'preparation-item'), inconsistent);
});

test('global changes reject the old source before the inventory query and cross-account reads stay masked', async () => {
  const f = await fixture(),
    old = f.sourceToken;
  await note(f, 'change-global');
  f.reads.length = 0;
  await assert.rejects(list(f, 'note', { sourceToken: old }), sourceChanged);
  assert.equal(f.reads.length, 0);
  f.reads.length = 0;
  f.metadataReads.length = 0;
  await assert.rejects(f.api.listCampaignBackupOwnInventory('other', request(f, 'note')), {
    code: 'not-found',
  });
  assert.equal(f.reads.length, 0);
  assert.equal(f.metadataReads.length, 2);
});

test('C4 reservation blocks every family before reading children and masks a foreign deletion', async () => {
  const f = await richFixture(),
    deletion = createCampaignDeletionService({ db: f.db, now: () => 500 }),
    source = await deletion.getCampaignDeletionSource(uid, { campaignId: f.id });
  await deletion.startCampaignDeletion(uid, {
    ...f.scope,
    expectedRevision: source.revision,
    operationId: op('delete-campaign'),
  });
  f.reads.length = 0;
  f.metadataReads.length = 0;
  for (const family of families) await assert.rejects(list(f, family), reason('campaign-deleting'));
  assert.equal(f.reads.length, 0);
  assert.equal(f.metadataReads.length, families.length);
  await assert.rejects(
    f.api.listCampaignBackupOwnInventory('foreign', request(f, 'note')),
    (error) => {
      assert.equal(error.code, 'not-found');
      assert.equal(error.details, undefined);
      return true;
    },
  );
});

test('transaction retries and caller mutation reuse the frozen request without writes or target changes', async () => {
  const f = await fixture();
  await note(f, 'freeze');
  await refresh(f);
  const db = readonly(f);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const api = createCampaignBackupInventoryService({
    db: {
      ...db,
      runTransaction: async (cb) => {
        await gate;
        const first = await db.runTransaction(cb),
          replay = await db.runTransaction(cb);
        assert.deepEqual(first, replay);
        return replay;
      },
    },
  });
  const input = request(f, 'note', { limit: 1 }),
    before = structuredClone([...f.records]),
    pending = api.listCampaignBackupOwnInventory(uid, input);
  input.campaignId = 'foreign';
  input.family = 'session';
  input.sourceToken = 'f'.repeat(64);
  input.limit = 25;
  input.cursor = 'invalid';
  input.expectedPageToken = 'f'.repeat(64);
  release();
  const result = await pending;
  assert.equal(result.family, 'note');
  assert.equal(result.items.length, 1);
  assert.deepEqual([...f.records], before);
});

test('native timestamp corruption in a dependency refuses the proof instead of reading its body', async () => {
  const f = await richFixture();
  f.metadata.set(f.path + '/sessionPreparationState/' + f.sessionId, {
    updatedAt: 0,
    updatedAtNanoseconds: -1,
  });
  await assert.rejects(list(f, 'session'), reason('campaign-backup-source-inconsistent'));
});

test('native parent recreation invalidates a link proof even when both logical records are unchanged', async () => {
  const f = await fixture(),
    sessionId = await session(f, 'parent-session'),
    itemId = await preparation(f, 'parent-clue');
  await link(f, 'parent-link', sessionId, itemId);
  await refresh(f);
  for (const relative of ['sessions/' + sessionId, 'preparationItems/' + itemId]) {
    const before = await list(f, 'session-preparation-link'),
      ref = f.db.doc(f.path + '/' + relative),
      data = structuredClone(f.records.get(ref.path));
    await f.db.runTransaction(async (tx) => tx.delete(ref));
    await f.db.runTransaction(async (tx) => tx.set(ref, data));
    await assert.rejects(
      list(f, 'session-preparation-link', {
        expectedPageToken: before.pageToken,
      }),
      pageChanged,
    );
    assert.deepEqual(f.records.get(ref.path), data);
  }
});

test('nonempty families cannot rely on absent global controls or inconsistent checklist counters', async () => {
  const cases = [
    ['note', 'noteState/current'],
    ['session', 'sessionState/current'],
    ['preparation-item', 'preparationState/current'],
    ['checklist', 'workProgress/current'],
  ];
  for (const [family, control] of cases) {
    const f = await richFixture();
    f.records.delete(f.path + '/' + control);
    await refresh(f);
    const before = structuredClone([...f.records]);
    await assert.rejects(list(f, family), inconsistent);
    assert.deepEqual([...f.records], before);
  }
  const f = await richFixture();
  f.records.get(f.path + '/workProgress/current').checklistCompleted = 2;
  await assert.rejects(list(f, 'checklist'), inconsistent);
});

test('query corruption cannot duplicate, reorder or inject a document from a different collection', async () => {
  const f = await fixture();
  await note(f, 'ordered-a');
  await note(f, 'ordered-b');
  await refresh(f);
  const db = readonly(f);
  for (const corrupt of [
    (docs) => [...docs].reverse(),
    (docs) => [docs[0], docs[0]],
    (docs) => [{ ...docs[0], ref: { path: 'campaigns/foreign/notes/' + docs[0].id } }],
    (docs) => [{ ...docs[0], id: '../foreign' }],
    (docs) => Array.from({ length: 27 }, () => docs[0]),
  ]) {
    const api = createCampaignBackupInventoryService({
      db: {
        ...db,
        runTransaction: (cb) =>
          db.runTransaction((tx) =>
            cb({
              ...tx,
              get: async (query) => ({ docs: corrupt((await tx.get(query)).docs) }),
            }),
          ),
      },
    });
    await assert.rejects(api.listCampaignBackupOwnInventory(uid, request(f, 'note')), inconsistent);
  }
});
