import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { prepareBookRestoreUniverseLink } from '../../functions/src/bookRestoreUniverse.mjs';
import { born } from '../../functions/src/bookRestoreUploadContracts.mjs';
import {
  readyRestoreUniverse,
  loadUniversePlanItem,
  loadedRestore,
} from '../../functions/test/helpers/bookRestoreUniverseFixture.mjs';
import {
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-universe',
  uid = 'author',
  id = 'restore-universe-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
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
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function world() {
  const ref = admin.doc('universes/world');
  await ref.create({
    authorId: uid,
    name: 'GLOBAL NAME DO NOT COPY',
    description: 'GLOBAL BODY DO NOT COPY',
    updatedAt: 2,
    bookCount: 0,
  });
  await ref.collection('entities').doc('secret').create({ description: 'GLOBAL LORE DO NOT COPY' });
  return { ref, snapshot: await ref.get() };
}
test('SDK preserves world during preparation and composes strict link with synthetic root in one native commit', async () => {
  const source = await world(),
    origin = { kind: 'reference', id: 'world', created: born(source.snapshot) },
    initial = await readyRestoreUniverse(factory, uid, id, origin),
    request = mutation(id, initial, 'universe-sdk-advance01'),
    response = await api.advanceBookRestoreUniverse(uid, request),
    p = response.progress,
    staged = await admin.doc(root).get(),
    unchanged = await source.ref.get(),
    book = admin.doc('books/' + p.bookId),
    use = source.ref.collection('books').doc(p.bookId);
  assert.equal(p.preparation.schemaVersion, 6);
  assert.equal(p.preparation.phase, 'history');
  assert.equal(p.preparation.itemIndex, initial.preparation.itemIndex + 1);
  assert.equal(p.preparation.artifactCount, initial.preparation.artifactCount);
  assert.deepEqual(p.preparation.universe, {
    schemaVersion: 1,
    itemIndex: initial.preparation.itemIndex,
    origin,
    observed: 'available',
  });
  assert.equal(staged.data().cleanupVersion, 9);
  assert.equal(
    (await admin.doc('books/' + p.bookId + '/workProgress/current').get()).data().countReady,
    false,
  );
  assert.equal((await book.get()).exists, false);
  assert.equal((await use.get()).exists, false);
  assert.deepEqual(unchanged.data(), source.snapshot.data());
  assert.ok(unchanged.updateTime.isEqual(source.snapshot.updateTime));
  assert.equal(JSON.stringify(staged.data()).includes('GLOBAL'), false);
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    await assertFails(getDoc(doc(db, root)));
    await assertFails(
      setDoc(doc(db, root), { preparation: { universe: origin } }, { merge: true }),
    );
  }
  assert.deepEqual((await api.advanceBookRestoreUniverse(uid, request)).receipt, response.receipt);
  const item = await loadUniversePlanItem(api, uid, id, p),
    failure = new Error('Synthetic activation rollback');
  await assert.rejects(
    () =>
      admin.runTransaction(async (tx) => {
        const plan = await prepareBookRestoreUniverseLink(
          tx,
          admin,
          await loadedRestore(admin, tx, uid, id, p),
          item,
        );
        assert.equal(plan.universeId, 'world');
        plan.commit();
        tx.create(book, { authorId: uid, universeId: plan.universeId, title: 'Synthetic root' });
        throw failure;
      }),
    (error) => error === failure,
  );
  assert.equal((await book.get()).exists, false);
  assert.equal((await use.get()).exists, false);
  assert.ok((await source.ref.get()).updateTime.isEqual(source.snapshot.updateTime));
  await admin.runTransaction(async (tx) => {
    const plan = await prepareBookRestoreUniverseLink(
      tx,
      admin,
      await loadedRestore(admin, tx, uid, id, p),
      item,
    );
    plan.commit();
    // Synthetic harness only. Production activation and final certification remain pending.
    tx.create(book, { authorId: uid, universeId: plan.universeId, title: 'Synthetic root' });
  });
  const linked = await use.get(),
    current = await source.ref.get(),
    created = await book.get();
  assert.equal(current.data().bookCount, 1);
  assert.equal(current.data().description, source.snapshot.data().description);
  assert.deepEqual(linked.data(), { bookId: p.bookId });
  assert.equal(created.data().universeId, 'world');
  assert.ok(created.createTime.isEqual(linked.createTime));
  assert.ok(created.createTime.isEqual(current.updateTime));
  await assert.rejects(() =>
    api.cancelBookRestore(uid, mutation(id, p, 'universe-sdk-root-cancel')),
  );
  assert.equal((await admin.doc(root).get()).data().preparation.phase, 'history');
});
test('SDK rejects ABA after available observation and cleanup preserves recreated world and lore', async () => {
  const source = await world(),
    origin = { kind: 'reference', id: 'world', created: born(source.snapshot) },
    initial = await readyRestoreUniverse(factory, uid, id, origin),
    p = (await api.advanceBookRestoreUniverse(uid, mutation(id, initial, 'universe-sdk-prepare02')))
      .progress,
    item = await loadUniversePlanItem(api, uid, id, p);
  assert.equal(p.preparation.universe.observed, 'available');
  await source.ref.delete();
  await source.ref.create(source.snapshot.data());
  const recreated = await source.ref.get();
  assert.equal(recreated.createTime.isEqual(source.snapshot.createTime), false);
  await admin.runTransaction(async (tx) => {
    const plan = await prepareBookRestoreUniverseLink(
      tx,
      admin,
      await loadedRestore(admin, tx, uid, id, p),
      item,
    );
    assert.equal(plan.universeId, null);
    assert.equal(plan.observed, 'unavailable');
    plan.commit();
  });
  assert.ok((await source.ref.get()).updateTime.isEqual(recreated.updateTime));
  assert.equal((await source.ref.collection('books').get()).empty, true);
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  const terminal = await cleanupLegacyRestore(api, uid, id, p, { limit: 5 }),
    after = await source.ref.get();
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  assert.deepEqual(after.data(), recreated.data());
  assert.ok(after.updateTime.isEqual(recreated.updateTime));
  assert.deepEqual((await source.ref.collection('entities').doc('secret').get()).data(), {
    description: 'GLOBAL LORE DO NOT COPY',
  });
});
