import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { adventureStageArtifactId } from '../../functions/src/adventureRestoreArtifacts.mjs';
import {
  imageAdventureArchive,
  prepareAdventureImages,
  finishImages,
} from '../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import {
  createAdventureStoragePNG,
  storageRequest,
} from '../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import { bookRestoreStorageWire } from '../../functions/test/helpers/bookRestoreStorageWire.mjs';
import {
  uid,
  id,
  mutation,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-image-storage',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? '')) throw Error('Only dedicated loopback demo');
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
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('real Firestore and GCS SDK reserve/upload/fence atomically, preserve original bytes privately and close late uploads before cleanup', async (t) => {
  const wire = await bookRestoreStorageWire(t),
    assets = wire.api,
    png = await createAdventureStoragePNG(),
    api = createAdventureRestoreTransferService({ db: admin, assets }),
    initial = await finishImages(
      { api, uid },
      await prepareAdventureImages(api, uid, await imageAdventureArchive({ image: png })),
    ),
    request = storageRequest(initial),
    [a, b] = await Promise.all([
      api.advanceAdventureRestoreImageStorage(uid, request),
      api.advanceAdventureRestoreImageStorage(uid, request),
    ]);
  assert.deepEqual(a, b);
  const reserved = a.progress,
    rows = await admin
      .collection(jobPath + '/preparedRoot')
      .where('kind', '==', 'adventure-restore-image-storage')
      .get();
  assert.equal(rows.size, 1);
  assert.equal(wire.requests.length, 0);
  const ref = rows.docs[0].ref,
    intent = rows.docs[0].data(),
    address = { scope: 'job', path: ['preparedRoot', ref.id] },
    journalRef = admin.doc(jobPath + '/stagingArtifacts/' + adventureStageArtifactId(address)),
    journal = await journalRef.get(),
    op = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + request.operationId)
      .get();
  assert.ok(rows.docs[0].createTime.isEqual(journal.createTime));
  assert.ok(rows.docs[0].createTime.isEqual(op.createTime));
  const before = (await admin.doc(jobPath).get()).data(),
    failingDb = {
      doc: admin.doc.bind(admin),
      collection: admin.collection.bind(admin),
      runTransaction: (cb) =>
        admin.runTransaction((tx) =>
          cb({
            get: tx.get.bind(tx),
            getAll: tx.getAll.bind(tx),
            create: tx.create.bind(tx),
            set: tx.set.bind(tx),
            delete: tx.delete.bind(tx),
            update(ref, value) {
              if (ref.path === jobPath && value.staging?.storagePrepared === 1)
                throw Error('SDK image Storage ACK rollback');
              return tx.update(ref, value);
            },
          }),
        ),
    },
    uploadRequest = storageRequest(reserved);
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({
        db: failingDb,
        assets,
      }).advanceAdventureRestoreImageStorage(uid, uploadRequest),
    /SDK image Storage ACK rollback/,
  );
  assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
  assert.equal((await ref.get()).data().state, 'reserved');
  const path = 'book-covers/' + uid + '/' + intent.asset.imageId + '.png',
    generation = wire.current.get(path).generation,
    prepared = (await api.advanceAdventureRestoreImageStorage(uid, uploadRequest)).progress;
  assert.equal(prepared.staging.storagePrepared, 1);
  assert.equal(wire.current.get(path).generation, generation);
  assert.deepEqual(wire.current.get(path).bytes, png);
  assert.equal(wire.current.get(path).metadata.accepted, 'false');
  assert.equal(wire.current.get(path).metadata.firebaseStorageDownloadTokens, undefined);
  assert.equal(wire.requests.filter((r) => r.method === 'POST').length, 1);
  const completedIntent = await ref.get(),
    completedJournal = await journalRef.get(),
    completedOp = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + uploadRequest.operationId)
      .get();
  assert.ok(completedIntent.createTime.isEqual(rows.docs[0].createTime));
  assert.ok(completedIntent.updateTime.isEqual(completedOp.createTime));
  assert.ok(completedJournal.updateTime.isEqual(completedOp.createTime));
  const at = wire.requests.length;
  assert.equal(
    (await api.advanceAdventureRestoreImageStorage(uid, uploadRequest)).receipt.operationId,
    uploadRequest.operationId,
  );
  assert.equal(wire.requests.length, at);
  const own = env.authenticatedContext(uid).firestore();
  await assertFails(getDoc(doc(own, ref.path)));
  await assertFails(getDoc(doc(own, 'adventures/' + reserved.adventureId)));
  assert.equal((await admin.collection('users/' + uid + '/imageLibrary').get()).empty, true);
  let p = (await api.advanceAdventureRestoreImageStorage(uid, storageRequest(prepared))).progress;
  assert.equal(p.staging.phase, 'image-storage-ready');
  p = (await api.cancelAdventureRestore(uid, mutation(p, 'sdk-storage-cancel-0001'))).progress;
  p = (
    await api.advanceAdventureRestoreCleanup(
      uid,
      mutation(p, 'sdk-storage-revoke-0001', { limit: 50 }),
    )
  ).progress;
  assert.equal(p.staging.personaLibraryRevoked, true);
  assert.equal(p.staging.storageFenced, 0);
  const chunksBefore = (await admin.collection(jobPath + '/chunks').get()).size,
    fence = assets.fence,
    fenceRequest = mutation(p, 'sdk-storage-fence-0001', { limit: 50 });
  let once = true;
  assets.fence = async (...args) => {
    const result = await fence(...args);
    if (once) {
      once = false;
      throw Error('SDK lost fence ACK');
    }
    return result;
  };
  await assert.rejects(
    () => api.advanceAdventureRestoreCleanup(uid, fenceRequest),
    /SDK lost fence ACK/,
  );
  assert.equal((await admin.doc(jobPath).get()).data().staging.storageFenced, 0);
  assert.equal((await admin.collection(jobPath + '/chunks').get()).size, chunksBefore);
  const marker = wire.current.get(path).generation;
  p = (await api.advanceAdventureRestoreCleanup(uid, fenceRequest)).progress;
  assert.equal(p.staging.storageFenced, 1);
  assert.equal(p.cleanupPhase, 'chunks');
  assert.equal(wire.current.get(path).generation, marker);
  assert.equal(wire.current.get(path).bytes.length, 0);
  assert.equal(wire.versions.get(path).size, 1);
  const fencedIntent = await ref.get(),
    fencedJournal = await journalRef.get(),
    fenceOp = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + fenceRequest.operationId)
      .get();
  assert.ok(fencedIntent.updateTime.isEqual(fenceOp.createTime));
  assert.ok(fencedJournal.updateTime.isEqual(fenceOp.createTime));
  assert.equal((await admin.collection(jobPath + '/chunks').get()).size, chunksBefore);
  for (let n = 0; p.state !== 'cancelled'; n++) {
    assert.ok(n < 1000);
    p = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(p, 'sdk-storage-clean-' + String(n).padStart(6, '0'), { limit: 50 }),
      )
    ).progress;
  }
  assert.equal(p.staging.cleanedArtifacts, p.staging.artifactCount);
  assert.equal((await admin.collection(jobPath + '/preparedRoot').get()).empty, true);
  assert.equal((await admin.collection(jobPath + '/stagingArtifacts').get()).empty, true);
  assert.equal(wire.current.get(path).generation, marker);
  assert.equal(wire.current.get(path).bytes.length, 0);
});
