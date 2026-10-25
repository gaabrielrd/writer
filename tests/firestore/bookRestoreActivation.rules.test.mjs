import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import {
  readyActivation,
  activate,
  uid,
} from '../../functions/test/helpers/bookRestoreActivationFixture.mjs';
import { universeRestoreFixture } from '../../functions/test/helpers/bookRestoreUniverseFixture.mjs';
import { coverRestoreFixture } from '../../functions/test/helpers/bookRestoreCoverFixture.mjs';
import { bookRestoreStorageBucket } from '../../functions/test/helpers/bookRestoreStorageBucket.mjs';
import { createBookRestoreCoverStorage } from '../../functions/src/bookRestoreCoverStorage.mjs';
import { born } from '../../functions/src/bookRestoreUploadContracts.mjs';
import { legacyMutation as mutation } from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { readPersonaRestoreBatchProof } from '../../functions/src/personaAvailability.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  sharp = requireFunctions('sharp'),
  projectId = 'demo-writer-restore-activation';
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback demo emulator required');
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
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK atomic book activation binds root, control, batch, universe and receipt; Rules protect origin and historical replay survives deletion', async () => {
  const world = admin.doc('universes/world');
  await world.create({
    authorId: uid,
    bookCount: 0,
    name: 'DO NOT COPY GLOBAL BODY',
    updatedAt: 1,
  });
  const origin = { kind: 'reference', id: 'world', created: born(await world.get()) },
    f = await readyActivation({ db: admin, records: universeRestoreFixture(origin) }),
    batchRef = admin.doc('users/' + uid + '/aiPersonaRestoreBatches/' + f.p.bookId),
    beforeBatch = await batchRef.get(),
    answer = await activate(f),
    root = await admin.doc('books/' + f.p.bookId).get(),
    control = await admin.doc(root.ref.path + '/workProgress/current').get(),
    batch = await batchRef.get(),
    job = await admin.doc(f.root).get(),
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + f.request.operationId)
      .get();
  assert.equal(answer.progress.state, 'activated');
  assert.equal(root.data().status, 'draft');
  assert.equal(root.data().universeId, 'world');
  assert.equal(control.data().countReady, true);
  assert.equal(batch.data().state, 'active');
  assert.equal(batch.createTime.isEqual(beforeBatch.createTime), true);
  for (const snap of [root, control, batch, job])
    assert.equal(snap.updateTime.isEqual(receipt.createTime), true);
  assert.equal(root.createTime.isEqual(receipt.createTime), true);
  assert.equal((await world.get()).data().bookCount, 1);
  assert.deepEqual((await admin.doc('universes/world/books/' + f.p.bookId).get()).data(), {
    bookId: f.p.bookId,
  });
  assert.equal((await admin.doc('deletedBooks/' + f.p.bookId).get()).exists, false);
  assert.equal((await admin.doc('bookRestoreReservations/' + f.p.bookId).get()).exists, true);
  assert.ok(
    await admin.runTransaction((tx) =>
      readPersonaRestoreBatchProof(
        tx,
        admin,
        uid,
        {
          schemaVersion: 1,
          bookId: f.p.bookId,
          restoreId: f.id,
          jobToken: f.p.jobToken,
        },
        'active',
      ),
    ),
  );
  const own = env.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(own, root.ref.path)));
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), root.ref.path)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), root.ref.path)));
  await assertFails(updateDoc(doc(own, root.ref.path), { restoreOrigin: deleteField() }));
  await assertFails(
    updateDoc(doc(own, root.ref.path), {
      'restoreOrigin.activationOperationId': 'forged-operation-001',
    }),
  );
  await assertSucceeds(updateDoc(doc(own, root.ref.path), { title: 'Edited after activation' }));
  const manual = {
    id: 'manual-book',
    authorId: uid,
    title: 'Manual',
    status: 'draft',
    localLoreVersion: 0,
    createdAt: 100,
    updatedAt: 100,
  };
  await assertFails(
    setDoc(doc(own, 'books/forged-origin'), {
      ...manual,
      restoreOrigin: root.data().restoreOrigin,
    }),
  );
  await assertSucceeds(setDoc(doc(own, 'books/manual-book'), manual));
  assert.deepEqual(await activate(f), answer);
  await assert.rejects(() =>
    f
      .factory()
      .cancelBookRestore(uid, mutation(f.id, answer.progress, f.id + '-sdk-cancel-denied')),
  );
  await root.ref.delete();
  await admin.doc('deletedBooks/' + f.p.bookId).create({ ownerId: uid, kind: 'normal-deletion' });
  assert.deepEqual(await activate(f), answer);
  assert.deepEqual(
    await f.factory().getBookRestore(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
    answer.progress,
  );
  assert.equal((await root.ref.get()).exists, false);
  assert.equal((await world.get()).data().bookCount, 1);
});
test('SDK atomic book activation registers a private pending cover and its use without accepting Storage', async () => {
  const png = await sharp({ create: { width: 3, height: 4, channels: 4, background: '#123456' } })
      .png()
      .toBuffer(),
    storage = bookRestoreStorageBucket(),
    assets = createBookRestoreCoverStorage(storage.bucket),
    f = await readyActivation({
      db: admin,
      records: coverRestoreFixture({ bytes: png }),
      restoreAssets: assets,
    }),
    events = storage.events.length,
    answer = await activate(f),
    imageId = f.p.preparation.cover.imageId,
    image = await admin.doc('users/' + uid + '/imageLibrary/' + imageId).get(),
    use = await admin.doc(image.ref.path + '/uses/' + f.p.bookId).get(),
    root = await admin.doc('books/' + f.p.bookId).get(),
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + f.request.operationId)
      .get();
  assert.equal(answer.progress.activation.mediaState, 'pending');
  assert.equal(image.data().state, 'preparing');
  assert.equal(image.data().useCount, 1);
  assert.equal(image.data().url, null);
  assert.deepEqual(use.data(), { bookId: f.p.bookId });
  assert.equal(root.data().coverImageId, imageId);
  assert.equal(root.data().coverUrl, null);
  for (const snap of [image, use, root])
    assert.equal(snap.createTime.isEqual(receipt.createTime), true);
  assert.equal(storage.version(image.data().path).metadata.metadata.accepted, 'false');
  assert.ok(storage.events.slice(events).every((e) => e.method === 'head'));
  assert.deepEqual(await activate(f), answer);
});
