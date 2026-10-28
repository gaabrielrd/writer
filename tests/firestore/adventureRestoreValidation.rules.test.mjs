import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, where, limit } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { emptyAdventureArchive } from '../../functions/test/helpers/adventureRestoreArchiveFixture.mjs';
import {
  uid,
  id,
  request,
  mutation,
  chunkRequest,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-validation',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin, api;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator');
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
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const req = (p) => mutation(p, 'sdk-validation-' + String(p.checkpoint).padStart(8, '0'));
async function ready(invalidRoot = false) {
  const bytes = await emptyAdventureArchive({ invalidRoot });
  let p = (await api.startAdventureRestore(uid, request(bytes))).progress;
  for (let at = 0; at < Math.ceil(bytes.length / 65536); at++)
    p = (await api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, at))).progress;
  return (
    await api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'sdk-initial-integrity-0001', { limit: 16 }),
    )
  ).progress;
}
async function step(p) {
  return (
    await createAdventureRestoreTransferService({ db: admin }).advanceAdventureRestoreValidation(
      uid,
      req(p),
    )
  ).progress;
}
async function finish(p) {
  let n = 0;
  while (['bytes-verified', 'validating'].includes(p.state)) {
    assert.ok(++n < 100);
    p = await step(p);
  }
  return p;
}
async function clean(p) {
  p = (await api.cancelAdventureRestore(uid, mutation(p, 'sdk-validation-cancel-0001'))).progress;
  let n = 0;
  while (p.state === 'cancelling') {
    assert.ok(++n < 100);
    p = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(p, 'sdk-validation-clean-' + String(n).padStart(8, '0'), { limit: 50 }),
      )
    ).progress;
  }
  return p;
}
test('SDK semantic completion preserves native state birth, private namespaces, and complete cancellation cleanup', async () => {
  let p = await ready();
  p = await step(p);
  const first = await admin.doc(jobPath + '/validationState/current').get();
  p = await finish(p);
  assert.equal(p.state, 'content-verified');
  const last = await admin.doc(jobPath + '/validationState/current').get();
  assert.ok(first.createTime.isEqual(last.createTime));
  assert.ok(!first.updateTime.isEqual(last.updateTime));
  assert.equal(p.validation.summary.sourceAdventureId, 'original-empty-adventure-0001');
  assert.ok(!JSON.stringify(p).includes('PRIVATE_EMPTY_TITLE'));
  for (const context of [
    env.authenticatedContext(uid),
    env.authenticatedContext('stranger'),
    env.unauthenticatedContext(),
  ]) {
    const db = context.firestore();
    for (const name of ['validationState', 'validationIndex', 'validationItems']) {
      const sample = (
        await admin
          .collection(jobPath + '/' + name)
          .limit(1)
          .get()
      ).docs[0];
      assert.ok(sample);
      await assertFails(getDoc(doc(db, sample.ref.path)));
      await assertFails(getDocs(collection(db, jobPath + '/' + name)));
      await assertFails(setDoc(doc(db, jobPath + '/' + name + '/forged'), { ownerId: uid }));
    }
  }
  const authorDb = env.authenticatedContext(uid).firestore();
  await assertFails(
    getDocs(query(collection(authorDb, 'adventures'), where('ownerId', '==', uid), limit(50))),
  );
  assert.equal((await clean(p)).state, 'cancelled');
  for (const name of [
    'chunks',
    'integrityProofs',
    'integrityStates',
    'validationIndex',
    'validationItems',
    'validationState',
  ])
    assert.equal(
      (
        await admin
          .collection(jobPath + '/' + name)
          .limit(1)
          .get()
      ).docs.length,
      0,
    );
  assert.equal(
    (await admin.doc('adventures/' + p.adventureId).get()).data().kind,
    'adventure-restore-retired',
  );
});
test('SDK concurrent same operation retries once and competing operation cannot reuse a checkpoint', async () => {
  const p = await ready(),
    input = req(p),
    results = await Promise.all([
      api.advanceAdventureRestoreValidation(uid, input),
      api.advanceAdventureRestoreValidation(uid, input),
    ]);
  assert.deepEqual(results[0], results[1]);
  const next = results[0].progress,
    race = await Promise.allSettled([
      api.advanceAdventureRestoreValidation(uid, req(next)),
      api.advanceAdventureRestoreValidation(uid, {
        ...req(next),
        operationId: 'sdk-validation-competitor-0001',
      }),
    ]);
  assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
  const replay = await api.advanceAdventureRestoreValidation(uid, input);
  assert.equal(replay.receipt.checkpoint, p.checkpoint + 1);
  assert.equal(replay.progress.checkpoint, p.checkpoint + 2);
});
test('SDK replaced current snapshot and modified index are not adopted by resume or cleanup', async () => {
  let p = await ready();
  p = await step(p);
  const state = admin.doc(jobPath + '/validationState/current'),
    original = (await state.get()).data();
  await state.delete();
  await state.set(original);
  await assert.rejects(() => step(p), { code: 'failed-precondition' });
  await env.clearFirestore();
  p = await ready();
  while (!(await admin.doc(jobPath).get()).data().validation?.indexEntries) p = await step(p);
  const entry = (
    await admin
      .collection(jobPath + '/validationIndex')
      .limit(1)
      .get()
  ).docs[0];
  await entry.ref.update({ valueJSON: '{}' });
  await assert.rejects(() => clean(p), { code: 'failed-precondition' });
});
test('SDK failed final transaction leaves no receipt or snapshot and exact retry recovers', async () => {
  const p = await ready(),
    db = {
      doc: admin.doc.bind(admin),
      collection: admin.collection.bind(admin),
      runTransaction: (cb) =>
        admin.runTransaction((tx) =>
          cb({
            get: tx.get.bind(tx),
            getAll: tx.getAll.bind(tx),
            create: tx.create.bind(tx),
            update(ref, value) {
              if (ref.path === jobPath) throw Error('sdk commit unavailable');
              return tx.update(ref, value);
            },
          }),
        ),
    };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({ db }).advanceAdventureRestoreValidation(uid, req(p)),
    /sdk commit unavailable/,
  );
  assert.equal((await admin.doc(jobPath + '/validationState/current').get()).exists, false);
  assert.equal(
    (await admin.doc('users/' + uid + '/adventureRestoreOperations/' + req(p).operationId).get())
      .exists,
    false,
  );
  assert.equal((await step(p)).state, 'validating');
});
test('SDK valid framing with invalid semantic root rejects without buffered effects or public content', async () => {
  const p = await finish(await ready(true));
  assert.equal(p.state, 'content-rejected');
  assert.equal(p.validation.failure, 'adventure-backup-invalid-content');
  assert.equal(
    (
      await admin
        .collection(jobPath + '/validationIndex')
        .limit(1)
        .get()
    ).docs.length,
    0,
  );
  assert.equal((await clean(p)).state, 'cancelled');
});
