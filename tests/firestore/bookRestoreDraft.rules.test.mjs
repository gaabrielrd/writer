import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import {
  draftRestoreFixture,
  readyRestoreDraft,
} from '../../functions/test/helpers/bookRestoreDraftFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-draft',
  uid = 'author',
  id = 'restore-draft-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
const factory = () => createBookRestoreUploadService({ db: admin });
before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(host ?? '')) throw new Error('Use a local demo emulator.');
  const [address, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: address,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com' });
  api = factory();
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK stages exact draft and persona privately, rolls back a body collision and cleans the v11 inventory', async () => {
  const content = '\ufeff' + '🌙'.repeat(16383) + 'fim',
    initial = await readyRestoreDraft(factory, uid, id, draftRestoreFixture({ content })),
    request = mutation(id, initial, 'draft-sdk-first01'),
    first = (await api.advanceBookRestoreDraft(uid, request)).progress,
    versionId = first.preparation.draft.versionId,
    secondBody = admin.doc(
      'books/' + first.bookId + '/workVersionBodies/' + digest({ versionId, index: 1 }),
    ),
    profile = admin.doc(root + '/preparedPersonas/' + first.preparation.personas.draftProfileId),
    profileBefore = await profile.get(),
    before = await admin.doc(root).get(),
    nextRequest = mutation(id, first, 'draft-sdk-second01');
  assert.equal(first.preparation.draft.parts, 1);
  assert.equal((await admin.doc(root + '/preparedDrafts/current').get()).exists, false);
  await secondBody.create({ foreign: true });
  await assert.rejects(() => api.advanceBookRestoreDraft(uid, nextRequest));
  const after = await admin.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal((await secondBody.get()).data().foreign, true);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + nextRequest.operationId).get())
      .exists,
    false,
  );
  await secondBody.delete();
  const response = await api.advanceBookRestoreDraft(uid, nextRequest),
    p = response.progress,
    descriptor = await admin.doc(root + '/preparedDrafts/current').get(),
    journal = (
      await admin
        .collection(root + '/materializationArtifacts')
        .where('kind', '==', 'draft-definition')
        .get()
    ).docs[0],
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + nextRequest.operationId)
      .get(),
    bodies = (
      await admin
        .collection('books/' + p.bookId + '/workVersionBodies')
        .where('versionId', '==', versionId)
        .orderBy('index')
        .get()
    ).docs;
  assert.equal(p.preparation.phase, 'draft-finalize');
  assert.equal(descriptor.data().outcome, 'version');
  assert.equal(bodies.map((s) => s.data().content).join(''), content);
  assert.equal(descriptor.data().chapter.title, '  Draft title 🌙  ');
  assert.equal(descriptor.data().chapter.createdAt, 111);
  assert.ok(descriptor.createTime.isEqual(journal.createTime));
  assert.ok(descriptor.createTime.isEqual(receipt.createTime));
  assert.ok((await profile.get()).updateTime.isEqual(profileBefore.updateTime));
  assert.equal(
    (await profile.get()).data().profile.instructions,
    '\ufeff  Draft exact\nOnly here  ',
  );
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDoc(doc(actor.firestore(), descriptor.ref.path)));
    await assertFails(setDoc(doc(actor.firestore(), descriptor.ref.path), { state: 'replace' }));
  }
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  assert.equal(
    (await admin.doc('books/' + p.bookId + '/workVersions/' + versionId).get()).exists,
    false,
  );
  assert.equal(
    (await admin.doc('books/' + p.bookId + '/workProgress/current').get()).data().countReady,
    false,
  );
  assert.deepEqual(
    (await api.advanceBookRestoreDraft(uid, request)).receipt.operationId,
    request.operationId,
  );
  const library = admin.doc(
    'users/' + uid + '/aiPersonas/' + p.preparation.personas.draftProfileId,
  );
  await library.create({ keep: true });
  const terminal = await cleanupLegacyRestore(api, uid, id, p, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal((await admin.collection(root + '/preparedDrafts').get()).empty, true);
  assert.equal(
    (await admin.collection('books/' + p.bookId + '/workVersionBodies').get()).empty,
    true,
  );
  assert.equal((await library.get()).data().keep, true);
});
test('SDK cleanup preserves a recreated draft descriptor instead of trusting its old journal', async () => {
  const initial = await readyRestoreDraft(factory, uid, id),
    p = (await api.advanceBookRestoreDraft(uid, mutation(id, initial, 'draft-sdk-descriptor02')))
      .progress,
    descriptor = await admin.doc(root + '/preparedDrafts/current').get(),
    value = descriptor.data();
  await descriptor.ref.delete();
  await descriptor.ref.create(value);
  const recreated = await descriptor.ref.get();
  assert.equal(recreated.createTime.isEqual(descriptor.createTime), false);
  const cancelling = (await api.cancelBookRestore(uid, mutation(id, p, 'draft-sdk-cancel02')))
    .progress;
  await assert.rejects(() => cleanupLegacyRestore(api, uid, id, cancelling, { limit: 5 }));
  const current = await descriptor.ref.get();
  assert.ok(current.createTime.isEqual(recreated.createTime));
  assert.deepEqual(current.data(), value);
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
});
