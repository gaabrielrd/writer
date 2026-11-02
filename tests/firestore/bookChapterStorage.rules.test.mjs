import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { chapterWritingFixture } from '../../functions/test/helpers/bookChapterStorageFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-chapter-storage';
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
const currentBody = async () => {
  const chapter = (await admin.doc('books/book/chapters/chapter').get()).data();
  return admin.doc('books/book/bookTextBodies/' + chapter.contentStorage.bodyId);
};
test('native large chapter history restores two near-8-MiB texts by references with exact pins and no copied version bodies', async () => {
  const f = await chapterWritingFixture(admin),
    A = 'x'.repeat(8388608 - 4096),
    B = 'y'.repeat(8388608 - 8192);
  await f.save(A, 'native-body-saveA01');
  const a = await currentBody(),
    { version } = await f.capture('native-body-capture01');
  assert.equal((await a.get()).data().pins, 2);
  assert.equal((await admin.collection('books/book/workVersionBodies').get()).empty, true);
  await f.save(B, 'native-body-saveB01');
  const b = await currentBody();
  assert.equal((await a.get()).data().pins, 1);
  assert.equal((await b.get()).data().pins, 1);
  const request = {
      target: f.target,
      resource: f.resource,
      versionId: version.id,
      operationId: 'native-body-restore01',
      expectedSourceToken: (await f.source()).sourceToken,
    },
    restored = await f.history.restoreWorkVersion('author', request);
  assert.equal(restored.source.content, A);
  assert.equal((await currentBody()).path, a.path);
  assert.equal((await a.get()).data().pins, 2);
  assert.equal((await b.get()).data().pins, 1);
  assert.equal(await f.readVersion(restored.previousVersion.id), B);
  await f.history.restoreWorkVersion('author', request);
  assert.equal((await a.get()).data().pins, 2);
  const chapters = await admin.collection('books/book/bookTextBodies').get();
  assert.equal(chapters.size, 2);
  const chapter = (await admin.doc('books/book/chapters/chapter').get()).data();
  await f.api.deleteLegacyChapters('author', {
    bookId: 'book',
    operationId: 'native-body-delete01',
    chapters: [{ id: 'chapter', expectedUpdatedAt: chapter.updatedAt }],
  });
  assert.equal((await a.get()).data().pins, 1);
  assert.equal(await f.readVersion(version.id), A);
  const versionRef = admin.doc('books/book/workVersions/' + version.id);
  await versionRef.update({ target: { kind: 'book', id: 'other' } });
  await assert.rejects(() => f.deleteVersion(version.id, 'native-body-foreign-del01'), {
    code: 'not-found',
  });
  assert.equal((await a.get()).data().pins, 1);
  await versionRef.update({ target: f.target, id: 'other' });
  await assert.rejects(() => f.readVersion(version.id), { code: 'not-found' });
  await versionRef.update({ id: version.id });
  await f.deleteVersion(version.id, 'native-body-version-del01');
  assert.equal((await a.get()).data().pins, 0);
  assert.equal((await a.get()).data().state, 'unreferenced');
  assert.equal(await f.readVersion(restored.previousVersion.id), B);
  for (const actor of [
    env.authenticatedContext('author'),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ])
    await assertFails(getDoc(doc(actor.firestore(), a.path)));
});
test('native chapter write rolls back occupied part failure and CAS never releases a winner generation', async () => {
  const f = await chapterWritingFixture(admin),
    A = '\ufeff' + 'ação 🌙\n'.repeat(60000);
  await f.save(A, 'native-guard-saveA01');
  const a = await currentBody(),
    base = (await f.source()).contentHash,
    outcomes = await Promise.allSettled([
      f.save('Winner', 'native-guard-writer01', base),
      f.save('Other', 'native-guard-writer02', base),
    ]);
  assert.equal(outcomes.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal((await a.get()).data().pins, 0);
  const source = await f.source();
  await assert.rejects(() => f.save('stale', 'native-guard-stale01', base), {
    code: 'failed-precondition',
  });
  assert.equal((await f.source()).content, source.content);
  assert.equal((await a.get()).data().pins, 0);
  await f.save(A + 'B', 'native-guard-live-big01');
  const live = await currentBody(),
    before = (await admin.doc('books/book/chapters/chapter').get()).data();
  // A native create precondition on an occupied child aborts the entire replacement.
  const { digest } = await import('../../functions/src/sceneContracts.mjs'),
    { prepareRestoredChapterText } = await import('../../functions/src/bookChapterText.mjs'),
    operationId = 'native-guard-collision01',
    plan = prepareRestoredChapterText({
      uid: 'author',
      bookId: 'book',
      chapterId: 'chapter',
      content: A,
      operationId: digest({ kind: 'legacy-save', id: operationId }),
      timestamp: 0,
    }),
    basePath = 'books/book/bookTextBodies/' + plan.manifest.bodyId,
    collision = admin.doc(basePath + '/chunks/000000000000000');
  await collision.create({ occupied: true });
  await assert.rejects(
    () => f.save(A, operationId),
    (error) => [6, 'already-exists'].includes(error.code),
  );
  assert.equal((await admin.doc(basePath).get()).exists, false);
  assert.equal((await live.get()).data().pins, 1);
  assert.deepEqual((await admin.doc('books/book/chapters/chapter').get()).data(), before);
  assert.equal((await collision.get()).data().occupied, true);
  assert.equal((await admin.doc('users/author/workOperations/' + operationId).get()).exists, false);
});
