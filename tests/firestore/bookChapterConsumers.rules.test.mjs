import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { chapterConsumersFixture } from '../../functions/test/helpers/bookChapterConsumersFixture.mjs';
import { prepareRestoredChapterText } from '../../functions/src/bookChapterText.mjs';
import { createBookChapterCleanupHandler } from '../../functions/src/bookChapterCleanup.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { countVisibleWords } from '../../functions/src/visibleWordCount.mjs';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookChapterBodyPlan } from '../../functions/src/bookChapterStorage.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-chapter-consumers',
  A = '\ufeff' + 'ação 🌙\n'.repeat(50000),
  B = '<p>' + 'y'.repeat(650000) + '</p>',
  chapter = 'books/book/chapters/chapter';
let env, admin;
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
});
beforeEach(() => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function fixture() {
  const f = await chapterConsumersFixture(admin);
  await f.save(A, 'native-consumer-save01');
  let count;
  do {
    count = await f.api.prepareWorkWordCount('author', {
      target: f.target,
      operationId: 'native-consumer-count01',
      limit: 25,
    });
  } while (!count.complete);
  return {
    ...f,
    body:
      'books/book/bookTextBodies/' + (await admin.doc(chapter).get()).data().contentStorage.bodyId,
  };
}
async function collect(path) {
  const handler = createBookChapterCleanupHandler({ db: admin }),
    e = {
      params: { bookId: 'book', bodyId: path.split('/').at(-1) },
      data: { after: await admin.doc(path).get() },
    };
  for (let i = 0; i < 5; i++) if ((await handler(e))?.complete) return;
  assert.fail('Cleanup did not finish');
}
test('native chat body creation failure rolls back credit, ledger, pins and receipt; concurrent replay charges once', async () => {
  const f = await fixture(),
    sourceHash = await f.seedSuggestion(),
    request = {
      requestId: 'native-consumer-accept01',
      messageId: 'message',
      expectedHash: sourceHash,
      sourceHash,
      after: B,
    },
    operationId = f.hash(
      JSON.stringify({
        kind: 'chapter-chat-apply',
        uid: 'author',
        bookId: 'book',
        chapterId: 'chapter',
        conversationId: 'conversation',
        requestId: request.requestId,
      }),
    ),
    plan = prepareRestoredChapterText({
      uid: 'author',
      bookId: 'book',
      chapterId: 'chapter',
      operationId,
      content: B,
      timestamp: 0,
    }),
    path = 'books/book/bookTextBodies/' + plan.manifest.bodyId,
    collision = admin.doc(path + '/chunks/000000000000000'),
    before = (await admin.doc(chapter).get()).data(),
    receipt = 'users/author/chapterChats/book/chapters/chapter/receipts/' + request.requestId;
  await collision.create({ occupied: true });
  await assert.rejects(
    () => f.apply(request),
    (error) => error.code === 6,
  );
  assert.deepEqual((await admin.doc(chapter).get()).data(), before);
  assert.equal((await admin.doc('users/author').get()).data().credits, 5);
  assert.equal((await admin.doc(f.body).get()).data().pins, 1);
  assert.equal((await admin.doc(receipt).get()).exists, false);
  assert.equal((await admin.doc(path).get()).exists, false);
  assert.equal(
    (await admin.doc('books/book/workProgress/current').get()).data().wordCount,
    countVisibleWords(A),
  );
  await collision.delete();
  const results = await Promise.all([f.apply(request), f.apply(request)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].content, B);
  assert.equal((await admin.doc('users/author').get()).data().credits, 4);
  assert.equal(
    (await admin.doc('books/book/workProgress/current').get()).data().wordCount,
    countVisibleWords(B),
  );
  assert.equal((await admin.doc(f.body).get()).data().pins, 0);
  await collect(f.body);
  assert.equal((await f.source()).content, B);
  await f.save('Later', 'native-consumer-later01');
  assert.deepEqual(await f.apply(request), results[0]);
  assert.equal((await f.source()).content, 'Later');
  for (const actor of [env.authenticatedContext('author'), env.authenticatedContext('other')])
    await assertFails(getDoc(doc(actor.firestore(), path)));
});
test('native conversion freezes complete source, preserves history and releases chapter generation without bypassing scene quota', async () => {
  const f = await fixture(),
    { version } = await f.capture('native-convert-version01'),
    manifest = (await admin.doc(chapter).get()).data().contentStorage,
    op = await f.conversion('native-convert-main01'),
    result = await f.scenes.convertChapterToScenes('author', op),
    stored = (await admin.doc('books/book/sceneSources/chapter').get()).data();
  assert.equal(stored.original.content, A);
  assert.equal('contentStorage' in stored.original, false);
  assert.equal((await admin.doc(chapter).get()).data().contentStorage, null);
  assert.equal(
    (await admin.doc('books/book/scenes/' + result.scene.id + '/body/current').get()).data()
      .content,
    A,
  );
  assert.equal((await admin.doc(f.body).get()).data().pins, 1);
  assert.equal(await f.readVersion(version.id), A);
  // A restored composed chapter may keep its frozen legacy field in external storage.
  await admin.runTransaction(async (tx) => {
    const bodies = createBookChapterBodyPlan(tx, admin, { uid: 'author', bookId: 'book' });
    await bodies.pin('chapter', manifest, 1);
    tx.update(admin.doc(chapter), { content: null, contentStorage: manifest });
    bodies.commit();
  });
  const backup = createBookBackupReadService({ db: admin }),
    start = await backup.getBookBackupSource('author', { bookId: 'book' }),
    scope = { bookId: 'book', kind: 'chapter', sourceToken: start.sourceToken },
    item = (await backup.listBookBackupStructure('author', scope)).items.find(
      (value) => value.id === 'chapter',
    ),
    parts = [];
  let count;
  for (let index = 0; count === undefined || index < count; index++) {
    const p = await backup.readBookBackupStructure('author', { ...scope, ...item, index });
    count = p.chunkCount;
    parts.push(Buffer.from(p.chunkBase64, 'base64'));
  }
  const decoded = JSON.parse(Buffer.concat(parts).toString('utf8'));
  assert.equal(decoded.content, A);
  assert.equal(decoded.contentMode, 'scenes');
  // Re-encode the same frozen field inline before releasing the final version.
  await admin.runTransaction(async (tx) => {
    const bodies = createBookChapterBodyPlan(tx, admin, { uid: 'author', bookId: 'book' });
    await bodies.pin('chapter', manifest, -1);
    tx.update(admin.doc(chapter), { content: A, contentStorage: null });
    bodies.commit();
  });
  await f.deleteVersion(version.id, 'native-convert-delete-v01');
  await collect(f.body);
  assert.equal((await admin.doc(f.body).get()).exists, false);
  assert.equal(
    (await admin.doc('books/book/sceneSources/chapter').get()).data().original.content,
    A,
  );
  await f.scenes.convertChapterToScenes('author', op);
  const created = await f.api.createLegacyChapter('author', {
      bookId: 'book',
      operationId: 'native-convert-large01',
      input: { title: 'Too large', content: 'x'.repeat(800001) },
    }),
    detail = await f.scenes.getSceneGroup('author', { target: f.target, parentId: created.id }),
    before = (await admin.doc('books/book/chapters/' + created.id).get()).data();
  assert.equal(detail.legacy.content.length, 800001);
  await assert.rejects(
    () =>
      f.scenes.convertChapterToScenes('author', {
        target: f.target,
        parentId: created.id,
        operationId: 'native-convert-reject01',
        expectedSourceVersion: detail.sourceVersion,
      }),
    { code: 'invalid-argument' },
  );
  assert.deepEqual((await admin.doc('books/book/chapters/' + created.id).get()).data(), before);
  assert.equal((await admin.doc('books/book/sceneSources/' + created.id).get()).exists, false);
});
test('native mixed group deletion revokes pin once and resumes after body collection using metadata only', async () => {
  const f = await fixture();
  let calls = 0;
  const guarded = {
      doc: (path) => admin.doc(path),
      collection: (path) => admin.collection(path),
      runTransaction: (callback) =>
        ++calls === 2
          ? Promise.reject(new Error('cleanup-interrupted'))
          : admin.runTransaction(callback),
    },
    service = createScenesService({ db: guarded }),
    request = {
      target: f.target,
      operationId: 'native-group-delete01',
      groups: [
        { id: 'chapter', expectedUpdatedAt: (await admin.doc(chapter).get()).data().updatedAt },
      ],
      limit: 1,
    };
  await assert.rejects(() => service.deleteSceneGroups('author', request), /cleanup-interrupted/);
  assert.equal((await admin.doc(chapter).get()).data().deleting, true);
  assert.equal((await admin.doc(f.body).get()).data().pins, 0);
  await collect(f.body);
  const detail = await f.scenes.getSceneGroup('author', { target: f.target, parentId: 'chapter' });
  assert.equal(detail.group.deleting, true);
  assert.equal(detail.legacy, null);
  let result;
  for (let i = 0; i < 10; i++) {
    result = await f.scenes.deleteSceneGroups('author', request);
    if (result.complete) break;
  }
  assert.equal(result.complete, true);
  assert.equal((await admin.doc(chapter).get()).exists, false);
  assert.equal((await admin.collection(f.body + '/chunks').get()).empty, true);
});
