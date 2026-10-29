import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignBackupSourceService } from '../src/campaignBackupSource.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../src/campaignPreparation.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createCampaignCaptureService } from '../src/campaignCapture.mjs';
import { createCampaignDeletionService } from '../src/campaignDeletion.mjs';
import { campaignIdentityToken } from '../src/campaignIdentity.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const uid = 'author',
  campaignId = 'campaign-backup-source-native',
  path = 'campaigns/' + campaignId,
  op = (name) => 'campaign-backup-operation-' + name,
  reason = (value) => (error) => error.details?.reason === value;
const changed = reason('campaign-backup-source-changed'),
  inconsistent = reason('campaign-backup-source-inconsistent'),
  forbidden = () => assert.fail('No full reads, queries or mutations during the anchor');

function readOnlyDb(f, transform = (tx) => tx) {
  return {
    doc: f.db.doc,
    collection: forbidden,
    runTransaction: (callback) =>
      f.db.runTransaction((tx) =>
        callback(
          transform({
            ...tx,
            get: forbidden,
            set: forbidden,
            update: forbidden,
            create: forbidden,
            delete: forbidden,
          }),
        ),
      ),
  };
}
async function fixture() {
  const f = studioDb(),
    studio = createStudioService({ db: f.db, now: () => 100 });
  await studio.createCampaign(uid, {
    operationId: campaignId,
    title: 'PRIVATE TITLE',
    description: 'PRIVATE DESCRIPTION',
  });
  const token = campaignIdentityToken(uid, campaignId, await f.db.doc(path).get());
  const api = createCampaignBackupSourceService({ db: readOnlyDb(f) });
  return { ...f, studio, api, token };
}
const source = (f, extra = {}, actor = uid) =>
  f.api.getCampaignBackupSource(actor, { campaignId, ...extra });
async function control(f, name, extra = {}) {
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(path + '/' + name + '/current'), {
      schemaVersion: 1,
      ownerId: uid,
      campaignId,
      campaignToken: f.token,
      revision: 0,
      ...extra,
    }),
  );
}

test('source returns only a stable private anchor with bounded masks and no authorial data or writes', async () => {
  const f = await fixture();
  for (const name of ['noteState', 'sessionState', 'preparationState', 'loreVariantState'])
    await control(f, name, {
      ...(['sessionState', 'preparationState'].includes(name) ? { nextOrder: 1 } : {}),
      ...(name === 'loreVariantState' ? { baseId: 'a'.repeat(64) } : {}),
      content: 'PRIVATE BODY',
      summary: 'PRIVATE SUMMARY',
      keyBase64: 'PRIVATE KEY',
    });
  await control(f, 'workProgress', { content: 'PRIVATE WORK' });
  f.metadataReads.length = 0;
  f.reads.length = 0;
  const before = structuredClone([...f.records]),
    first = await source(f);
  assert.deepEqual(Object.keys(first).sort(), ['campaignId', 'schemaVersion', 'sourceToken']);
  assert.equal(first.campaignId, campaignId);
  assert.equal(first.schemaVersion, 1);
  assert.match(first.sourceToken, /^[a-f0-9]{64}$/);
  assert.deepEqual(await source(f, { expectedSourceToken: first.sourceToken }), first);
  assert.equal(JSON.stringify(first).includes('PRIVATE'), false);
  assert.deepEqual([...f.records], before);
  assert.equal(f.reads.length, 0);
  assert.equal(f.metadataReads.length, 14);
  for (const read of f.metadataReads) {
    assert.ok(
      read.path === 'campaignDeletionReservations/' + campaignId ||
        read.path === path ||
        new RegExp(
          '^' +
            path +
            '/(workProgress|noteState|sessionState|preparationState|loreVariantState)/current$',
        ).test(read.path),
    );
    assert.ok(read.fields.length > 0 && read.fields.length <= 9);
    for (const name of ['title', 'description', 'content', 'summary', 'keyBase64', 'provenance'])
      assert.equal(read.fields.includes(name), false);
  }
});

test('empty campaign anchor does not manufacture missing singleton controls', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  assert.deepEqual(await source(f), await source(f));
  assert.deepEqual([...f.records], before);
  for (const name of ['noteState', 'sessionState', 'preparationState', 'loreVariantState'])
    assert.equal(f.records.has(path + '/' + name + '/current'), false);
});

test('invalid caller, closed payload, IDs and hashes fail before any port or transaction use', async () => {
  const api = createCampaignBackupSourceService({
    db: { doc: forbidden, collection: forbidden, runTransaction: forbidden },
  });
  for (const actor of [null, undefined, '', 4, {}, new String(uid)])
    await assert.rejects(api.getCampaignBackupSource(actor, { campaignId }), {
      code: 'unauthenticated',
    });
  for (const actor of ['..', 'actor/foreign', 'x'.repeat(1501)])
    await assert.rejects(api.getCampaignBackupSource(actor, { campaignId }), {
      code: 'invalid-argument',
    });
  for (const input of [
    null,
    [],
    'text',
    {},
    { campaignId, extra: true },
    ...['', '.', '..', 'other/ID', 17, {}, 'é'.repeat(751)].map((id) => ({ campaignId: id })),
    ...[undefined, null, 'A'.repeat(64), 'f'.repeat(63), 1, new String('f'.repeat(64))].map(
      (value) => ({ campaignId, expectedSourceToken: value }),
    ),
  ])
    await assert.rejects(api.getCampaignBackupSource(uid, input), { code: 'invalid-argument' });
});

test('native document ID byte limit remains supported without a smaller backup-specific cap', async () => {
  const f = await fixture(),
    id = 'é'.repeat(750);
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc('campaigns/' + id), {
      ...f.records.get(path),
      id,
    }),
  );
  const result = await f.api.getCampaignBackupSource(uid, { campaignId: id });
  assert.equal(result.campaignId, id);
  assert.match(result.sourceToken, /^[a-f0-9]{64}$/);
});

test('missing, foreign and deleting roots stop before controls, with no source/origin leak', async () => {
  for (const patch of [null, { ownerId: 'other' }, { deleting: true }]) {
    const f = await fixture();
    if (patch === null) f.records.delete(path);
    else Object.assign(f.records.get(path), patch);
    f.metadataReads.length = 0;
    await assert.rejects(source(f), { code: 'not-found' });
    assert.deepEqual(
      f.metadataReads.map((r) => r.path),
      ['campaignDeletionReservations/' + campaignId, path],
    );
  }
  const f = await fixture();
  await assert.rejects(source(f, {}, 'stranger'), { code: 'not-found' });
});

test('invalid stored root schema or revision cannot certify an anchor', async () => {
  for (const patch of [
    { schemaVersion: 2 },
    { revision: 0 },
    { revision: -1 },
    { revision: 1.5 },
    { revision: '1' },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const f = await fixture();
    Object.assign(f.records.get(path), patch);
    f.metadataReads.length = 0;
    await assert.rejects(source(f), inconsistent);
    assert.equal(f.metadataReads.length, 2);
  }
});

test('timestamp failures, including precision and update-before-birth, cannot produce a token', async () => {
  for (const metadata of [
    { createdAt: -1000 },
    { updatedAt: -1000 },
    { createdAt: 0, createdAtNanoseconds: -1 },
    { updatedAt: 0, updatedAtNanoseconds: 1e9 },
    { updatedAtNanoseconds: 1.2 },
    { createdAt: NaN },
    { createdAt: 30000, updatedAt: 20000 },
    { createdAt: 1000, updatedAt: 1000, createdAtNanoseconds: 2, updatedAtNanoseconds: 1 },
  ]) {
    const f = await fixture();
    f.metadata.set(path, metadata);
    await assert.rejects(source(f), inconsistent);
  }
  const f = await fixture();
  const api = createCampaignBackupSourceService({
    db: readOnlyDb(f, (tx) => ({
      ...tx,
      getAll: async (...args) => {
        const snapshots = await tx.getAll(...args);
        if (args[0].path === path) return [{ ...snapshots[0], createTime: null }];
        return snapshots;
      },
    })),
  });
  await assert.rejects(api.getCampaignBackupSource(uid, { campaignId }), inconsistent);
});

test('fixed controls validate campaign scope, native incarnation, revisions and family fields', async () => {
  for (const name of ['noteState', 'sessionState', 'preparationState', 'loreVariantState']) {
    const good = {
      ...(['sessionState', 'preparationState'].includes(name) ? { nextOrder: 1 } : {}),
      ...(name === 'loreVariantState' ? { baseId: 'a'.repeat(64) } : {}),
    };
    const invalid = [
      { schemaVersion: 2 },
      { ownerId: 'other' },
      { campaignId: 'other' },
      { campaignToken: 'b'.repeat(64) },
      { revision: -1 },
      { revision: '0' },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      ...(['sessionState', 'preparationState'].includes(name)
        ? [{ nextOrder: 0 }, { nextOrder: 1.5 }, { nextOrder: undefined }]
        : []),
      ...(name === 'loreVariantState' ? [{ baseId: null }, { baseId: {} }] : []),
    ];
    for (const patch of invalid) {
      const f = await fixture();
      await control(f, name, { ...good, ...patch });
      const before = structuredClone([...f.records]);
      await assert.rejects(source(f), inconsistent);
      assert.deepEqual([...f.records], before);
    }
  }
  const f = await fixture();
  await control(f, 'workProgress', { schemaVersion: 2 });
  await assert.rejects(source(f), inconsistent);
});

test('optional controls and same-data rewrites/recreation invalidate the expected native anchor', async () => {
  const f = await fixture();
  let previous = await source(f);
  for (const name of [
    'workProgress',
    'noteState',
    'sessionState',
    'preparationState',
    'loreVariantState',
  ]) {
    const ref = f.db.doc(path + '/' + name + '/current');
    await control(f, name, {
      ...(['sessionState', 'preparationState'].includes(name) ? { nextOrder: 1 } : {}),
      ...(name === 'loreVariantState' ? { baseId: 'a'.repeat(64) } : {}),
    });
    await assert.rejects(source(f, { expectedSourceToken: previous.sourceToken }), changed);
    previous = await source(f);
    const data = structuredClone(f.records.get(ref.path));
    await f.db.runTransaction(async (tx) => tx.set(ref, data));
    await assert.rejects(source(f, { expectedSourceToken: previous.sourceToken }), changed);
    previous = await source(f);
    await f.db.runTransaction(async (tx) => tx.delete(ref));
    await assert.rejects(source(f, { expectedSourceToken: previous.sourceToken }), changed);
    const absent = await source(f);
    await f.db.runTransaction(async (tx) => tx.set(ref, data));
    await assert.rejects(source(f, { expectedSourceToken: absent.sourceToken }), changed);
    previous = await source(f);
  }
});

test('control native timestamps are validated as strictly as root timestamps', async () => {
  const f = await fixture();
  await control(f, 'noteState');
  f.metadata.set(path + '/noteState/current', { updatedAt: 0, updatedAtNanoseconds: -1 });
  await assert.rejects(source(f), inconsistent);
});

test('root same-data rewrite and recreation invalidate tokens even with unchanged logical dates', async () => {
  const f = await fixture(),
    root = structuredClone(f.records.get(path)),
    initial = await source(f);
  await f.db.runTransaction(async (tx) => tx.set(f.db.doc(path), root));
  await assert.rejects(source(f, { expectedSourceToken: initial.sourceToken }), changed);
  const rewritten = await source(f);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.set(f.db.doc(path), root));
  await assert.rejects(source(f, { expectedSourceToken: rewritten.sourceToken }), changed);
  assert.deepEqual(f.records.get(path), root);
});

test('native notes, sessions, preparation and checklist writers each invalidate the source', async () => {
  const f = await fixture(),
    notes = createCampaignNotesService({ db: f.db, now: () => 200 }),
    sessions = createCampaignSessionsService({ db: f.db, now: () => 200 }),
    preparation = createCampaignPreparationService({ db: f.db, now: () => 200 }),
    progress = createWorkProgressService({ db: f.db, now: () => 200 }),
    scope = { campaignId, campaignToken: f.token },
    root = structuredClone(f.records.get(path));
  const writers = [
    () =>
      notes.saveCampaignNote(uid, {
        ...scope,
        noteId: op('note'),
        operationId: op('note'),
        expectedRevision: 0,
        title: 'Nota',
        content: 'Own exact text 🐉\n  ',
      }),
    () =>
      sessions.saveCampaignSession(uid, {
        ...scope,
        sessionId: op('session'),
        operationId: op('session'),
        expectedRevision: 0,
        title: 'Sessão',
        scheduledDate: null,
        status: 'planned',
        summary: 'Own summary',
      }),
    () =>
      preparation.saveCampaignPreparationItem(uid, {
        ...scope,
        itemId: op('clue'),
        operationId: op('clue'),
        expectedRevision: 0,
        expectedItemCollectionRevision: 0,
        kind: 'clue',
        title: 'Pista',
        status: 'pending',
        body: { text: 'Private clue', condition: 'Discover', recipient: 'Master' },
      }),
    () =>
      progress.createWorkChecklistItem(uid, {
        target: { kind: 'campaign', id: campaignId },
        operationId: op('task'),
        title: 'Prepare',
      }),
  ];
  for (let index = 0; index < writers.length; index++) {
    const before = await source(f),
      rootBefore = await f.db.doc(path).get();
    await writers[index]();
    await assert.rejects(source(f, { expectedSourceToken: before.sourceToken }), changed);
    if (index < 3) {
      assert.deepEqual(f.records.get(path), root);
      const rootAfter = await f.db.doc(path).get();
      assert.equal(rootAfter.updateTime.seconds, rootBefore.updateTime.seconds);
      assert.equal(rootAfter.updateTime.nanoseconds, rootBefore.updateTime.nanoseconds);
    }
  }
});

test('anchor explicitly does not certify per-session membership changes', async () => {
  const f = await fixture(),
    sessions = createCampaignSessionsService({ db: f.db, now: () => 200 }),
    preparation = createCampaignPreparationService({ db: f.db, now: () => 200 }),
    scope = { campaignId, campaignToken: f.token },
    sessionId = op('session-link'),
    itemId = op('clue-link');
  await sessions.saveCampaignSession(uid, {
    ...scope,
    sessionId,
    operationId: sessionId,
    expectedRevision: 0,
    title: 'Mesa',
    scheduledDate: null,
    status: 'planned',
    summary: 'Own',
  });
  await preparation.saveCampaignPreparationItem(uid, {
    ...scope,
    itemId,
    operationId: itemId,
    expectedRevision: 0,
    expectedItemCollectionRevision: 0,
    kind: 'clue',
    title: 'Pista',
    status: 'pending',
    body: { text: 'Own', condition: '', recipient: '' },
  });
  const before = await source(f),
    root = structuredClone(f.records.get(path)),
    sessionControl = structuredClone(f.records.get(path + '/sessionState/current')),
    itemControl = structuredClone(f.records.get(path + '/preparationState/current'));
  await preparation.addCampaignSessionPreparationLink(uid, {
    ...scope,
    sessionId,
    expectedSessionRevision: 1,
    operationId: op('link'),
    linkId: op('link'),
    expectedRevision: 0,
    expectedLinkCollectionRevision: 0,
    itemId,
    expectedItemRevision: 1,
  });
  assert.ok(f.records.has(path + '/sessionPreparationState/' + sessionId));
  assert.deepEqual(f.records.get(path), root);
  assert.deepEqual(f.records.get(path + '/sessionState/current'), sessionControl);
  assert.deepEqual(f.records.get(path + '/preparationState/current'), itemControl);
  assert.deepEqual(await source(f, { expectedSourceToken: before.sourceToken }), before);
});

test('campaign C4 start gates anchor before root or prose; foreign reservation remains masked', async () => {
  const f = await fixture(),
    deletion = createCampaignDeletionService({ db: f.db, now: () => 500 }),
    initial = await deletion.getCampaignDeletionSource(uid, { campaignId });
  await deletion.startCampaignDeletion(uid, {
    campaignId,
    campaignToken: initial.campaignToken,
    expectedRevision: initial.revision,
    operationId: op('delete'),
  });
  f.metadataReads.length = 0;
  await assert.rejects(source(f), reason('campaign-deleting'));
  assert.deepEqual(
    f.metadataReads.map((r) => r.path),
    ['campaignDeletionReservations/' + campaignId],
  );
  await assert.rejects(source(f, {}, 'other'), (error) => {
    assert.equal(error.code, 'not-found');
    assert.equal(error.details, undefined);
    return true;
  });
  const reservation = f.records.get('campaignDeletionReservations/' + campaignId);
  reservation.state = 'deleted';
  await assert.rejects(source(f), reason('campaign-deleted'));
});

test('metadata port is mandatory and cannot fall back to full reads', async () => {
  const api = createCampaignBackupSourceService({
    db: { runTransaction: (cb) => cb({ get: forbidden }), doc: forbidden },
  });
  await assert.rejects(api.getCampaignBackupSource(uid, { campaignId }), inconsistent);
  const f = await fixture();
  const broken = createCampaignBackupSourceService({
    db: readOnlyDb(f, (tx) => ({
      ...tx,
      getAll: async (...args) => (args[0].path === path ? [] : tx.getAll(...args)),
    })),
  });
  await assert.rejects(broken.getCampaignBackupSource(uid, { campaignId }), inconsistent);
});

test('caller mutation while waiting for the transaction cannot change the frozen target or token', async () => {
  const f = await fixture(),
    initial = await source(f),
    db = readOnlyDb(f);
  let enter;
  const gate = new Promise((resolve) => {
    enter = resolve;
  });
  const api = createCampaignBackupSourceService({
    db: {
      ...db,
      runTransaction: async (callback) => {
        await gate;
        return db.runTransaction(callback);
      },
    },
  });
  const input = { campaignId, expectedSourceToken: initial.sourceToken },
    pending = api.getCampaignBackupSource(uid, input);
  input.campaignId = 'foreign';
  input.expectedSourceToken = 'f'.repeat(64);
  enter();
  assert.deepEqual(await pending, initial);
});

test('owned original campaign remains anchorable after the actual captured adventure disappears', async () => {
  const f = await fixture(),
    adventureId = op('adventure');
  await f.studio.createAdventure(uid, {
    operationId: adventureId,
    title: 'Original',
    universeId: null,
  });
  const capture = createCampaignCaptureService({ db: f.db, assets: {}, now: () => 300 }),
    origin = await capture.getCampaignCaptureSource(uid, { adventureId });
  let prepared = await capture.startCampaignCapture(uid, {
    operationId: op('capture'),
    adventureId,
    expectedSourceToken: origin.sourceToken,
    title: 'Mesa congelada',
    description: '',
    universeId: null,
  });
  for (let index = 0; prepared.state === 'preparing' && index < 100; index++)
    prepared = await capture.advanceCampaignCapture(uid, {
      captureId: prepared.captureId,
      operationId: digest({ captureId: prepared.captureId, checkpoint: prepared.checkpoint }),
      expectedCheckpoint: prepared.checkpoint,
    });
  assert.equal(prepared.state, 'prepared');
  const active = await capture.activateCampaignCapture(uid, {
    captureId: prepared.captureId,
    operationId: op('activate'),
    expectedCheckpoint: prepared.checkpoint,
  });
  assert.equal(active.kind, 'activated');
  assert.equal(active.campaign.provenance.kind, 'original');
  const before = await f.api.getCampaignBackupSource(uid, { campaignId: active.campaign.id });
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc('adventures/' + adventureId)));
  f.metadataReads.length = 0;
  assert.deepEqual(
    await f.api.getCampaignBackupSource(uid, {
      campaignId: active.campaign.id,
      expectedSourceToken: before.sourceToken,
    }),
    before,
  );
  assert.equal(
    f.metadataReads.some(
      (r) => r.path.startsWith('adventures/') || r.path.includes('/campaignBases/'),
    ),
    false,
  );
});

test('recreated root cannot adopt old control scope even when the author and logical root are identical', async () => {
  const f = await fixture(),
    notes = createCampaignNotesService({ db: f.db, now: () => 200 });
  await notes.saveCampaignNote(uid, {
    campaignId,
    campaignToken: f.token,
    noteId: op('old-scope'),
    operationId: op('old-scope'),
    expectedRevision: 0,
    title: 'Nota',
    content: 'Own text',
  });
  const root = structuredClone(f.records.get(path)),
    oldControl = structuredClone(f.records.get(path + '/noteState/current'));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(async (tx) => tx.set(f.db.doc(path), root));
  await assert.rejects(source(f), inconsistent);
  assert.deepEqual(f.records.get(path + '/noteState/current'), oldControl);
});
