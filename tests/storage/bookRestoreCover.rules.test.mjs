import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref as storageRef, getBytes } from 'firebase/storage';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createBookRestoreCoverStorage } from '../../functions/src/bookRestoreCoverStorage.mjs';
import {
  coverRestoreFixture,
  readyRestoreCover,
  finishRestoreCover,
} from '../../functions/test/helpers/bookRestoreCoverFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  { Storage } = requireFunctions('@google-cloud/storage'),
  sharp = requireFunctions('sharp'),
  projectId = 'demo-writer-backup-cover',
  uid = 'author',
  id = 'cover-materialize-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, bucket, bytes, assets, api;
const factory = () => createBookRestoreUploadService({ db: admin, restoreAssets: assets });
before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST,
    storage = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (
    !/^127\.0\.0\.1:\d+$/.test(host ?? '') ||
    !/^127\.0\.0\.1:\d+$/.test(storage ?? '') ||
    process.env.WRITER_COVER_STORAGE_BUCKET !== projectId + '.appspot.com'
  )
    throw new Error('Dedicated demo emulators required.');
  const [fh, fp] = host.split(':'),
    [sh, sp] = storage.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: fh,
      port: Number(fp),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
    storage: {
      host: sh,
      port: Number(sp),
      rules: await readFile(new URL('../../storage.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com' });
  bucket = new Storage({
    projectId,
    apiEndpoint: 'http://' + storage,
    useAuthWithCustomEndpoint: false,
    retryOptions: { autoRetry: false },
  }).bucket(process.env.WRITER_COVER_STORAGE_BUCKET);
  const raw = Buffer.alloc(1200 * 1800 * 3);
  let seed = 29;
  for (let i = 0; i < 1200 * 40 * 3; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    raw[i] = seed >>> 24;
  }
  bytes = await sharp(raw, { raw: { width: 1200, height: 1800, channels: 3 } })
    .png()
    .toBuffer();
});
beforeEach(async () => {
  await env.clearFirestore();
  await bucket.deleteFiles({ force: true });
  assets = createBookRestoreCoverStorage(() => bucket);
  api = factory();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function ready() {
  const p = await finishRestoreCover(
    factory,
    uid,
    id,
    await readyRestoreCover(factory, uid, id, coverRestoreFixture({ bytes })),
  );
  return (await api.reserveBookRestoreCover(uid, mutation(id, p, 'sdk-reserve-cover01'))).progress;
}
const objectPath = (p) => 'book-covers/' + uid + '/' + p.preparation.cover.imageId + '.png';
test('SDK materializes exact private PNG, authenticates intent and protects a recreated generation', async () => {
  const p = await ready(),
    path = objectPath(p),
    request = mutation(id, p, 'sdk-materialize-cover01'),
    done = (await api.materializeBookRestoreCover(uid, request)).progress,
    [metadata] = await bucket.file(path).getMetadata(),
    [actual] = await bucket.file(path).download(),
    intent = await admin.doc(root + '/preparedCoverStorage/current').get(),
    journal = (
      await admin
        .collection(root + '/materializationArtifacts')
        .where('kind', '==', 'cover-storage')
        .get()
    ).docs[0],
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + request.operationId)
      .get();
  assert.deepEqual(actual, bytes);
  assert.equal((await sharp(actual).metadata()).width, 1200);
  assert.equal(metadata.metadata.accepted, 'false');
  assert.equal(metadata.metadata.firebaseStorageDownloadTokens, undefined);
  assert.equal(metadata.cacheControl, 'private, no-store');
  assert.equal(done.preparation.phase, 'personas-integrate');
  assert.equal(intent.data().cover.name, '\ufeff  Capa ' + String.fromCodePoint(0x1f319) + '  ');
  assert.equal(intent.data().storage.generation, String(metadata.generation));
  assert.ok(intent.createTime.isEqual(journal.createTime));
  assert.ok(intent.updateTime.isEqual(journal.updateTime));
  assert.ok(intent.updateTime.isEqual(receipt.createTime));
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDoc(doc(actor.firestore(), intent.ref.path)));
    await assertFails(setDoc(doc(actor.firestore(), intent.ref.path), { replace: true }));
    await assertFails(getBytes(storageRef(actor.storage(), path)));
  }
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
  assert.equal(
    (await admin.doc('books/' + done.bookId + '/workProgress/current').get()).data().countReady,
    false,
  );
  assert.equal((await admin.collection('users/' + uid + '/imageLibrary').get()).empty, true);
  assert.deepEqual(
    (await api.materializeBookRestoreCover(uid, request)).receipt.operationId,
    request.operationId,
  );
  // Conditional GCS deletion is exercised by the SDK wire contract: Firebase emulator ignores generation query parameters.
  // An already-confirmed generation must not authorize a later native incarnation.
  const context = {
      ownerId: uid,
      restoreId: id,
      jobToken: p.jobToken,
      imageId: 'restore-' + 'e'.repeat(64),
      contentHash: intent.data().cover.contentHash,
      byteLength: bytes.length,
    },
    adapter = createBookRestoreCoverStorage(() => bucket),
    proof = await adapter.stage(context, bytes),
    other = 'book-covers/' + uid + '/' + context.imageId + '.png',
    [original] = await bucket.file(other).getMetadata();
  await bucket.file(other).save(bytes, {
    resumable: false,
    metadata: {
      contentType: 'image/png',
      cacheControl: original.cacheControl,
      metadata: original.metadata,
    },
  });
  const [recreated] = await bucket.file(other).getMetadata();
  assert.notEqual(String(recreated.generation), proof.generation);
  await assert.rejects(() => adapter.fence(context, proof));
  assert.equal(
    String((await bucket.file(other).getMetadata())[0].generation),
    String(recreated.generation),
  );
});
test('SDK stage starting after cancellation observes the fence before sending PNG bytes', async () => {
  const p = await ready(),
    path = objectPath(p),
    stage = assets.stage;
  let enter, release;
  const entered = new Promise((r) => (enter = r)),
    gate = new Promise((r) => (release = r));
  assets.stage = async (...args) => {
    enter();
    await gate;
    return stage(...args);
  };
  const pending = api.materializeBookRestoreCover(uid, mutation(id, p, 'sdk-late-materialize01'));
  await entered;
  const terminal = await cleanupLegacyRestore(api, uid, id, p, { limit: 10 });
  release();
  await assert.rejects(() => pending);
  const [metadata] = await bucket.file(path).getMetadata(),
    [empty] = await bucket.file(path).download();
  assert.equal(terminal.state, 'cancelled');
  assert.equal(empty.length, 0);
  assert.equal(metadata.metadata.restoreState, 'fenced');
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/sdk-late-materialize01').get())
      .exists,
    false,
  );
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
});
