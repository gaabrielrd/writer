import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../../functions/src/bookRestoreRemap.mjs';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
import {
  readyRestoreHistory,
  finishRestoreHistory,
  historyRestoreFixture,
} from '../../functions/test/helpers/bookRestoreHistoryFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-history',
  uid = 'author',
  id = 'restore-history-sdk01',
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
const mapping = (p) =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId: 'book',
    bookId: p.bookId,
  });
test('SDK keeps partial history private, rolls back an occupied body, resumes exact text and cleans v10', async () => {
  const parts = ['\ufeff' + '🌙'.repeat(16383), 'fim'],
    initial = await readyRestoreHistory(
      factory,
      uid,
      id,
      historyRestoreFixture([
        { id: 'manual', content: parts.join(''), parts, label: '  Versão 🌙  ' },
      ]),
    ),
    firstRequest = mutation(id, initial, 'history-sdk-first01'),
    first = (await api.advanceBookRestoreHistory(uid, firstRequest)).progress,
    versionId = mapping(first).identity('version', 'manual'),
    versionPath = 'books/' + first.bookId + '/workVersions/' + versionId,
    collisionPath =
      'books/' + first.bookId + '/workVersionBodies/' + digest({ versionId, index: 1 }),
    request = mutation(id, first, 'history-sdk-second01'),
    before = await admin.doc(root).get();
  assert.equal(first.preparation.history.pending.part, 1);
  assert.equal((await admin.doc(versionPath).get()).exists, false);
  assert.equal((await admin.doc('books/' + first.bookId).get()).exists, false);
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDoc(doc(actor.firestore(), root)));
    const body = (await admin.collection('books/' + first.bookId + '/workVersionBodies').get())
      .docs[0];
    await assertFails(getDoc(doc(actor.firestore(), body.ref.path)));
  }
  await admin.doc(collisionPath).create({ foreign: true });
  await assert.rejects(() => api.advanceBookRestoreHistory(uid, request));
  const after = await admin.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal((await admin.doc(versionPath).get()).exists, false);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId).get())
      .exists,
    false,
  );
  assert.equal((await admin.doc(collisionPath).get()).data().foreign, true);
  await admin.doc(collisionPath).delete();
  const done = await api.advanceBookRestoreHistory(uid, request),
    p = await finishRestoreHistory(factory, uid, id, done.progress),
    version = await admin.doc(versionPath).get(),
    journal = (
      await admin
        .collection(root + '/materializationArtifacts')
        .where('kind', '==', 'history-version')
        .get()
    ).docs[0],
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + request.operationId)
      .get();
  assert.ok(version.createTime.isEqual(journal.createTime));
  assert.ok(version.createTime.isEqual(receipt.createTime));
  assert.equal(version.data().label, '  Versão 🌙  ');
  assert.equal(version.data().createdAt, 10);
  assert.equal(p.preparation.history.versions, 1);
  assert.deepEqual(
    (await api.advanceBookRestoreHistory(uid, firstRequest)).receipt.operationId,
    firstRequest.operationId,
  );
  assert.equal(
    (await admin.doc('books/' + p.bookId + '/workProgress/current').get()).data().countReady,
    false,
  );
  // Synthetic root proves existing readers only; final activation is still pending.
  await admin.doc('books/' + p.bookId).create({ authorId: uid, title: 'Synthetic root' });
  const read = await createWorkHistoryService({ db: admin }).readWorkVersion(uid, {
    target: { kind: 'book', id: p.bookId },
    versionId,
    limit: 8,
  });
  assert.equal(read.chunks.map((c) => c.content).join(''), parts.join(''));
  assert.equal(read.version.resource.id, mapping(p).identity('chapter', 'removed'));
  await admin.doc('books/' + p.bookId).delete();
  await admin.doc('books/other/workVersions/own').create({ keep: true });
  const terminal = await cleanupLegacyRestore(api, uid, id, p, { limit: 3 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal((await admin.collection('books/' + p.bookId + '/workVersions').get()).empty, true);
  assert.equal(
    (await admin.collection('books/' + p.bookId + '/workVersionBodies').get()).empty,
    true,
  );
  assert.equal((await admin.doc('books/other/workVersions/own').get()).data().keep, true);
});
test('SDK cleanup rejects a recreated partial body and preserves its new incarnation', async () => {
  const parts = ['a'.repeat(65536), 'b'],
    initial = await readyRestoreHistory(
      factory,
      uid,
      id,
      historyRestoreFixture([{ id: 'partial', content: parts.join(''), parts }]),
    ),
    first = (
      await api.advanceBookRestoreHistory(uid, mutation(id, initial, 'history-sdk-partial02'))
    ).progress,
    body = (await admin.collection('books/' + first.bookId + '/workVersionBodies').get()).docs[0],
    stored = body.data();
  await body.ref.delete();
  await body.ref.create(stored);
  const recreated = await body.ref.get();
  assert.equal(recreated.createTime.isEqual(body.createTime), false);
  const cancelling = (await api.cancelBookRestore(uid, mutation(id, first, 'history-sdk-cancel02')))
    .progress;
  await assert.rejects(() => cleanupLegacyRestore(api, uid, id, cancelling, { limit: 5 }));
  const retained = await body.ref.get();
  assert.ok(retained.createTime.isEqual(recreated.createTime));
  assert.deepEqual(retained.data(), stored);
  assert.equal((await admin.doc('books/' + first.bookId).get()).exists, false);
});
