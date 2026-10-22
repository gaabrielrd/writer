import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../../functions/src/bookRestoreRemap.mjs';
import { finishRestoreStructure } from '../../functions/test/helpers/bookRestoreStructureFixture.mjs';
import {
  loreRestoreFixture,
  finishRestoreLore,
} from '../../functions/test/helpers/bookRestoreLoreFixture.mjs';
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
  projectId = 'demo-writer-restore-lore',
  uid = 'author',
  id = 'restore-lore-sdk01',
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
async function ready() {
  const { progress } = await uploadArchiveRestore(api, uid, id, loreRestoreFixture()),
    validated = await finishLegacyRestore(factory, uid, id, progress);
  return finishRestoreStructure(factory, uid, id, validated);
}
test('SDK restores interleaved lore in proven pages with atomic journals, private access and bounded cancellation', async () => {
  const initial = await ready(),
    request = mutation(id, initial, 'lore-sdk-first-0001'),
    first = await api.advanceBookRestoreLore(uid, request),
    p = first.progress,
    mapper = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: p.jobToken,
      sourceBookId: 'book',
      bookId: p.bookId,
    }),
    base = 'books/' + p.bookId,
    path = base + '/lore/' + mapper.identity('lore', 'entity');
  assert.equal((await admin.doc(path).get()).data().relations.length, 64);
  const done = await finishRestoreLore(factory, uid, id, p),
    native = await admin.doc(path).get(),
    journals = await admin
      .collection(root + '/materializationArtifacts')
      .where('kind', '==', 'lore')
      .get();
  assert.equal(native.data().relations.length, 130);
  assert.equal(done.preparation.loreCount, 3);
  assert.equal(done.preparation.itemIndex, initial.preparation.itemIndex);
  assert.equal((await admin.doc(base).get()).exists, false);
  assert.equal((await admin.doc('publicBooks/' + p.bookId).get()).exists, false);
  assert.equal(journals.size, 3);
  for (const journal of journals.docs) {
    const data = journal.data(),
      value = await admin.doc(base + '/lore/' + data.id).get(),
      born = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + data.createdByOperationId)
        .get(),
      latest = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + data.lastOperationId)
        .get();
    assert.ok(value.createTime.isEqual(journal.createTime));
    assert.ok(value.createTime.isEqual(born.createTime));
    assert.ok(value.updateTime.isEqual(journal.updateTime));
    assert.ok(value.updateTime.isEqual(latest.createTime));
  }
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    await assertFails(getDoc(doc(db, path)));
    await assertFails(getDocs(collection(db, base + '/lore')));
    await assertFails(setDoc(doc(db, path), { details: 'replace' }));
    await assertFails(getDoc(doc(db, journals.docs[0].ref.path)));
  }
  await admin.doc('books/unrelated/lore/keep').set({ details: 'preserve' });
  const cancelled = await cleanupLegacyRestore(api, uid, id, done, { limit: 5 });
  assert.equal(cancelled.preparation.cleanedArtifacts, done.preparation.artifactCount);
  assert.equal((await admin.collection(base + '/lore').get()).empty, true);
  assert.equal((await admin.collection(root + '/materializationArtifacts').get()).empty, true);
  assert.equal((await admin.doc('books/unrelated/lore/keep').get()).data().details, 'preserve');
  const replay = await api.advanceBookRestoreLore(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.state, 'cancelled');
});
test('SDK oversized lore fails atomically with intact source/checkpoint and no narrowed logical format', async () => {
  const legacy = bookLegacyFixture(1);
  legacy.lore[0].details = '\ufeff' + 'Own 🌙'.repeat(150000);
  const { progress } = await uploadLegacyRestore(api, uid, id, legacy),
    validated = await finishLegacyRestore(factory, uid, id, progress),
    initial = await finishRestoreStructure(factory, uid, id, validated),
    before = await admin.doc(root).get(),
    request = mutation(id, initial, 'lore-sdk-oversize01');
  await assert.rejects(
    () => api.advanceBookRestoreLore(uid, request),
    (error) =>
      error.code === 3 && /longer than|exceeds.*maximum|maximum.*size/i.test(error.message),
  );
  const after = await admin.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal((await admin.collection('books/' + initial.bookId + '/lore').get()).empty, true);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId).get())
      .exists,
    false,
  );
  const reader = await api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: initial.jobToken,
    }),
    item = await reader.readMappedItem(initial.preparation.itemIndex);
  assert.equal(item.value.data.details, legacy.lore[0].details);
  await cleanupLegacyRestore(api, uid, id, initial);
});
test('SDK recreated prepared lore blocks both append and paired cleanup', async () => {
  const initial = await ready(),
    first = (await api.advanceBookRestoreLore(uid, mutation(id, initial, 'lore-sdk-rebirth01')))
      .progress,
    journals = await admin
      .collection(root + '/materializationArtifacts')
      .where('kind', '==', 'lore')
      .get(),
    target = admin.doc('books/' + first.bookId + '/lore/' + journals.docs[0].data().id),
    original = await target.get();
  await target.delete();
  await target.create(original.data());
  const before = await admin.doc(root).get();
  await assert.rejects(() =>
    api.advanceBookRestoreLore(uid, mutation(id, first, 'lore-sdk-rebirth02')),
  );
  assert.deepEqual((await admin.doc(root).get()).data(), before.data());
  let p = (await api.cancelBookRestore(uid, mutation(id, first, 'lore-sdk-cancel001'))).progress;
  p = (
    await api.advanceBookRestoreCleanup(uid, mutation(id, p, 'lore-sdk-clean001', { limit: 50 }))
  ).progress;
  assert.equal(p.integrity.cleanupPhase, 'artifacts');
  await assert.rejects(() =>
    api.advanceBookRestoreCleanup(uid, mutation(id, p, 'lore-sdk-clean002', { limit: 50 })),
  );
  assert.equal((await target.get()).exists, true);
});
