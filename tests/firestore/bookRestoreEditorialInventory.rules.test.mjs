import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { prepareBookRestoreArtifacts } from '../../functions/src/bookRestoreArtifacts.mjs';
import { prepareBookRestoreEditorialCleanup } from '../../functions/src/bookRestoreEditorialCleanup.mjs';
import { bookRestoreEditorialAddress } from '../../functions/src/bookRestoreEditorialInventory.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-restore-editorial-inventory',
  cid = 'c'.repeat(64),
  token = 'a'.repeat(64);
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use somente o emulador demo local.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(() => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
// Native helper proofs only. This fixture does not bypass or certify a v2 admission/activation journey.
async function staged(extra = []) {
  const loaded = {
    ref: admin.doc('users/author/bookRestores/editorial-native-0001'),
    view: { jobToken: token },
    job: {
      ownerId: 'author',
      restoreId: 'editorial-native-0001',
      bookId: 'editorial-copy',
      cleanupVersion: 15,
      checkpoint: 20,
      state: 'content-verified',
      cleanupPhase: 'done',
      preparation: { schemaVersion: 13, artifactCount: 4 + extra.length, cleanedArtifacts: 0 },
    },
  };
  const writes = [
    { kind: 'editorial-record', id: cid, value: { bodyId: cid } },
    { kind: 'editorial-body', id: cid, value: { byteLength: 10 } },
    {
      kind: 'editorial-part',
      id: cid + ':000000000000000',
      value: { privateBody: 'PRIVATE_NATIVE_ARCHIVE' },
    },
    { kind: 'editorial-control', id: 'current', value: { phase: 'preparing' } },
    ...extra,
  ];
  await admin.runTransaction(async (tx) => {
    const artifacts = await prepareBookRestoreArtifacts(
      tx,
      admin,
      loaded,
      'editorial-native-write-0001',
      writes,
    );
    artifacts.commit();
    tx.create(admin.doc('users/author/bookRestoreOperations/editorial-native-write-0001'), {
      ownerId: 'author',
      restoreId: loaded.job.restoreId,
      jobToken: token,
      receipt: {
        action: extra.length ? 'advanceBookRestoreEditorialHeads' : 'advanceBookRestoreEditorial',
        operationId: 'editorial-native-write-0001',
        checkpoint: 1,
      },
    });
  });
  loaded.job.state = 'cancelling';
  loaded.job.cleanupPhase = 'editorial';
  async function cleanup(rollback = false) {
    const patch = await admin.runTransaction(async (tx) => {
      const prepared = await prepareBookRestoreEditorialCleanup(tx, admin, loaded, 1);
      for (const ref of prepared.remove) tx.delete(ref);
      if (rollback) throw new Error('rollback native cleanup');
      return prepared.patch;
    });
    loaded.job = { ...loaded.job, ...patch };
  }
  return { loaded, writes, cleanup };
}
test('native v15 artifacts share original receipt birth, remain SDK-private and clean parts before headers without creating a book', async () => {
  const f = await staged(),
    write = f.writes[2],
    partRef = admin.doc(bookRestoreEditorialAddress(f.loaded, write.kind, write.id)),
    journalRef = admin.doc(
      f.loaded.ref.path + '/materializationArtifacts/' + digest([write.kind, write.id]),
    );
  const [part, journal, receipt] = await admin.getAll(
    partRef,
    journalRef,
    admin.doc('users/author/bookRestoreOperations/editorial-native-write-0001'),
  );
  assert.ok(part.createTime.isEqual(journal.createTime));
  assert.ok(part.createTime.isEqual(receipt.createTime));
  assert.equal((await admin.doc('books/editorial-copy').get()).exists, false);
  for (const actor of ['author', 'other']) {
    const sdk = environment.authenticatedContext(actor).firestore();
    for (const item of f.writes) {
      const path = bookRestoreEditorialAddress(f.loaded, item.kind, item.id);
      await assertFails(getDoc(doc(sdk, path)));
      await assertFails(setDoc(doc(sdk, path), { injected: true }));
    }
  }
  await f.cleanup();
  assert.equal((await partRef.get()).exists, false);
  assert.equal(
    (await admin.doc(bookRestoreEditorialAddress(f.loaded, 'editorial-record', cid)).get()).exists,
    true,
  );
  for (let unit = 0; unit < 4; unit++) await f.cleanup();
  assert.equal(f.loaded.job.cleanupPhase, 'resource-children');
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 4);
  assert.equal((await admin.doc('books/editorial-copy').get()).exists, false);
});
test('real transaction rollback and same-ID recreation preserve every uncertain editorial header and body', async () => {
  const f = await staged(),
    write = f.writes[2],
    partRef = admin.doc(bookRestoreEditorialAddress(f.loaded, write.kind, write.id));
  await assert.rejects(f.cleanup(true), /rollback native cleanup/);
  assert.equal((await partRef.get()).exists, true);
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 0);
  const value = (await partRef.get()).data();
  await partRef.delete();
  await partRef.create(value);
  await assert.rejects(f.cleanup());
  assert.deepEqual((await partRef.get()).data(), value);
  assert.equal(
    (await admin.doc(bookRestoreEditorialAddress(f.loaded, 'editorial-record', cid)).get()).exists,
    true,
  );
  assert.equal(
    (await admin.doc(bookRestoreEditorialAddress(f.loaded, 'editorial-body', cid)).get()).exists,
    true,
  );
});

test('native editable heads, versions and review metadata remain SDK-private and join the protected cleanup inventory', async () => {
  const plan = 'restore-' + cid;
  const extra = [
    { kind: 'editorial-contract', id: 'current', value: { privateContract: true } },
    { kind: 'editorial-contract-version', id: '1', value: { privateContract: true } },
    { kind: 'editorial-plan', id: plan, value: { privatePlan: true } },
    { kind: 'editorial-plan-version', id: cid, value: { privatePlan: true } },
    { kind: 'editorial-review', id: plan, value: { review: 'required', execution: 'disabled' } },
  ];
  const f = await staged(extra);
  for (const actor of ['author', 'other']) {
    const sdk = environment.authenticatedContext(actor).firestore();
    for (const item of extra) {
      const path = bookRestoreEditorialAddress(f.loaded, item.kind, item.id);
      await assertFails(getDoc(doc(sdk, path)));
      await assertFails(setDoc(doc(sdk, path), { injected: true }));
    }
  }
  for (let unit = 0; f.loaded.job.cleanupPhase === 'editorial' && unit < 20; unit++)
    await f.cleanup();
  assert.equal(f.loaded.job.cleanupPhase, 'resource-children');
  assert.equal(f.loaded.job.preparation.cleanedArtifacts, 9);
  for (const item of extra)
    assert.equal(
      (await admin.doc(bookRestoreEditorialAddress(f.loaded, item.kind, item.id)).get()).exists,
      false,
    );
  assert.equal((await admin.doc('books/editorial-copy').get()).exists, false);
});
