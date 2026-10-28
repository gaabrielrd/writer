import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, limit } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createUniverseService } from '../../functions/src/universes.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import {
  createAdventureDeletionService,
  readAdventureDeletionJob,
} from '../../functions/src/adventureDeletion.mjs';
import {
  readAdventureDeletionInventoryPage as page,
  assertAdventureDeletionInventoryEmpty as empty,
  ADVENTURE_DELETION_LAYOUT as layout,
} from '../../functions/src/adventureDeletionInventory.mjs';
import { adventureReservationPath } from '../../functions/src/adventureDeletionGuard.mjs';
import {
  adventureDeletionPath,
  adventureDeletionOperationPath,
  adventureDeletionFencePath,
} from '../../functions/src/adventureDeletionContracts.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = require('firebase-admin/firestore');
const uid = 'author',
  id = 'adventure-private-deletion-sdk',
  root = 'adventures/' + id,
  operationId = 'adventure-private-deletion-op',
  projectId = 'demo-writer-adventure-deletion-start';
let env, db, studio, api, world;
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator');
  process.env.METADATA_SERVER_DETECTION = 'none';
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  db = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  studio = createStudioService({ db });
  api = createAdventureDeletionService({ db });
  world = createUniverseService({ db });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await db?.terminate();
  await env?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
async function setup(universe = false) {
  if (universe) await world.createUniverse(uid, { creationId: 'world', name: 'Own world' });
  await studio.createAdventure(uid, {
    operationId: id,
    title: 'Private own adventure',
    ...(universe ? { universeId: 'world' } : {}),
  });
  return input();
}
async function input(op = operationId) {
  const s = await api.getAdventureDeletionSource(uid, { adventureId: id });
  return {
    adventureId: id,
    adventureToken: s.adventureToken,
    sourceToken: s.sourceToken,
    expectedRevision: s.revision,
    operationId: op,
  };
}
test('native commit binds start, world unlink, marker and receipt; retry preserves content and counters', async () => {
  await setup(true);
  const scene = await createScenesService({ db }).createScene(uid, {
    target: { kind: 'adventure', id },
    operationId: 'native-deletion-scene-0001',
    parentId: null,
    title: 'Scene',
    content: 'Keep exact own text',
  });
  const request = await input(),
    body = db.doc(root + '/scenes/' + scene.scene.id + '/body/current'),
    before = (await body.get()).data();
  const first = await api.startAdventureDeletion(uid, request);
  assert.equal(first.progress.phase, 'quiescence');
  assert.equal(first.progress.revoked, true);
  assert.equal((await db.doc('universes/world').get()).data().adventureCount, 0);
  assert.equal((await db.doc('universes/world/adventures/' + id).get()).exists, false);
  const job = await db.doc(adventureDeletionPath(uid, operationId)).get(),
    reserved = await db.doc(adventureReservationPath(id)).get(),
    receipt = await db.doc(adventureDeletionOperationPath(uid, operationId)).get(),
    marker = await db.doc(root).get();
  assert.ok(job.createTime.isEqual(reserved.createTime));
  assert.ok(job.createTime.isEqual(receipt.createTime));
  assert.ok(marker.updateTime.isEqual(receipt.createTime));
  assert.ok(receipt.createTime.isEqual(receipt.updateTime));
  assert.deepEqual(await api.startAdventureDeletion(uid, request), first);
  assert.deepEqual(
    await api.resolveAdventureDeletionStart(uid, { ...request, intent: 'cancel' }),
    first,
  );
  assert.deepEqual(
    (await api.getAdventureDeletion(uid, { adventureId: id })).deletion,
    first.progress,
  );
  assert.deepEqual((await body.get()).data(), before);
  assert.equal((await db.doc(adventureDeletionFencePath(uid, operationId)).get()).exists, false);
  assert.equal(await studio.getAdventure(uid, { id }), null);
});
test('real competing starts acquire one permanent reservation and decrement the world once', async () => {
  const request = await setup(true),
    other = { ...request, operationId: operationId + '-other' };
  const results = await Promise.allSettled([
    api.startAdventureDeletion(uid, request),
    api.startAdventureDeletion(uid, other),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const winner = results.find((r) => r.status === 'fulfilled').value,
    loser = results.find((r) => r.status === 'rejected').reason;
  assert.equal(loser.details.reason, 'adventure-deleting');
  assert.equal(loser.details.deletionId, winner.progress.deletionId);
  assert.equal((await db.collection('users/' + uid + '/adventureDeletions').get()).size, 1);
  assert.equal((await db.doc('universes/world').get()).data().adventureCount, 0);
});
test('unknown-start fence leaves an available root untouched and prevents its delayed start', async () => {
  const request = await setup(),
    before = await db.doc(root).get();
  const stopped = await api.resolveAdventureDeletionStart(uid, { ...request, intent: 'cancel' });
  assert.equal(stopped.kind, 'canceled');
  assert.deepEqual(await api.startAdventureDeletion(uid, request), stopped);
  const after = await db.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  assert.equal((await db.doc(adventureReservationPath(id)).get()).exists, false);
});
test('actual native update invalidates a stale source without changing title or logical revision', async () => {
  const request = await setup();
  await db.doc(root).update({ synopsis: 'New own text' });
  await assert.rejects(
    () => api.startAdventureDeletion(uid, request),
    (e) => e.details?.reason === 'adventure-deletion-source-changed',
  );
  assert.equal((await db.doc(adventureReservationPath(id)).get()).exists, false);
  assert.equal((await db.doc(root).get()).data().deleting, undefined);
});
test('copying every private start record cannot replace its native commit or authorize the old marker', async () => {
  const request = await setup();
  await api.startAdventureDeletion(uid, request);
  const paths = [
      adventureDeletionPath(uid, operationId),
      adventureReservationPath(id),
      adventureDeletionOperationPath(uid, operationId),
    ],
    copies = await Promise.all(paths.map((p) => db.doc(p).get()));
  const remove = db.batch();
  paths.forEach((p) => remove.delete(db.doc(p)));
  await remove.commit();
  const replace = db.batch();
  paths.forEach((p, i) => replace.create(db.doc(p), copies[i].data()));
  await replace.commit();
  await assert.rejects(() => api.getAdventureDeletion(uid, { adventureId: id }), {
    code: 'failed-precondition',
  });
  await assert.rejects(() => api.startAdventureDeletion(uid, request), {
    code: 'failed-precondition',
  });
  assert.equal((await db.doc(root).get()).data().deleting, true);
});
test('bounded orphan inventory works without a root and preserves foreign projects; empty certification is separate', async () => {
  const request = await setup(),
    first = await api.startAdventureDeletion(uid, request),
    batch = db.batch();
  for (let n = 0; n < 53; n++)
    batch.create(db.doc(root + '/scenes/missing-' + String(n).padStart(4, '0') + '/body/current'), {
      content: 'PRIVATE_BODY_' + n,
    });
  batch.create(db.doc(root + '/sceneBlocks/日本語/body/current'), { content: 'PRIVATE_BLOCK' });
  const foreign = 'adventures/' + id + '-other/scenes/missing/body/current';
  batch.create(db.doc(foreign), { content: 'KEEP_FOREIGN' });
  batch.delete(db.doc(root));
  await batch.commit();
  const sizes = [];
  for (;;) {
    const result = await db.runTransaction(async (tx) => {
      const l = await readAdventureDeletionJob(tx, db, uid, first.progress.deletionId),
        found = await page(
          tx,
          db,
          l.p,
          layout.findIndex((f) => f.scope === 'nested' && f.collection === 'body'),
        );
      for (const snapshot of found.documents) {
        assert.deepEqual(snapshot.data(), {});
        tx.delete(snapshot.ref);
      }
      return found;
    });
    sizes.push(result.documents.length);
    if (result.empty) break;
    assert.ok(sizes.length < 10);
  }
  assert.deepEqual(sizes, [25, 25, 4, 0]);
  await db.runTransaction(async (tx) => {
    const l = await readAdventureDeletionJob(tx, db, uid, operationId);
    await empty(tx, db, l.p);
  });
  assert.equal((await db.doc(foreign).get()).data().content, 'KEEP_FOREIGN');
  assert.equal((await db.doc(adventureReservationPath(id)).get()).data().state, 'deleting');
  await db.doc(root + '/arcs/missing/milestones/reappeared').create({ title: 'Still own content' });
  await assert.rejects(
    () =>
      db.runTransaction(async (tx) => {
        const l = await readAdventureDeletionJob(tx, db, uid, operationId);
        await empty(tx, db, l.p);
      }),
    { code: 'failed-precondition' },
  );
});
test('unexpected descendants are preserved and cannot pass the physical inventory certificate', async () => {
  const request = await setup();
  await api.startAdventureDeletion(uid, request);
  const bad = root + '/parts/part/body/current';
  await db.doc(bad).create({ content: 'DO_NOT_GUESS' });
  await assert.rejects(
    () =>
      db.runTransaction(async (tx) => {
        const l = await readAdventureDeletionJob(tx, db, uid, operationId);
        await empty(tx, db, l.p);
      }),
    { code: 'failed-precondition' },
  );
  assert.equal((await db.doc(bad).get()).data().content, 'DO_NOT_GUESS');
});
test('SDK cannot access private start records or inventory after revocation; another account learns no status', async () => {
  const request = await setup();
  await api.startAdventureDeletion(uid, request);
  await db.doc(root + '/scenes/missing/body/current').create({ content: 'PRIVATE_BODY' });
  for (const owner of [uid, 'other', null]) {
    const client = owner
      ? env.authenticatedContext(owner).firestore()
      : env.unauthenticatedContext().firestore();
    for (const path of [
      root,
      root + '/scenes/missing/body/current',
      adventureDeletionPath(uid, operationId),
      adventureDeletionOperationPath(uid, operationId),
      adventureReservationPath(id),
    ])
      await assertFails(getDoc(doc(client, path)));
    await assertFails(
      getDocs(query(collection(client, 'users/' + uid + '/adventureDeletions'), limit(25))),
    );
  }
  assert.equal((await api.getAdventureDeletion('other', { adventureId: id })).deletion, null);
});
