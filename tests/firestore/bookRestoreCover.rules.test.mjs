import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
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
  sharp = requireFunctions('sharp'),
  projectId = 'demo-writer-restore-cover',
  uid = 'author',
  id = 'restore-cover-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api, bytes;
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
  const raw = Buffer.alloc(1200 * 1800 * 3);
  let seed = 17;
  for (let i = 0; i < 1200 * 70 * 3; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    raw[i] = seed >>> 24;
  }
  bytes = await sharp(raw, { raw: { width: 1200, height: 1800, channels: 3 } })
    .png()
    .toBuffer();
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK copies exact private PNG parts, rolls back collision and certifies cleanup without touching the library', async () => {
  const initial = await readyRestoreCover(factory, uid, id, coverRestoreFixture({ bytes })),
    firstRequest = mutation(id, initial, 'cover-sdk-first01'),
    first = (await api.advanceBookRestoreCover(uid, firstRequest)).progress,
    collision = admin.doc(root + '/preparedCoverChunks/000000000000001'),
    nextRequest = mutation(id, first, 'cover-sdk-next01'),
    before = await admin.doc(root).get();
  assert.equal(first.preparation.cover.parts, 1);
  assert.equal((await admin.doc(root + '/preparedCovers/current').get()).exists, false);
  await collision.create({ foreign: true });
  await assert.rejects(() => api.advanceBookRestoreCover(uid, nextRequest));
  const after = await admin.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal((await collision.get()).data().foreign, true);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + nextRequest.operationId).get())
      .exists,
    false,
  );
  await collision.delete();
  const p = await finishRestoreCover(
      factory,
      uid,
      id,
      (await api.advanceBookRestoreCover(uid, nextRequest)).progress,
    ),
    descriptor = await admin.doc(root + '/preparedCovers/current').get(),
    pieces = (
      await admin
        .collection(root + '/preparedCoverChunks')
        .orderBy('index')
        .get()
    ).docs,
    actual = Buffer.concat(pieces.map((d) => d.data().bytes)),
    metadata = await sharp(actual).metadata(),
    journal = (
      await admin
        .collection(root + '/materializationArtifacts')
        .where('kind', '==', 'cover-definition')
        .get()
    ).docs[0],
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + journal.data().createdByOperationId)
      .get();
  assert.deepEqual(actual, bytes);
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 1800);
  assert.equal(descriptor.data().cover.name, '\ufeff  Capa 🌙  ');
  assert.equal(descriptor.data().cover.createdAt, 3);
  assert.ok(descriptor.createTime.isEqual(journal.createTime));
  assert.ok(descriptor.createTime.isEqual(receipt.createTime));
  assert.equal(p.preparation.phase, 'cover-finalize');
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    await assertFails(getDoc(doc(db, descriptor.ref.path)));
    await assertFails(getDoc(doc(db, pieces[0].ref.path)));
    await assertFails(getDocs(collection(db, root + '/preparedCoverChunks')));
    await assertFails(setDoc(doc(db, descriptor.ref.path), { cover: 'replace' }));
  }
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  assert.equal((await admin.collection('users/' + uid + '/imageLibrary').get()).empty, true);
  assert.equal(
    (await admin.doc('books/' + p.bookId + '/workProgress/current').get()).data().countReady,
    false,
  );
  const library = admin.doc('users/' + uid + '/imageLibrary/' + p.preparation.cover.imageId);
  await library.create({ keep: true });
  const terminal = await cleanupLegacyRestore(api, uid, id, p, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.equal((await admin.collection(root + '/preparedCoverChunks').get()).empty, true);
  assert.equal((await admin.collection(root + '/preparedCovers').get()).empty, true);
  assert.equal((await library.get()).data().keep, true);
  assert.deepEqual(
    (await api.advanceBookRestoreCover(uid, firstRequest)).receipt.operationId,
    firstRequest.operationId,
  );
});
test('SDK cleanup refuses a recreated native cover part and preserves its new incarnation', async () => {
  const initial = await readyRestoreCover(factory, uid, id),
    p = (await api.advanceBookRestoreCover(uid, mutation(id, initial, 'cover-sdk-part02')))
      .progress,
    ref = admin.doc(root + '/preparedCoverChunks/000000000000000'),
    before = await ref.get(),
    value = before.data();
  await ref.delete();
  await ref.create(value);
  const recreated = await ref.get();
  assert.equal(recreated.createTime.isEqual(before.createTime), false);
  const cancelling = (await api.cancelBookRestore(uid, mutation(id, p, 'cover-sdk-cancel02')))
    .progress;
  await assert.rejects(() => cleanupLegacyRestore(api, uid, id, cancelling, { limit: 5 }));
  const current = await ref.get();
  assert.ok(current.createTime.isEqual(recreated.createTime));
  assert.deepEqual(current.data(), value);
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
});
