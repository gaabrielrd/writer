import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createCampaignsService } from '../../functions/src/campaigns.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-campaign-management-tests',
  campaignId = 'campaign-sdk-current-0001',
  path = 'campaigns/' + campaignId,
  op = (name) => 'campaign-sdk-operation-' + name,
  previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, studio, api;
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
  studio = createStudioService({ db: admin });
  api = createCampaignsService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await studio.createCampaign('author', {
    operationId: campaignId,
    title: 'Mesa privada',
    description: 'Descrição preservada',
  });
  await admin
    .doc(path + '/workChecklist/task')
    .set({ title: 'Preparação privada', completed: true, revision: 5 });
  await admin
    .doc(path + '/workProgress/current')
    .set({ revision: 6, checklistTotal: 1, checklistCompleted: 1 });
  for (const id of ['first', 'second'])
    await admin.doc('universes/' + id).set({
      authorId: 'author',
      campaignCount: 0,
      bookCount: 4,
      adventureCount: 2,
      loreVersion: 7,
      privacyVersion: 3,
      createdAt: 1,
      updatedAt: 100,
    });
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
const update = (name, expectedRevision, patch, uid = 'author', id = campaignId) =>
  api.updateCampaign(uid, { campaignId: id, operationId: op(name), expectedRevision, patch });
const record = async (path) => (await admin.doc(path).get()).data();

test('SDK campaign update is server-only and private; confirmed metadata preserves creation and checklist while receipts omit description', async () => {
  const before = await record(path),
    checklist = await record(path + '/workChecklist/task'),
    control = await record(path + '/workProgress/current');
  const result = await update('metadata', 1, {
    title: ' Mesa atual ',
    description: ' Nova descrição ',
    status: 'archived',
  });
  assert.equal(result.revision, 2);
  assert.equal(result.title, 'Mesa atual');
  assert.equal(result.description, 'Nova descrição');
  assert.equal(result.createdAt, before.createdAt);
  assert.ok(result.updatedAt > before.updatedAt);
  assert.deepEqual(result.provenance, { kind: 'independent' });
  assert.deepEqual(await record(path + '/workChecklist/task'), checklist);
  assert.deepEqual(await record(path + '/workProgress/current'), control);
  assert.deepEqual(
    await update('metadata', 1, {
      title: 'Mesa atual',
      description: 'Nova descrição',
      status: 'archived',
    }),
    result,
  );
  const receiptPath = 'users/author/campaignOperations/' + op('metadata');
  assert.equal(JSON.stringify(await record(receiptPath)).includes('descrição'), false);
  for (const uid of ['author', 'other', null]) {
    await assertFails(getDoc(doc(client(uid), receiptPath)));
    await assertFails(setDoc(doc(client(uid), receiptPath), { forged: true }));
    await assertFails(deleteDoc(doc(client(uid), receiptPath)));
    await assertFails(updateDoc(doc(client(uid), path), { title: 'Forjado', revision: 2 }));
    await assertFails(
      setDoc(doc(client(uid), 'universes/first/campaigns/' + campaignId), { campaignId }),
    );
  }
  await assert.rejects(update('other', 2, { title: 'Outra conta' }, 'other'), {
    code: 'not-found',
  });
  await assert.rejects(update('anon', 2, { title: 'Anônimo' }, null), { code: 'unauthenticated' });
  const restored = await update('restore', 2, { status: 'active' });
  assert.equal(restored.status, 'active');
  assert.equal(restored.description, result.description);
});

test('SDK competing revisions select one whole campaign update and universe use; replay cannot adopt a later confirmation', async () => {
  const requests = [
    {
      campaignId,
      operationId: op('race-a'),
      expectedRevision: 1,
      patch: { title: 'Mesa A', universeId: 'first' },
    },
    {
      campaignId,
      operationId: op('race-b'),
      expectedRevision: 1,
      patch: { title: 'Mesa B', universeId: 'second' },
    },
  ];
  const results = await Promise.allSettled(
    requests.map((request) => api.updateCampaign('author', request)),
  );
  assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1);
  const index = results.findIndex((entry) => entry.status === 'fulfilled'),
    result = results[index].value;
  const rejected = results.find((entry) => entry.status === 'rejected');
  assert.equal(rejected.reason.details?.reason, 'revision-conflict');
  assert.deepEqual(await api.updateCampaign('author', requests[index]), result);
  assert.equal((await record(path)).universeId, result.universeId);
  assert.equal((await record('universes/' + result.universeId)).campaignCount, 1);
  const other = result.universeId === 'first' ? 'second' : 'first';
  assert.equal((await record('universes/' + other)).campaignCount, 0);
  assert.equal(
    (await admin.doc('universes/' + other + '/campaigns/' + campaignId).get()).exists,
    false,
  );
  const switched = await update('switch', 2, { universeId: other });
  assert.equal((await record('universes/' + result.universeId)).campaignCount, 0);
  assert.equal((await record('universes/' + other)).campaignCount, 1);
  await assert.rejects(
    api.updateCampaign('author', requests[index]),
    (error) => error.details?.reason === 'revision-conflict',
  );
  await update('unlink', switched.revision, { universeId: null });
  assert.equal((await record('universes/' + other)).campaignCount, 0);
});

test('SDK legacy first-link proof and concurrent links yield exact counts; an absent universe detaches without recreation', async () => {
  await admin.doc('universes/legacy').set({ authorId: 'author', name: 'Antigo' });
  const secondCampaign = 'campaign-sdk-current-0002';
  await studio.createCampaign('author', { operationId: secondCampaign, title: 'Outra mesa' });
  await Promise.all([
    update('legacy-a', 1, { universeId: 'legacy' }),
    update('legacy-b', 1, { universeId: 'legacy' }, 'author', secondCampaign),
  ]);
  assert.equal((await record('universes/legacy')).campaignCount, 2);
  assert.equal((await admin.collection('universes/legacy/campaigns').get()).size, 2);
  await admin.doc('universes/legacy').delete();
  const detached = await update('detach-orphan', 2, { universeId: null });
  assert.equal(detached.universeId, null);
  assert.equal((await admin.doc('universes/legacy').get()).exists, false);
  assert.equal((await admin.doc('universes/legacy/campaigns/' + campaignId).get()).exists, false);
  assert.equal(
    (await admin.doc('universes/legacy/campaigns/' + secondCampaign).get()).exists,
    true,
  );
  await admin.doc('universes/legacy-used').set({ authorId: 'author', name: 'Uso antigo' });
  await admin.doc('universes/legacy-used/campaigns/old').set({ campaignId: 'old' });
  await assert.rejects(update('bad-legacy', 3, { universeId: 'legacy-used' }), {
    code: 'failed-precondition',
  });
  assert.equal((await record('universes/legacy-used')).campaignCount, undefined);
});

test('SDK malformed use/counter or unsupported origin fails atomically without repairing data or overwriting the campaign', async () => {
  await update('link', 1, { universeId: 'first' });
  const before = await record(path);
  await admin.doc('universes/first').update({ campaignCount: 0 });
  await assert.rejects(update('bad-unlink', 2, { universeId: null }), {
    code: 'failed-precondition',
  });
  assert.deepEqual(await record(path), before);
  assert.equal((await admin.doc('universes/first/campaigns/' + campaignId).get()).exists, true);
  assert.equal(
    (await admin.doc('users/author/campaignOperations/' + op('bad-unlink')).get()).exists,
    false,
  );
  await assert.rejects(update('forged', 2, { provenance: { kind: 'independent' } }), {
    code: 'invalid-argument',
  });
  await admin.doc(path).update({ provenance: { kind: 'original', adventureId: 'future' } });
  await assert.rejects(update('future', 2, { title: 'Não permitido' }), {
    code: 'failed-precondition',
  });
  await admin.doc(path).delete();
  await assert.rejects(update('link', 1, { universeId: 'first' }), { code: 'not-found' });
  assert.equal((await admin.doc(path).get()).exists, false);
});
