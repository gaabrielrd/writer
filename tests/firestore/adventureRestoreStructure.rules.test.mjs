import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { createVerifiedAdventureRestoreContent } from '../../functions/src/adventureRestoreContentRead.mjs';
import { sceneAdventureArchive } from '../../functions/test/helpers/adventureRestoreSceneArchiveFixture.mjs';
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
  projectId = 'demo-writer-adventure-structure',
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
const req = (p) => mutation(p, 'sdk-structure-' + String(p.checkpoint).padStart(8, '0'));
async function ready() {
  const bytes = await sceneAdventureArchive();
  let p = (await api.startAdventureRestore(uid, request(bytes))).progress;
  for (let at = 0; at < Math.ceil(bytes.length / 65536); at++)
    p = (await api.appendAdventureRestoreChunk(uid, chunkRequest(p, bytes, at))).progress;
  p = (
    await api.advanceAdventureRestoreIntegrity(
      uid,
      mutation(p, 'sdk-structure-integrity-0001', { limit: 16 }),
    )
  ).progress;
  for (let n = 0; ['bytes-verified', 'validating'].includes(p.state); n++) {
    assert.ok(n < 100);
    p = (
      await api.advanceAdventureRestoreValidation(
        uid,
        mutation(p, 'sdk-structure-validate-' + String(n).padStart(6, '0')),
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
    assert.ok(n < 100);
    p = await step(p);
  }
  return p;
}
async function clean(p) {
  p = (await api.cancelAdventureRestore(uid, mutation(p, 'sdk-structure-cancel-0001'))).progress;
  for (let n = 0; p.state === 'cancelling'; n++) {
    assert.ok(n < 100);
    p = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(p, 'sdk-structure-clean-' + String(n).padStart(6, '0'), { limit: 50 }),
      )
    ).progress;
  }
  return p;
}
test('SDK native paired scene staging stays invisible, proves common artifact birth, and cleanup removes every prepared target', async () => {
  const p = await finish(await ready()),
    rootPath = 'adventures/' + p.adventureId,
    scenes = await admin.collection(rootPath + '/scenes').get(),
    head = scenes.docs[0],
    body = await head.ref.collection('body').doc('current').get();
  assert.equal(p.staging.artifactCount, 5);
  assert.equal(body.data().content, '<p>PRIVATE_CORPO 🌙</p>');
  assert.equal(body.data().hash, head.data().bodyHash);
  assert.equal(head.data().mainBlockAudience, 'gm');
  assert.equal(head.data().revision, 1);
  assert.ok(head.createTime.isEqual(body.createTime));
  assert.equal(Object.hasOwn((await admin.doc(rootPath).get()).data(), 'ownerId'), false);
  assert.equal(
    (await admin.doc(rootPath + '/workProgress/current').get()).data().countReady,
    false,
  );
  assert.equal(
    await createStudioService({ db: admin }).getAdventure(uid, { id: p.adventureId }),
    null,
  );
  for (const auth of [
    env.authenticatedContext(uid),
    env.authenticatedContext('stranger'),
    env.unauthenticatedContext(),
  ])
    for (const path of [rootPath, head.ref.path, body.ref.path, jobPath + '/preparedRoot/current'])
      await assertFails(getDoc(doc(auth.firestore(), path)));
  const journals = await admin.collection(jobPath + '/stagingArtifacts').get();
  assert.equal(journals.docs.length, 5);
  for (const journal of journals.docs) {
    const entry = journal.data(),
      op = await admin
        .doc('users/' + uid + '/adventureRestoreOperations/' + entry.createdByOperationId)
        .get();
    assert.ok(journal.createTime.isEqual(op.createTime));
  }
  const cancelled = await clean(p);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, 5);
  for (const name of ['scenes', 'sceneControls', 'workProgress'])
    assert.equal(
      (
        await admin
          .collection(rootPath + '/' + name)
          .limit(1)
          .get()
      ).docs.length,
      0,
    );
  assert.equal((await body.ref.get()).exists, false);
  assert.equal(
    (
      await admin
        .collection(jobPath + '/stagingArtifacts')
        .limit(1)
        .get()
    ).docs.length,
    0,
  );
  assert.equal((await admin.doc(jobPath + '/preparedRoot/current').get()).exists, false);
});
test('SDK concurrent replay commits one root preparation and a failed scene/body transaction rolls back both targets and journals', async () => {
  const p = await ready(),
    input = req(p),
    pair = await Promise.all([
      api.advanceAdventureRestoreStructure(uid, input),
      api.advanceAdventureRestoreStructure(uid, input),
    ]);
  assert.deepEqual(pair[0], pair[1]);
  let current = pair[0].progress;
  for (let n = 0; n < 100; n++) {
    const reader = await createVerifiedAdventureRestoreContent({
        db: admin,
        uid,
        restoreId: current.restoreId,
        jobToken: current.jobToken,
      }),
      unit = await reader.readItem(current.staging.itemIndex);
    if (unit.value.kind === 'scene') break;
    current = await step(current);
  }
  const db = {
    doc: admin.doc.bind(admin),
    collection: admin.collection.bind(admin),
    runTransaction: (cb) =>
      admin.runTransaction((tx) =>
        cb({
          get: tx.get.bind(tx),
          getAll: tx.getAll.bind(tx),
          create: tx.create.bind(tx),
          update(ref, value) {
            if (ref.path === jobPath) throw Error('SDK staging commit unavailable');
            return tx.update(ref, value);
          },
        }),
      ),
  };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({ db }).advanceAdventureRestoreStructure(
        uid,
        req(current),
      ),
    /SDK staging commit unavailable/,
  );
  assert.equal(
    (
      await admin
        .collection('adventures/' + p.adventureId + '/scenes')
        .limit(1)
        .get()
    ).docs.length,
    0,
  );
  assert.equal((await admin.doc(jobPath).get()).data().checkpoint, current.checkpoint);
  const recovered = await step(current);
  assert.equal(recovered.staging.scenes, 1);
  assert.equal(
    (await admin.collection('adventures/' + p.adventureId + '/scenes').get()).docs.length,
    1,
  );
});
test('SDK changed native target or recreated journal prevents cleanup certification and preserves the changed document', async () => {
  for (const mode of ['body', 'journal']) {
    await env.clearFirestore();
    const p = await finish(await ready()),
      head = (await admin.collection('adventures/' + p.adventureId + '/scenes').get()).docs[0],
      body = head.ref.collection('body').doc('current');
    if (mode === 'body') await body.update({ content: 'FOREIGN_CHANGE' });
    else {
      const journal = (
          await admin
            .collection(jobPath + '/stagingArtifacts')
            .limit(1)
            .get()
        ).docs[0],
        value = journal.data();
      await journal.ref.delete();
      await journal.ref.set(value);
    }
    await assert.rejects(() => clean(p));
    assert.equal((await admin.doc(jobPath).get()).data().state, 'cancelling');
    assert.equal((await body.get()).exists, true);
    if (mode === 'body') assert.equal((await body.get()).data().content, 'FOREIGN_CHANGE');
  }
});
