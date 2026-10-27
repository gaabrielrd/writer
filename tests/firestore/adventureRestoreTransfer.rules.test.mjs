import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import {
  uid,
  id,
  request,
  mutation,
  chunkRequest,
  hash,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { startInput, requestHash } from '../../functions/src/adventureRestoreContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-adventure-restore',
  bytes = Buffer.alloc(131079, 65),
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
const begin = async () => (await api.startAdventureRestore(uid, request(bytes))).progress;
async function upload() {
  let p = await begin();
  for (let n = 0; n < 3; n++)
    p = (await api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, n))).progress;
  return p;
}
async function verified() {
  let p = await upload();
  for (let n = 0; n < 3; n++)
    p = (
      await api.advanceAdventureRestoreIntegrity(
        uid,
        mutation(p, 'adventure-sdk-integrity-' + String(n).padStart(4, '0'), { limit: 1 }),
      )
    ).progress;
  return p;
}
test('SDK pending root is natively reserved, invisible and unusable even with staged descendants', async () => {
  const p = await begin(),
    paths = [
      jobPath,
      'adventures/' + p.adventureId,
      'adventureRestoreReservations/' + p.adventureId,
      'users/' + uid + '/adventureRestoreOperations/' + id,
    ],
    docs = await admin.getAll(...paths.map((path) => admin.doc(path)));
  assert.ok(docs.every((s) => s.createTime.isEqual(docs[0].createTime)));
  assert.equal(Object.hasOwn(docs[1].data(), 'ownerId'), false);
  const studio = createStudioService({ db: admin });
  await studio.createAdventure(uid, {
    operationId: 'adventure-sdk-control-0001',
    title: 'Control',
  });
  assert.equal(await studio.getAdventure(uid, { id: p.adventureId }), null);
  const listing = await studio.listStudioProjects(uid, { kind: 'adventure', limit: 50 });
  assert.deepEqual(
    listing.items.map((v) => v.id),
    ['adventure-sdk-control-0001'],
  );
  await assert.rejects(
    studio.createAdventure(uid, { operationId: p.adventureId, title: 'Collision' }),
  );
  await assert.rejects(
    createScenesService({ db: admin }).createScene(uid, {
      target: { kind: 'adventure', id: p.adventureId },
      operationId: 'adventure-sdk-stub-scene-0001',
      title: 'No',
    }),
  );
  await assert.rejects(
    createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(uid, {
      adventureId: p.adventureId,
    }),
    { code: 'not-found' },
  );
  await admin
    .doc('adventures/' + p.adventureId + '/parts/hidden')
    .set({ ownerId: uid, content: 'PRIVATE_STAGED' });
  await admin
    .doc('adventures/' + p.adventureId + '/scenes/hidden/body/current')
    .set({ content: 'PRIVATE_STAGED' });
  for (const context of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = context.firestore();
    for (const path of [
      paths[1],
      paths[1] + '/parts/hidden',
      paths[1] + '/scenes/hidden/body/current',
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ownerId: uid }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
  const own = env.authenticatedContext(uid).firestore();
  const rows = await assertSucceeds(
    getDocs(query(collection(own, 'adventures'), where('ownerId', '==', uid), limit(50))),
  );
  assert.deepEqual(
    rows.docs.map((d) => d.id),
    ['adventure-sdk-control-0001'],
  );
});
test('SDK cannot read list or write private chunks, SHA state, operations, fences or reservations', async () => {
  const p = await upload(),
    r = await api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'adventure-sdk-private-check-0001', { limit: 1 }),
    );
  const paths = [
    jobPath,
    jobPath + '/chunks/000000000000000',
    jobPath + '/integrityProofs/000000000000000',
    jobPath + '/integrityStates/adventure-sdk-private-check-0001',
    'users/' + uid + '/adventureRestoreOperations/' + id,
    'users/' + uid + '/adventureRestoreStartFences/' + id,
    'adventureRestoreReservations/' + p.adventureId,
  ];
  for (const context of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = context.firestore();
    for (const path of paths) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { ownerId: uid }));
      await assertFails(deleteDoc(doc(db, path)));
    }
    for (const path of [
      'users/' + uid + '/adventureRestores',
      jobPath + '/chunks',
      jobPath + '/integrityStates',
      'users/' + uid + '/adventureRestoreOperations',
    ])
      await assertFails(getDocs(collection(db, path)));
  }
  const values = await api.listAdventureRestores(uid, { limit: 1 }),
    serialized = JSON.stringify([values, r, await api.getAdventureRestore(uid, { restoreId: id })]);
  assert.equal(values.items.length, 1);
  assert.equal(serialized.includes('chunkBase64'), false);
  assert.equal(serialized.includes('hashState'), false);
  await assert.rejects(api.getAdventureRestore('other', { restoreId: id }), { code: 'not-found' });
});
test('SDK real concurrent appends write one native receipt and resume to an independent full SHA', async () => {
  const first = await begin(),
    input = chunkRequest(first, bytes, 0),
    same = await Promise.all([
      api.appendAdventureRestoreChunk(uid, input),
      api.appendAdventureRestoreChunk(uid, input),
    ]);
  assert.deepEqual(same[0].receipt, same[1].receipt);
  let p = await api.getAdventureRestore(uid, { restoreId: id });
  const race = await Promise.allSettled([
    api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, 1, 'adventure-sdk-race-one-0001')),
    api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, 1, 'adventure-sdk-race-two-0001')),
  ]);
  assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal((await admin.collection(jobPath + '/chunks').get()).size, 2);
  p = await api.getAdventureRestore(uid, { restoreId: id });
  p = (await api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, 2))).progress;
  for (let n = 0; n < 3; n++)
    p = (
      await api.advanceAdventureRestoreIntegrity(
        uid,
        mutation(p, 'adventure-sdk-resume-' + String(n).padStart(4, '0'), { limit: 1 }),
      )
    ).progress;
  assert.equal(p.state, 'bytes-verified');
  assert.equal(p.integrityDigest, hash(bytes));
  const replay = await api.appendAdventureRestoreChunk(uid, input);
  assert.equal(replay.receipt.checkpoint, 1);
  assert.equal(replay.progress.state, 'bytes-verified');
  const chunk = await admin.doc(jobPath + '/chunks/000000000000000').get(),
    receipt = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + input.operationId)
      .get();
  assert.ok(chunk.createTime.isEqual(receipt.createTime));
  assert.ok(chunk.updateTime.isEqual(chunk.createTime));
});
test('SDK cleanup removes sensitive upload state and preserves private fences and root birth', async () => {
  let p = await verified();
  const root = admin.doc('adventures/' + p.adventureId),
    before = await root.get();
  p = (await api.cancelAdventureRestore(uid, mutation(p, 'adventure-sdk-cancel-0001'))).progress;
  let n = 0;
  while (p.state !== 'cancelled') {
    if (n > 30) throw Error('unbounded cleanup');
    p = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(p, 'adventure-sdk-cleanup-' + String(n++).padStart(4, '0'), { limit: 2 }),
      )
    ).progress;
  }
  for (const name of ['chunks', 'integrityProofs', 'integrityStates'])
    assert.equal((await admin.collection(jobPath + '/' + name).get()).size, 0);
  const after = await root.get();
  assert.ok(after.createTime.isEqual(before.createTime));
  assert.equal(after.data().kind, 'adventure-restore-retired');
  assert.equal(Object.hasOwn(after.data(), 'ownerId'), false);
  await assert.rejects(
    createStudioService({ db: admin }).createAdventure(uid, {
      operationId: p.adventureId,
      title: 'Cannot reuse',
    }),
  );
  assert.equal((await api.startAdventureRestore(uid, request(bytes))).progress.state, 'cancelled');
  const absent = request(bytes, 'adventure-sdk-fenced-0001'),
    fp = requestHash('startAdventureRestore', startInput(absent));
  const fence = await api.resolveAdventureRestoreStart(uid, {
    operationId: absent.operationId,
    requestHash: fp,
    intent: 'cancel',
  });
  assert.equal((await api.startAdventureRestore(uid, absent)).kind, 'cancelled');
  assert.equal(
    (await admin.doc('users/' + uid + '/adventureRestores/' + absent.operationId).get()).exists,
    false,
  );
  assert.equal(
    (await admin.doc('adventures/' + fence.adventureId).get()).data().kind,
    'adventure-restore-retired',
  );
});
test('SDK recreated chunk and root cannot be adopted through the old transfer token', async () => {
  const p = await upload(),
    chunk = admin.doc(jobPath + '/chunks/000000000000000'),
    value = (await chunk.get()).data();
  await chunk.delete();
  await chunk.create(value);
  await assert.rejects(
    api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'adventure-sdk-bad-birth-0001', { limit: 1 }),
    ),
  );
  assert.equal((await api.getAdventureRestore(uid, { restoreId: id })).checkedChunks, 0);
  const root = admin.doc('adventures/' + p.adventureId),
    data = (await root.get()).data();
  await root.delete();
  await root.create(data);
  await assert.rejects(api.getAdventureRestore(uid, { restoreId: id, jobToken: p.jobToken }));
  await assert.rejects(api.cancelAdventureRestore(uid, mutation(p, 'adventure-sdk-bad-root-0001')));
  assert.deepEqual((await root.get()).data(), data);
});

test('SDK exact latest receipt cannot be replaced by a historic start receipt after checkpoint corruption', async () => {
  const p = await begin();
  await admin.doc(jobPath).update({ checkpoint: p.checkpoint + 1 });
  await assert.rejects(api.getAdventureRestore(uid, { restoreId: id, jobToken: p.jobToken }));
  const root = await admin.doc('adventures/' + p.adventureId).get();
  assert.equal(Object.hasOwn(root.data(), 'ownerId'), false);
});
