import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch, updateDoc } from 'firebase/firestore';
import {
  creationFixture,
  seedCreationBook,
} from '../../functions/test/helpers/bookLoreCreationFixture.mjs';
import {
  openCreationReservation,
  assertCreationOpening,
} from '../../functions/src/bookLoreCreationStore.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-book-lore-creation';
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
const data = async (path) => (await admin.doc(path).get()).data();
async function snapshots(paths) {
  return Promise.all(
    paths.map(async (path) => {
      const s = await admin.doc(path).get();
      return {
        path,
        exists: s.exists,
        value: s.data(),
        create: s.createTime?.toMillis(),
        update: s.updateTime?.toMillis(),
      };
    }),
  );
}

test('SDK concurrent native reservations preserve publication and clocks, block the reserved ID and leave unrelated creation usable', async () => {
  await seedCreationBook(admin, 'book', 'author', {
    title: 'Book',
    localLoreVersion: 0,
    publicationPrivacyVersion: 0,
    historyRevision: 0,
    status: 'published',
  });
  await admin.doc('publicBooks/book').create({ revisionId: 'old' });
  const f = creationFixture(admin),
    client = env.authenticatedContext(f.uid).firestore(),
    anonymous = env.unauthenticatedContext().firestore(),
    [p, retry] = await Promise.all([f.start(), f.start()]),
    context = await admin.doc(f.c.path).get(),
    marker = await admin.doc(f.c.reservationPath).get(),
    book = await admin.doc('books/book').get();
  assert.deepEqual(p, retry);
  assert.equal(context.createTime.isEqual(marker.createTime), true);
  assert.equal(context.createTime.isEqual(book.updateTime), true);
  assert.equal(book.data().localLoreVersion, 0);
  assert.equal(book.data().publicationPrivacyVersion, 0);
  assert.equal(book.data().updatedAt, 1001);
  assert.equal(book.data().status, 'published');
  assert.equal((await admin.doc('books/book/lore/' + p.loreId).get()).exists, false);
  await assertSucceeds(getDoc(doc(anonymous, 'publicBooks/book')));
  await assertFails(getDoc(doc(client, f.c.path)));
  await assertFails(getDoc(doc(client, f.c.reservationPath)));
  await assertFails(setDoc(doc(client, f.c.reservationPath), {}));
  await assertFails(updateDoc(doc(client, 'books/book'), { hasLoreResources: false }));
  const positive = writeBatch(client),
    head = { bookId: 'book', name: 'Other', category: 'other', isPublic: false };
  positive.update(doc(client, 'books/book'), { localLoreVersion: 1 });
  positive.set(doc(client, 'books/book/lore/other'), head);
  await assertFails(positive.commit());
  const unrelated = await creationAdoptionFixture(admin, {
    creationId: 'unrelated-creation-native-0001',
    editId: 'unrelated-edit-native-0001',
  });
  await adoptCreation(unrelated);
  const rejected = writeBatch(client);
  rejected.update(doc(client, 'books/book'), { localLoreVersion: 2 });
  rejected.set(doc(client, 'books/book/lore/' + p.loreId), head);
  await assertFails(rejected.commit());
  assert.equal((await data('books/book')).localLoreVersion, 1);
  await admin.runTransaction(async (tx) =>
    assertCreationOpening(tx, await openCreationReservation(tx, f.c, { jobToken: p.jobToken })),
  );
  const done = await f.cancel('cancel-native-reservation', p.jobToken),
    cancelled = await admin.doc(f.c.cancelRef.path).get(),
    proof = await admin.doc(f.c.proofRef.path).get();
  assert.equal(cancelled.createTime.isEqual(proof.createTime), true);
  assert.equal(done.phase, 'cancelled');
  assert.deepEqual(await f.start(), done);
  assert.equal((await admin.doc(f.c.reservationPath).get()).exists, true);
  assert.equal((await admin.doc(unrelated.headPath).get()).exists, true);
});

test('SDK a prestart fence stays private and a recreated marker cannot authorize a premature head or the original reservation', async () => {
  const before = creationFixture(admin, { bookId: 'foreign' }),
    p = await before.cancel();
  assert.equal(p.jobToken, null);
  assert.equal((await admin.doc(before.c.reservationPath).get()).exists, false);
  await seedCreationBook(admin, 'foreign', 'other');
  const root = await snapshots(['books/foreign']);
  assert.deepEqual(await before.start(), p);
  assert.deepEqual(await snapshots(['books/foreign']), root);
  await seedCreationBook(admin);
  const f = creationFixture(admin, { creationId: 'creation-operation-native-0002' }),
    ready = await f.start(),
    headPath = 'books/book/lore/' + ready.loreId,
    head = { bookId: 'book', name: 'Premature', category: 'other' };
  await admin.doc(headPath).create(head);
  await assert.rejects(() =>
    createBookLoreReadService({ db: admin }).getBookLoreRead(f.uid, {
      bookId: 'book',
      id: ready.loreId,
    }),
  );
  await assert.rejects(() => f.cancel());
  const ref = admin.doc(f.c.reservationPath),
    original = await ref.get(),
    value = original.data();
  await ref.delete();
  await ref.create(value);
  assert.equal((await ref.get()).createTime.isEqual(original.createTime), false);
  await assert.rejects(() => f.get());
  assert.deepEqual(await data(headPath), head);
});

test('SDK book cleanup rolls back creation cancellation with its checkpoint and preserves the permanent IDs after deleting root', async () => {
  await seedCreationBook(admin);
  const f = creationFixture(admin),
    p = await f.start(),
    book = bookLoreDeletionFixture(admin);
  await markBookDeleting(book);
  for (
    let i = 0;
    i < 1000 &&
    (await data('users/author/bookLoreDeletions/book/state/current'))?.phase !== 'creations';
    i++
  )
    await book.step();
  const outer = 'users/author/sceneOperations/' + book.operationId,
    paths = [
      f.c.path,
      f.c.reservationPath,
      f.c.cancelRef.path,
      f.c.proofRef.path,
      outer,
      'users/author/bookLoreDeletions/book/state/current',
      'books/book',
    ],
    before = await snapshots(paths),
    run = admin.runTransaction.bind(admin);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'set')
              return (ref, ...args) => {
                const result = target.set(ref, ...args);
                if (ref.path === outer) throw Error('injected creation checkpoint failure');
                return result;
              };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(() => book.step(), /injected creation checkpoint failure/);
  } finally {
    admin.runTransaction = run;
  }
  assert.deepEqual(await snapshots(paths), before);
  await finishBookLoreDeletion(book);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  const done = await f.get();
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.jobToken, p.jobToken);
  assert.deepEqual(await f.start(), done);
  assert.equal((await admin.doc(f.c.reservationPath).get()).exists, true);
});
