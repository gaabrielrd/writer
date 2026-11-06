import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc, setDoc, writeBatch } from 'firebase/firestore';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-book-backup-read';
const root = {
  authorId: 'author',
  title: 'Livro',
  status: 'published',
  createdAt: 1,
  updatedAt: 100,
  wordCount: 0,
  actCount: 1,
};
const chapter = {
  title: 'Vazio',
  order: 1,
  content: '',
  wordCount: 0,
  createdAt: 1,
  updatedAt: 100,
};
let environment, admin, api, progress;
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
const client = (uid = 'author') =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
const start = () => api.getBookBackupSource('author', { bookId: 'book' });
const list = (source, extra = {}) =>
  api.listBookBackupStructure('author', {
    bookId: 'book',
    sourceToken: source.sourceToken,
    kind: 'chapter',
    limit: 50,
    ...extra,
  });
const read = (source, item, extra = {}) =>
  api.readBookBackupStructure('author', {
    bookId: 'book',
    sourceToken: source.sourceToken,
    kind: 'chapter',
    ...item,
    index: 0,
    ...extra,
  });
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw new Error('Use somente emulador demo.');
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
  api = createBookBackupReadService({ db: admin });
  progress = createWorkProgressService({ db: admin, now: () => 500 });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').set(root);
  await admin.doc('books/book/chapters/existing').set(chapter);
  await admin
    .doc('books/book/acts/existing')
    .set({ name: null, order: 1, createdAt: 1, updatedAt: 100 });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
test('real author-only service reads are side-effect free and published root grants no private backup to other/anonymous SDKs', async () => {
  const source = await start(),
    snapshot = await admin.doc('books/book').get(),
    item = (await list(source)).items[0];
  const part = await read(source, item);
  assert.equal(JSON.parse(Buffer.from(part.chunkBase64, 'base64').toString()).content, '');
  assert.ok(snapshot.updateTime.isEqual((await admin.doc('books/book').get()).updateTime));
  assert.equal((await admin.doc('books/book/workProgress/current').get()).exists, false);
  for (const uid of [null, 'other']) {
    await assertFails(getDoc(doc(client(uid), 'books/book/chapters/existing')));
    await assert.rejects(api.getBookBackupSource(uid, { bookId: 'book' }), {
      code: uid ? 'not-found' : 'unauthenticated',
    });
    await assert.rejects(
      api.listBookBackupStructure(uid, {
        bookId: 'book',
        sourceToken: source.sourceToken,
        kind: 'chapter',
      }),
      { code: uid ? 'not-found' : 'unauthenticated' },
    );
    await assert.rejects(
      api.readBookBackupStructure(uid, {
        bookId: 'book',
        sourceToken: source.sourceToken,
        kind: 'chapter',
        ...item,
        index: 0,
      }),
      { code: uid ? 'not-found' : 'unauthenticated' },
    );
  }
});
test('native item versions detect isolated native metadata changes and ABA while SDK requires the root clock', async () => {
  const source = await start(),
    item = (await list(source)).items[0],
    snapshot = await admin.doc('books/book').get();
  const firestore = client();
  await assertFails(
    updateDoc(doc(firestore, 'books/book/chapters/existing'), { title: 'Outro título' }),
  );
  await admin.doc('books/book/chapters/existing').update({ title: 'Outro título' });
  assert.ok(snapshot.updateTime.isEqual((await admin.doc('books/book').get()).updateTime));
  assert.equal((await start()).sourceToken, source.sourceToken);
  assert.notEqual((await list(source)).items[0].itemToken, item.itemToken);
  await assert.rejects(read(source, item), { details: { reason: 'book-backup-item-changed' } });
  await assertFails(updateDoc(doc(firestore, 'books/book/chapters/existing'), { title: 'Vazio' }));
  await admin.doc('books/book/chapters/existing').update({ title: 'Vazio' });
  await assert.rejects(read(source, item), { code: 'failed-precondition' });
});
test('atomic SDK empty chapter addition/removal invalidates the old source even when total words stay zero', async () => {
  const firestore = client(),
    source = await start();
  let batch = writeBatch(firestore);
  batch.set(doc(firestore, 'books/book/chapters/empty'), chapter);
  batch.update(doc(firestore, 'books/book'), { updatedAt: 101 });
  await assertSucceeds(batch.commit());
  await assert.rejects(list(source), { details: { reason: 'book-backup-source-changed' } });
  const next = await start();
  batch = writeBatch(firestore);
  batch.delete(doc(firestore, 'books/book/chapters/empty'));
  batch.update(doc(firestore, 'books/book'), { updatedAt: 102 });
  await assertSucceeds(batch.commit());
  await assert.rejects(list(next), { code: 'failed-precondition' });
  assert.equal((await admin.doc('books/book').get()).data().wordCount, 0);
});
test('real Admin legacy create/delete writers invalidate root anchor, including empty prose and idempotent retry', async () => {
  const source = await start();
  const created = await progress.createLegacyChapter('author', {
    bookId: 'book',
    operationId: 'backup-read-create-chapter',
    input: { title: 'Nova', content: '', order: 2 },
  });
  await assert.rejects(list(source), { code: 'failed-precondition' });
  const next = await start();
  await progress.createLegacyChapter('author', {
    bookId: 'book',
    operationId: 'backup-read-create-chapter',
    input: { title: 'Nova', content: '', order: 2 },
  });
  assert.equal((await start()).sourceToken, next.sourceToken);
  await progress.deleteLegacyChapters('author', {
    bookId: 'book',
    operationId: 'backup-read-delete-chapter',
    chapters: [{ id: created.id, expectedUpdatedAt: created.updatedAt }],
  });
  await assert.rejects(list(next), { code: 'failed-precondition' });
  assert.equal((await admin.doc('books/book/chapters/' + created.id).get()).exists, false);
});
test('word-goal activation is captured; isolated control mutation invalidates source without changing root', async () => {
  const initial = await start();
  await progress.updateWorkProgress('author', {
    target: { kind: 'book', id: 'book' },
    operationId: 'backup-read-goal',
    expectedRevision: 0,
    patch: { wordGoal: 1000 },
  });
  await assert.rejects(list(initial), { code: 'failed-precondition' });
  const source = await start(),
    snapshot = await admin.doc('books/book').get();
  const part = await read(source, { id: 'book', itemToken: source.sourceToken }, { kind: 'book' });
  assert.deepEqual(JSON.parse(Buffer.from(part.chunkBase64, 'base64').toString()).progress, {
    editorialState: 'draft',
    wordGoal: 1000,
  });
  await admin.doc('books/book/workProgress/current').update({ wordGoal: 2000 });
  assert.ok(snapshot.updateTime.isEqual((await admin.doc('books/book').get()).updateTime));
  await assert.rejects(list(source), { details: { reason: 'book-backup-source-changed' } });
});
test('native metadata-only pages enumerate more than 50 actual Firestore documents in UTF-8 order', async () => {
  const batch = admin.batch();
  const ids = [
    ...Array.from({ length: 105 }, (_, i) => 'c' + String(i).padStart(3, '0')),
    '\ue000',
    '🌙',
  ];
  for (const id of ids)
    batch.set(admin.doc('books/book/chapters/' + id), {
      ...chapter,
      content: 'segredo 🌙'.repeat(1000),
    });
  await batch.commit();
  const source = await start(),
    captured = [];
  let cursor = null,
    pages = 0;
  do {
    const page = await list(source, { cursor });
    pages++;
    assert.ok(page.items.length <= 50);
    for (const item of page.items) assert.deepEqual(Object.keys(item), ['id', 'itemToken']);
    captured.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(pages, 3);
  assert.deepEqual(
    captured,
    [...ids, 'existing'].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))),
  );
});
test('multi-part real stored Unicode text survives JSON chunk boundaries and item recreation invalidates old proof', async () => {
  const content = 'ação 🌙\u0000'.repeat(15000),
    ref = admin.doc('books/book/chapters/existing');
  await ref.update({ content });
  const source = await start(),
    item = (await list(source)).items[0],
    parts = [];
  let count = 1;
  for (let index = 0; index < count; index++) {
    const part = await read(source, item, { index });
    count = part.chunkCount;
    const bytes = Buffer.from(part.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    parts.push(bytes);
  }
  assert.ok(count > 3);
  assert.equal(JSON.parse(Buffer.concat(parts).toString()).content, content);
  await ref.delete();
  await ref.set(chapter);
  assert.equal((await start()).sourceToken, source.sourceToken);
  await assert.rejects(read(source, item), { code: 'failed-precondition' });
});
test('deleting, missing and same-ID recreated roots block old source before body can be returned', async () => {
  const source = await start(),
    item = (await list(source)).items[0],
    ref = admin.doc('books/book');
  await ref.update({ deleting: true });
  await assert.rejects(read(source, item), { code: 'not-found' });
  await ref.delete();
  await assert.rejects(list(source), { code: 'not-found' });
  await ref.set(root);
  await assert.rejects(read(source, item), { details: { reason: 'book-backup-source-changed' } });
});
test('SDK cannot create/control wordGoal to forge a source, and tokens from another owned book are unusable', async () => {
  await assertFails(setDoc(doc(client(), 'books/book/workProgress/current'), { wordGoal: 999 }));
  await admin.doc('books/other').set(root);
  const other = await api.getBookBackupSource('author', { bookId: 'other' });
  await assert.rejects(list(other), { code: 'failed-precondition' });
  const source = await start(),
    cursor = (await list(source, { limit: 1 })).nextCursor;
  assert.equal(cursor, null);
});
