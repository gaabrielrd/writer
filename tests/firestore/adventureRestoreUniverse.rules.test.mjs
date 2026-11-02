import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { createAdventureRestoreStore } from '../../functions/src/adventureRestoreStore.mjs';
import { prepareAdventureRestoreUniverseLink } from '../../functions/src/adventureRestoreUniverse.mjs';
import { createVerifiedAdventureRestoreContent } from '../../functions/src/adventureRestoreContentRead.mjs';
import { createUniverseService } from '../../functions/src/universes.mjs';
import { born } from '../../functions/src/adventureRestoreContracts.mjs';
import { prepareUniverseAdventure } from '../../functions/test/helpers/adventureRestoreUniverseFixture.mjs';
import {
  uid,
  id,
  mutation,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-universe',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin, api;
before(async () => {
  const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(hostPort ?? '')) throw Error('Only local demo emulator');
  const [host, port] = hostPort.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({
    projectId,
    host: hostPort,
    ssl: false,
    universeDomain: 'googleapis.com',
  });
  api = createAdventureRestoreTransferService({ db: admin });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function ready() {
  await createUniverseService({ db: admin }).createUniverse(uid, {
    creationId: 'world',
    name: 'GLOBAL_PRIVATE_NAME',
    description: 'GLOBAL_PRIVATE_TEXT',
  });
  await admin.doc('universes/world/lore/entity').create({ details: 'GLOBAL_PRIVATE_LORE' });
  const snapshot = await admin.doc('universes/world').get(),
    origin = { kind: 'reference', id: 'world', created: born(snapshot) };
  return { p: await prepareUniverseAdventure(api, uid, origin), origin, snapshot };
}
const req = (p) => mutation(p, 'sdk-universe-' + String(p.checkpoint).padStart(8, '0'));
async function context(p) {
  const store = createAdventureRestoreStore({ db: admin }),
    reader = await createVerifiedAdventureRestoreContent({
      db: admin,
      uid,
      restoreId: id,
      jobToken: p.jobToken,
    }),
    job = (await admin.doc(jobPath).get()).data(),
    item = await reader.readItem(job.staging.historyStartIndex);
  return { store, item };
}
async function clean(p) {
  p = (await api.cancelAdventureRestore(uid, mutation(p, 'sdk-universe-cancel-0001'))).progress;
  for (let n = 0; p.state === 'cancelling'; n++) {
    assert.ok(n < 1000);
    p = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(p, 'sdk-universe-clean-' + String(n).padStart(6, '0'), { limit: 50 }),
      )
    ).progress;
  }
  return p;
}
test('real original identity, private selection, concurrent replay, revocation and complete cleanup', async () => {
  const { p, origin, snapshot } = await ready(),
    request = req(p),
    [first, second] = await Promise.all([
      api.advanceAdventureRestoreUniverse(uid, request),
      api.advanceAdventureRestoreUniverse(uid, request),
    ]),
    end = first.progress;
  assert.deepEqual(first, second);
  assert.equal(end.staging.universeOutcome, 'available');
  assert.equal(end.staging.phase, 'universe-ready');
  assert.deepEqual(
    (await admin.doc(jobPath + '/preparedRoot/universe-candidate').get()).data().origin,
    origin,
  );
  assert.equal((await admin.doc('adventures/' + end.adventureId).get()).data().ownerId, undefined);
  const afterSelection = await admin.doc('universes/world').get();
  assert.ok(afterSelection.updateTime.isEqual(snapshot.updateTime));
  assert.equal((await admin.collection('universes/world/adventures').get()).size, 0);
  for (const client of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    for (const path of [
      'adventures/' + end.adventureId,
      jobPath + '/preparedRoot/universe-candidate',
    ])
      await assertFails(getDoc(doc(client.firestore(), path)));
  }
  const c = await context(end);
  await admin.doc('universes/world').update({ authorId: 'other' });
  const result = await admin.runTransaction(async (tx) => {
    const loaded = await c.store.load(tx, uid, id, end.jobToken),
      plan = await prepareAdventureRestoreUniverseLink(tx, c.store, loaded, c.item);
    plan.commit();
    return { observed: plan.observed, universeId: plan.universeId };
  });
  assert.deepEqual(result, { observed: 'unavailable', universeId: null });
  assert.deepEqual(
    (await api.advanceAdventureRestoreUniverse(uid, request)).receipt,
    first.receipt,
  );
  assert.equal((await admin.collection('universes/world/adventures').get()).size, 0);
  assert.equal((await clean(end)).state, 'cancelled');
  assert.equal(
    (await admin.doc('adventures/' + end.adventureId).get()).data().kind,
    'adventure-restore-retired',
  );
  assert.equal((await admin.collection(jobPath + '/preparedRoot').get()).empty, true);
  assert.equal((await admin.collection(jobPath + '/stagingArtifacts').get()).empty, true);
  assert.equal((await admin.doc('universes/world').get()).data().adventureCount, 0);
  assert.equal(
    (await admin.doc('universes/world/lore/entity').get()).data().details,
    'GLOBAL_PRIVATE_LORE',
  );
});
test('real strict link plan rolls back with root and rejects replacement universe identity', async () => {
  const { p } = await ready(),
    end = (await api.advanceAdventureRestoreUniverse(uid, req(p))).progress,
    c = await context(end),
    worldRef = admin.doc('universes/world'),
    rootRef = admin.doc('adventures/' + end.adventureId),
    beforeWorld = await worldRef.get(),
    beforeRoot = await rootRef.get(),
    abort = new Error('atomic rollback');
  await assert.rejects(
    () =>
      admin.runTransaction(async (tx) => {
        const loaded = await c.store.load(tx, uid, id, end.jobToken),
          plan = await prepareAdventureRestoreUniverseLink(tx, c.store, loaded, c.item);
        assert.equal(plan.universeId, 'world');
        plan.commit();
        tx.set(rootRef, { schemaVersion: 1, ownerId: uid, universeId: plan.universeId });
        throw abort;
      }),
    (e) => e === abort,
  );
  assert.ok((await worldRef.get()).updateTime.isEqual(beforeWorld.updateTime));
  assert.ok((await rootRef.get()).updateTime.isEqual(beforeRoot.updateTime));
  assert.equal((await admin.collection('universes/world/adventures').get()).size, 0);
  const data = beforeWorld.data();
  await worldRef.delete();
  await worldRef.create(data);
  assert.ok(!(await worldRef.get()).createTime.isEqual(beforeWorld.createTime));
  const result = await admin.runTransaction(async (tx) => {
    const loaded = await c.store.load(tx, uid, id, end.jobToken),
      plan = await prepareAdventureRestoreUniverseLink(tx, c.store, loaded, c.item);
    plan.commit();
    return plan.universeId;
  });
  assert.equal(result, null);
  assert.equal((await admin.collection('universes/world/adventures').get()).size, 0);
  assert.equal((await clean(end)).state, 'cancelled');
});

test('synthetic activation commits real root, strict universe use and counter together', async () => {
  const { p } = await ready(),
    end = (await api.advanceAdventureRestoreUniverse(uid, req(p))).progress,
    c = await context(end),
    rootRef = admin.doc('adventures/' + end.adventureId);
  await admin.runTransaction(async (tx) => {
    const loaded = await c.store.load(tx, uid, id, end.jobToken),
      plan = await prepareAdventureRestoreUniverseLink(tx, c.store, loaded, c.item);
    assert.equal(plan.universeId, 'world');
    plan.commit();
    // Synthetic harness only; production activation still requires all remaining audits.
    tx.set(rootRef, { schemaVersion: 1, ownerId: uid, universeId: plan.universeId });
  });
  assert.equal((await rootRef.get()).data().universeId, 'world');
  assert.equal((await admin.doc('universes/world').get()).data().adventureCount, 1);
  assert.deepEqual(
    (await admin.doc('universes/world/adventures/' + end.adventureId).get()).data(),
    { adventureId: end.adventureId },
  );
  assert.equal(
    (await admin.doc('universes/world/lore/entity').get()).data().details,
    'GLOBAL_PRIVATE_LORE',
  );
  await assert.rejects(() =>
    api.cancelAdventureRestore(uid, mutation(end, 'sdk-universe-active-cancel')),
  );
});
