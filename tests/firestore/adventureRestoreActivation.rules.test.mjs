import { setPersonaWithCatalog } from './helpers/personaCatalog.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { readAvailablePersonaMetadata } from '../../functions/src/personaAvailability.mjs';
import {
  prepareAdventureImages,
  finishImages,
} from '../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import { profileAdventureArchive } from '../../functions/test/helpers/adventureRestoreProfileArchiveFixture.mjs';
import { finishImageStorage } from '../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import { finishCounts } from '../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import { finishAudit } from '../../functions/test/helpers/adventureRestoreAuditFixture.mjs';
import { finishImageLibrary } from '../../functions/test/helpers/adventureRestoreImageLibraryFixture.mjs';
import { activationRequest } from '../../functions/test/helpers/adventureRestoreActivationFixture.mjs';
import {
  uid,
  id,
  mutation,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-activation',
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
test('native activation releases adventure and personas atomically, preserves birth and confirms history after deletion', async () => {
  const api = createAdventureRestoreTransferService({ db: admin }),
    f = { api, uid };
  let p = await prepareAdventureImages(api, uid, await profileAdventureArchive());
  p = await finishImageStorage(f, await finishImages(f, p));
  p = await finishCounts(f, p);
  p = await finishAudit(f, await finishImageLibrary(f, await finishAudit(f, p)));
  const rootRef = admin.doc('adventures/' + p.adventureId),
    rootBefore = await rootRef.get(),
    controlRef = rootRef.collection('workProgress').doc('current'),
    batchRef = admin.doc('users/' + uid + '/aiPersonaRestoreBatches/' + p.adventureId),
    profiles = await admin.collection('users/' + uid + '/aiPersonas').get(),
    profile = profiles.docs[0],
    own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other-user').firestore();
  assert.ok(profile);
  await assertFails(getDoc(doc(own, rootRef.path)));
  // Existing Rules allow the owner to inspect pending metadata, but not use/edit it.
  await assertSucceeds(getDoc(doc(own, profile.ref.path)));
  await assertFails(
    setPersonaWithCatalog(own, doc(own, profile.ref.path), {
      ...profile.data(),
      revision: profile.data().revision + 1,
    }),
  );
  assert.equal(
    await admin.runTransaction((tx) =>
      readAvailablePersonaMetadata(tx, admin, uid, profile.id, ['revision']),
    ),
    null,
  );
  const { request } = await activationRequest(f, p),
    before = (await admin.doc(jobPath).get()).data();
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
            if (ref.path.endsWith('/' + request.operationId))
              throw Error('SDK activation rollback');
            return tx.create(ref, value);
          },
        }),
      ),
  };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({ db: failing }).activateAdventureRestore(uid, request),
    /SDK activation rollback/,
  );
  assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
  assert.equal((await rootRef.get()).data().ownerId, undefined);
  assert.equal((await controlRef.get()).data().countReady, false);
  assert.equal((await batchRef.get()).data().state, 'preparing');
  const [done, replay] = await Promise.all([
    api.activateAdventureRestore(uid, request),
    api.activateAdventureRestore(uid, request),
  ]);
  assert.deepEqual(done, replay);
  assert.equal(done.progress.state, 'activated');
  const root = await rootRef.get(),
    control = await controlRef.get(),
    batch = await batchRef.get(),
    receipt = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + request.operationId)
      .get();
  assert.ok(root.createTime.isEqual(rootBefore.createTime));
  for (const value of [root, control, batch])
    assert.ok(value.updateTime.isEqual(receipt.createTime));
  assert.equal(control.data().countReady, true);
  assert.equal(batch.data().state, 'active');
  await assertSucceeds(getDoc(doc(own, rootRef.path)));
  await assertSucceeds(getDoc(doc(own, profile.ref.path)));
  await assertSucceeds(
    setPersonaWithCatalog(own, doc(own, profile.ref.path), {
      ...profile.data(),
      revision: profile.data().revision + 1,
    }),
  );
  await assertFails(getDoc(doc(other, rootRef.path)));
  await assertFails(getDoc(doc(other, profile.ref.path)));
  await assertFails(setDoc(doc(own, jobPath), { state: 'activated' }));
  assert.ok(
    await admin.runTransaction((tx) =>
      readAvailablePersonaMetadata(tx, admin, uid, profile.id, ['revision']),
    ),
  );
  await rootRef.update({ title: 'Edited after activation' });
  await assert.rejects(() =>
    api.cancelAdventureRestore(uid, mutation(done.progress, 'sdk-cancel-active-0001')),
  );
  assert.deepEqual(await api.activateAdventureRestore(uid, request), done);
  await rootRef.delete();
  assert.deepEqual(await api.retireAdventureRestoreActivation(uid, request), done);
  assert.ok(
    await admin.runTransaction((tx) =>
      readAvailablePersonaMetadata(tx, admin, uid, profile.id, ['revision']),
    ),
  );
  await rootRef.create({ ownerId: 'other-user', title: 'Recreated root' });
  assert.deepEqual(await api.activateAdventureRestore(uid, request), done);
  await assertFails(getDoc(doc(own, rootRef.path)));
  assert.equal((await rootRef.get()).data().ownerId, 'other-user');
});
