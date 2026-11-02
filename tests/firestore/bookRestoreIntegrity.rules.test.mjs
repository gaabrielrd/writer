import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { chunkId } from '../../functions/src/bookRestoreUploadContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-restore-integrity',
  uid = 'author',
  id = 'restore-sdk-integrity01',
  data = Buffer.alloc(131079, 72);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
const mutation = (p, operationId, extra = {}) => ({
  restoreId: p.restoreId,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
const advance = (p, operationId, limit = 1) =>
  api.advanceBookRestoreIntegrity(uid, mutation(p, operationId, { limit }));
async function uploaded(hash = sha(data)) {
  let p = (
    await api.startBookRestore(uid, {
      operationId: id,
      source: { format: 'writer-book-archive', version: 1, byteLength: data.length, sha256: hash },
      reviewHash: 'a'.repeat(64),
    })
  ).progress;
  await api.getBookRestoreRecoveryKey(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  });
  for (let i = 0; i < 3; i++) {
    const part = data.subarray(i * 65536, (i + 1) * 65536);
    p = (
      await api.appendBookRestoreChunk(
        uid,
        mutation(p, 'upload-sdk-integrity' + i, {
          index: i,
          chunkHash: sha(part),
          chunkBase64: part.toString('base64'),
        }),
      )
    ).progress;
  }
  return p;
}
async function cleanup(p) {
  let step = 0;
  p = (await api.cancelBookRestore(uid, mutation(p, 'cancel-sdk-integrity01'))).progress;
  while (p.state !== 'cancelled') {
    p = (
      await api.advanceBookRestoreCleanup(
        uid,
        mutation(p, 'cleanup-sdk-integrity' + step++, { limit: 2 }),
      )
    ).progress;
    assert.ok(step < 10);
  }
  return p;
}
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw new Error('Use only a local demo emulator.');
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
test('private native proofs/SHA state survive new service instances and remain SDK denied', async () => {
  let p = await uploaded();
  p = (await advance(p, 'integrity-sdk-step001')).progress;
  const state = await admin.doc(root + '/integrityState/current').get(),
    proof = await admin.doc(root + '/integrityProofs/' + chunkId(0)).get(),
    chunk = await admin.doc(root + '/chunks/' + chunkId(0)).get();
  assert.ok(state.data().hashState);
  assert.ok(proof.data().chunkToken);
  assert.ok(chunk.createTime);
  const context = { restoreId: id, jobToken: p.jobToken, reviewHash: p.reviewHash };
  assert.ok((await api.getBookRestoreRecoveryKey(uid, context)).keyBase64);
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    for (const path of [
      root + '/integrityState/current',
      root + '/integrityProofs/' + chunkId(0),
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ownerId: uid }));
    }
    await assertFails(getDocs(collection(db, root + '/integrityState')));
    await assertFails(getDocs(collection(db, root + '/integrityProofs')));
  }
  api = createBookRestoreUploadService({ db: admin });
  p = (await advance(p, 'integrity-sdk-step002')).progress;
  p = (await advance(p, 'integrity-sdk-step003')).progress;
  assert.equal(p.state, 'bytes-verified');
  assert.equal(p.integrity.checkedBytes, data.length);
  assert.equal((await admin.doc(root).get()).data().integrityDigest, sha(data));
  assert.equal((await admin.doc(root + '/integrityState/current').get()).exists, false);
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  const source = await api.openVerifiedBookRestoreSource(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  assert.deepEqual(Buffer.from(await source.read(65530, 20)), data.subarray(65530, 65550));
  assert.deepEqual(
    Buffer.from(await source.read(100, 65536 + 73)),
    data.subarray(100, 100 + 65536 + 73),
  );
  assert.equal(
    JSON.stringify(await api.listBookRestores(uid, {})).includes(state.data().hashState),
    false,
  );
});
test('transaction retries preserve SHA checkpoint and immutable receipt for identical or competing steps', async () => {
  const p = await uploaded(),
    request = mutation(p, 'integrity-sdk-race001', { limit: 1 });
  const result = await Promise.all([
    api.advanceBookRestoreIntegrity(uid, request),
    api.advanceBookRestoreIntegrity(uid, request),
  ]);
  assert.deepEqual(result[0].receipt, result[1].receipt);
  assert.equal(result[0].progress.integrity.checkedChunks, 1);
  const q = result[0].progress;
  const race = await Promise.allSettled([
    advance(q, 'integrity-sdk-race002'),
    advance(q, 'integrity-sdk-race003'),
  ]);
  assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(race.find((x) => x.status === 'rejected').reason.code, 'failed-precondition');
  const current = await api.getBookRestore(uid, { restoreId: id }),
    last = await advance(current, 'integrity-sdk-race004');
  assert.equal(last.progress.state, 'bytes-verified');
  const late = await api.advanceBookRestoreIntegrity(uid, request);
  assert.equal(late.receipt.integrity.checkedChunks, 1);
  assert.equal(late.progress.integrity.checkedChunks, 3);
  assert.equal((await admin.collection(root + '/integrityProofs').get()).size, 3);
});
test('same-body native chunk recreation invalidates the verified byte source', async () => {
  const p = (await advance(await uploaded(), 'integrity-sdk-full001', 16)).progress;
  const source = await api.openVerifiedBookRestoreSource(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  const ref = admin.doc(root + '/chunks/' + chunkId(0)),
    old = await ref.get();
  await ref.delete();
  await ref.create(old.data());
  assert.equal(old.createTime.isEqual((await ref.get()).createTime), false);
  await assert.rejects(source.read(0, 1), { code: 'failed-precondition' });
});
test('hash mismatch rejects; cleanup v2 removes all private input while preserving permanent metadata and other books', async () => {
  let p = (await advance(await uploaded('0'.repeat(64)), 'integrity-sdk-badhash', 16)).progress;
  assert.equal(p.state, 'rejected');
  assert.equal(p.integrity.failure, 'file-hash-mismatch');
  await admin.doc('books/unrelated/chapters/chapter').set({ content: 'preserve' });
  p = await cleanup(p);
  assert.equal(p.integrity.cleanupPhase, 'done');
  for (const name of ['chunks', 'integrityProofs', 'integrityState'])
    assert.equal((await admin.collection(root + '/' + name).get()).empty, true);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreRecoveryKeys/' + id).get()).exists,
    false,
  );
  assert.equal((await admin.doc('deletedBooks/' + p.bookId).get()).exists, true);
  assert.equal((await admin.doc('bookRestoreReservations/' + p.bookId).get()).exists, true);
  assert.equal(
    (await admin.doc('books/unrelated/chapters/chapter').get()).data().content,
    'preserve',
  );
});
test('corrupt private SHA state blocks advance but remains explicitly cancellable and removable', async () => {
  let p = (await advance(await uploaded(), 'integrity-sdk-corrupt1')).progress;
  await admin.doc(root + '/integrityState/current').update({ hashState: 'corrupted' });
  await assert.rejects(advance(p, 'integrity-sdk-corrupt2'), { code: 'failed-precondition' });
  p = await cleanup(p);
  assert.equal(p.state, 'cancelled');
  assert.equal((await admin.collection(root + '/integrityState').get()).empty, true);
});
