import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { sha256, chunkId } from '../../functions/src/bookRestoreUploadContracts.mjs';
import { validateBookBackupContent } from '../../functions/src/bookBackupContent.mjs';
import {
  indexedLoreData,
  indexedLoreArchive,
  PRIVATE_LORE_BODY,
} from '../../functions/test/helpers/bookLoreContentFixture.mjs';
import {
  fixture,
  source,
  indexFixture,
  hashPort,
} from '../../functions/test/helpers/bookContentFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-validation',
  uid = 'author',
  id = 'restore-validation-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
const mutation = (p, operationId, extra = {}) => ({
  restoreId: id,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
async function ready(records = fixture()) {
  const src = await source(records),
    bytes = await src.read(0, src.size);
  let p = (
    await api.startBookRestore(uid, {
      operationId: id,
      source: {
        format: 'writer-book-archive',
        version: 1,
        byteLength: bytes.length,
        sha256: sha256(bytes),
      },
      reviewHash: 'a'.repeat(64),
    })
  ).progress;
  await api.getBookRestoreRecoveryKey(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  });
  for (let i = 0; i < Math.ceil(bytes.length / 65536); i++) {
    const part = bytes.subarray(i * 65536, (i + 1) * 65536);
    p = (
      await api.appendBookRestoreChunk(
        uid,
        mutation(p, 'validation-sdk-upload' + i, {
          index: i,
          chunkHash: sha256(part),
          chunkBase64: Buffer.from(part).toString('base64'),
        }),
      )
    ).progress;
  }
  let hashStep = 0;
  while (p.state !== 'bytes-verified')
    p = (
      await api.advanceBookRestoreIntegrity(
        uid,
        mutation(p, 'validation-sdk-hash-' + hashStep++, { limit: 16 }),
      )
    ).progress;
  return { p, src };
}
async function steps(p, count, prefix = 'validation-sdk-step') {
  for (let i = 0; i < count; i++)
    p = (await api.advanceBookRestoreValidation(uid, mutation(p, prefix + i))).progress;
  return p;
}
async function finish(p, prefix = 'validation-sdk-finish') {
  let count = 0;
  while (['bytes-verified', 'validating'].includes(p.state)) {
    api = createBookRestoreUploadService({ db: admin });
    p = (await api.advanceBookRestoreValidation(uid, mutation(p, prefix + count++))).progress;
    assert.ok(count < 200);
  }
  return p;
}
async function clean(p, prefix = 'validation-sdk-clean') {
  p = (await api.cancelBookRestore(uid, mutation(p, prefix + 'cancel'))).progress;
  let count = 0;
  while (p.state !== 'cancelled') {
    p = (await api.advanceBookRestoreCleanup(uid, mutation(p, prefix + count++, { limit: 25 })))
      .progress;
    assert.ok(count < 30);
  }
  return p;
}
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw new Error('Use a local demo emulator.');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  api = createBookRestoreUploadService({ db: admin });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('real server validation resumes to the shared semantic result and every private namespace stays SDK denied', async () => {
  const { p, src } = await ready(),
    done = await finish(p),
    expected = await validateBookBackupContent(src, { index: indexFixture(), hash: hashPort });
  assert.equal(done.state, 'content-verified');
  assert.deepEqual(done.validation.summary.totals, expected.totals);
  assert.deepEqual(done.validation.summary.warnings, expected.warnings);
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
  const index = (
      await admin
        .collection(root + '/validationIndex')
        .limit(1)
        .get()
    ).docs[0],
    item = (
      await admin
        .collection(root + '/validationItems')
        .limit(1)
        .get()
    ).docs[0];
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    for (const path of [root + '/validationState/current', index.ref.path, item.ref.path]) {
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
  let rawParts = 0;
  for (let position = 0; position < reader.itemCount; position++) {
    const content = await reader.readItem(position);
    await admin.runTransaction(content.verify);
    if (content.raw)
      for await (const part of content.raw()) {
        await admin.runTransaction(part.verify);
        rawParts++;
      }
  }
  assert.equal(rawParts, 2); // Empty historical text and explicit BOM/Unicode draft.
  const content = await reader.readItem(0),
    proofRef = admin.doc('privateProofs/content-read');
  await admin.runTransaction(async (tx) => {
    await content.verify(tx);
    tx.create(proofRef, { accepted: true });
  });
  assert.equal((await proofRef.get()).data().accepted, true);
  const second = await reader.readItem(1);
  const pointer = await item.ref.get();
  await pointer.ref.delete();
  await pointer.ref.create(pointer.data());
  await assert.rejects(() => admin.runTransaction(content.verify));
  await assert.rejects(() => reader.readItem(0));
  const job = await admin.doc(root).get(),
    birthRef = admin.doc(
      'users/' + uid + '/bookRestoreOperations/' + job.data().validationBirthOperationId,
    ),
    birth = await birthRef.get();
  await birthRef.delete();
  await birthRef.create(birth.data());
  await assert.rejects(() => admin.runTransaction(second.verify));
  await assert.rejects(() => reader.readItem(1));
  const metadata = JSON.stringify(await api.listBookRestores(uid, {}));
  for (const text of ['Original', 'Livro', 'hashState', 'instructions'])
    assert.equal(metadata.includes(text), false);
});
test('identical retries commit index, item, state and receipt together; competing steps lose CAS without rejecting the file', async () => {
  let { p } = await ready();
  p = await steps(p, 2);
  const request = mutation(p, 'validation-sdk-race01'),
    values = await Promise.all([
      api.advanceBookRestoreValidation(uid, request),
      api.advanceBookRestoreValidation(uid, request),
    ]);
  assert.deepEqual(values[0].receipt, values[1].receipt);
  assert.equal(values[0].progress.checkpoint, p.checkpoint + 1);
  const job = await admin.doc(root).get(),
    state = await admin.doc(root + '/validationState/current').get(),
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + request.operationId)
      .get(),
    item = (
      await admin
        .collection(root + '/validationItems')
        .limit(1)
        .get()
    ).docs[0],
    index = (
      await admin
        .collection(root + '/validationIndex')
        .limit(1)
        .get()
    ).docs[0];
  assert.ok(job.updateTime.isEqual(state.updateTime));
  assert.ok(job.updateTime.isEqual(receipt.createTime));
  assert.ok(job.updateTime.isEqual(item.createTime));
  assert.ok(job.updateTime.isEqual(index.createTime));
  assert.ok(index.createTime.isEqual(index.updateTime));
  const q = values[0].progress,
    race = await Promise.allSettled([
      api.advanceBookRestoreValidation(uid, mutation(q, 'validation-sdk-race02')),
      api.advanceBookRestoreValidation(uid, mutation(q, 'validation-sdk-race03')),
    ]);
  assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(race.find((x) => x.status === 'rejected').reason.code, 'failed-precondition');
  const current = await api.getBookRestore(uid, { restoreId: id });
  assert.equal(current.state, 'validating');
  assert.equal(current.validation.failure, null);
  await admin.doc('books/other/chapters/chapter').set({ content: 'preserve' });
  const terminal = await clean(current);
  assert.equal(terminal.state, 'cancelled');
  for (const name of [
    'chunks',
    'integrityProofs',
    'integrityState',
    'validationIndex',
    'validationItems',
    'validationState',
  ])
    assert.equal((await admin.collection(root + '/' + name).get()).empty, true);
  assert.equal((await admin.doc('books/other/chapters/chapter').get()).data().content, 'preserve');
  assert.equal((await admin.doc('deletedBooks/' + p.bookId).get()).exists, true);
});
test('identical private state recreation loses native birth binding and remains explicitly cancellable', async () => {
  let { p } = await ready();
  p = await steps(p, 1);
  const ref = admin.doc(root + '/validationState/current'),
    old = await ref.get();
  await ref.delete();
  await ref.create(old.data());
  assert.equal(old.createTime.isEqual((await ref.get()).createTime), false);
  await assert.rejects(
    api.advanceBookRestoreValidation(uid, mutation(p, 'validation-sdk-stateaba')),
    { code: 'failed-precondition' },
  );
  assert.equal((await api.getBookRestore(uid, { restoreId: id })).state, 'validating');
  await clean(p);
});
test('recreated index data cannot substitute for the original receipt-bound generation', async () => {
  let { p } = await ready();
  p = await steps(p, 3);
  const index = (
      await admin
        .collection(root + '/validationIndex')
        .limit(1)
        .get()
    ).docs[0],
    ref = index.ref;
  await ref.delete();
  await ref.create(index.data());
  let rejected = false;
  for (let i = 0; i < 150; i++) {
    try {
      p = (await api.advanceBookRestoreValidation(uid, mutation(p, 'validation-sdk-indexaba' + i)))
        .progress;
    } catch (error) {
      assert.equal(error.code, 'failed-precondition');
      rejected = true;
      break;
    }
    assert.equal(p.state, 'validating');
  }
  assert.equal(rejected, true);
  assert.equal((await api.getBookRestore(uid, { restoreId: id })).state, 'validating');
  await clean(p);
});

test('SDK streamed lore above 8 MiB validates with constant pointers and private metadata without activating the book', async () => {
  const records = indexedLoreArchive(indexedLoreData({ large: true, count: 130 })),
    expected = await validateBookBackupContent(await source(indexedLoreArchive()), {
      index: indexFixture(),
      hash: hashPort,
    });
  let { p } = await ready(records),
    maximum = 0,
    resumed = 0,
    count = 0;
  while (['bytes-verified', 'validating'].includes(p.state)) {
    api = createBookRestoreUploadService({ db: admin });
    p = (
      await api.advanceBookRestoreValidation(uid, mutation(p, 'validation-sdk-large-' + count++))
    ).progress;
    const snapshot = (await admin.doc(root + '/validationState/current').get()).data()?.state;
    maximum = Math.max(maximum, Buffer.byteLength(JSON.stringify(snapshot)));
    assert.equal(JSON.stringify(snapshot).includes(PRIVATE_LORE_BODY), false);
    if (snapshot.lore?.frame) resumed++;
    if (snapshot.lore) assert.equal(Object.hasOwn(snapshot.lore, 'spans'), false);
    assert.ok(count < 1000);
  }
  assert.equal(p.state, 'content-verified');
  assert.deepEqual(p.validation.summary.totals, expected.totals);
  assert.deepEqual(p.validation.summary.warnings, expected.warnings);
  assert.ok(maximum < 65536 && resumed > 0);
  const pointer = (
      await admin
        .collection(root + '/validationItems')
        .where('record.kind', '==', 'book-lore')
        .get()
    ).docs[0],
    value = pointer.data();
  assert.equal(Object.hasOwn(value, 'spans'), false);
  assert.ok(value.byteLength > 8 * 1024 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < 16384);
  assert.ok(value.lore.chunkCount > 128);
  assert.equal(value.lore.metadata.index.relations.count, 130);
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), pointer.ref.path)));
});
test('SDK dense-frame retry binds rows to the atomic receipt and a recreated source cannot resume', async () => {
  let { p } = await ready(indexedLoreArchive(indexedLoreData({ count: 205 }))),
    frame;
  for (let step = 0; step < 100; step++) {
    p = (await api.advanceBookRestoreValidation(uid, mutation(p, 'validation-sdk-dense-' + step)))
      .progress;
    frame = (await admin.doc(root + '/validationState/current').get()).data().state.lore?.frame;
    if (frame) break;
  }
  assert.ok(frame);
  const request = mutation(p, 'validation-sdk-dense-retry'),
    values = await Promise.all([
      api.advanceBookRestoreValidation(uid, request),
      api.advanceBookRestoreValidation(uid, request),
    ]);
  assert.deepEqual(values[0].receipt, values[1].receipt);
  p = values[0].progress;
  const rows = (
      await admin
        .collection(root + '/validationIndex')
        .where('createdByOperationId', '==', request.operationId)
        .get()
    ).docs,
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + request.operationId)
      .get(),
    snapshot = await admin.doc(root + '/validationState/current').get();
  assert.equal(rows.filter((r) => r.data().value.kind === 'lore-relation').length, 64);
  for (const row of rows) assert.ok(row.createTime.isEqual(receipt.createTime));
  assert.ok(snapshot.updateTime.isEqual(receipt.createTime));
  assert.ok(snapshot.data().state.lore.frame);
  const race = await Promise.allSettled([
    api.advanceBookRestoreValidation(uid, mutation(p, 'validation-sdk-dense-race-a')),
    api.advanceBookRestoreValidation(uid, mutation(p, 'validation-sdk-dense-race-b')),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(race.find((r) => r.status === 'rejected').reason.code, 'failed-precondition');
  p = await api.getBookRestore(uid, { restoreId: id });
  const current = (await admin.doc(root + '/validationState/current').get()).data().state;
  assert.ok(current.lore.frame);
  const chunk = Math.floor(current.lore.frame.span.offset / 65536),
    ref = admin.doc(root + '/chunks/' + chunkId(chunk)),
    old = await ref.get();
  assert.ok(old.exists);
  await ref.delete();
  await ref.create(old.data());
  const before = await admin.doc(root).get();
  await assert.rejects(
    api.advanceBookRestoreValidation(uid, mutation(p, 'validation-sdk-dense-source-aba')),
    { code: 'failed-precondition' },
  );
  assert.ok(before.updateTime.isEqual((await admin.doc(root).get()).updateTime));
  assert.equal((await api.getBookRestore(uid, { restoreId: id })).state, 'validating');
  await clean(p, 'validation-sdk-dense-clean-');
});
