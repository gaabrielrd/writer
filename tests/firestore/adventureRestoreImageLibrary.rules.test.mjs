import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { createImageLibraryService } from '../../functions/src/imageLibrary.mjs';
import { adventureStageArtifactId } from '../../functions/src/adventureRestoreArtifacts.mjs';
import {
  prepareAdventureImages,
  finishImages,
  imageAdventureArchive,
} from '../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import {
  createAdventureStoragePNG,
  finishImageStorage,
} from '../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import { finishCounts } from '../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import {
  finishAudit,
  auditStep,
} from '../../functions/test/helpers/adventureRestoreAuditFixture.mjs';
import {
  libraryRequest,
  finishImageLibrary,
} from '../../functions/test/helpers/adventureRestoreImageLibraryFixture.mjs';
import { cleanup, uid, id } from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { bookRestoreStorageWire } from '../../functions/test/helpers/bookRestoreStorageWire.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-image-library',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? '')) throw Error('Dedicated loopback demo only');
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
test('real SDK installs a private image/use in one birth, preserves historical audit replay and cleans its exact native copy', async (t) => {
  const wire = await bookRestoreStorageWire(t),
    assets = wire.api,
    api = createAdventureRestoreTransferService({ db: admin, assets }),
    f = { api, uid },
    png = await createAdventureStoragePNG();
  let p = await prepareAdventureImages(api, uid, await imageAdventureArchive({ image: png }));
  p = await finishImages(f, p);
  p = await finishImageStorage(f, p);
  p = await finishCounts(f, p);
  p = await finishAudit(f, p);
  const request = libraryRequest(p),
    before = (await admin.doc(jobPath).get()).data(),
    failingDb = {
      doc: admin.doc.bind(admin),
      collection: admin.collection.bind(admin),
      runTransaction: (cb) =>
        admin.runTransaction((tx) =>
          cb({
            get: tx.get.bind(tx),
            getAll: tx.getAll.bind(tx),
            update: tx.update.bind(tx),
            set: tx.set.bind(tx),
            delete: tx.delete.bind(tx),
            create(ref, value) {
              if (
                ref.path ===
                'users/' + uid + '/adventureRestoreOperations/' + request.operationId
              )
                throw Error('SDK library receipt rollback');
              return tx.create(ref, value);
            },
          }),
        ),
    };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({ db: failingDb }).advanceAdventureRestoreImageLibrary(
        uid,
        request,
      ),
    /SDK library receipt rollback/,
  );
  assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
  assert.equal((await admin.collection('users/' + uid + '/imageLibrary').get()).empty, true);
  const [first, same] = await Promise.all([
    api.advanceAdventureRestoreImageLibrary(uid, request),
    api.advanceAdventureRestoreImageLibrary(uid, request),
  ]);
  assert.deepEqual(first, same);
  p = first.progress;
  const images = await admin.collection('users/' + uid + '/imageLibrary').get();
  assert.equal(images.size, 1);
  const image = images.docs[0],
    uses = await image.ref.collection('uses').get(),
    op = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + request.operationId)
      .get(),
    address = { scope: 'image', path: ['imageLibrary', image.id] },
    journal = await admin
      .doc(jobPath + '/stagingArtifacts/' + adventureStageArtifactId(address))
      .get();
  assert.equal(uses.size, 1);
  assert.ok(image.createTime.isEqual(uses.docs[0].createTime));
  assert.ok(image.createTime.isEqual(journal.createTime));
  assert.ok(image.createTime.isEqual(op.createTime));
  assert.equal(image.data().state, 'preparing');
  assert.equal(image.data().url, null);
  assert.equal(image.data().useCount, 1);
  assert.deepEqual(image.data().restoreOrigin.target, { kind: 'adventure', id: p.adventureId });
  assert.equal(image.data().restoreOrigin.bookId, undefined);
  assert.equal(uses.docs[0].data().adventureId, p.adventureId);
  const library = createImageLibraryService({ db: admin, assets });
  await admin.doc('users/' + uid + '/imageLibraryMigration/current').set({ complete: true });
  assert.deepEqual((await library.list(uid, {})).images, []);
  const io = wire.requests.length;
  await assert.rejects(() => library.remove(uid, { id: image.id }));
  await assert.rejects(() => library.rename(uid, { id: image.id, name: 'not yet' }));
  assert.equal(wire.requests.length, io);
  const own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other-user').firestore();
  assert.equal((await getDoc(doc(own, image.ref.path))).data().url, null);
  await assertFails(getDoc(doc(other, image.ref.path)));
  await assertFails(setDoc(doc(own, image.ref.path), { state: 'active' }));
  await assertFails(getDoc(doc(own, uses.docs[0].ref.path)));
  await assertFails(getDoc(doc(own, 'adventures/' + p.adventureId)));
  const installed = await finishImageLibrary(f, p),
    source = (await admin.doc(jobPath).get()).data().staging.librarySourceAudit;
  assert.equal(installed.staging.auditJournals, undefined);
  p = await auditStep(f, installed);
  const replay = await api.advanceAdventureRestoreAudit(uid, {
    restoreId: p.restoreId,
    jobToken: p.jobToken,
    operationId: source.operationId,
    expectedCheckpoint: source.checkpoint - 1,
  });
  assert.equal(replay.receipt.operationId, source.operationId);
  p = await finishAudit(f, p);
  assert.equal(p.staging.auditJournals, installed.staging.artifactCount);
  assert.equal(p.staging.auditPhysical, installed.staging.artifactCount);
  assert.equal(p.staging.auditMedia, 1);
  assert.equal((await image.ref.get()).data().state, 'preparing');
  const cancelled = await cleanup(f, p, 50);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal((await admin.collection('users/' + uid + '/imageLibrary').get()).empty, true);
  assert.equal((await image.ref.collection('uses').get()).empty, true);
  assert.equal((await admin.doc('adventures/' + p.adventureId).get()).data().ownerId, undefined);
  for (const path of wire.current.keys()) {
    assert.equal(wire.current.get(path).bytes.length, 0);
    assert.equal(wire.versions.get(path).size, 1);
  }
});
