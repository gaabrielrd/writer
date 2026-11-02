import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
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
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureDeletionSourceService } from '../../functions/src/adventureDeletionSource.mjs';
import { adventureReservationPath } from '../../functions/src/adventureDeletionGuard.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const uid = 'author',
  id = 'adventure-deletion-sdk-0001',
  rootPath = 'adventures/' + id;
let env, admin, studio;
const client = (owner = uid) =>
  owner ? env.authenticatedContext(owner).firestore() : env.unauthenticatedContext().firestore();
const previousMetadata = process.env.METADATA_SERVER_DETECTION;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator');
  process.env.METADATA_SERVER_DETECTION = 'none';
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-writer-adventure-deletion-guard',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({
    projectId: 'demo-writer-adventure-deletion-guard',
    host: address,
    ssl: false,
    universeDomain: 'googleapis.com',
  });
  studio = createStudioService({ db: admin });
});
beforeEach(async () => {
  await env.clearFirestore();
  await studio.createAdventure(uid, {
    operationId: id,
    title: 'Private adventure',
    synopsis: 'PRIVATE_ROOT',
  });
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
  if (previousMetadata === undefined) delete process.env.METADATA_SERVER_DETECTION;
  else process.env.METADATA_SERVER_DETECTION = previousMetadata;
});
const reserve = (state = 'deleting') =>
  admin.doc(adventureReservationPath(id)).create({
    schemaVersion: 1,
    ownerId: uid,
    adventureId: id,
    adventureToken: 'a'.repeat(64),
    deletionId: 'adventure-deletion-sdk-op-0001',
    state,
    createdAt: 1000,
    updatedAt: 1000,
  });
const childPaths = [
  'parts/part',
  'scenes/scene',
  'scenes/scene/body/current',
  'scenes/scene/planning/current',
  'scenes/scene/references/ref',
  'arcs/arc',
  'arcs/arc/milestones/milestone',
  'timelineEvents/event',
  'narrativeLinks/link',
];
test('permanent reservation denies SDK root and descendants even if the same owned root remains or reappears', async () => {
  for (const path of childPaths)
    await admin.doc(rootPath + '/' + path).create({ ownerId: uid, content: 'PRIVATE_CHILD' });
  for (const path of [rootPath, ...childPaths.map((p) => rootPath + '/' + p)])
    await assertSucceeds(getDoc(doc(client(), path)));
  await reserve('deleted');
  for (const owner of [uid, 'other', null])
    for (const path of [rootPath, ...childPaths.map((p) => rootPath + '/' + p)])
      await assertFails(getDoc(doc(client(owner), path)));
  const old = (await admin.doc(rootPath).get()).data();
  await admin.doc(rootPath).delete();
  await admin.doc(rootPath).create(old);
  await assertFails(getDoc(doc(client(), rootPath)));
  assert.equal(await studio.getAdventure(uid, { id }), null);
  await assert.rejects(
    () => studio.createAdventure(uid, { operationId: id, title: 'Replacement' }),
    (e) => e.details?.reason === 'adventure-deleted',
  );
});
test('an empty reservation also closes SDK access and deleting root closes before cleanup', async () => {
  await admin.doc(rootPath).update({ deleting: true });
  await assertFails(getDoc(doc(client(), rootPath)));
  await admin.doc(rootPath).update({ deleting: false });
  await admin.doc(adventureReservationPath(id)).create({});
  await assertFails(getDoc(doc(client(), rootPath)));
  await assert.rejects(() => studio.getAdventure(uid, { id }), { code: 'failed-precondition' });
});
test('SDK catalog is closed while the server scans bounded metadata and paginates past a reserved project', async () => {
  const batch = admin.batch();
  for (let n = 0; n < 50; n++)
    batch.create(admin.doc('adventures/available-deletion-sdk-' + String(n).padStart(4, '0')), {
      ownerId: uid,
      schemaVersion: 1,
      revision: 1,
      title: 'Available ' + n,
      createdAt: 1,
      updatedAt: 1,
      status: 'draft',
      content: 'PRIVATE_BODY',
    });
  await batch.commit();
  await reserve();
  for (const owner of [uid, 'other', null])
    await assertFails(
      getDocs(
        query(collection(client(owner), 'adventures'), where('ownerId', '==', uid), limit(50)),
      ),
    );
  const items = [];
  let cursor;
  do {
    const page = await studio.listStudioProjects(uid, {
      kind: 'adventure',
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(items.length, 50);
  assert.equal(
    items.some((item) => item.id === id),
    false,
  );
  assert.equal(
    items.some((item) => 'content' in item),
    false,
  );
});
test('reservations and deletion jobs, receipts and start fences remain inaccessible to the SDK', async () => {
  await reserve();
  const paths = [
    adventureReservationPath(id),
    'users/' + uid + '/adventureDeletions/operation-0001',
    'users/' + uid + '/adventureDeletionOperations/operation-0001',
    'users/' + uid + '/adventureDeletionStartFences/operation-0001',
  ];
  for (const path of paths.slice(1))
    await admin.doc(path).create({ ownerId: uid, adventureId: id, privateText: 'DO_NOT_READ' });
  for (const owner of [uid, 'other', null])
    for (const path of paths) {
      const ref = doc(client(owner), path);
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(client(owner), path.slice(0, path.lastIndexOf('/')))));
      await assertFails(setDoc(ref, { ownerId: owner }));
      await assertFails(deleteDoc(ref));
    }
});
test('source uses real Admin native metadata and stops scene writes behind the reservation', async () => {
  const api = createAdventureDeletionSourceService({ db: admin }),
    read = () => api.getAdventureDeletionSource(uid, { adventureId: id });
  const first = await read(),
    ref = admin.doc(rootPath),
    old = (await ref.get()).data();
  await ref.update({ synopsis: 'Changed without changing revision or title' });
  const updated = await read();
  assert.equal(updated.revision, first.revision);
  assert.equal(updated.adventureToken, first.adventureToken);
  assert.notEqual(updated.sourceToken, first.sourceToken);
  await ref.delete();
  await ref.create(old);
  const recreated = await read();
  assert.notEqual(recreated.adventureToken, first.adventureToken);
  assert.notEqual(recreated.sourceToken, updated.sourceToken);
  await reserve();
  assert.equal(await read(), null);
  await assert.rejects(
    () =>
      createScenesService({ db: admin }).createScene(uid, {
        target: { kind: 'adventure', id },
        operationId: 'deleted-scene-sdk-0001',
        parentId: null,
        title: 'Late scene',
        content: 'Late text',
      }),
    (e) => e.details?.reason === 'adventure-deleting',
  );
  assert.equal((await admin.collection(rootPath + '/scenes').get()).empty, true);
});
