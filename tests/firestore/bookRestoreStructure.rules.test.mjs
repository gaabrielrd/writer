import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import {
  structureRestoreFixture,
  finishRestoreStructure,
} from '../../functions/test/helpers/bookRestoreStructureFixture.mjs';
import { uploadArchiveRestore } from '../../functions/test/helpers/bookRestoreContentFixture.mjs';
import { bookLegacyFixture } from '../../functions/test/helpers/bookLegacyFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-structure',
  uid = 'author',
  id = 'restore-structure-sdk01',
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
test('native structure and journal commit with receipts, remain SDK private and clean in bounded pages with historical replay', async () => {
  const { progress } = await uploadArchiveRestore(api, uid, id, structureRestoreFixture()),
    validated = await finishLegacyRestore(factory, uid, id, progress),
    firstRequest = mutation(id, validated, 'structure-sdk-first01'),
    first = await api.advanceBookRestoreStructure(uid, firstRequest),
    p = await finishRestoreStructure(factory, uid, id, first.progress),
    base = 'books/' + p.bookId;
  assert.equal(p.preparation.artifactCount, 8);
  assert.equal((await admin.doc(base).get()).exists, false);
  const journal = await admin.collection(root + '/materializationArtifacts').get();
  assert.equal(journal.size, 8);
  for (const artifact of journal.docs) {
    const data = artifact.data(),
      paths = {
        act: 'acts',
        chapter: 'chapters',
        'work-control': 'workProgress',
        'word-group': 'workWordGroups',
        'word-source': 'workWordSources',
      },
      target = await admin.doc(base + '/' + paths[data.kind] + '/' + data.id).get(),
      first = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + data.createdByOperationId)
        .get(),
      last = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + data.lastOperationId)
        .get();
    assert.ok(target.createTime.isEqual(artifact.createTime));
    assert.ok(target.createTime.isEqual(first.createTime));
    assert.ok(target.updateTime.isEqual(artifact.updateTime));
    assert.ok(target.updateTime.isEqual(last.createTime));
  }
  const chapters = await admin.collection(base + '/chapters').get(),
    legacy = chapters.docs.find((d) => d.data().contentMode === 'legacy');
  assert.equal(legacy.data().content, '\ufeffOne two \u{1f319}');
  assert.equal(
    (await admin.doc(base + '/workProgress/current').get()).data().wordCount,
    legacy.data().wordCount,
  );
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    for (const path of [legacy.ref.path, base + '/workProgress/current', journal.docs[0].ref.path])
      await assertFails(getDoc(doc(db, path)));
    await assertFails(getDocs(collection(db, base + '/chapters')));
    await assertFails(getDocs(collection(db, root + '/materializationArtifacts')));
  }
  await admin.doc('books/unrelated/chapters/keep').set({ content: 'preserve' });
  const cancelled = await cleanupLegacyRestore(api, uid, id, p, { limit: 2 });
  assert.equal(cancelled.preparation.cleanedArtifacts, 8);
  for (const name of ['acts', 'chapters', 'workProgress', 'workWordGroups', 'workWordSources'])
    assert.equal((await admin.collection(base + '/' + name).get()).empty, true, name);
  assert.equal((await admin.collection(root + '/materializationArtifacts').get()).empty, true);
  assert.equal((await admin.doc('books/unrelated/chapters/keep').get()).data().content, 'preserve');
  const replay = await api.advanceBookRestoreStructure(uid, firstRequest);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.state, 'cancelled');
});
test('native oversized document fails without progress or truncation and recreated prepared data stays protected from cleanup', async () => {
  const legacy = bookLegacyFixture(1);
  legacy.chapters[0].content = 'x'.repeat(1100000);
  const { progress } = await uploadLegacyRestore(api, uid, id, legacy),
    validated = await finishLegacyRestore(factory, uid, id, progress),
    first = (
      await api.advanceBookRestoreStructure(uid, mutation(id, validated, 'structure-size-first01'))
    ).progress,
    request = mutation(id, first, 'structure-size-large01'),
    before = await admin.doc(root).get();
  await assert.rejects(
    () => api.advanceBookRestoreStructure(uid, request),
    (error) => error.code === 3 && /property "content".*longer than/i.test(error.message),
  );
  const after = await admin.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId).get())
      .exists,
    false,
  );
  assert.equal((await admin.collection('books/' + first.bookId + '/chapters').get()).empty, true);
  const reader = await factory().openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: first.jobToken,
    }),
    chapter = await reader.readMappedItem(1);
  assert.equal(chapter.value.content.length, 1100000);
  assert.equal(chapter.value.content, legacy.chapters[0].content);
  const target = admin.doc('books/' + first.bookId + '/workProgress/current'),
    stored = await target.get();
  await target.delete();
  await target.create(stored.data());
  const cancelled = (
    await api.cancelBookRestore(uid, mutation(id, first, 'structure-size-cancel01'))
  ).progress;
  await assert.rejects(() =>
    api.advanceBookRestoreCleanup(
      uid,
      mutation(id, cancelled, 'structure-size-clean01', { limit: 5 }),
    ),
  );
  assert.equal((await target.get()).exists, true);
  assert.equal((await admin.collection(root + '/materializationArtifacts').get()).size, 1);
  assert.equal((await admin.doc('books/' + first.bookId).get()).exists, false);
});
