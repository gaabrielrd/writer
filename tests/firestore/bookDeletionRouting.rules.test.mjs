import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  fieldUploadFixture,
  uploadAll,
} from '../../functions/test/helpers/bookLoreFieldUploadFixture.mjs';
import {
  bookLoreDeletionFixture,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-book-deletion-routing';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
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
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const legacyBook = (extra = {}) => ({
  authorId: 'author',
  title: 'Legacy',
  genre: 'Fantasy',
  synopsis: '',
  coverUrl: null,
  status: 'draft',
  wordCount: 0,
  createdAt: 1000,
  updatedAt: 1001,
  deleting: false,
  localLoreVersion: 0,
  ...extra,
});
async function begin(client, bookId = 'book') {
  const batch = writeBatch(client);
  batch.update(doc(client, 'books/' + bookId), {
    status: 'draft',
    deleting: true,
    updatedAt: 2000,
  });
  batch.delete(doc(client, 'publicBooks/' + bookId));
  await assertSucceeds(batch.commit());
}
for (const flags of [undefined, false])
  test(
    'SDK denies finalizing a legacy book with flags ' +
      flags +
      ' while the native server cleans its private preparation and resumes',
    async () => {
      const f = await fieldUploadFixture(admin, { value: '\ufeffprivate staged 🌙'.repeat(5000) });
      await admin
        .doc('books/book')
        .update(legacyBook(flags === undefined ? {} : { hasLoreResources: false }));
      const uploaded = await uploadAll(f),
        client = env.authenticatedContext(f.uid).firestore();
      assert.equal(
        (await admin.collection('books/book/bookResourceChunks').limit(1).get()).size,
        1,
      );
      const parent = await admin.doc('books/book').get();
      assert.equal(Object.hasOwn(parent.data(), 'hasLoreResources'), flags !== undefined);
      await assertSucceeds(
        updateDoc(doc(client, 'books/book'), { title: 'Metadata still editable', updatedAt: 1002 }),
      );
      await begin(client);
      const bypass = writeBatch(client);
      bypass.set(doc(client, 'deletedBooks/book'), { deletedAt: serverTimestamp() });
      bypass.delete(doc(client, 'books/book'));
      await assertFails(bypass.commit());
      assert.equal((await admin.doc('books/book').get()).exists, true);
      assert.equal((await admin.doc('deletedBooks/book').get()).exists, false);
      await assertFails(setDoc(doc(client, 'deletedBooks/book'), { deletedAt: serverTimestamp() }));
      const first = bookLoreDeletionFixture(admin, { operationId: 'routing-first-operation' });
      assert.equal((await first.step()).complete, false);
      const checkpoint = (await admin.doc('books/book').get()).data().sceneDeletionOperationId;
      assert.equal(checkpoint, first.operationId);
      assert.equal((await admin.doc('deletedBooks/book').get()).exists, false);
      await assertFails(deleteDoc(doc(client, 'books/book')));
      const resumed = bookLoreDeletionFixture(admin, { operationId: 'routing-resumed-operation' });
      const done = await finishBookLoreDeletion(resumed);
      assert.equal(done.complete, true);
      assert.equal((await admin.doc('books/book').get()).exists, false);
      assert.equal((await admin.doc('deletedBooks/book').get()).exists, true);
      assert.equal(
        (await admin.collection('books/book/bookResourceBodies').limit(1).get()).size,
        0,
      );
      assert.equal(
        (await admin.collection('books/book/bookResourceChunks').limit(1).get()).size,
        0,
      );
      assert.equal(
        (
          await f.factory().getBookLoreFieldUpload(f.uid, {
            uploadId: f.uploadId,
            startHash: f.startHash,
            jobToken: uploaded.jobToken,
          })
        ).phase,
        'cancelled',
      );
      assert.equal((await admin.doc(f.c.path).get()).exists, true);
      assert.equal(
        (await admin.doc('books/book/bookResourceLeases/' + f.prepared.manifest.bodyId).get())
          .exists,
        true,
      );
      assert.deepEqual(await resumed.step(), done);
      await assertFails(setDoc(doc(client, 'books/book'), legacyBook()));
      await assertFails(deleteDoc(doc(client, 'deletedBooks/book')));
    },
  );
test('SDK cannot remove even an empty legacy root with an existing tombstone; native deletion preserves other books and universe counts', async () => {
  const root = legacyBook({ universeId: 'world' });
  await admin.doc('books/book').create(root);
  await admin.doc('books/other').create({ ...root, title: 'Other book' });
  await admin.doc('universes/world').create({ authorId: 'author', name: 'World', bookCount: 2 });
  await admin.doc('universes/world/books/book').create({ bookId: 'book' });
  await admin.doc('universes/world/books/other').create({ bookId: 'other' });
  const client = env.authenticatedContext('author').firestore();
  await begin(client);
  await admin.doc('deletedBooks/book').create({ deletedAt: 1 });
  await assertFails(deleteDoc(doc(client, 'books/book')));
  await assertSucceeds(getDoc(doc(client, 'books/book')));
  await assertFails(updateDoc(doc(client, 'deletedBooks/book'), { deletedAt: 2 }));
  const f = bookLoreDeletionFixture(admin);
  assert.equal((await finishBookLoreDeletion(f)).complete, true);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await admin.doc('books/other').get()).data().title, 'Other book');
  assert.equal((await admin.doc('universes/world').get()).data().bookCount, 1);
  assert.equal((await admin.doc('universes/world/books/book').get()).exists, false);
  assert.equal((await admin.doc('universes/world/books/other').get()).exists, true);
  assert.equal((await admin.doc('deletedBooks/book').get()).exists, true);
});
