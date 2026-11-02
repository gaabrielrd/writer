import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { resourceAdventureArchive } from '../../functions/test/helpers/adventureRestoreResourceArchiveFixture.mjs';
import { digest } from '../../functions/src/adventureRestoreContracts.mjs';
import {
  uid,
  id,
  request,
  mutation,
  chunkRequest,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-resources',
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
const req = (p) => mutation(p, 'sdk-resource-' + String(p.checkpoint).padStart(8, '0'));
async function ready(options) {
  const bytes = await resourceAdventureArchive(options);
  let p = (await api.startAdventureRestore(uid, request(bytes))).progress;
  for (let at = 0; at < Math.ceil(bytes.length / 65536); at++)
    p = (await api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, at))).progress;
  p = (
    await api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'sdk-resource-integrity-0001', { limit: 16 }),
    )
  ).progress;
  for (let n = 0; ['bytes-verified', 'validating'].includes(p.state); n++) {
    assert.ok(n < 2000);
    p = (
      await api.advanceAdventureRestoreValidation(
        uid,
        mutation(p, 'sdk-resource-validate-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  assert.equal(p.state, 'content-verified');
  return p;
}
async function step(p) {
  return (await api.advanceAdventureRestoreStructure(uid, req(p))).progress;
}
async function finish(p) {
  for (let n = 0; !p.staging || p.staging.phase === 'structure'; n++) {
    assert.ok(n < 2000);
    p = await step(p);
  }
  return p;
}
async function clean(p) {
  p = (await api.cancelAdventureRestore(uid, mutation(p, 'sdk-resource-cancel-0001'))).progress;
  for (let n = 0; p.state === 'cancelling'; n++) {
    assert.ok(n < 2000);
    p = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(p, 'sdk-resource-clean-' + String(n).padStart(6, '0'), { limit: 50 }),
      )
    ).progress;
  }
  return p;
}
async function resourceStep(p) {
  return (await api.advanceAdventureRestoreResources(uid, req(p))).progress;
}
async function resources(p) {
  for (let n = 0; p.staging.phase !== 'resources-ready'; n++) {
    assert.ok(n < 2000);
    p = await resourceStep(p);
  }
  return p;
}
test('SDK resource updates preserve native birth, qualified pointers and private access, then remove more than fifty descendants completely', async () => {
  const start = await finish(await ready({ references: 65, milestoneFirst: true })),
    root = 'adventures/' + start.adventureId,
    control = admin.doc(root + '/workProgress/current'),
    before = await control.get();
  const end = await resources(start),
    after = await control.get();
  assert.ok(before.createTime.isEqual(after.createTime));
  assert.equal(after.data().wordGoal, 12345);
  assert.equal(after.data().checklistCompleted, 1);
  assert.equal(after.data().countReady, false);
  assert.deepEqual((await admin.doc(root + '/narrativeControls/entity-scenes').get()).data(), {
    complete: true,
    processed: 65,
  });
  const scene = (await admin.collection(root + '/scenes').get()).docs[0],
    refs = await scene.ref.collection('references').get();
  assert.equal(refs.size, 65);
  for (const ref of refs.docs) assert.equal(ref.data().scopeId, 'external-universe-0001');
  const arc = (await admin.collection(root + '/arcs').get()).docs[0];
  assert.equal((await arc.ref.collection('milestones').get()).size, 1);
  assert.equal(
    await createStudioService({ db: admin }).getAdventure(uid, { id: start.adventureId }),
    null,
  );
  const journal = (await admin.collection(jobPath + '/stagingArtifacts').get()).docs.find(
      (d) => d.data().address.path.join('/') === 'workProgress/current',
    ),
    entry = journal.data();
  const first = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + entry.createdByOperationId)
      .get(),
    last = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + entry.updatedByOperationId)
      .get();
  assert.notEqual(entry.createdByOperationId, entry.updatedByOperationId);
  assert.ok(journal.createTime.isEqual(first.createTime));
  assert.ok(journal.updateTime.isEqual(last.createTime));
  assert.ok(after.updateTime.isEqual(last.createTime));
  assert.equal(entry.valueHash, digest(after.data()));
  for (const auth of [
    env.authenticatedContext(uid),
    env.authenticatedContext('stranger'),
    env.unauthenticatedContext(),
  ])
    for (const path of [
      root,
      control.path,
      refs.docs[0].ref.path,
      root + '/narrativeControls/entity-scenes',
      jobPath + '/preparedRoot/current',
    ])
      await assertFails(getDoc(doc(auth.firestore(), path)));
  const cancelled = await clean(end);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, end.staging.artifactCount);
  for (const name of [
    'scenes',
    'arcs',
    'timelineEvents',
    'workProgress',
    'workChecklist',
    'narrativeControls',
    'narrativeLinks',
    'sceneLoreLinks',
  ])
    assert.equal((await admin.collection(root + '/' + name).get()).empty, true);
  assert.equal((await scene.ref.collection('references').get()).empty, true);
  assert.equal((await scene.ref.collection('planning').get()).empty, true);
  assert.equal((await arc.ref.collection('milestones').get()).empty, true);
  assert.equal((await admin.collection(jobPath + '/stagingArtifacts').get()).empty, true);
});
test('SDK failed resource transaction rolls back native replacements and index, while same-operation and competing-checkpoint races commit once', async () => {
  const p = await finish(await ready()),
    root = 'adventures/' + p.adventureId,
    definition = await admin.doc(jobPath + '/preparedRoot/current').get(),
    before = await admin.doc(root + '/workProgress/current').get();
  const db = {
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
            if (ref.path === jobPath) throw Error('SDK resource commit unavailable');
            return tx.update(ref, value);
          },
        }),
      ),
  };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({ db }).advanceAdventureRestoreResources(uid, req(p)),
    /SDK resource commit unavailable/,
  );
  assert.ok(
    (await admin.doc(root + '/workProgress/current').get()).updateTime.isEqual(before.updateTime),
  );
  assert.ok((await definition.ref.get()).updateTime.isEqual(definition.updateTime));
  assert.equal((await admin.doc(root + '/narrativeControls/entity-scenes').get()).exists, false);
  const input = req(p),
    pair = await Promise.all([
      api.advanceAdventureRestoreResources(uid, input),
      api.advanceAdventureRestoreResources(uid, input),
    ]);
  assert.deepEqual(pair[0], pair[1]);
  const next = pair[0].progress,
    race = await Promise.allSettled([
      resourceStep(next),
      api.advanceAdventureRestoreResources(uid, {
        ...req(next),
        operationId: 'sdk-resource-competitor-0001',
      }),
    ]);
  assert.equal(race.filter((v) => v.status === 'fulfilled').length, 1);
  const replay = await api.advanceAdventureRestoreResources(uid, input);
  assert.equal(replay.progress.checkpoint, p.checkpoint + 2);
  assert.deepEqual(replay.receipt, pair[0].receipt);
});
test('SDK foreign child, replaced reference and recreated child journal prevent cleanup certification without deleting the scene', async () => {
  for (const mode of ['foreign', 'changed', 'journal']) {
    await env.clearFirestore();
    const p = await resources(await finish(await ready({ references: 3 }))),
      root = 'adventures/' + p.adventureId,
      scene = (await admin.collection(root + '/scenes').get()).docs[0],
      ref = (await scene.ref.collection('references').get()).docs[0];
    if (mode === 'foreign')
      await scene.ref.collection('references').doc('foreign').set({ content: 'FOREIGN' });
    else if (mode === 'changed') await ref.ref.update({ scopeId: 'replaced-origin-0001' });
    else {
      const journal = (await admin.collection(jobPath + '/stagingArtifacts').get()).docs.find(
          (d) => d.data().address.path.join('/') === ref.ref.path.slice(root.length + 1),
        ),
        value = journal.data();
      await journal.ref.delete();
      await journal.ref.set(value);
    }
    await assert.rejects(() => clean(p));
    assert.equal((await admin.doc(jobPath).get()).data().state, 'cancelling');
    assert.equal((await scene.ref.get()).exists, true);
    if (mode === 'foreign')
      assert.equal(
        (await scene.ref.collection('references').doc('foreign').get()).data().content,
        'FOREIGN',
      );
    if (mode === 'changed')
      assert.equal((await ref.ref.get()).data().scopeId, 'replaced-origin-0001');
  }
});

test('SDK cleanup crosses a short descendant/parent page only after committing all descendants', async () => {
  const p = await resources(await finish(await ready({ references: 0, milestoneFirst: true }))),
    root = 'adventures/' + p.adventureId;
  const journals = (
    await admin
      .collection(jobPath + '/stagingArtifacts')
      .orderBy('__name__')
      .get()
  ).docs;
  assert.ok(journals.length < 50);
  assert.ok(journals.some((d) => d.id.startsWith('0-')));
  assert.ok(journals.some((d) => !d.id.startsWith('0-')));
  const cancelled = await clean(p);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, p.staging.artifactCount);
  assert.equal((await admin.collection(root + '/scenes').get()).empty, true);
  assert.equal((await admin.collection(root + '/arcs').get()).empty, true);
});
