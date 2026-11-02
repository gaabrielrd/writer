import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { adventureStageArtifactId } from '../../functions/src/adventureRestoreArtifacts.mjs';
import { resourceAdventureArchive } from '../../functions/test/helpers/adventureRestoreResourceArchiveFixture.mjs';
import {
  prepareAdventureImages,
  finishImages,
} from '../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import { finishImageStorage } from '../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import {
  countRequest,
  countStep,
  finishCounts,
} from '../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import { cleanup, uid, id } from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-counts',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? '')) throw Error('Only dedicated loopback demo');
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
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('native count journals, rollback and replay preserve private aggregates and cleanup removes their ledger', async () => {
  const api = createAdventureRestoreTransferService({ db: admin }),
    f = { api, uid },
    prepared = await prepareAdventureImages(api, uid, await resourceAdventureArchive());
  let p = await finishImageStorage(f, await finishImages(f, prepared));
  const request = countRequest(p),
    [first, same] = await Promise.all([
      api.advanceAdventureRestoreCounts(uid, request),
      api.advanceAdventureRestoreCounts(uid, request),
    ]);
  assert.deepEqual(first, same);
  p = first.progress;
  while (p.staging.phase !== 'counts-scenes') p = await countStep(f, p);
  const failingDb = {
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
              if (ref.path === jobPath && value.staging?.countScenes === 1)
                throw Error('SDK count commit rollback');
              return tx.update(ref, value);
            },
          }),
        ),
    },
    failedApi = createAdventureRestoreTransferService({ db: failingDb });
  let held;
  for (let n = 0; p.staging.countScenes === 0; n++) {
    assert.ok(n < 1000);
    const before = (await admin.doc(jobPath).get()).data(),
      input = countRequest(p);
    try {
      p = (await failedApi.advanceAdventureRestoreCounts(uid, input)).progress;
    } catch (error) {
      assert.match(error.message, /SDK count commit rollback/);
      assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
      assert.equal(
        (await admin.collection('adventures/' + p.adventureId + '/workWordSources').get()).empty,
        true,
      );
      held = input;
      break;
    }
  }
  assert.ok(held);
  const applied = await api.advanceAdventureRestoreCounts(uid, held);
  p = applied.progress;
  const sources = await admin.collection('adventures/' + p.adventureId + '/workWordSources').get();
  assert.equal(sources.size, 1);
  const source = sources.docs[0],
    address = { scope: 'adventure', path: ['workWordSources', source.id] },
    journal = await admin
      .doc(jobPath + '/stagingArtifacts/' + adventureStageArtifactId(address))
      .get(),
    receipt = await admin
      .doc('users/' + uid + '/adventureRestoreOperations/' + held.operationId)
      .get();
  assert.ok(source.createTime.isEqual(journal.createTime));
  assert.ok(source.createTime.isEqual(receipt.createTime));
  assert.equal(source.data().words, 0);
  assert.deepEqual(await api.advanceAdventureRestoreCounts(uid, held), applied);
  const client = env.authenticatedContext(uid).firestore();
  await assertFails(getDoc(doc(client, source.ref.path)));
  await assertFails(getDoc(doc(client, 'adventures/' + p.adventureId)));
  p = await finishCounts(f, p);
  const prefix = 'adventures/' + p.adventureId,
    control = (await admin.doc(prefix + '/workProgress/current').get()).data(),
    milestones = await admin.collection(prefix + '/arcs').get();
  assert.equal(control.countReady, false);
  assert.equal(control.wordCount, 0);
  assert.equal(control.processed, 1);
  assert.equal(control.phase, 'done');
  assert.equal(control.cursor, null);
  assert.equal(p.staging.countLinks, 1);
  assert.equal(milestones.size, 1);
  assert.equal(milestones.docs[0].data().referenceCount, 0);
  const linked = await milestones.docs[0].ref.collection('milestones').get();
  assert.equal(linked.docs[0].data().referenceCount, 1);
  assert.equal((await admin.doc(prefix).get()).data().ownerId, undefined);
  const cancelled = await cleanup(f, p, 50);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.staging.cleanedArtifacts, p.staging.artifactCount);
  for (const name of [
    'workWordSources',
    'workWordGroups',
    'workProgress',
    'scenes',
    'parts',
    'arcs',
  ])
    assert.equal((await admin.collection(prefix + '/' + name).get()).empty, true, name);
  assert.equal((await admin.collection(jobPath + '/stagingArtifacts').get()).empty, true);
});
