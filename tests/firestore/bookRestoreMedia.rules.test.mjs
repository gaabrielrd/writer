import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  readyMedia,
  finishMedia,
  mediaState,
  uid,
} from '../../functions/test/helpers/bookRestoreMediaFixture.mjs';
import { createImageLibraryService } from '../../functions/src/imageLibrary.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-media';
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
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK restored media resumes after external failure, commits URLs and private proofs together, and preserves deletion and activation history', async () => {
  const f = await readyMedia({ db: admin }),
    imageId = f.p.preparation.cover.imageId,
    imageRef = admin.doc('users/' + uid + '/imageLibrary/' + imageId),
    rootRef = admin.doc('books/' + f.p.bookId),
    job = await admin.doc(f.root).get(),
    activation = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + f.request.operationId)
      .get(),
    imageBefore = await imageRef.get(),
    rootBefore = await rootRef.get();
  f.hooks.after = () => {
    throw Error('lost Storage response');
  };
  await assert.rejects(() => finishMedia(f), /lost Storage response/);
  assert.equal((await imageRef.get()).data().state, 'preparing');
  assert.equal((await rootRef.get()).data().coverUrl, null);
  const stored = f.storage.version(imageBefore.data().path),
    token = stored.metadata.metadata.firebaseStorageDownloadTokens;
  assert.equal(stored.metadata.metadata.accepted, 'true');
  f.hooks.after = null;
  const answer = await finishMedia(f),
    image = await imageRef.get(),
    root = await rootRef.get(),
    outcome = await admin.doc(f.root + '/activationMedia/current').get(),
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreMediaOperations/' + f.mediaRequest.operationId)
      .get();
  assert.equal(answer.media.state, 'ready');
  assert.equal(answer.media.imageAvailable, true);
  assert.equal(image.data().state, 'active');
  assert.ok(image.data().url.endsWith(token));
  assert.equal(root.data().coverUrl, image.data().url);
  assert.equal(image.data().useCount, 1);
  assert.equal(image.createTime.isEqual(imageBefore.createTime), true);
  assert.equal(root.createTime.isEqual(rootBefore.createTime), true);
  for (const snapshot of [image, root, outcome])
    assert.equal(snapshot.updateTime.isEqual(receipt.createTime), true);
  for (const original of [job, activation]) {
    const now = await original.ref.get();
    assert.deepEqual(now.data(), original.data());
    assert.equal(now.updateTime.isEqual(original.updateTime), true);
  }
  assert.equal(
    JSON.stringify({ answer, outcome: outcome.data(), receipt: receipt.data() }).includes(token),
    false,
  );
  assert.deepEqual(await finishMedia(f), answer);
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDoc(doc(actor.firestore(), outcome.ref.path)));
    await assertFails(getDoc(doc(actor.firestore(), receipt.ref.path)));
  }
  const own = env.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(own, image.ref.path)));
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), image.ref.path)));
  await assertFails(updateDoc(doc(own, image.ref.path), { url: 'https://forged.invalid' }));
  const library = createImageLibraryService({
    db: admin,
    assets: {
      retireRestoreImage: f.assets.retire,
      remove: (path) => f.storage.bucket().file(path).delete({ ignoreNotFound: true }),
    },
  });
  await library.detach(uid, f.p.bookId, imageId);
  await rootRef.delete();
  await admin.doc('deletedBooks/' + f.p.bookId).create({ ownerId: uid, kind: 'normal-deletion' });
  await library.remove(uid, { id: imageId });
  const retired = f.storage.version(image.data().path);
  assert.equal(retired.bytes.length, 0);
  assert.equal(retired.metadata.metadata.restoreState, 'retired');
  assert.equal(retired.metadata.metadata.firebaseStorageDownloadTokens, undefined);
  assert.equal(f.storage.versions.get(image.data().path).size, 1);
  assert.equal((await imageRef.get()).createTime.isEqual(image.createTime), true);
  const status = await mediaState(f),
    beforeEvents = f.storage.events.length;
  assert.equal(status.media.state, 'ready');
  assert.equal(status.media.imageAvailable, false);
  assert.equal((await finishMedia(f)).media.imageAvailable, false);
  assert.equal(f.storage.events.length, beforeEvents);
  assert.equal((await rootRef.get()).exists, false);
  assert.deepEqual(
    await f.factory().getBookRestore(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
    f.p,
  );
  const originalDeleted = await imageRef.get(),
    deletedValue = originalDeleted.data(),
    racingLibrary = createImageLibraryService({
      db: admin,
      assets: {
        async retireRestoreImage(...args) {
          const result = await f.assets.retire(...args);
          await imageRef.delete();
          await imageRef.create(deletedValue);
          return result;
        },
      },
    });
  await assert.rejects(() => racingLibrary.remove(uid, { id: imageId }));
  const recreatedDeleted = await imageRef.get();
  assert.equal(recreatedDeleted.createTime.isEqual(originalDeleted.createTime), false);
  assert.deepEqual(recreatedDeleted.data(), deletedValue);
  assert.equal(f.storage.version(image.data().path).bytes.length, 0);
  const value = outcome.data();
  await outcome.ref.delete();
  await outcome.ref.create(value);
  await assert.rejects(() => finishMedia(f));
  assert.deepEqual((await outcome.ref.get()).data(), value);
});
