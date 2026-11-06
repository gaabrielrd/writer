import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as collections } from '../../functions/src/bookEditorialStorage.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-editorial-book-deletion';
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use somente o emulador demo local.');
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
});
beforeEach(() => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
// Existing owned book plus stored editorial resources. This does not simulate v2 activation.
test('real book deletion removes bounded editorial parts before headers, rejects direct SDK mutation and preserves another copy and library', async () => {
  const root = 'books/book',
    request = {
      target: { kind: 'book', id: 'book' },
      operationId: 'editorial-sdk-book-delete',
      limit: 5,
    };
  await admin.doc(root).set({
    authorId: 'author',
    title: 'Own',
    genre: 'Fantasy',
    synopsis: '',
    coverUrl: null,
    status: 'draft',
    deleting: true,
    createdAt: 1,
    updatedAt: 100,
    wordCount: 0,
  });
  for (let index = 0; index < 53; index++)
    await admin
      .doc(root + '/' + collections.parts + '/body:' + String(index).padStart(15, '0'))
      .set({ privateBytes: 'PRIVATE_' + index });
  for (const [name, id] of [
    [collections.bodies, 'body'],
    [collections.records, 'record'],
    [collections.reviews, 'contract'],
    ['literaryProduction', 'current'],
    ['literaryContractVersions', '1'],
    ['literaryPlans', 'plan'],
    ['literaryPlanVersions', 'version'],
  ])
    await admin.doc(root + '/' + name + '/' + id).set({ private: true });
  await admin.doc('books/other').set({
    authorId: 'author',
    title: 'Other copy',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
  });
  const independent = 'books/other/' + collections.parts + '/own';
  await admin.doc(independent).set({ bytes: 'OTHER_COPY' });
  await admin.doc('users/author/aiPersonas/copied').set({ instructions: 'OWN_LIBRARY' });
  for (const actor of ['author', 'other']) {
    const sdk = environment.authenticatedContext(actor).firestore();
    await assertFails(getDoc(doc(sdk, root + '/' + collections.records + '/record')));
    await assertFails(
      setDoc(doc(sdk, root + '/' + collections.parts + '/injected'), { bytes: 'injected' }),
    );
  }
  let complete = false,
    previous = 53;
  for (let unit = 0; unit < 600; unit++) {
    const result = await createScenesService({ db: admin, now: () => 1000 }).deleteSceneBook(
      'author',
      request,
    );
    const parts = (await admin.collection(root + '/' + collections.parts).get()).size;
    assert.ok(previous - parts <= request.limit);
    assert.ok(parts <= previous);
    previous = parts;
    if (parts > 0)
      assert.equal((await admin.doc(root + '/' + collections.bodies + '/body').get()).exists, true);
    if (result.complete) {
      complete = true;
      break;
    }
  }
  assert.equal(complete, true);
  assert.equal((await admin.doc(root).get()).exists, false);
  for (const name of [
    ...Object.values(collections),
    'literaryProduction',
    'literaryContractVersions',
    'literaryPlans',
    'literaryPlanVersions',
  ])
    assert.equal(
      (
        await admin
          .collection(root + '/' + name)
          .limit(1)
          .get()
      ).empty,
      true,
    );
  assert.equal((await admin.doc('books/other').get()).data().title, 'Other copy');
  assert.deepEqual((await admin.doc(independent).get()).data(), { bytes: 'OTHER_COPY' });
  assert.deepEqual((await admin.doc('users/author/aiPersonas/copied').get()).data(), {
    instructions: 'OWN_LIBRARY',
  });
  const replay = await createScenesService({ db: admin, now: () => 1000 }).deleteSceneBook(
    'author',
    request,
  );
  assert.equal(replay.complete, true);
});
