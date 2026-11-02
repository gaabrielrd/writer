import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createCampaignsService } from '../../functions/src/campaigns.mjs';
import { createCampaignNotesService } from '../../functions/src/campaignNotes.mjs';
import { digest } from '../../functions/src/campaignNotesContracts.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-campaign-notes-tests',
  campaignId = 'campaign-notes-sdk-current-001',
  path = 'campaigns/' + campaignId,
  op = (name) => 'campaign-notes-sdk-operation-' + name,
  reason = (name) => (error) => error.details?.reason === name,
  previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, studio, api, token;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente o emulador demo.');
  process.env.METADATA_SERVER_DETECTION = 'none';
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
  studio = createStudioService({ db: admin, now: () => 100 });
  api = createCampaignNotesService({ db: admin, now: () => 200 });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await studio.createCampaign('author', { operationId: campaignId, title: 'Mesa privada' });
  token = (await api.listCampaignNotes('author', { campaignId })).campaignToken;
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const client = (uid) =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
const input = (name, extra = {}) => ({
  campaignId,
  campaignToken: token,
  noteId: op(name),
  operationId: op(name),
  expectedRevision: 0,
  title: '  Minha nota  ',
  content: 'Texto próprio\n🐉  ',
  ...extra,
});
const save = (name, extra) => api.saveCampaignNote('author', input(name, extra));
const read = (noteId) =>
  api.getCampaignNote('author', { campaignId, campaignToken: token, noteId });
const record = async (key) => (await admin.doc(key).get()).data();

test('SDK own notes preserve exact UTF-8 and metadata pagination while every direct note/control/receipt access is denied', async () => {
  const created = await save('a');
  await save('b');
  assert.equal(created.note.title, 'Minha nota');
  assert.equal(created.note.content, 'Texto próprio\n🐉  ');
  assert.deepEqual((await read(created.note.id)).note, created.note);
  const page = await api.listCampaignNotes('author', {
    campaignId,
    campaignToken: token,
    limit: 1,
  });
  assert.equal(page.items[0].id, op('a'));
  assert.equal('content' in page.items[0], false);
  const next = await api.listCampaignNotes('author', {
    campaignId,
    campaignToken: token,
    limit: 1,
    cursor: page.nextCursor,
  });
  assert.equal(next.items[0].id, op('b'));
  assert.equal(next.nextCursor, null);
  const receiptPath = 'users/author/campaignNoteOperations/' + op('a');
  const receipt = await record(receiptPath);
  assert.equal('content' in receipt, false);
  assert.equal('title' in receipt, false);
  for (const uid of ['author', 'other', null]) {
    const db = client(uid);
    for (const key of [path + '/notes/' + op('a'), path + '/noteState/current', receiptPath]) {
      await assertFails(getDoc(doc(db, key)));
      await assertFails(setDoc(doc(db, key), { forged: true }));
      await assertFails(updateDoc(doc(db, key), { revision: 9 }));
      await assertFails(deleteDoc(doc(db, key)));
    }
    await assertFails(getDocs(collection(db, path + '/notes')));
  }
  await assert.rejects(
    api.getCampaignNote('other', { campaignId, campaignToken: token, noteId: op('a') }),
    { code: 'not-found' },
  );
  await assert.rejects(api.listCampaignNotes(null, { campaignId }), { code: 'unauthenticated' });
  const secondCampaign = campaignId + '-other';
  await studio.createCampaign('author', { operationId: secondCampaign, title: 'Outra mesa' });
  const otherToken = (await api.listCampaignNotes('author', { campaignId: secondCampaign }))
    .campaignToken;
  assert.equal(
    (
      await api.getCampaignNote('author', {
        campaignId: secondCampaign,
        campaignToken: otherToken,
        noteId: op('a'),
      })
    ).note,
    null,
  );
  await assert.rejects(
    api.getCampaignNote('author', {
      campaignId: secondCampaign,
      campaignToken: token,
      noteId: op('a'),
    }),
    reason('campaign-changed'),
  );
});

test('SDK note CAS permits one writer; replay tracks only its own confirmation and tombstones cannot be recreated', async () => {
  const create = input('created'),
    created = await api.saveCampaignNote('author', create),
    noteId = created.note.id;
  await save('other');
  assert.equal((await api.saveCampaignNote('author', create)).collectionRevision, 2);
  const page = await api.listCampaignNotes('author', { campaignId, limit: 1 });
  const attempts = [
    input('race-a', { noteId, expectedRevision: 1, content: 'A' }),
    input('race-b', { noteId, expectedRevision: 1, content: 'B' }),
  ];
  const results = await Promise.allSettled(
    attempts.map((data) => api.saveCampaignNote('author', data)),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((result) => result.status === 'rejected').reason.details?.reason,
    'revision-conflict',
  );
  const winner = results.findIndex((result) => result.status === 'fulfilled');
  assert.deepEqual(await api.saveCampaignNote('author', attempts[winner]), results[winner].value);
  await assert.rejects(
    api.listCampaignNotes('author', { campaignId, cursor: page.nextCursor }),
    reason('cursor-invalidated'),
  );
  await assert.rejects(api.saveCampaignNote('author', create), reason('revision-conflict'));
  const remove = {
    campaignId,
    campaignToken: token,
    noteId,
    operationId: op('delete'),
    expectedRevision: 2,
  };
  const deleted = await api.deleteCampaignNote('author', remove);
  assert.equal(deleted.revision, 3);
  assert.equal(deleted.collectionRevision, 4);
  assert.deepEqual(await api.deleteCampaignNote('author', remove), deleted);
  const tombstone = await record(path + '/notes/' + noteId);
  assert.equal('content' in tombstone, false);
  assert.equal('title' in tombstone, false);
  assert.equal((await read(noteId)).note, null);
  await assert.rejects(
    api.saveCampaignNote('author', attempts[winner]),
    reason('revision-conflict'),
  );
  await assert.rejects(
    api.deleteCampaignNote('author', {
      ...remove,
      operationId: op('delete-again'),
      expectedRevision: 3,
    }),
    { code: 'not-found' },
  );
  assert.equal((await record(path + '/noteState/current')).revision, 4);
});

test('SDK own notes survive missing original/base and metadata edits but precise root recreation cannot adopt old notes or receipts', async () => {
  const baseId = digest('missing-base');
  await admin.doc(path).update({
    provenance: { kind: 'original', adventureId: 'missing-adventure', baseId },
    activeBaseId: baseId,
    universeId: 'missing-universe',
  });
  const request = input('own-after-origin'),
    created = await api.saveCampaignNote('author', request);
  const before = await admin.doc(path).get();
  await createCampaignsService({ db: admin }).updateCampaign('author', {
    campaignId,
    operationId: op('metadata'),
    expectedRevision: 1,
    patch: { title: 'Título da mesa' },
  });
  assert.equal((await api.listCampaignNotes('author', { campaignId })).campaignToken, token);
  assert.equal((await read(created.note.id)).note.content, request.content);
  const replacement = {
    ...(await record(path)),
    provenance: { kind: 'independent' },
    activeBaseId: null,
    universeId: null,
  };
  await admin.doc(path).delete();
  await admin.doc(path).create(replacement);
  const after = await admin.doc(path).get();
  assert.notDeepEqual(after.createTime, before.createTime);
  await assert.rejects(read(created.note.id), reason('campaign-changed'));
  await assert.rejects(api.saveCampaignNote('author', request), reason('campaign-changed'));
  await assert.rejects(api.listCampaignNotes('author', { campaignId }), reason('campaign-changed'));
  await admin.doc(path + '/notes/' + created.note.id).delete();
  await admin.doc(path + '/noteState/current').delete();
  const fresh = await api.listCampaignNotes('author', { campaignId });
  assert.notEqual(fresh.campaignToken, token);
  await assert.rejects(
    api.saveCampaignNote('author', { ...request, campaignToken: fresh.campaignToken }),
    { code: 'invalid-argument' },
  );
  assert.equal((await admin.doc(path + '/notes/' + created.note.id).get()).exists, false);
});

test('SDK invalid UTF-8/input/schema, overflow and missing control including tombstones fail without partial writes', async () => {
  const first = await save('bounds', { content: '漢'.repeat(150000) });
  for (const patch of [
    { content: '\ud800' },
    { content: 'a'.repeat(150001) },
    { ownerId: 'forged' },
  ])
    await assert.rejects(save('invalid', patch), { code: 'invalid-argument' });
  assert.equal(
    (await admin.doc('users/author/campaignNoteOperations/' + op('invalid')).get()).exists,
    false,
  );
  assert.equal((await record(path + '/noteState/current')).revision, 1);
  await admin.doc(path).update({ schemaVersion: 2 });
  await assert.rejects(read(first.note.id), { code: 'failed-precondition' });
  await admin.doc(path).update({ schemaVersion: 1 });
  await admin.doc(path + '/noteState/current').update({ revision: Number.MAX_SAFE_INTEGER });
  await assert.rejects(save('overflow'), { code: 'failed-precondition' });
  assert.equal((await admin.doc(path + '/notes/' + op('overflow')).get()).exists, false);
  await admin.doc(path + '/noteState/current').update({ revision: 1 });
  await api.deleteCampaignNote('author', {
    campaignId,
    campaignToken: token,
    noteId: first.note.id,
    operationId: op('delete-only'),
    expectedRevision: 1,
  });
  await admin.doc(path + '/noteState/current').delete();
  await assert.rejects(api.listCampaignNotes('author', { campaignId }), {
    code: 'failed-precondition',
  });
  await assert.rejects(save('after-missing-control'), { code: 'failed-precondition' });
  assert.equal((await admin.doc(path + '/noteState/current').get()).exists, false);
});
