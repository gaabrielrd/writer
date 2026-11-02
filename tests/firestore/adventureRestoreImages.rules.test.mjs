import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { adventureStageArtifactId } from '../../functions/src/adventureRestoreArtifacts.mjs';
import {
  imageAdventureArchive,
  prepareAdventureImages,
  imageRequest,
  finishImages,
  smallPNG,
} from '../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import {
  uid,
  id,
  mutation,
} from '../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-adventure-images-prepare',
  jobPath = 'users/' + uid + '/adventureRestores/' + id;
let env, admin, api;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Only local demo emulator');
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
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK persists canonical numeric image frames with atomic receipts, exact native proof, private Rules and complete cancellation', async () => {
  const image = Buffer.concat([smallPNG, Buffer.alloc(70000, 79)]),
    p = await prepareAdventureImages(api, uid, await imageAdventureArchive({ image })),
    input = imageRequest(p),
    [a, b] = await Promise.all([
      api.advanceAdventureRestoreImages(uid, input),
      api.advanceAdventureRestoreImages(uid, input),
    ]);
  assert.deepEqual(a, b);
  const current = a.progress,
    before = (await admin.doc(jobPath).get()).data(),
    failingDb = {
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
              if (ref.path === jobPath) throw Error('SDK image rollback');
              return tx.update(ref, value);
            },
          }),
        ),
    };
  await assert.rejects(
    () =>
      createAdventureRestoreTransferService({ db: failingDb }).advanceAdventureRestoreImages(
        uid,
        imageRequest(current),
      ),
    /SDK image rollback/,
  );
  assert.deepEqual((await admin.doc(jobPath).get()).data(), before);
  assert.equal(
    (await admin.collection(jobPath + '/preparedRoot').get()).docs.filter((d) =>
      d.id.startsWith('image-bytes-'),
    ).length,
    0,
  );
  const partial = (await api.advanceAdventureRestoreImages(uid, imageRequest(current))).progress;
  assert.equal(partial.staging.imagePending, true);
  assert.equal(partial.staging.imageBytes, 65536);
  const end = await finishImages({ api, uid }, partial),
    values = (await admin.collection(jobPath + '/preparedRoot').get()).docs,
    chunks = values
      .filter((d) => d.id.startsWith('image-bytes-'))
      .sort((a, b) => a.data().index - b.data().index);
  assert.equal(chunks.length, 2);
  assert.deepEqual(Buffer.concat(chunks.map((d) => Buffer.from(d.data().bytes))), image);
  for (const row of chunks) {
    assert.ok(Array.isArray(row.data().bytes));
    assert.ok(row.data().bytes.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
    assert.ok(row.data().bytes.length <= 65536);
    const address = { scope: 'job', path: ['preparedRoot', row.id] },
      journal = await admin
        .doc(jobPath + '/stagingArtifacts/' + adventureStageArtifactId(address))
        .get(),
      op = await admin
        .doc('users/' + uid + '/adventureRestoreOperations/' + journal.data().createdByOperationId)
        .get();
    assert.ok(row.createTime.isEqual(journal.createTime));
    assert.ok(row.createTime.isEqual(op.createTime));
    assert.equal(op.data().receipt.action, 'advanceAdventureRestoreImages');
  }
  const own = env.authenticatedContext(uid).firestore(),
    other = env.authenticatedContext('other').firestore();
  await assertFails(getDoc(doc(own, chunks[0].ref.path)));
  await assertFails(getDoc(doc(other, chunks[0].ref.path)));
  await assertFails(setDoc(doc(own, chunks[0].ref.path), { bytes: [1] }));
  await assertFails(getDoc(doc(own, 'adventures/' + p.adventureId)));
  assert.equal((await admin.collection('users/' + uid + '/imageLibrary').get()).empty, true);
  let cancelled = (await api.cancelAdventureRestore(uid, mutation(end, 'sdk-image-cancel-0001')))
    .progress;
  for (let n = 0; cancelled.state !== 'cancelled'; n++) {
    assert.ok(n < 1000);
    cancelled = (
      await api.advanceAdventureRestoreCleanup(
        uid,
        mutation(cancelled, 'sdk-image-clean-' + String(n).padStart(6, '0'), { limit: 50 }),
      )
    ).progress;
  }
  assert.equal(cancelled.staging.cleanedArtifacts, end.staging.artifactCount);
  assert.equal((await admin.collection(jobPath + '/preparedRoot').get()).empty, true);
  assert.equal((await admin.collection(jobPath + '/stagingArtifacts').get()).empty, true);
  assert.equal(
    (await admin.doc('adventures/' + p.adventureId).get()).data().kind,
    'adventure-restore-retired',
  );
});
