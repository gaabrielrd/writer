import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createBookChapterCleanupHandler } from '../../functions/src/bookChapterCleanup.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { chapterWritingFixture } from '../../functions/test/helpers/bookChapterStorageFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-chapter-cleanup';
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
const bodyPath = async () => {
  const value = (await admin.doc('books/book/chapters/chapter').get()).data();
  return 'books/book/bookTextBodies/' + value.contentStorage.bodyId;
};
const event = async (path) => ({
  params: { bookId: 'book', bodyId: path.split('/').at(-1) },
  data: { after: await admin.doc(path).get() },
});
test('native cleanup drains masked pages under duplicate events and keeps a pinned version until explicit deletion', async () => {
  const f = await chapterWritingFixture(admin),
    handler = createBookChapterCleanupHandler({ db: admin }),
    A = 'x'.repeat(65536 * 110 + 17),
    B = 'y'.repeat(650000);
  await f.save(A, 'native-cleanup-saveA01');
  const a = await bodyPath();
  await f.save(B, 'native-cleanup-saveB01');
  const b = await bodyPath(),
    e = await event(a);
  const first = await handler(e);
  assert.deepEqual(first, { complete: false, processed: 50 });
  assert.equal((await admin.doc(a).get()).data().gcRevision, 1);
  assert.equal((await admin.collection(a + '/chunks').get()).size, 61);
  const concurrent = await Promise.all([handler(e), handler(e)]);
  assert.ok(concurrent.every((result) => result.processed <= 50));
  assert.equal((await admin.doc(a).get()).exists, true);
  assert.equal((await admin.collection(a + '/chunks').get()).size, 0);
  assert.equal((await handler(e)).complete, true);
  assert.equal((await admin.doc(a).get()).exists, false);
  assert.deepEqual(await handler(e), { complete: true, processed: 0 });
  const { version } = await f.capture('native-cleanup-version01');
  await f.save('Current', 'native-cleanup-current01');
  assert.equal(await handler(await event(b)), null);
  assert.equal(await f.readVersion(version.id), B);
  await f.deleteVersion(version.id, 'native-cleanup-version-del01');
  const last = await event(b);
  let complete = false;
  for (let step = 0; step < 5; step++) {
    if ((await handler(last)).complete) {
      complete = true;
      break;
    }
  }
  assert.equal(complete, true);
  assert.equal((await admin.doc(b).get()).exists, false);
  assert.equal((await f.source()).content, 'Current');
  for (const actor of [
    env.authenticatedContext('author'),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ])
    await assertFails(getDoc(doc(actor.firestore(), b)));
});
test('native book deletion upgrades legacy finish checkpoint and drains pinned bodies before root and sentinel', async () => {
  const f = await chapterWritingFixture(admin),
    scenes = createScenesService({ db: admin }),
    A = '\ufeff' + 'ação 🌙\n'.repeat(60000);
  await f.save(A, 'native-book-clean-save01');
  const a = await bodyPath();
  await f.capture('native-book-clean-version01');
  await admin.doc('books/book').update({ deleting: true });
  const request = { target: f.target, operationId: 'native-book-clean-delete01', limit: 3 },
    job = admin.doc('users/author/sceneOperations/' + request.operationId);
  for (let n = 0; n < 500; n++) {
    await scenes.deleteSceneBook('author', request);
    if ((await job.get()).data().phase === 'text-bodies') break;
  }
  assert.equal((await job.get()).data().phase, 'text-bodies');
  await job.update({ cleanupVersion: 1, phase: 'finish' });
  assert.equal((await scenes.deleteSceneBook('author', request)).complete, false);
  assert.equal((await job.get()).data().cleanupVersion, 3);
  assert.equal((await admin.doc('books/book').get()).exists, true);
  assert.equal((await admin.doc('deletedBooks/book').get()).exists, false);
  await admin.doc(a).update({ ownerId: 'other' });
  await assert.rejects(() => scenes.deleteSceneBook('author', request), {
    code: 'failed-precondition',
  });
  assert.equal((await admin.doc('books/book').get()).exists, true);
  await admin.doc(a).update({ ownerId: 'author' });
  let result;
  for (let n = 0; n < 500; n++) {
    result = await scenes.deleteSceneBook('author', request);
    if (result.complete) break;
    assert.equal((await admin.doc('books/book').get()).exists, true);
    if (!(await admin.doc(a).get()).exists)
      assert.equal((await admin.collection(a + '/chunks').get()).empty, true);
  }
  assert.equal(result.complete, true);
  assert.equal((await admin.doc(a).get()).exists, false);
  assert.equal((await admin.collection(a + '/chunks').get()).empty, true);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await admin.doc('deletedBooks/book').get()).exists, true);
  assert.deepEqual(await scenes.deleteSceneBook('author', request), result);
});
test('native changed part and late event for a recreated generation preserve bytes rather than guessing ownership', async () => {
  const f = await chapterWritingFixture(admin),
    handler = createBookChapterCleanupHandler({ db: admin });
  await f.save('z'.repeat(600000), 'native-bad-clean-save01');
  const path = await bodyPath();
  await f.save('Current', 'native-bad-clean-current01');
  const e = await event(path),
    part = admin.doc(path + '/chunks/000000000000000');
  await part.update({ extra: 'changed' });
  await assert.rejects(() => handler(e), { code: 'failed-precondition' });
  assert.equal((await admin.collection(path + '/chunks').get()).size, 10);
  const header = admin.doc(path),
    value = (await header.get()).data();
  await header.delete();
  await header.create(value);
  await assert.rejects(() => handler(e), { code: 'failed-precondition' });
  assert.equal((await header.get()).exists, true);
  assert.equal((await admin.collection(path + '/chunks').get()).size, 10);
});
