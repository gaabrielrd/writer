import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-book-backup';
const target = { kind: 'book', id: 'book' };
const rootData = {
  authorId: 'author',
  title: 'Livro',
  status: 'draft',
  createdAt: 1,
  updatedAt: 100,
  wordCount: 0,
  actCount: 1,
};
const chapterData = {
  title: 'Capítulo vazio',
  order: 1,
  content: '',
  wordCount: 0,
  createdAt: 1,
  updatedAt: 100,
};
const actData = { name: null, order: 1, createdAt: 1, updatedAt: 100 };
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
let environment, admin, history;
const client = (uid = 'author') =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
const source = () => history.getWorkHistoryBackupSource('author', { target });
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
  history = createWorkHistoryService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').set(rootData);
  await admin.doc('books/other').set(rootData);
  await admin.doc('books/book/chapters/existing').set(chapterData);
  await admin.doc('books/book/acts/existing').set(actData);
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});

test('SDK cannot add a chapter without advancing its book in the same atomic write', async () => {
  const firestore = client();
  const before = await source();
  await assertFails(setDoc(doc(firestore, 'books/book/chapters/new'), chapterData));
  assert.equal((await admin.doc('books/book/chapters/new').get()).exists, false);
  assert.deepEqual(await source(), before);
});
test('equal, lower, unrelated and previously advanced root writes cannot authorize a later chapter', async () => {
  const firestore = client();
  for (const patch of [
    { updatedAt: 100 },
    { updatedAt: 99 },
    { title: 'Outro título' },
    { wordCount: 1 },
  ]) {
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'books/book/chapters/new'), chapterData);
    batch.update(doc(firestore, 'books/book'), patch);
    await assertFails(batch.commit());
  }
  const wrongBook = writeBatch(firestore);
  wrongBook.set(doc(firestore, 'books/book/chapters/new'), chapterData);
  wrongBook.update(doc(firestore, 'books/other'), { updatedAt: 101 });
  await assertFails(wrongBook.commit());
  await assertSucceeds(updateDoc(doc(firestore, 'books/book'), { updatedAt: 101 }));
  await assertFails(setDoc(doc(firestore, 'books/book/chapters/new'), chapterData));
  assert.equal((await admin.doc('books/book/chapters/new').get()).exists, false);
});
test('atomic empty-chapter creation changes native token with words/history revision unchanged', async () => {
  const firestore = client(),
    before = await source();
  const rootBefore = await admin.doc('books/book').get();
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, 'books/book/chapters/new'), chapterData);
  batch.update(doc(firestore, 'books/book'), { updatedAt: 101 });
  await assertSucceeds(batch.commit());
  const after = await source(),
    rootAfter = await admin.doc('books/book').get();
  assert.notEqual(after.sourceToken, before.sourceToken);
  assert.equal(after.historyRevision, before.historyRevision);
  assert.equal(rootAfter.data().wordCount, 0);
  assert.ok(rootBefore.createTime.isEqual(rootAfter.createTime));
  assert.equal(rootBefore.updateTime.isEqual(rootAfter.updateTime), false);
  await assert.rejects(
    () =>
      history.listWorkVersions('author', {
        target,
        limit: 50,
        expectedHistoryToken: before.sourceToken,
      }),
    (error) =>
      error.code === 'failed-precondition' && error.details?.reason === 'history-snapshot-changed',
  );
});
test('SDK cannot remove a live-book chapter without atomically advancing the same root', async () => {
  const firestore = client(),
    before = await source();
  await assertFails(deleteDoc(doc(firestore, 'books/book/chapters/existing')));
  const same = writeBatch(firestore);
  same.delete(doc(firestore, 'books/book/chapters/existing'));
  same.update(doc(firestore, 'books/book'), { updatedAt: 100 });
  await assertFails(same.commit());
  assert.equal((await admin.doc('books/book/chapters/existing').get()).exists, true);
  assert.deepEqual(await source(), before);
  const valid = writeBatch(firestore);
  valid.delete(doc(firestore, 'books/book/chapters/existing'));
  valid.update(doc(firestore, 'books/book'), { updatedAt: 101 });
  await assertSucceeds(valid.commit());
  assert.equal((await admin.doc('books/book/chapters/existing').get()).exists, false);
  assert.notEqual((await source()).sourceToken, before.sourceToken);
});
test('matching actCount alone cannot authorize another act, but atomic UI creation remains valid', async () => {
  const firestore = client(),
    before = await source();
  await assertFails(setDoc(doc(firestore, 'books/book/acts/new'), actData));
  const invalid = writeBatch(firestore);
  invalid.set(doc(firestore, 'books/book/acts/new'), { ...actData, order: 2 });
  invalid.update(doc(firestore, 'books/book'), { actCount: 2 });
  await assertFails(invalid.commit());
  const valid = writeBatch(firestore);
  valid.set(doc(firestore, 'books/book/acts/new'), { ...actData, order: 2 });
  valid.update(doc(firestore, 'books/book'), { actCount: 2, updatedAt: 101 });
  await assertSucceeds(valid.commit());
  assert.equal((await admin.doc('books/book/acts/new').get()).data().order, 2);
  assert.notEqual((await source()).sourceToken, before.sourceToken);
});
test('an atomic clock does not grant another account or anonymous access', async () => {
  for (const uid of ['other', null]) {
    const firestore = client(uid),
      batch = writeBatch(firestore);
    batch.set(doc(firestore, 'books/book/chapters/foreign'), chapterData);
    batch.update(doc(firestore, 'books/book'), { updatedAt: 101 });
    await assertFails(batch.commit());
    await assertFails(deleteDoc(doc(firestore, 'books/book/chapters/existing')));
  }
  assert.equal((await admin.doc('books/book/chapters/foreign').get()).exists, false);
  assert.equal((await admin.doc('books/book/chapters/existing').get()).exists, true);
});
test('legacy missing or invalid updatedAt can be repaired by the mutation without inventing createdAt', async () => {
  const firestore = client();
  for (const [index, previous] of [undefined, null, 'antiga', -1, NaN].entries()) {
    const undated = { ...rootData };
    delete undated.updatedAt;
    await admin
      .doc('books/book')
      .set({ ...undated, ...(previous === undefined ? {} : { updatedAt: previous }) });
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'books/book/chapters/legacy-' + index), chapterData);
    batch.update(doc(firestore, 'books/book'), { updatedAt: 101 });
    await assertSucceeds(batch.commit());
    const result = (await admin.doc('books/book').get()).data();
    assert.equal(result.createdAt, 1);
    assert.equal(result.updatedAt, 101);
  }
  const undated = { ...rootData };
  delete undated.createdAt;
  delete undated.updatedAt;
  await admin.doc('books/book').set(undated);
  const repair = writeBatch(firestore);
  repair.set(doc(firestore, 'books/book/chapters/undated'), chapterData);
  repair.update(doc(firestore, 'books/book'), { updatedAt: 101 });
  await assertSucceeds(repair.commit());
  assert.equal('createdAt' in (await admin.doc('books/book').get()).data(), false);
});
test('cleanup of a book already deleting remains allowed and creation stays blocked', async () => {
  await admin.doc('books/book').update({ deleting: true });
  const firestore = client();
  await assertSucceeds(deleteDoc(doc(firestore, 'books/book/chapters/existing')));
  await assertFails(setDoc(doc(firestore, 'books/book/chapters/new'), chapterData));
  await assertFails(setDoc(doc(firestore, 'books/book/acts/new'), actData));
});
test('a 200-chapter batch shares one root advance for create and removal', async () => {
  const firestore = client(),
    before = await source();
  const create = writeBatch(firestore);
  for (let index = 0; index < 200; index += 1) {
    create.set(doc(firestore, 'books/book/chapters/batch-' + index), {
      ...chapterData,
      actId: 'existing',
      order: index + 2,
    });
  }
  create.update(doc(firestore, 'books/book'), { updatedAt: 101 });
  await assertSucceeds(create.commit());
  assert.equal((await admin.collection('books/book/chapters').get()).size, 201);
  const middle = await source();
  assert.notEqual(middle.sourceToken, before.sourceToken);
  const remove = writeBatch(firestore);
  for (let index = 0; index < 200; index += 1) {
    remove.delete(doc(firestore, 'books/book/chapters/batch-' + index));
  }
  remove.update(doc(firestore, 'books/book'), { updatedAt: 102 });
  await assertSucceeds(remove.commit());
  assert.equal((await admin.collection('books/book/chapters').get()).size, 1);
  assert.notEqual((await source()).sourceToken, middle.sourceToken);
});
test('direct chapter metadata remains allowed and proves why a separate native readset is still needed', async () => {
  const before = await source();
  const chapterBefore = await admin.doc('books/book/chapters/existing').get();
  await assertSucceeds(
    updateDoc(doc(client(), 'books/book/chapters/existing'), { title: 'Título revisto' }),
  );
  const chapterAfter = await admin.doc('books/book/chapters/existing').get();
  assert.equal(chapterAfter.data().title, 'Título revisto');
  assert.equal(chapterBefore.updateTime.isEqual(chapterAfter.updateTime), false);
  assert.deepEqual(await source(), before);
});
