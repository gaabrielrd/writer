import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import {
  ready,
  finish,
  logical,
  uid,
  id,
} from '../../functions/test/helpers/bookRestoreLoreStreamFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { finishRestoreResources } from '../../functions/test/helpers/bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from '../../functions/test/helpers/bookRestoreCountsFixture.mjs';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-stream';
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback demo emulator required');
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
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const data = () => ({
  name: '',
  category: 'other',
  details: '\ufeff' + 'x'.repeat(530000),
  relations: Array.from({ length: 65 }, (_, i) => ({
    targetEntityId: 'entity',
    relationType: '',
    ...(i === 63 ? { description: 'literal 🌙 after the target' } : {}),
  })),
});
async function controls(p) {
  return admin
    .collection('books/' + p.bookId + '/bookResourceBodies')
    .where('stageKind', '==', 'restore-lore-generation')
    .limit(2)
    .get();
}

test('SDK lore generation: actual advanceLore resumes with new-job option disabled, preserves logical missing dates and stays private before activation', async () => {
  const original = data(),
    f = await ready(original, { db: admin }),
    request = mutation(id, f.p, id + '-sdk-init'),
    first = await f.factory().advanceBookRestoreLore(uid, request);
  assert.equal(first.progress.preparation.lorePayload.streamed, true);
  assert.deepEqual(await f.factory().advanceBookRestoreLore(uid, request), first);
  f.factory = () => createBookRestoreUploadService({ db: admin, now: () => 1000 });
  const p = await finish(f, first.progress),
    result = await logical(f, p),
    expected = structuredClone(original);
  for (const relation of expected.relations)
    relation.targetEntityId = f.mapper.identity('lore', 'entity');
  assert.deepEqual(result.data, expected);
  assert.deepEqual(result.native.payloadStorage.portableDates, {});
  assert.equal(result.native.createdAt, p.preparation.timestamp);
  assert.equal(result.native.updatedAt, p.preparation.timestamp);
  assert.equal(result.native.payloadStorage.relations.pages, 2);
  assert.equal(p.preparation.loreCount, 1);
  assert.equal(p.preparation.loreRelationCount, 65);
  const next = await finishRestoreResources(f.factory, uid, id, p);
  assert.equal(next.preparation.phase, 'resource-counts');
  assert.equal(next.preparation.resourceCounts.lore, 1);
  const reconciled = await finishRestoreCounts(f.factory, uid, id, next);
  assert.equal(reconciled.preparation.phase, 'personas');
  const reconcileControls = await admin
    .collection('books/' + p.bookId + '/bookResourceBodies')
    .where('stageKind', '==', 'restore-lore-reconcile')
    .limit(2)
    .get();
  assert.equal(reconcileControls.size, 1);
  assert.equal(reconcileControls.docs[0].data().phase, 'done');
  const nativeControls = await controls(next);
  assert.equal(nativeControls.size, 1);
  assert.equal(nativeControls.docs[0].data().phase, 'done');
  const segment = (
      await admin
        .collection('books/' + p.bookId + '/bookLoreSegments')
        .limit(1)
        .get()
    ).docs[0],
    chunk = (
      await admin
        .collection('books/' + p.bookId + '/bookResourceChunks')
        .limit(1)
        .get()
    ).docs[0],
    paths = [
      nativeControls.docs[0].ref.path,
      reconcileControls.docs[0].ref.path,
      segment.ref.path,
      chunk.ref.path,
      'books/' + p.bookId + '/lore/' + f.mapper.identity('lore', 'entity'),
    ];
  for (const path of paths) {
    assert.equal((await admin.doc(path).get()).exists, true);
    for (const actor of [
      env.authenticatedContext(uid),
      env.authenticatedContext('other'),
      env.unauthenticatedContext(),
    ])
      await assertFails(getDoc(doc(actor.firestore(), path)));
  }
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  await assert.rejects(() =>
    createBookLoreReadService({ db: admin }).getBookLoreRead(uid, {
      bookId: p.bookId,
      id: f.mapper.identity('lore', 'entity'),
    }),
  );
});

test('SDK lore generation: production cancellation drains all enrolled generation and staging data', async () => {
  const f = await ready(data(), { db: admin });
  let p = f.p;
  for (let step = 0; step < 20; step++)
    p = (
      await f.factory().advanceBookRestoreLore(uid, mutation(id, p, id + '-sdk-partial-' + step))
    ).progress;
  assert.equal((await controls(p)).size, 1);
  assert.equal(
    (
      await admin
        .collection('books/' + p.bookId + '/bookResourceBodies')
        .limit(1)
        .get()
    ).empty,
    false,
  );
  const done = await cleanupLegacyRestore(f.factory(), uid, id, p, {
    limit: 5,
    prefix: id + '-sdk-clean-',
  });
  assert.equal(done.state, 'cancelled');
  for (const name of ['lore', 'bookResourceBodies', 'bookResourceChunks', 'bookLoreSegments'])
    assert.equal(
      (
        await admin
          .collection('books/' + p.bookId + '/' + name)
          .limit(1)
          .get()
      ).empty,
      true,
    );
  assert.equal(
    (
      await admin
        .collection('users/' + uid + '/bookRestores/' + id + '/materializationArtifacts')
        .limit(1)
        .get()
    ).empty,
    true,
  );
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
});

test('SDK lore generation: recreated generation control is refused and preserved by cleanup', async () => {
  const f = await ready(data(), { db: admin }),
    p = (await f.factory().advanceBookRestoreLore(uid, mutation(id, f.p, id + '-sdk-init')))
      .progress,
    found = await controls(p);
  assert.equal(found.size, 1);
  const original = found.docs[0],
    ref = original.ref;
  assert.equal(original.exists, true);
  await ref.delete();
  await ref.create(original.data());
  await assert.rejects(() =>
    f.factory().advanceBookRestoreLore(uid, mutation(id, p, id + '-sdk-next')),
  );
  await assert.rejects(() =>
    cleanupLegacyRestore(f.factory(), uid, id, p, { limit: 5, prefix: id + '-sdk-aba-' }),
  );
  assert.deepEqual((await ref.get()).data(), original.data());
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
});
