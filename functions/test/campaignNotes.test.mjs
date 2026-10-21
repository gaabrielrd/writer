import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignsService } from '../src/campaigns.mjs';
import { digest } from '../src/campaignNotesContracts.mjs';

const uid = 'author',
  campaignId = 'campaign-notes-current-001',
  path = 'campaigns/' + campaignId,
  op = (name) => 'campaign-notes-operation-' + name;
async function fixture() {
  const f = studioDb(),
    studio = createStudioService({ db: f.db, now: () => 100 });
  await studio.createCampaign(uid, {
    operationId: campaignId,
    title: 'Minha campanha',
    description: 'Descrição própria',
  });
  f.records.set(path + '/workChecklist/task', { title: 'Checklist', completed: true });
  f.records.set('users/author', { credits: 5 });
  const api = createCampaignNotesService({ db: f.db, now: () => 50 }),
    initial = await api.listCampaignNotes(uid, { campaignId });
  return { ...f, studio, api, token: initial.campaignToken };
}
const saveInput = (f, name, extra = {}) => ({
  campaignId,
  campaignToken: f.token,
  noteId: op(name),
  operationId: op(name),
  expectedRevision: 0,
  title: '  Minha nota  ',
  content: 'Texto próprio\n🐉  ',
  ...extra,
});
const save = (f, name, extra) => f.api.saveCampaignNote(uid, saveInput(f, name, extra));
const read = (f, noteId) =>
  f.api.getCampaignNote(uid, { campaignId, campaignToken: f.token, noteId });
const removeInput = (f, noteId, revision, name = 'delete') => ({
  campaignId,
  campaignToken: f.token,
  noteId,
  operationId: op(name),
  expectedRevision: revision,
});
const reason = (name) => (error) => error.details?.reason === name;

test('notes preserve own Unicode/plain text and envelope; identical save increments once, replay does not and unrelated domains stay untouched', async () => {
  const f = await fixture(),
    original = structuredClone([...f.records]),
    input = saveInput(f, 'create'),
    created = await f.api.saveCampaignNote(uid, input);
  assert.equal(created.note.title, 'Minha nota');
  assert.equal(created.note.content, input.content);
  assert.equal(created.note.revision, 1);
  assert.equal(created.collectionRevision, 1);
  assert.match(created.campaignToken, /^[a-f0-9]{64}$/);
  assert.equal(created.note.createdAt, created.note.updatedAt);
  assert.equal(created.schemaVersion, 1);
  assert.deepEqual(await f.api.saveCampaignNote(uid, input), created);
  const identical = await save(f, 'identical', {
    noteId: created.note.id,
    expectedRevision: 1,
    title: created.note.title,
    content: created.note.content,
  });
  assert.equal(identical.note.revision, 2);
  assert.equal(identical.collectionRevision, 2);
  assert.equal(identical.note.createdAt, created.note.createdAt);
  assert.ok(identical.note.updatedAt > created.note.updatedAt);
  assert.deepEqual((await read(f, created.note.id)).note, identical.note);
  for (const [key, value] of original) assert.deepEqual(f.records.get(key), value);
  const receipt = f.records.get('users/author/campaignNoteOperations/' + input.operationId);
  assert.equal(JSON.stringify(receipt).includes('Minha nota'), false);
  assert.equal(JSON.stringify(receipt).includes('Texto próprio'), false);
});

test('replay confirms current note only and returns current collection revision after another note changes', async () => {
  const f = await fixture(),
    input = saveInput(f, 'first'),
    first = await f.api.saveCampaignNote(uid, input);
  await save(f, 'second');
  const replay = await f.api.saveCampaignNote(uid, input);
  assert.deepEqual(replay.note, first.note);
  assert.equal(replay.collectionRevision, 2);
  await save(f, 'edit', { noteId: first.note.id, expectedRevision: 1, content: 'Mudança minha' });
  await assert.rejects(f.api.saveCampaignNote(uid, input), reason('revision-conflict'));
  await assert.rejects(f.api.saveCampaignNote(uid, { ...input, content: 'Outro pedido' }), {
    code: 'invalid-argument',
  });
});

test('concurrent mutations cannot overwrite and note deletion removes body but retains replay-safe identity tombstone', async () => {
  const f = await fixture(),
    created = await save(f, 'created'),
    id = created.note.id;
  const outcomes = await Promise.allSettled([
    save(f, 'race-a', { noteId: id, expectedRevision: 1 }),
    save(f, 'race-b', { noteId: id, expectedRevision: 1 }),
  ]);
  assert.equal(outcomes.filter((value) => value.status === 'fulfilled').length, 1);
  const input = removeInput(f, id, 2),
    removed = await f.api.deleteCampaignNote(uid, input);
  assert.equal(removed.deleted, true);
  assert.equal(removed.revision, 3);
  assert.equal(removed.collectionRevision, 3);
  const tombstone = f.records.get(path + '/notes/' + id);
  assert.equal('title' in tombstone, false);
  assert.equal('content' in tombstone, false);
  assert.equal((await read(f, id)).note, null);
  assert.deepEqual(await f.api.deleteCampaignNote(uid, input), removed);
  await assert.rejects(
    f.api.saveCampaignNote(uid, saveInput(f, 'created')),
    reason('revision-conflict'),
  );
  await assert.rejects(
    f.api.deleteCampaignNote(uid, { ...input, operationId: op('old-delete') }),
    reason('revision-conflict'),
  );
  await assert.rejects(
    f.api.deleteCampaignNote(uid, { ...input, operationId: op('new-delete'), expectedRevision: 3 }),
    { code: 'not-found' },
  );
  assert.equal(f.records.get(path + '/noteState/current').revision, 3);
});

test('metadata-only pagination is deterministic, bounded and invalidates on any note mutation', async () => {
  const f = await fixture();
  await save(f, 'a');
  await save(f, 'b');
  await save(f, 'c');
  const first = await f.api.listCampaignNotes(uid, {
    campaignId,
    campaignToken: f.token,
    limit: 1,
  });
  const second = await f.api.listCampaignNotes(uid, {
    campaignId,
    campaignToken: f.token,
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(first.items[0].id, op('a'));
  assert.equal(second.items[0].id, op('b'));
  assert.equal('content' in first.items[0], false);
  assert.ok(
    f.reads
      .filter((query) => query.collectionPath === path + '/notes')
      .every((query) => query.fields && !query.fields.includes('content')),
  );
  await save(f, 'd');
  await assert.rejects(
    f.api.listCampaignNotes(uid, { campaignId, cursor: first.nextCursor }),
    reason('cursor-invalidated'),
  );
  const cursor = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  await assert.rejects(
    f.api.listCampaignNotes(uid, {
      campaignId,
      cursor: Buffer.from(JSON.stringify({ ...cursor, extra: true })).toString('base64url'),
    }),
    { code: 'invalid-argument' },
  );
  assert.ok(f.reads.every((query) => query.maximum <= 51));
});

test('notes do not depend on adventure, universe or base; campaign ownership and supported schema remain mandatory', async () => {
  const f = await fixture();
  const root = f.records.get(path);
  root.provenance = {
    kind: 'original',
    adventureId: 'removed-adventure',
    baseId: digest('removed-base'),
  };
  root.activeBaseId = root.provenance.baseId;
  root.universeId = 'removed-universe';
  const created = await save(f, 'after-revocation');
  assert.equal(created.note.content, 'Texto próprio\n🐉  ');
  const edited = await save(f, 'own-edit', {
    noteId: created.note.id,
    expectedRevision: 1,
    content: 'Continua minha',
  });
  assert.equal(edited.note.content, 'Continua minha');
  root.universeId = null;
  assert.equal((await read(f, created.note.id)).note.content, 'Continua minha');
  await assert.rejects(f.api.listCampaignNotes('other', { campaignId }), { code: 'not-found' });
  root.deleting = true;
  await assert.rejects(read(f, created.note.id), { code: 'not-found' });
  root.deleting = false;
  root.schemaVersion = 2;
  await assert.rejects(read(f, created.note.id), { code: 'failed-precondition' });
});

test('campaign token uses immutable nanosecond createTime and refuses journals or orphan children after root recreation', async () => {
  const f = await fixture(),
    first = await save(f, 'old-note'),
    token = f.token;
  await createCampaignsService({ db: f.db }).updateCampaign(uid, {
    campaignId,
    operationId: op('metadata'),
    expectedRevision: 1,
    patch: { title: 'Outro título' },
  });
  assert.equal((await f.api.listCampaignNotes(uid, { campaignId })).campaignToken, token);
  await f.db.runTransaction(async (tx) => {
    tx.delete(f.db.doc(path));
  });
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc(path), {
      id: campaignId,
      ownerId: uid,
      schemaVersion: 1,
      revision: 1,
      provenance: { kind: 'independent' },
      title: 'Nova',
      createdAt: 100,
      updatedAt: 100,
    });
  });
  await assert.rejects(read(f, first.note.id), reason('campaign-changed'));
  await assert.rejects(
    f.api.saveCampaignNote(uid, saveInput(f, 'new-old-journal')),
    reason('campaign-changed'),
  );
  await assert.rejects(f.api.listCampaignNotes(uid, { campaignId }), reason('campaign-changed'));
  f.records.delete(path + '/noteState/current');
  f.records.delete(path + '/notes/' + first.note.id);
  const current = await f.api.listCampaignNotes(uid, { campaignId });
  assert.notEqual(current.campaignToken, token);
});

test('missing list control probes include tombstones and never reset a nonempty collection', async () => {
  const f = await fixture();
  assert.equal(f.records.has(path + '/noteState/current'), false);
  const created = await save(f, 'only'),
    input = removeInput(f, created.note.id, 1);
  await f.api.deleteCampaignNote(uid, input);
  f.records.delete(path + '/noteState/current');
  await assert.rejects(f.api.listCampaignNotes(uid, { campaignId }), {
    code: 'failed-precondition',
  });
  await assert.rejects(save(f, 'another'), { code: 'failed-precondition' });
  assert.equal(f.records.has(path + '/noteState/current'), false);
  const probe = f.reads.at(-1);
  assert.equal(probe.maximum, 1);
  assert.deepEqual(probe.fields, []);
});

test('closed inputs, text bounds, invalid note identity/control and revision overflow reject without writes or truncation', async () => {
  const f = await fixture(),
    baseline = structuredClone([...f.records]);
  for (const patch of [
    { title: '' },
    { title: 'a'.repeat(301) },
    { title: '\ud800' },
    { content: 'a'.repeat(150001) },
    { content: '\ud800' },
    { content: null },
    { ownerId: 'forged' },
    { noteId: op('mismatch') },
    { expectedRevision: -1 },
  ])
    await assert.rejects(f.api.saveCampaignNote(uid, { ...saveInput(f, 'invalid'), ...patch }), {
      code: 'invalid-argument',
    });
  assert.deepEqual([...f.records], baseline);
  const boundary = await save(f, 'boundary', { content: '漢'.repeat(150000) });
  assert.equal(boundary.note.content.length, 150000);
  const stored = f.records.get(path + '/notes/' + boundary.note.id);
  stored.content = '\ud800';
  await assert.rejects(read(f, boundary.note.id), { code: 'failed-precondition' });
  stored.content = boundary.note.content;
  f.records.get(path + '/noteState/current').revision = Number.MAX_SAFE_INTEGER;
  await assert.rejects(save(f, 'overflow'), { code: 'failed-precondition' });
  const current = f.records.get(path + '/notes/' + boundary.note.id);
  current.campaignToken = digest('foreign');
  await assert.rejects(read(f, current.id), reason('campaign-changed'));
});
