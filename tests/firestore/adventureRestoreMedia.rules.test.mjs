import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { createImageLibraryService } from '../../functions/src/imageLibrary.mjs';
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
import { finishAudit } from '../../functions/test/helpers/adventureRestoreAuditFixture.mjs';
import { finishImageLibrary } from '../../functions/test/helpers/adventureRestoreImageLibraryFixture.mjs';
import { activationRequest } from '../../functions/test/helpers/adventureRestoreActivationFixture.mjs';
import {
  mediaRequest,
  finishMedia,
} from '../../functions/test/helpers/adventureRestoreMediaFixture.mjs';
import { uid, id } from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { bookRestoreStorageWire } from '../../functions/test/helpers/bookRestoreStorageWire.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-media',
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
test('real Firestore and Storage wire finalize a native image atomically without rewriting its adventure or resurrecting a removed copy', async (t) => {
  const wire = await bookRestoreStorageWire(t),
    assets = wire.api,
    api = createAdventureRestoreTransferService({ db: admin, assets }),
    f = { api, uid };
  let p = await prepareAdventureImages(
    api,
    uid,
    await imageAdventureArchive({ image: await createAdventureStoragePNG() }),
  );
  p = await finishCounts(f, await finishImageStorage(f, await finishImages(f, p)));
  p = await finishAudit(f, await finishImageLibrary(f, await finishAudit(f, p)));
  p = (await api.activateAdventureRestore(uid, (await activationRequest(f, p)).request)).progress;
  const job = await admin.doc(jobPath).get(),
    root = await admin.doc('adventures/' + p.adventureId).get(),
    image = (await admin.collection('users/' + uid + '/imageLibrary').get()).docs[0],
    usage = (await image.ref.collection('uses').get()).docs[0].data(),
    blocks = createAdventureBlocksService({ db: admin }),
    media = (
      await api.getAdventureRestoreMediaState(uid, { restoreId: p.restoreId, jobToken: p.jobToken })
    ).media,
    request = mediaRequest(p, media),
    own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other-user').firestore();
  await assert.rejects(() =>
    blocks.getAdventureBlockImage(uid, { adventureId: p.adventureId, resource: usage.resource }),
  );
  const failing = {
    doc: admin.doc.bind(admin),
    collection: admin.collection.bind(admin),
    runTransaction: (cb) =>
      admin.runTransaction((tx) =>
        cb({
          get: tx.get.bind(tx),
          getAll: tx.getAll.bind(tx),
          set: tx.set.bind(tx),
          update: tx.update.bind(tx),
          delete: tx.delete.bind(tx),
          create(ref, value) {
            if (ref.path.includes('/adventureRestoreMediaOperations/'))
              throw Error('SDK media rollback');
            return tx.create(ref, value);
          },
        }),
      ),
  };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({ db: failing, assets }).advanceAdventureRestoreMedia(
        uid,
        request,
      ),
    /SDK media rollback/,
  );
  assert.equal((await image.ref.get()).data().state, 'preparing');
  assert.equal((await admin.doc(jobPath + '/activationMedia/current').get()).exists, false);
  const [done, same] = await Promise.all([
    api.advanceAdventureRestoreMedia(uid, request),
    api.advanceAdventureRestoreMedia(uid, request),
  ]);
  assert.deepEqual(done, same);
  const active = await image.ref.get(),
    control = await admin.doc(jobPath + '/activationMedia/current').get(),
    outcome = (await admin.collection(jobPath + '/activationMediaItems').get()).docs[0],
    op = await admin
      .doc('users/' + uid + '/adventureRestoreMediaOperations/' + request.operationId)
      .get();
  assert.equal(active.data().state, 'active');
  assert.ok(active.createTime.isEqual(image.createTime));
  assert.ok(active.updateTime.isEqual(control.createTime));
  assert.ok(active.updateTime.isEqual(outcome.createTime));
  assert.ok(active.updateTime.isEqual(op.createTime));
  assert.equal(wire.requests.filter((r) => r.method === 'PATCH').length, 1);
  assert.ok(
    (
      await blocks.getAdventureBlockImage(uid, {
        adventureId: p.adventureId,
        resource: usage.resource,
      })
    ).image,
  );
  assert.deepEqual((await admin.doc(jobPath).get()).data(), job.data());
  assert.ok((await admin.doc(jobPath).get()).updateTime.isEqual(job.updateTime));
  assert.deepEqual((await root.ref.get()).data(), root.data());
  await assertFails(getDoc(doc(other, image.ref.path)));
  await assertFails(getDoc(doc(own, control.ref.path)));
  await assertFails(setDoc(doc(own, op.ref.path), { checkpoint: 10 }));
  const current = await blocks.getAdventureBlockImage(uid, {
    adventureId: p.adventureId,
    resource: usage.resource,
  });
  await blocks.setAdventureBlockImage(uid, {
    adventureId: p.adventureId,
    resource: usage.resource,
    operationId: 'sdk-media-detach-0001',
    expectedRevision: current.revision,
    image: null,
  });
  await createImageLibraryService({
    db: admin,
    assets: { retireRestoreImage: assets.retire },
  }).remove(uid, { id: image.id });
  const io = wire.requests.length;
  assert.deepEqual(await api.advanceAdventureRestoreMedia(uid, request), done);
  assert.equal(wire.requests.length, io);
  assert.equal((await image.ref.get()).data().state, 'deleted');
  const complete = await finishMedia(f, p, done.media);
  assert.equal(complete.complete, true);
  assert.equal(complete.ready, 1);
  assert.equal(complete.checkpoint, 2);
  assert.equal((await root.ref.get()).data().id, p.adventureId);
});
