import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createImageLibraryService } from '../../functions/src/imageLibrary.mjs';
import {
  readyLoreMode,
  advanceLoreMode,
} from '../../functions/test/helpers/bookRestoreLoreModeFixture.mjs';
import {
  sha256,
  startInput,
  requestHash,
  chunkInput,
} from '../../functions/src/bookRestoreUploadContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore, FieldValue } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-restore-upload',
  uid = 'author',
  id = 'restore-sdk-000001',
  bytes = Buffer.alloc(131079, 66);
const request = () => ({
  operationId: id,
  source: {
    format: 'writer-book-archive',
    version: 1,
    byteLength: bytes.length,
    sha256: sha256(bytes),
  },
  reviewHash: 'a'.repeat(64),
});
let env, admin, api;
const normalBook = {
  authorId: uid,
  title: 'New book',
  status: 'draft',
  localLoreVersion: 0,
  createdAt: 1000,
  updatedAt: 1000,
};
const mutate = (p, operationId, extra = {}) => ({
  restoreId: p.restoreId,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
const append = (p, index, operationId = 'upload-sdk-000001') => {
  const data = bytes.subarray(index * 65536, (index + 1) * 65536);
  return mutate(p, operationId, {
    index,
    chunkHash: sha256(data),
    chunkBase64: data.toString('base64'),
  });
};
async function prepare() {
  const p = (await api.startBookRestore(uid, request())).progress;
  await api.getBookRestoreRecoveryKey(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  });
  return api.getBookRestore(uid, { restoreId: id });
}
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Use only the local demo emulator.');
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
test('native atomic reservation blocks SDK and normal server book creation', async () => {
  const p = (await api.startBookRestore(uid, request())).progress,
    db = env.authenticatedContext(uid).firestore();
  const snapshots = await admin.getAll(
    admin.doc('users/' + uid + '/bookRestores/' + id),
    admin.doc('bookRestoreReservations/' + p.bookId),
    admin.doc('deletedBooks/' + p.bookId),
  );
  assert.ok(snapshots.every((s) => s.exists && s.createTime.isEqual(snapshots[0].createTime)));
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  await assertSucceeds(setDoc(doc(db, 'books/control-book'), normalBook));
  await assertFails(setDoc(doc(db, 'books/' + p.bookId), normalBook));
  await assert.rejects(
    createImageLibraryService({ db: admin, assets: {} }).saveBook(uid, {
      creationId: p.bookId,
      title: 'Collision',
    }),
    { code: 'failed-precondition' },
  );
  await assertFails(deleteDoc(doc(db, 'deletedBooks/' + p.bookId)));
  const result = await api.startBookRestore(uid, request());
  assert.equal(result.progress.jobToken, p.jobToken);
});
test('own, foreign and anonymous SDK cannot read/list/write private jobs, parts, keys, receipts or fences', async () => {
  const p = await prepare(),
    r = await api.appendBookRestoreChunk(uid, append(p, 0));
  const paths = [
    'users/' + uid + '/bookRestores/' + id,
    'users/' + uid + '/bookRestores/' + id + '/chunks/000000000000000',
    'users/' + uid + '/bookRestoreRecoveryKeys/' + id,
    'users/' + uid + '/bookRestoreOperations/' + r.receipt.operationId,
    'users/' + uid + '/bookRestoreStartFences/' + id,
    'bookRestoreReservations/' + p.bookId,
  ];
  for (const context of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = context.firestore();
    for (const path of paths) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ownerId: uid }));
    }
    await assertFails(getDocs(collection(db, 'users/' + uid + '/bookRestores')));
    await assertFails(getDocs(collection(db, 'users/' + uid + '/bookRestores/' + id + '/chunks')));
  }
  await assert.rejects(api.getBookRestore('other', { restoreId: id }), { code: 'not-found' });
  const values = await api.listBookRestores(uid, { limit: 1 });
  assert.equal(values.items.length, 1);
  assert.equal(JSON.stringify(values).includes('keyBase64'), false);
});
test('real transaction race writes once; historic receipt remains distinct from latest progress', async () => {
  const p = await prepare(),
    one = append(p, 0);
  const same = await Promise.all([
    api.appendBookRestoreChunk(uid, one),
    api.appendBookRestoreChunk(uid, one),
  ]);
  assert.deepEqual(same[0].receipt, same[1].receipt);
  assert.equal(
    (await admin.collection('users/' + uid + '/bookRestores/' + id + '/chunks').get()).size,
    1,
  );
  const q = same[0].progress,
    results = await Promise.allSettled([
      api.appendBookRestoreChunk(uid, append(q, 1, 'upload-sdk-000002')),
      api.appendBookRestoreChunk(uid, append(q, 1, 'upload-sdk-000003')),
    ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(results.find((x) => x.status === 'rejected').reason.code, 'failed-precondition');
  const current = await api.getBookRestore(uid, { restoreId: id }),
    completed = await api.appendBookRestoreChunk(uid, append(current, 2, 'upload-sdk-000004'));
  assert.equal(completed.progress.state, 'uploaded');
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  const resolved = await api.resolveBookRestoreOperation(uid, {
    restoreId: id,
    jobToken: p.jobToken,
    operationId: one.operationId,
    requestHash: requestHash('appendBookRestoreChunk', chunkInput(one)),
  });
  assert.equal(resolved.receipt.checkpoint, 1);
  assert.equal(resolved.progress.checkpoint, 3);
  assert.equal(resolved.progress.uploadedBytes, bytes.length);
});
test('bounded cleanup preserves foreign book trees and permanent reservation after deleting uploaded bytes', async () => {
  let p = await prepare();
  for (let i = 0; i < 3; i++)
    p = (await api.appendBookRestoreChunk(uid, append(p, i, 'upload-sdk-clean0' + i))).progress;
  await admin.doc('books/unrelated-book/chapters/chapter').set({ content: 'preserve' });
  p = (await api.cancelBookRestore(uid, mutate(p, 'cancel-sdk-000001'))).progress;
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreRecoveryKeys/' + id).get()).exists,
    false,
  );
  const a = await api.advanceBookRestoreCleanup(uid, mutate(p, 'cleanup-sdk-00001', { limit: 2 }));
  assert.equal(a.progress.state, 'cancelling');
  assert.equal(a.progress.cleanedChunks, 2);
  const b = await api.advanceBookRestoreCleanup(
    uid,
    mutate(a.progress, 'cleanup-sdk-00002', { limit: 2 }),
  );
  assert.equal(b.progress.state, 'cancelled');
  assert.equal(b.progress.cleanedChunks, 3);
  assert.equal(
    (await admin.collection('users/' + uid + '/bookRestores/' + id + '/chunks').get()).empty,
    true,
  );
  assert.equal(
    (await admin.doc('books/unrelated-book/chapters/chapter').get()).data().content,
    'preserve',
  );
  assert.equal((await admin.doc('deletedBooks/' + p.bookId).get()).exists, true);
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), 'books/' + p.bookId), normalBook),
  );
  const late = await api.startBookRestore(uid, request());
  assert.equal(late.receipt.state, 'uploading');
  assert.equal(late.progress.state, 'cancelled');
});
test('missing recovery key never regenerates; native identical job recreation fails closed', async () => {
  const p = await prepare(),
    keyRef = admin.doc('users/' + uid + '/bookRestoreRecoveryKeys/' + id);
  await keyRef.delete();
  await assert.rejects(
    api.getBookRestoreRecoveryKey(uid, {
      restoreId: id,
      jobToken: p.jobToken,
      reviewHash: p.reviewHash,
    }),
    { code: 'failed-precondition' },
  );
  const ref = admin.doc('users/' + uid + '/bookRestores/' + id),
    old = await ref.get();
  await ref.delete();
  await ref.create(old.data());
  assert.equal(old.createTime.isEqual((await ref.get()).createTime), false);
  await assert.rejects(api.getBookRestore(uid, { restoreId: id, jobToken: p.jobToken }), {
    code: 'failed-precondition',
  });
});
test('cancel resolver creates a permanent fence and races safely with a late start', async () => {
  const input = {
    operationId: id,
    requestHash: requestHash('startBookRestore', startInput(request())),
    intent: 'cancel',
  };
  const result = await api.resolveBookRestoreStart(uid, input);
  assert.equal(result.kind, 'cancelled');
  assert.deepEqual(await api.startBookRestore(uid, request()), result);
  assert.equal((await admin.doc('users/' + uid + '/bookRestores/' + id).get()).exists, false);
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), 'books/' + result.bookId), normalBook),
  );
  await env.clearFirestore();
  const [startResult, resolved] = await Promise.all([
    api.startBookRestore(uid, request()),
    api.resolveBookRestoreStart(uid, input),
  ]);
  assert.equal(startResult.kind, resolved.kind);
  if (startResult.kind === 'confirmed')
    assert.equal((await api.getBookRestore(uid, { restoreId: id })).state, 'uploading');
  else assert.equal((await admin.doc('users/' + uid + '/bookRestores/' + id).get()).exists, false);
});

test('SDK pinned lore mode stays original on start replay and protected reservation mutation is refused', async () => {
  for (const flag of [false, true]) {
    const service = (value) =>
        createBookRestoreUploadService({ db: admin, now: () => 1000, indexedLoreBodies: value }),
      input = { ...request(), operationId: 'sdk-mode-start-' + flag },
      first = await service(flag).startBookRestore(uid, input),
      job = admin.doc('users/' + uid + '/bookRestores/' + input.operationId),
      reserve = admin.doc('bookRestoreReservations/' + first.progress.bookId),
      raw = await job.get(),
      reserved = await reserve.get();
    assert.equal(raw.data().loreMode, flag ? 'indexed-v2' : 'inline-v1');
    assert.equal(reserved.data().loreMode, raw.data().loreMode);
    assert.equal(reserved.createTime.isEqual(reserved.updateTime), true);
    assert.equal(raw.createTime.isEqual(reserved.createTime), true);
    assert.deepEqual(await service(!flag).startBookRestore(uid, input), first);
    const own = env.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(own, job.path), { loreMode: 'inline-v1' }, { merge: true }));
    await assertFails(setDoc(doc(own, reserve.path), { loreMode: 'inline-v1' }, { merge: true }));
    await assert.rejects(
      service(!flag).startBookRestore(uid, { ...input, loreMode: 'inline-v1' }),
      { code: 'invalid-argument' },
    );
    await job.update({ loreMode: FieldValue.delete() });
    await assert.rejects(service(!flag).getBookRestore(uid, { restoreId: input.operationId }), {
      code: 'failed-precondition',
    });
    await job.update({ loreMode: raw.data().loreMode });
    await reserve.update({ touchedByTest: true });
    await assert.rejects(service(!flag).getBookRestore(uid, { restoreId: input.operationId }), {
      code: 'failed-precondition',
    });
    assert.equal((await admin.doc('books/' + first.progress.bookId).get()).exists, false);
  }
});
test('SDK pinned lore mode legacy candidate query authenticates an existing v2 journal between entities', async () => {
  const f = await readyLoreMode(true, { db: admin, id: 'sdk-mode-old-boundary' });
  await advanceLoreMode(
    f,
    true,
    (p) => p.preparation.loreCount === 1 && p.preparation.lorePayload === null,
  );
  // Emulate pre-policy metadata only; this is a selector/query test, not historical activation certification.
  const batch = admin.batch();
  batch.update(admin.doc(f.root), { loreMode: FieldValue.delete() });
  batch.update(admin.doc(f.reservation), { loreMode: FieldValue.delete() });
  await batch.commit();
  await advanceLoreMode(f, false);
  const heads = await admin.collection('books/' + f.p.bookId + '/lore').get();
  assert.equal(heads.size, 2);
  assert.ok(heads.docs.every((s) => s.data().payloadStorage.schemaVersion === 2));
  assert.equal((await admin.doc(f.root).get()).data().loreMode, undefined);
  assert.equal((await admin.doc('books/' + f.p.bookId).get()).exists, false);
});
