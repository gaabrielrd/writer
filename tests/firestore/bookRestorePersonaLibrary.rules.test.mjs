import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import {
  readAvailablePersonaMetadata,
  readPersonaRestoreBatchProof,
} from '../../functions/src/personaAvailability.mjs';
import {
  readyRestorePersonaLibrary,
  finishRestorePersonaLibrary,
} from '../../functions/test/helpers/bookRestorePersonaLibraryFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-persona-library',
  uid = 'author',
  id = 'persona-library-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
const factory = () => createBookRestoreUploadService({ db: admin });
const batchRef = (p) => admin.doc('users/' + uid + '/aiPersonaRestoreBatches/' + p.bookId);
const copies = (p) =>
  admin
    .collection('users/' + uid + '/aiPersonas')
    .where('restoreOrigin.bookId', '==', p.bookId)
    .get();
const origin = (p) => ({ schemaVersion: 1, bookId: p.bookId, restoreId: id, jobToken: p.jobToken });
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Dedicated local emulator required.');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  api = factory();
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});

test('SDK copies exact pending library snapshots, atomically rejects collisions and revokes before certified cleanup', async () => {
  const initial = await readyRestorePersonaLibrary(factory, uid, id),
    definitions = (
      await admin
        .collection(root + '/preparedPersonas')
        .orderBy('__name__')
        .get()
    ).docs,
    saved = definitions.map((d) => d.data().profile),
    firstRequest = mutation(id, initial, 'persona-library-first01'),
    installed = await api.advanceBookRestorePersonaLibrary(uid, firstRequest),
    p = installed.progress,
    batch = await batchRef(p).get(),
    first = (await copies(p)).docs[0],
    journal = (
      await admin
        .collection(root + '/materializationArtifacts')
        .where('kind', '==', 'persona-library-profile')
        .get()
    ).docs[0],
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + firstRequest.operationId)
      .get();
  assert.equal(saved.length, 3);
  for (const row of [first, journal, receipt]) assert.ok(row.createTime.isEqual(batch.createTime));
  assert.ok(batch.updateTime.isEqual(receipt.createTime));
  assert.equal(batch.data().profileCount, 1);
  const collision = admin.doc('users/' + uid + '/aiPersonas/' + definitions[1].id),
    nextRequest = mutation(id, p, 'persona-library-collision01'),
    before = await admin.doc(root).get();
  await collision.create({ keep: true });
  await assert.rejects(() => api.advanceBookRestorePersonaLibrary(uid, nextRequest));
  assert.ok((await admin.doc(root).get()).updateTime.isEqual(before.updateTime));
  assert.ok((await batchRef(p).get()).updateTime.isEqual(batch.updateTime));
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + nextRequest.operationId).get())
      .exists,
    false,
  );
  assert.deepEqual((await collision.get()).data(), { keep: true });
  await collision.delete();
  const finished = await finishRestorePersonaLibrary(
      factory,
      uid,
      id,
      (await api.advanceBookRestorePersonaLibrary(uid, nextRequest)).progress,
    ),
    profiles = (await copies(p)).docs,
    finalBatch = await batchRef(p).get(),
    last = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + finalBatch.data().lastOperationId)
      .get();
  assert.equal(profiles.length, 3);
  for (const row of profiles) {
    const { restoreOrigin, ...profile } = row.data();
    assert.deepEqual(restoreOrigin, origin(p));
    assert.deepEqual(
      profile,
      saved.find((value) => value.id === row.id),
    );
    assert.equal(
      await admin.runTransaction((tx) => readAvailablePersonaMetadata(tx, admin, uid, row.id)),
      null,
    );
  }
  assert.equal(finalBatch.data().state, 'preparing');
  assert.ok(finalBatch.createTime.isEqual(batch.createTime));
  assert.ok(finalBatch.updateTime.isEqual(last.createTime));
  assert.equal(finished.preparation.phase, 'resources-finalize');
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  assert.equal(
    (await admin.doc('books/' + p.bookId + '/workProgress/current').get()).data().countReady,
    false,
  );
  const own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other').firestore();
  await assertSucceeds(getDoc(doc(own, first.ref.path)));
  await assertFails(getDoc(doc(other, first.ref.path)));
  await assertFails(
    setDoc(doc(own, first.ref.path), {
      ...first.data(),
      name: 'Changed',
      revision: first.data().revision + 1,
    }),
  );
  await assertFails(updateDoc(doc(own, finalBatch.ref.path), { state: 'active' }));
  const existing = admin.doc('books/existing-book');
  await existing.create({
    authorId: uid,
    title: 'Existing',
    status: 'draft',
    createdAt: 1,
    updatedAt: 2,
  });
  await assertFails(updateDoc(doc(own, existing.path), { personaId: first.id }));
  const keep = admin.doc('users/' + uid + '/aiPersonas/custom-existing');
  await keep.create({ keep: true });
  let current = (
    await api.cancelBookRestore(uid, mutation(id, finished, 'persona-library-cancel01'))
  ).progress;
  assert.equal(current.integrity.cleanupPhase, 'persona-library');
  current = (
    await api.advanceBookRestoreCleanup(uid, {
      ...mutation(id, current, 'persona-library-revoke01'),
      limit: 1,
    })
  ).progress;
  assert.equal(current.integrity.cleanupPhase, 'cover-storage');
  assert.equal((await batchRef(p).get()).data().state, 'cancelled');
  assert.equal((await copies(p)).size, 3);
  const done = await cleanupLegacyRestore(api, uid, id, current, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal((await copies(p)).empty, true);
  assert.deepEqual((await keep.get()).data(), { keep: true });
  assert.ok(
    await admin.runTransaction((tx) =>
      readPersonaRestoreBatchProof(tx, admin, uid, origin(p), 'cancelled'),
    ),
  );
  assert.deepEqual(
    (await api.advanceBookRestorePersonaLibrary(uid, firstRequest)).receipt,
    installed.receipt,
  );
  assert.equal((await copies(p)).empty, true);
});

for (const kind of ['profile', 'batch'])
  test(
    'SDK recreated native ' + kind + ' is preserved and cannot inherit restore authority',
    async () => {
      const initial = await readyRestorePersonaLibrary(factory, uid, id),
        p = (
          await api.advanceBookRestorePersonaLibrary(
            uid,
            mutation(id, initial, 'persona-library-aba-first01'),
          )
        ).progress,
        ref = kind === 'batch' ? batchRef(p) : (await copies(p)).docs[0].ref,
        original = await ref.get(),
        value = original.data();
      await ref.delete();
      await ref.create(value);
      const recreated = await ref.get();
      assert.equal(recreated.createTime.isEqual(original.createTime), false);
      if (kind === 'batch')
        await assert.rejects(() =>
          api.advanceBookRestorePersonaLibrary(uid, mutation(id, p, 'persona-library-aba-next01')),
        );
      await assert.rejects(() => cleanupLegacyRestore(api, uid, id, p, { limit: 5 }));
      const current = await ref.get();
      assert.ok(current.createTime.isEqual(recreated.createTime));
      assert.deepEqual(current.data(), value);
      assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
      if (kind === 'profile') assert.equal((await batchRef(p).get()).data().state, 'cancelled');
    },
  );
