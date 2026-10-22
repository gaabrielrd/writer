import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { BOOK_RESTORE_NATIVE_V4 } from '../../functions/src/bookRestoreArtifacts.mjs';
import { bookRestoreResourcePath } from '../../functions/src/bookRestoreResourcePaths.mjs';
import { createBookRestoreRemapper } from '../../functions/src/bookRestoreRemap.mjs';
import { countVisibleWords } from '../../functions/src/visibleWordCount.mjs';
import {
  countsRestoreFixture,
  readyRestoreCounts,
  finishRestoreCounts,
} from '../../functions/test/helpers/bookRestoreCountsFixture.mjs';
import {
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-counts',
  uid = 'author',
  id = 'restore-counts-sdk01',
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
test('SDK reconciles manuscript/group/reference counts with native no-op proofs, concurrent CAS and complete v8 cleanup', async () => {
  const records = countsRestoreFixture(),
    initial = await readyRestoreCounts(factory, uid, id, records),
    m = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: initial.jobToken,
      sourceBookId: 'book',
      bookId: initial.bookId,
    }),
    index = records.findIndex(
      (r) =>
        r.kind === 'book-scene' && JSON.parse(new TextDecoder().decode(r.payload)).id === 'active',
    );
  let p = initial,
    unit = 0;
  while ((p.preparation.counts?.itemIndex ?? p.preparation.resourceStartIndex) !== index) {
    p = (await api.advanceBookRestoreCounts(uid, mutation(id, p, 'counts-sdk-before-' + unit++)))
      .progress;
    assert.ok(unit < 100);
  }
  const request = mutation(id, p, 'counts-sdk-race-0001'),
    results = await Promise.allSettled([
      api.advanceBookRestoreCounts(uid, request),
      factory().advanceBookRestoreCounts(uid, mutation(id, p, 'counts-sdk-race-0002')),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const wonIndex = results.findIndex((r) => r.status === 'fulfilled'),
    first = results[wonIndex].value,
    wonRequest = wonIndex === 0 ? request : mutation(id, p, 'counts-sdk-race-0002'),
    done = await finishRestoreCounts(factory, uid, id, first.progress),
    base = 'books/' + done.bookId,
    expectedWords =
      countVisibleWords('\ufeffOne two \u{1f319}') +
      countVisibleWords('\ufeffActive own \u{1f319}'),
    chapterId = m.identity('chapter', 'chapter'),
    chapter = (await admin.doc(base + '/chapters/' + chapterId).get()).data(),
    control = (await admin.doc(base + '/workProgress/current').get()).data();
  assert.equal(done.preparation.wordCount, expectedWords);
  assert.equal(control.wordCount, expectedWords);
  assert.equal(control.countReady, false);
  assert.equal(chapter.sceneCount, 3);
  assert.equal(chapter.wordCount, countVisibleWords('\ufeffActive own \u{1f319}'));
  assert.equal((await admin.doc(base).get()).exists, false);
  assert.equal(done.preparation.counts.sceneCount, 6);
  assert.equal(done.preparation.counts.linkCount, 4);
  assert.equal(
    (await admin.doc(base + '/narrativeControls/entity-scenes').get()).data().complete,
    true,
  );
  assert.equal(
    (await admin.doc(base + '/arcs/' + m.identity('arc', 'arc')).get()).data().referenceCount,
    1,
  );
  assert.equal(
    (await admin.doc(base + '/timelineEvents/' + m.identity('event', 'event')).get()).data()
      .referenceCount,
    1,
  );
  const journals = await admin.collection(root + '/materializationArtifacts').get();
  assert.equal(journals.size, done.preparation.artifactCount);
  for (const journal of journals.docs) {
    const value = journal.data(),
      suffix =
        value.kind === 'entity-index-control'
          ? 'narrativeControls/entity-scenes'
          : value.kind === 'lore'
            ? 'lore/' + value.id
            : BOOK_RESTORE_NATIVE_V4[value.kind]
              ? BOOK_RESTORE_NATIVE_V4[value.kind] + '/' + value.id
              : bookRestoreResourcePath(value.kind, value.id),
      native = await admin.doc(base + '/' + suffix).get(),
      born = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + value.createdByOperationId)
        .get(),
      latest = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + value.lastOperationId)
        .get();
    assert.ok(native.createTime.isEqual(journal.createTime), value.kind);
    assert.ok(native.createTime.isEqual(born.createTime), value.kind);
    assert.ok(native.updateTime.isEqual(journal.updateTime), value.kind);
    assert.ok(native.updateTime.isEqual(latest.createTime), value.kind);
  }
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    await assertFails(getDoc(doc(db, base + '/narrativeControls/entity-scenes')));
    await assertFails(
      setDoc(doc(db, base + '/narrativeControls/entity-scenes'), { complete: false }),
    );
    await assertFails(getDoc(doc(db, base + '/workProgress/current')));
  }
  await admin.doc('books/other/workProgress/current').set({ wordCount: 77 });
  const terminal = await cleanupLegacyRestore(api, uid, id, done, { limit: 7 });
  assert.equal(terminal.preparation.cleanedArtifacts, done.preparation.artifactCount);
  assert.equal((await admin.collection(base + '/narrativeControls').get()).empty, true);
  assert.equal((await admin.collection(base + '/workWordSources').get()).empty, true);
  assert.equal((await admin.collection(root + '/materializationArtifacts').get()).empty, true);
  assert.equal((await admin.doc('books/other/workProgress/current').get()).data().wordCount, 77);
  const replay = await api.advanceBookRestoreCounts(uid, wonRequest);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.state, 'cancelled');
});
test('SDK refuses recreated native source before reconciling or advancing the old preparation', async () => {
  const initial = await readyRestoreCounts(factory, uid, id),
    journal = (
      await admin
        .collection(root + '/materializationArtifacts')
        .where('kind', '==', 'scene-body')
        .get()
    ).docs,
    reader = await api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: initial.jobToken,
    }),
    item = await reader.readMappedItem(initial.preparation.resourceStartIndex),
    selected = journal.find((d) => d.data().id === item.value.parentId + ':current'),
    target = admin.doc(
      'books/' + initial.bookId + '/' + bookRestoreResourcePath('scene-body', selected.data().id),
    ),
    saved = await target.get();
  await target.delete();
  await target.create(saved.data());
  const before = await admin.doc(root).get(),
    request = mutation(id, initial, 'counts-sdk-recreated01');
  await assert.rejects(() => api.advanceBookRestoreCounts(uid, request));
  const after = await admin.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId).get())
      .exists,
    false,
  );
  assert.equal((await target.get()).exists, true);
});
