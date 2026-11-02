import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignDeletionService } from '../src/campaignDeletion.mjs';
import { finishDeletion } from './helpers/campaignDeletion.mjs';
import { validScheduledDate } from '../src/campaignSessionsContracts.mjs';

const uid = 'author',
  campaignId = 'campaign-sessions-independent',
  path = 'campaigns/' + campaignId;
const op = (name) => 'campaign-session-operation-' + name;
const reason = (name) => (error) => error.details?.reason === name;
async function fixture() {
  const f = studioDb(),
    studio = createStudioService({ db: f.db, now: () => 100 });
  await studio.createCampaign(uid, {
    operationId: campaignId,
    title: 'Mesa',
    description: 'Texto próprio',
  });
  const api = createCampaignSessionsService({ db: f.db, now: () => 120 }),
    initial = await api.listCampaignSessions(uid, { campaignId });
  return { ...f, api, studio, token: initial.campaignToken };
}
const scope = (f) => ({ campaignId, campaignToken: f.token });
const saveInput = (f, name, extra = {}) => ({
  ...scope(f),
  operationId: op(name),
  sessionId: op(name),
  expectedRevision: 0,
  title: '  Minha sessão  ',
  status: 'planned',
  scheduledDate: '0001-01-01',
  summary: 'Texto próprio 🐉\n  ',
  ...extra,
});
const save = (f, name, extra) => f.api.saveCampaignSession(uid, saveInput(f, name, extra));
const read = (f, sessionId) => f.api.getCampaignSession(uid, { ...scope(f), sessionId });
const remove = (f, s, name = 'delete') =>
  f.api.deleteCampaignSession(uid, {
    ...scope(f),
    sessionId: s.id,
    expectedRevision: s.revision,
    operationId: op(name),
  });
const moveInput = (f, s, collectionRevision, direction = 'up', name = 'move') => ({
  ...scope(f),
  sessionId: s.id,
  expectedRevision: s.revision,
  expectedCollectionRevision: collectionRevision,
  direction,
  operationId: op(name),
});

test('sessions preserve exact own plain text, civil dates, full-save states and identity; retries confirm one event', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    input = saveInput(f, 'first');
  const result = await f.api.saveCampaignSession(uid, input);
  assert.equal(result.session.title, 'Minha sessão');
  assert.equal(result.session.summary, input.summary);
  assert.equal(result.session.order, 1);
  assert.equal(result.session.scheduledDate, '0001-01-01');
  assert.equal(result.receipt.revision, 1);
  assert.equal(result.collectionRevision, 1);
  assert.deepEqual(await f.api.saveCampaignSession(uid, input), result);
  for (const [key, value] of before) assert.deepEqual(f.records.get(key), value);
  const updated = await save(f, 'edit', {
    sessionId: input.sessionId,
    expectedRevision: 1,
    status: 'completed',
    scheduledDate: null,
    summary: '  Reescrita\n',
    title: 'Outro título',
  });
  assert.equal(updated.session.createdAt, result.session.createdAt);
  assert.ok(updated.session.updatedAt > result.session.updatedAt);
  assert.equal(updated.session.status, 'completed');
  assert.equal(updated.session.summary, '  Reescrita\n');
  assert.deepEqual((await read(f, input.sessionId)).session, updated.session);
  assert.equal((await read(f, 'missing-session')).session, null);
  const stored = f.records.get(`users/${uid}/campaignSessionOperations/${input.operationId}`);
  for (const text of ['Minha sessão', 'Texto próprio', '0001-01-01'])
    assert.equal(JSON.stringify(stored).includes(text), false);
});

test('historical replay returns current envelope but never another revision body, including deletion', async () => {
  const f = await fixture(),
    input = saveInput(f, 'first'),
    first = await f.api.saveCampaignSession(uid, input);
  await save(f, 'second');
  let replay = await f.api.saveCampaignSession(uid, input);
  assert.deepEqual(replay.session, first.session);
  assert.equal(replay.collectionRevision, 2);
  assert.equal(replay.receipt.collectionRevision, 1);
  const edited = await save(f, 'edit', {
    sessionId: first.session.id,
    expectedRevision: 1,
    summary: 'Nova preparação',
  });
  replay = await f.api.saveCampaignSession(uid, input);
  assert.equal(replay.session, null);
  assert.deepEqual(replay.receipt, first.receipt);
  const deleted = await remove(f, edited.session);
  assert.equal(deleted.session, null);
  assert.equal(deleted.receipt.revision, 3);
  const tombstone = f.records.get(path + '/sessions/' + first.session.id);
  for (const field of ['summary', 'title', 'scheduledDate', 'status'])
    assert.equal(field in tombstone, false);
  assert.equal((await read(f, first.session.id)).session, null);
  assert.equal((await f.api.saveCampaignSession(uid, input)).session, null);
  assert.deepEqual(await remove(f, edited.session), deleted);
  await assert.rejects(save(f, 'first', { title: 'Outro pedido' }), { code: 'invalid-argument' });
  await assert.rejects(save(f, 'recreate', { sessionId: first.session.id, expectedRevision: 3 }), {
    code: 'not-found',
  });
});

test('move swaps only live adjacent sessions atomically, revises both and preserves body; stale editors and topology conflict', async () => {
  const f = await fixture(),
    a = (await save(f, 'a', { summary: 'A' })).session,
    b = (await save(f, 'b', { summary: 'B' })).session,
    c = (await save(f, 'c', { summary: 'C' })).session;
  await remove(f, b);
  const input = moveInput(f, c, 4),
    result = await f.api.moveCampaignSession(uid, input);
  assert.equal(result.session.order, 1);
  assert.equal(result.session.summary, 'C');
  assert.equal(result.receipt.collectionRevision, 5);
  const neighbor = (await read(f, a.id)).session;
  assert.equal(neighbor.order, 3);
  assert.equal(neighbor.revision, 2);
  assert.equal(neighbor.summary, 'A');
  assert.equal(f.records.get(path + '/sessions/' + b.id).order, 2);
  assert.deepEqual(await f.api.moveCampaignSession(uid, input), result);
  await assert.rejects(
    save(f, 'stale-editor', { sessionId: a.id, expectedRevision: 1 }),
    reason('revision-conflict'),
  );
  await assert.rejects(
    f.api.moveCampaignSession(uid, moveInput(f, neighbor, 4, 'up', 'stale-topology')),
    reason('revision-conflict'),
  );
  await assert.rejects(
    f.api.moveCampaignSession(uid, moveInput(f, result.session, 5, 'up', 'boundary')),
    reason('order-boundary'),
  );
  assert.equal(f.records.has(`users/${uid}/campaignSessionOperations/${op('boundary')}`), false);
  const down = await f.api.moveCampaignSession(
    uid,
    moveInput(f, result.session, 5, 'down', 'down'),
  );
  assert.equal(down.session.order, 3);
  assert.equal((await f.api.moveCampaignSession(uid, input)).session, null);
});

test('competing saves have one winner and never partially overwrite the order or another session', async () => {
  const f = await fixture(),
    s = (await save(f, 'create')).session;
  const results = await Promise.allSettled([
    save(f, 'race-a', { sessionId: s.id, expectedRevision: 1, summary: 'A' }),
    save(f, 'race-b', { sessionId: s.id, expectedRevision: 1, summary: 'B' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'revision-conflict',
  );
  assert.equal((await read(f, s.id)).session.revision, 2);
  assert.equal(f.records.get(path + '/sessionState/current').revision, 2);
});

test('list has bounded metadata-only pages and scope/revision-bound cursors without body leakage', async () => {
  const f = await fixture();
  for (let n = 0; n < 51; n++) await save(f, 'page-' + n, { summary: '🐉'.repeat(75000) });
  const page = await f.api.listCampaignSessions(uid, { ...scope(f), limit: 25 });
  assert.equal(page.items.length, 25);
  assert.ok(page.nextCursor);
  assert.equal(
    page.items.some((item) => 'summary' in item || 'campaignToken' in item || 'deleted' in item),
    false,
  );
  const next = await f.api.listCampaignSessions(uid, { ...scope(f), cursor: page.nextCursor });
  assert.equal(next.items.length, 25);
  const last = await f.api.listCampaignSessions(uid, { ...scope(f), cursor: next.nextCursor });
  assert.equal(last.items.length, 1);
  assert.equal(last.nextCursor, null);
  assert.equal(new Set([...page.items, ...next.items, ...last.items].map((s) => s.id)).size, 51);
  for (const query of f.reads.filter((q) => q.collectionPath === path + '/sessions')) {
    assert.ok(query.maximum <= 51);
    assert.ok(query.fields && !query.fields.includes('summary'));
  }
  const parsed = JSON.parse(Buffer.from(page.nextCursor, 'base64url'));
  const foreign = Buffer.from(JSON.stringify({ ...parsed, uid: 'other' })).toString('base64url');
  await assert.rejects(
    f.api.listCampaignSessions(uid, { ...scope(f), cursor: foreign }),
    reason('cursor-invalidated'),
  );
  for (const cursor of [
    '!',
    Buffer.from('{}').toString('base64url'),
    Buffer.from('[]').toString('base64url'),
    Buffer.from(JSON.stringify({ ...parsed, extra: true })).toString('base64url'),
  ])
    await assert.rejects(f.api.listCampaignSessions(uid, { ...scope(f), cursor }), {
      code: 'invalid-argument',
    });
  await save(f, 'invalidate');
  await assert.rejects(
    f.api.listCampaignSessions(uid, { ...scope(f), cursor: page.nextCursor }),
    reason('cursor-invalidated'),
  );
});

test('civil calendar, creation state, UTF8 and closed fields reject invalid payloads without writes', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  for (const date of [
    '0000-01-01',
    '10000-01-01',
    '1900-02-29',
    '2024-04-31',
    '2024-00-01',
    '2024-01-00',
    '2024-01-01T00:00Z',
    undefined,
  ])
    await assert.rejects(save(f, 'invalid-date', { scheduledDate: date }), {
      code: 'invalid-argument',
    });
  for (const date of ['0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31', null])
    assert.equal(validScheduledDate(date), true);
  for (const extra of [
    { status: 'running' },
    { status: 'completed' },
    { summary: '\ud800' },
    { summary: 'x'.repeat(150001) },
    { title: '\ud800' },
    { title: ' ' },
    { isPublic: true },
    { sessionId: 'different-session' },
  ])
    await assert.rejects(save(f, 'invalid', extra), { code: 'invalid-argument' });
  assert.deepEqual([...f.records], before);
});

test('receipt corruption and equal-revision hash divergence fail closed; missing state never fabricates zero', async () => {
  const f = await fixture(),
    input = saveInput(f, 'first'),
    result = await f.api.saveCampaignSession(uid, input),
    receiptPath = `users/${uid}/campaignSessionOperations/${input.operationId}`,
    originalReceipt = structuredClone(f.records.get(receiptPath));
  for (const patch of [
    { schemaVersion: 2 },
    { ownerId: 'other' },
    { campaignToken: '0'.repeat(64) },
    { receipt: { ...originalReceipt.receipt, collectionRevision: 2 } },
    { confirmationHash: '0'.repeat(64) },
  ]) {
    f.records.set(receiptPath, { ...originalReceipt, ...patch });
    await assert.rejects(f.api.saveCampaignSession(uid, input), reason('session-inconsistent'));
  }
  f.records.set(receiptPath, originalReceipt);
  const stored = f.records.get(path + '/sessions/' + result.session.id);
  f.records.set(path + '/sessions/' + result.session.id, { ...stored, summary: 'CORROMPIDO' });
  await assert.rejects(f.api.saveCampaignSession(uid, input), reason('session-inconsistent'));
  f.records.set(path + '/sessions/' + result.session.id, stored);
  f.records.delete(path + '/sessionState/current');
  await assert.rejects(
    f.api.listCampaignSessions(uid, { campaignId }),
    reason('session-inconsistent'),
  );
  f.records.set(path + '/sessions/' + result.session.id, { ...stored, deleted: true });
  await assert.rejects(
    f.api.listCampaignSessions(uid, { campaignId }),
    reason('session-inconsistent'),
  );
});

test('overflow in primary, neighbor, collection or append order never partially mutates', async () => {
  for (const field of ['primary', 'neighbor', 'collection', 'nextOrder', 'sameOrder']) {
    const f = await fixture(),
      a = (await save(f, 'a')).session,
      b = (await save(f, 'b')).session;
    if (field === 'primary')
      f.records.get(path + '/sessions/' + b.id).revision = Number.MAX_SAFE_INTEGER;
    if (field === 'neighbor')
      f.records.get(path + '/sessions/' + a.id).revision = Number.MAX_SAFE_INTEGER;
    if (field === 'collection')
      f.records.get(path + '/sessionState/current').revision = Number.MAX_SAFE_INTEGER;
    if (field === 'nextOrder')
      f.records.get(path + '/sessionState/current').nextOrder = Number.MAX_SAFE_INTEGER;
    if (field === 'sameOrder') f.records.get(path + '/sessions/' + b.id).order = a.order;
    const before = structuredClone([...f.records]);
    if (field === 'nextOrder')
      await assert.rejects(save(f, 'overflow'), reason('session-inconsistent'));
    else
      await assert.rejects(
        f.api.moveCampaignSession(
          uid,
          moveInput(
            f,
            { ...b, revision: field === 'primary' ? Number.MAX_SAFE_INTEGER : b.revision },
            field === 'collection' ? Number.MAX_SAFE_INTEGER : 2,
          ),
        ),
        reason('session-inconsistent'),
      );
    assert.deepEqual([...f.records], before);
  }
});

test('lowered existing control rejects records outside nextOrder or collectionRevision before reading body', async () => {
  for (const patch of [{ nextOrder: 1 }, { revision: 0 }]) {
    const f = await fixture(),
      created = await save(f, 'control-regression');
    Object.assign(f.records.get(path + '/sessionState/current'), patch);
    const before = structuredClone([...f.records]);
    await assert.rejects(read(f, created.session.id), reason('session-inconsistent'));
    await assert.rejects(
      save(f, 'bad-control-edit', { sessionId: created.session.id, expectedRevision: 1 }),
      reason('session-inconsistent'),
    );
    await assert.rejects(f.api.listCampaignSessions(uid, scope(f)), reason('session-inconsistent'));
    assert.deepEqual([...f.records], before);
  }
});

test('owner-only sessions survive unavailable adventure; token/C4 gates precede body or historical receipt', async () => {
  const f = await fixture(),
    root = f.records.get(path);
  f.records.set(path, {
    ...root,
    provenance: { kind: 'original', adventureId: 'missing-adventure', baseId: 'a'.repeat(64) },
    activeBaseId: 'a'.repeat(64),
  });
  const input = saveInput(f, 'own'),
    result = await f.api.saveCampaignSession(uid, input);
  assert.equal((await read(f, result.session.id)).session.summary, input.summary);
  const fullReads = [];
  f.api = createCampaignSessionsService({
    db: {
      ...f.db,
      runTransaction: (work) =>
        f.db.runTransaction((tx) =>
          work({
            ...tx,
            get: (ref) => {
              if (ref.path) fullReads.push(ref.path);
              return tx.get(ref);
            },
          }),
        ),
    },
  });
  await assert.rejects(f.api.listCampaignSessions('other', { campaignId }), { code: 'not-found' });
  await assert.rejects(f.api.listCampaignSessions(null, { campaignId }), {
    code: 'unauthenticated',
  });
  await assert.rejects(
    f.api.getCampaignSession(uid, {
      ...scope(f),
      campaignToken: '0'.repeat(64),
      sessionId: result.session.id,
    }),
    reason('campaign-changed'),
  );
  assert.equal(
    fullReads.some(
      (value) => value.includes('/sessions/') || value.includes('/campaignSessionOperations/'),
    ),
    false,
  );
  const deletion = createCampaignDeletionService({ db: f.db });
  const source = await deletion.getCampaignDeletionSource(uid, { campaignId });
  await deletion.startCampaignDeletion(uid, {
    campaignId,
    campaignToken: source.campaignToken,
    expectedRevision: source.revision,
    operationId: op('delete-campaign'),
  });
  await assert.rejects(f.api.saveCampaignSession(uid, input), reason('campaign-deleting'));
  await assert.rejects(read(f, result.session.id), reason('campaign-deleting'));
  assert.equal(
    fullReads.some(
      (value) => value.includes('/sessions/') || value.includes('/campaignSessionOperations/'),
    ),
    false,
  );
});

test('C4 latest purges paginated sessions/state and sanitizes only own receipts; absent v1 stays resumable and future versions fail', async () => {
  const f = await fixture();
  for (let n = 0; n < 27; n++) await save(f, 'cleanup-' + n);
  f.records.set('campaigns/other/sessions/preserved', { summary: 'Outra mesa' });
  f.records.set('users/author/campaignSessionOperations/other', {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: 'other',
    fingerprint: 'preservado',
  });
  const deletion = createCampaignDeletionService({ db: f.db }),
    source = await deletion.getCampaignDeletionSource(uid, { campaignId });
  const start = await deletion.startCampaignDeletion(uid, {
    campaignId,
    campaignToken: source.campaignToken,
    expectedRevision: source.revision,
    operationId: op('cleanup'),
  });
  const jobPath = 'users/author/campaignDeletions/' + start.progress.deletionId;
  assert.equal(f.records.get(jobPath).cleanupVersion, 4);
  await finishDeletion(deletion, start.progress, 'sessions-cleanup');
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith(path + '/')),
    false,
  );
  assert.equal(f.records.get('campaigns/other/sessions/preserved').summary, 'Outra mesa');
  for (const [key, value] of f.records)
    if (
      key.startsWith('users/author/campaignSessionOperations/') &&
      value.campaignId === campaignId
    )
      assert.deepEqual(value, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId,
        deletionId: start.progress.deletionId,
        state: 'deleted-campaign',
      });
  assert.equal(
    f.records.get('users/author/campaignSessionOperations/other').fingerprint,
    'preservado',
  );
  assert.equal('cleanupVersion' in f.records.get(jobPath), false);
  const old = await fixture(),
    oldDeletion = createCampaignDeletionService({ db: old.db }),
    oldSource = await oldDeletion.getCampaignDeletionSource(uid, { campaignId });
  const initial = await oldDeletion.startCampaignDeletion(uid, {
    campaignId,
    campaignToken: oldSource.campaignToken,
    expectedRevision: 1,
    operationId: op('old-cleanup'),
  });
  const oldJob = old.records.get('users/author/campaignDeletions/' + initial.progress.deletionId);
  for (const invalid of [null, 0, 5, '2']) {
    oldJob.cleanupVersion = invalid;
    await assert.rejects(
      oldDeletion.advanceCampaignDeletion(uid, {
        deletionId: initial.progress.deletionId,
        operationId: op('bad-version'),
        expectedCheckpoint: 0,
      }),
      { code: 'failed-precondition' },
    );
    assert.equal(oldJob.checkpoint, 0);
  }
  delete oldJob.cleanupVersion;
  await finishDeletion(oldDeletion, initial.progress, 'old-sessions-cleanup');
  assert.equal(old.records.has(path), false);
});
