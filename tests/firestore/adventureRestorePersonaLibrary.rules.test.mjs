import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import {
  readAvailablePersonaMetadata,
  readPersonaRestoreBatchProof,
} from '../../functions/src/personaAvailability.mjs';
import {
  preparePersonaLibrary,
  libraryRequest,
} from '../../functions/test/helpers/adventureRestorePersonaLibraryFixture.mjs';
import {
  uid,
  id,
  mutation,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-persona-installer',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin, api;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Only local demo emulator');
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
  api = createAdventureRestoreTransferService({ db: admin });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const origin = (p) => ({
  schemaVersion: 2,
  target: { kind: 'adventure', id: p.adventureId },
  restoreId: id,
  jobToken: p.jobToken,
});
const batchRef = (p) => admin.doc('users/' + uid + '/aiPersonaRestoreBatches/' + p.adventureId);
const profiles = (p) =>
  admin
    .collection('users/' + uid + '/aiPersonas')
    .where('restoreOrigin.target.id', '==', p.adventureId);
async function step(p) {
  return (await api.advanceAdventureRestorePersonaLibrary(uid, libraryRequest(p))).progress;
}
async function finish(p) {
  for (let n = 0; p.staging.phase !== 'persona-library-ready'; n++) {
    assert.ok(n < 1000);
    p = await step(p);
  }
  return p;
}
async function cancel(p) {
  return (await api.cancelAdventureRestore(uid, mutation(p, 'sdk-persona-cancel-0001'))).progress;
}
async function clean(p) {
  for (let n = 0; p.state === 'cancelling'; n++) {
    assert.ok(n < 1000);
    p = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(p, 'sdk-persona-clean-' + String(n).padStart(6, '0'), { limit: 50 }),
      )
    ).progress;
  }
  return p;
}
test('SDK actual installer creates exact profiles/batch/receipt atomically and revokes before complete cleanup', async () => {
  const p = await preparePersonaLibrary(api, uid, {
      distinctSceneProfile: true,
      profilePatch: { archived: true, revision: 17 },
    }),
    definitions = await admin
      .collection(jobPath + '/preparedRoot')
      .where('kind', '==', 'adventure-restore-persona')
      .get(),
    manual = admin.doc('users/' + uid + '/aiPersonas/custom-preserve-manual');
  await manual.create({ kept: true });
  const failingDb = {
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
            if (ref.path === jobPath) throw Error('SDK installer rollback');
            return tx.update(ref, value);
          },
        }),
      ),
  };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({
        db: failingDb,
      }).advanceAdventureRestorePersonaLibrary(uid, libraryRequest(p)),
    /SDK installer rollback/,
  );
  assert.equal((await batchRef(p).get()).exists, false);
  assert.equal((await profiles(p).get()).size, 0);
  const [a, b] = await Promise.all([
    api.advanceAdventureRestorePersonaLibrary(uid, libraryRequest(p)),
    api.advanceAdventureRestorePersonaLibrary(uid, libraryRequest(p)),
  ]);
  assert.deepEqual(a, b);
  assert.equal((await profiles(p).get()).size, 1);
  assert.equal(a.progress.staging.personaLibraryInstalled, 1);
  const end = await finish(a.progress),
    rows = await profiles(p).get();
  assert.equal(rows.size, 2);
  assert.equal(end.staging.personaLibraryInstalled, 2);
  for (const row of rows.docs) {
    const expected = definitions.docs.map((d) => d.data().profile).find((v) => v.id === row.id);
    assert.deepEqual(row.data(), { ...expected, restoreOrigin: origin(p) });
    const journal = (
        await admin
          .collection(jobPath + '/stagingArtifacts')
          .where('address.scope', '==', 'persona')
          .get()
      ).docs.find((d) => d.data().address.path[1] === row.id),
      op = await admin
        .doc('users/' + uid + '/adventureRestoreOperations/' + journal.data().createdByOperationId)
        .get();
    assert.ok(row.createTime.isEqual(op.createTime));
    assert.ok(journal.createTime.isEqual(op.createTime));
    assert.equal(
      await admin.runTransaction((tx) => readAvailablePersonaMetadata(tx, admin, uid, row.id)),
      null,
    );
  }
  assert.ok(
    await admin.runTransaction((tx) =>
      readPersonaRestoreBatchProof(tx, admin, uid, origin(p), 'preparing'),
    ),
  );
  const own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other').firestore(),
    anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(own, rows.docs[0].ref.path)));
  await assertFails(
    updateDoc(doc(own, rows.docs[0].ref.path), { revision: 18, name: 'Blocked preparing' }),
  );
  await assertFails(getDoc(doc(other, rows.docs[0].ref.path)));
  await assertFails(getDoc(doc(anon, rows.docs[0].ref.path)));
  await assertFails(getDoc(doc(own, 'adventures/' + p.adventureId)));
  const cancelling = await cancel(end),
    revoked = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(cancelling, 'sdk-persona-first-revoke', { limit: 1 }),
      )
    ).progress;
  assert.equal(revoked.cleanupPhase, cancelling.cleanupPhase);
  assert.equal(revoked.staging.personaLibraryRevoked, true);
  for (const row of rows.docs) assert.ok((await row.ref.get()).updateTime.isEqual(row.updateTime));
  assert.ok(
    await admin.runTransaction((tx) =>
      readPersonaRestoreBatchProof(tx, admin, uid, origin(p), 'cancelled'),
    ),
  );
  const cancelled = await clean(revoked);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal((await profiles(p).get()).size, 0);
  assert.equal((await batchRef(p).get()).data().state, 'cancelled');
  assert.equal((await manual.get()).data().kept, true);
  assert.equal((await admin.collection(jobPath + '/preparedRoot').get()).empty, true);
  assert.equal((await admin.collection(jobPath + '/stagingArtifacts').get()).empty, true);
  assert.equal(
    (await admin.doc('adventures/' + p.adventureId).get()).data().kind,
    'adventure-restore-retired',
  );
});
test('SDK recreated global profile is preserved and cleanup refuses to certify the foreign incarnation', async () => {
  const p = await preparePersonaLibrary(api, uid),
    first = await step(p),
    row = (await profiles(p).get()).docs[0],
    data = row.data();
  await row.ref.delete();
  await row.ref.create(data);
  const recreated = await row.ref.get();
  assert.equal(recreated.createTime.isEqual(row.createTime), false);
  const cancelling = await cancel(first);
  await assert.rejects(() => clean(cancelling));
  assert.deepEqual((await row.ref.get()).data(), data);
  assert.ok((await row.ref.get()).createTime.isEqual(recreated.createTime));
  assert.equal((await batchRef(p).get()).data().state, 'cancelled');
  assert.equal((await admin.doc(jobPath).get()).data().state, 'cancelling');
});
