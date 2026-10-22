import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import {
  prepareRestoredChapterText,
  readBookChapterText,
  BOOK_CHAPTER_TEXT_BYTES,
} from '../../functions/src/bookChapterText.mjs';
import { prepareBookRestoreArtifacts } from '../../functions/src/bookRestoreArtifacts.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
import { bookLegacyFixture } from '../../functions/test/helpers/bookLegacyFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from '../../functions/test/helpers/bookRestoreStructureFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-chapter-text',
  uid = 'author',
  id = 'chapter-text-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
const factory = () => createBookRestoreUploadService({ db: admin });
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
  api = factory();
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('native chunked text restores the formerly oversized 1.1 MB content and cleans child pairs before its body', async () => {
  const legacy = bookLegacyFixture(1),
    content = '\ufeff' + 'x'.repeat(1099997);
  legacy.chapters[0].content = content;
  const { progress } = await uploadLegacyRestore(api, uid, id, legacy),
    validated = await finishLegacyRestore(factory, uid, id, progress),
    p = await finishRestoreStructure(factory, uid, id, validated),
    chapters = await admin.collection('books/' + p.bookId + '/chapters').get(),
    chapter = chapters.docs[0],
    data = chapter.data(),
    body = 'books/' + p.bookId + '/bookTextBodies/' + data.contentStorage.bodyId;
  assert.equal(data.content, null);
  assert.equal(data.contentStorage.byteLength, 1100000);
  assert.equal(p.preparation.artifactCount, 22);
  assert.equal((await admin.doc(root).get()).data().cleanupVersion, 5);
  const actual = await admin.runTransaction((tx) =>
    readBookChapterText(tx, admin, { uid, bookId: p.bookId, chapterId: chapter.id, chapter: data }),
  );
  assert.equal(actual, content);
  assert.equal(p.preparation.wordCount, 1);
  const header = await admin.doc(body).get(),
    part = await admin.doc(body + '/chunks/000000000000000').get();
  assert.ok(header.createTime.isEqual(part.createTime));
  assert.ok(part.createTime.isEqual(part.updateTime));
  const metadata = JSON.stringify(await api.listBookRestores(uid, {}));
  assert.equal(metadata.includes('contentStorage'), false);
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ])
    for (const path of [body, part.ref.path])
      await assertFails(getDoc(doc(actor.firestore(), path)));
  const cancelled = await cleanupLegacyRestore(api, uid, id, p, { limit: 3 });
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.preparation.cleanedArtifacts, 22);
  assert.equal((await admin.doc(body).get()).exists, false);
  assert.equal((await admin.collection(body + '/chunks').get()).empty, true);
  assert.equal((await admin.collection(root + '/materializationArtifacts').get()).empty, true);
});
test('native capacity commits and reads near-8-MiB text with all 133 native artifacts atomically', async () => {
  // Isolated storage capacity probe, not a full backup/source-validation journey.
  const bookId = 'restore-' + digest('capacity-book'),
    chapterId = 'restore-' + digest('capacity-chapter'),
    operationId = 'text-capacity-op01',
    content = 'x'.repeat(BOOK_CHAPTER_TEXT_BYTES - 4096),
    plan = prepareRestoredChapterText({
      uid,
      bookId,
      chapterId,
      operationId,
      timestamp: 1000,
      content,
    }),
    loaded = {
      ref: admin.doc(root),
      job: { ownerId: uid, restoreId: id, bookId, cleanupVersion: 5, checkpoint: 1 },
      view: { jobToken: 'a'.repeat(64) },
    },
    chapter = {
      id: chapterId,
      bookId,
      ownerId: uid,
      title: 'Capacity',
      contentMode: 'legacy',
      wordCount: 1,
      ...plan.patch,
    },
    writes = [
      ...plan.writes,
      { kind: 'chapter', id: chapterId, value: chapter },
      { kind: 'work-control', id: 'current', value: { wordCount: 1, countReady: false } },
      { kind: 'word-group', id: digest('group'), value: { words: 1, enabled: true } },
      { kind: 'word-source', id: digest('source'), value: { words: 1, groupId: chapterId } },
    ];
  assert.equal(writes.length, 133);
  await admin.runTransaction(async (tx) => {
    const staged = await prepareBookRestoreArtifacts(tx, admin, loaded, operationId, writes, 5);
    assert.equal(staged.created, 133);
    staged.commit();
    tx.create(admin.doc('users/' + uid + '/bookRestoreOperations/' + operationId), {
      schemaVersion: 1,
      ownerId: uid,
      restoreId: id,
      jobToken: loaded.view.jobToken,
      receipt: { action: 'advanceBookRestoreStructure', operationId, checkpoint: 1 },
    });
  });
  const result = await admin.runTransaction((tx) =>
    readBookChapterText(tx, admin, { uid, bookId, chapterId, chapter }),
  );
  assert.equal(result, content);
  assert.equal((await admin.collection(root + '/materializationArtifacts').get()).size, 133);
  assert.equal((await admin.doc('books/' + bookId).get()).exists, false);
});
