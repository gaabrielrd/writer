import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
import { inspectBookLegacyContent } from '../../functions/src/bookLegacyReview.mjs';
import { bookLegacyFixture as fixture } from '../../functions/test/helpers/bookLegacyFixture.mjs';
import { indexFixture, hashPort } from '../../functions/test/helpers/bookContentFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
  largeLegacyCursorFixture,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-legacy-validation',
  uid = 'author',
  id = 'legacy-validation-sdk01',
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
async function emptyNamespaces() {
  for (const name of [
    'chunks',
    'integrityProofs',
    'integrityState',
    'validationIndex',
    'validationItems',
    'validationState',
  ])
    assert.equal((await admin.collection(root + '/' + name).get()).empty, true, name);
}
test('native legacy validation commits opaque state/index/receipt together and matches the full semantic report privately', async () => {
  const { progress: p, source } = await uploadLegacyRestore(api, uid, id, fixture(6));
  const firstRequest = mutation(id, p, 'legacy-sdk-first01'),
    first = await api.advanceBookRestoreValidation(uid, firstRequest);
  const initial = await admin.doc(root + '/validationState/current').get(),
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + firstRequest.operationId)
      .get(),
    job = await admin.doc(root).get(),
    index = (
      await admin
        .collection(root + '/validationIndex')
        .limit(1)
        .get()
    ).docs[0];
  assert.equal(initial.data().validationVersion, 2);
  assert.equal(typeof initial.data().stateJSON, 'string');
  assert.ok(initial.createTime.isEqual(receipt.createTime));
  assert.ok(job.updateTime.isEqual(initial.updateTime));
  assert.ok(index.createTime.isEqual(receipt.createTime));
  assert.ok(index.createTime.isEqual(index.updateTime));
  let lastRequest;
  const done = await finishLegacyRestore(factory, uid, id, first.progress, {
    onStep: (_, req) => {
      lastRequest = req;
    },
  });
  const expected = await inspectBookLegacyContent(source, {
    index: indexFixture(),
    hash: hashPort,
  });
  assert.equal(done.state, 'content-verified');
  assert.deepEqual(done.validation.summary, {
    sourceBookId: expected.source.bookId,
    totals: expected.totals,
    warnings: expected.warnings,
    source: expected.source,
    legacyWarnings: expected.legacyWarnings,
  });
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
  const finalState = await initial.ref.get(),
    last = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + lastRequest.operationId)
      .get();
  assert.ok(finalState.createTime.isEqual(initial.createTime));
  assert.ok(finalState.updateTime.isEqual(last.createTime));
  assert.ok((await admin.doc(root).get()).updateTime.isEqual(last.createTime));
  const item = (
    await admin
      .collection(root + '/validationItems')
      .limit(1)
      .get()
  ).docs[0];
  const itemReceipt = await admin
    .doc('users/' + uid + '/bookRestoreOperations/' + item.data().createdByOperationId)
    .get();
  assert.ok(item.createTime.isEqual(itemReceipt.createTime));
  assert.ok(item.createTime.isEqual(item.updateTime));
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    for (const path of [initial.ref.path, index.ref.path, item.ref.path]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ownerId: uid }));
    }
    for (const name of ['validationState', 'validationIndex', 'validationItems'])
      await assertFails(getDocs(collection(db, root + '/' + name)));
  }
  const reader = await api.openVerifiedBookRestoreContent(uid, {
    restoreId: id,
    jobToken: done.jobToken,
  });
  let ownProse = false;
  for (let position = 0; position < reader.itemCount; position++) {
    const content = await reader.readItem(position);
    await admin.runTransaction(content.verify);
    assert.equal(content.raw, null);
    ownProse ||= JSON.stringify(content.value).includes('Own prose');
  }
  assert.equal(ownProse, true);
  const prepared = await reader.readItem(0),
    catalogRef = admin.doc(root + '/validationIndex/' + digest(['legacy', 'book', '0'])),
    catalog = await catalogRef.get();
  await catalogRef.delete();
  await catalogRef.create(catalog.data()); // Identical payload, new native birth.
  await assert.rejects(() => admin.runTransaction(prepared.verify));
  await assert.rejects(() => reader.readItem(0));
  const metadata = JSON.stringify(await api.listBookRestores(uid, {}));
  for (const text of [
    'Own title',
    'Own prose',
    'Original',
    'PRIVATE_TOKEN',
    'GLOBAL NAME',
    'PRIVATE RESOLVED NAME',
    'stateJSON',
  ])
    assert.equal(metadata.includes(text), false, text);
  const replay = await api.advanceBookRestoreValidation(uid, firstRequest);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.state, 'content-verified');
  await admin.doc('books/unrelated/chapters/chapter').set({ content: 'preserve' });
  const cancelled = await cleanupLegacyRestore(api, uid, id, done, { limit: 7 });
  assert.equal(cancelled.state, 'cancelled');
  await emptyNamespaces();
  assert.equal(
    (await admin.doc('books/unrelated/chapters/chapter').get()).data().content,
    'preserve',
  );
  assert.equal((await admin.doc('deletedBooks/' + done.bookId).get()).exists, true);
});
test('large native opaque checkpoint resumes and identical recreation loses receipt birth while cleanup remains possible', async (t) => {
  const { progress: initial } = await uploadLegacyRestore(
    api,
    uid,
    id,
    largeLegacyCursorFixture(fixture(2)),
  );
  let p = initial,
    big = null,
    count = 0,
    firstReceipt,
    firstRequest;
  while (!big) {
    const req = mutation(id, p, 'legacy-sdk-large-' + count++);
    const result = await factory().advanceBookRestoreValidation(uid, req);
    p = result.progress;
    if (!firstReceipt) {
      firstReceipt = result.receipt;
      firstRequest = req;
    }
    const snapshot = await admin.doc(root + '/validationState/current').get();
    if (Buffer.byteLength(snapshot.data().stateJSON, 'utf8') > 200 * 1024) big = snapshot;
    assert.equal(p.state, 'validating');
    assert.ok(count < 100);
  }
  const before = p.checkpoint;
  p = (
    await factory().advanceBookRestoreValidation(uid, mutation(id, p, 'legacy-sdk-large-resume'))
  ).progress;
  assert.equal(p.checkpoint, before + 1);
  assert.equal(p.state, 'validating');
  assert.equal(p.validation.failure, null);
  big = await admin.doc(root + '/validationState/current').get();
  const payloadBytes = Buffer.byteLength(big.data().stateJSON, 'utf8'),
    outerBytes = Buffer.byteLength(JSON.stringify(big.data()));
  assert.ok(payloadBytes > 200 * 1024);
  assert.ok(payloadBytes <= 640 * 1024);
  t.diagnostic(JSON.stringify({ payloadBytes, outerBytes, resumedCheckpoint: p.checkpoint }));
  await big.ref.delete();
  await big.ref.create(big.data());
  assert.equal(big.createTime.isEqual((await big.ref.get()).createTime), false);
  await assert.rejects(
    () => factory().advanceBookRestoreValidation(uid, mutation(id, p, 'legacy-sdk-large-aba')),
    { code: 'failed-precondition' },
  );
  const current = await api.getBookRestore(uid, { restoreId: id });
  assert.equal(current.state, 'validating');
  assert.equal(current.validation.failure, null);
  const cancelled = await cleanupLegacyRestore(api, uid, id, current, { limit: 9 });
  assert.equal(cancelled.state, 'cancelled');
  await emptyNamespaces();
  const replay = await api.advanceBookRestoreValidation(uid, firstRequest);
  assert.deepEqual(replay.receipt, firstReceipt);
  assert.equal(replay.progress.state, 'cancelled');
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
});
