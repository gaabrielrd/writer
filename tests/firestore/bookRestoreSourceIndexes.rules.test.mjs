import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../../functions/src/bookBackupResourceRead.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
import { bookBackupIdentity } from '../../functions/src/bookBackupContext.mjs';
import {
  sourceIndexesRecords,
  sourceIndexesLegacyDb,
  readyRestoreSourceIndexes,
} from '../../functions/test/helpers/bookRestoreSourceIndexesFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { observeSceneSourcePartReads } from '../../functions/test/helpers/bookSceneSourceEncodingFixture.mjs';
import { sourceText } from '../../functions/test/helpers/bookSceneSourceFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-source-index-migration',
  uid = 'author',
  id = 'source-index-sdk01';
let env, admin, api, oldFactory;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Dedicated local emulator required.');
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
  const oldDb = sourceIndexesLegacyDb(admin);
  oldFactory = () => createBookRestoreUploadService({ db: oldDb });
  api = createBookRestoreUploadService({ db: admin });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const partProof = (docs) =>
  docs.map((d) => [
    d.id,
    bookBackupIdentity(d),
    digest(Buffer.from(d.data().bytes).toString('base64')),
  ]);
test('SDK migrates an old indexed-free generation with native receipt/journal proof, exact backup and v12 cancellation', async (t) => {
  const initial = await readyRestoreSourceIndexes(
      oldFactory,
      uid,
      id,
      sourceIndexesRecords({ sources: 2, inlineExtra: true }),
    ),
    root = 'users/' + uid + '/bookRestores/' + id,
    base = 'books/' + initial.bookId,
    body = (await admin.collection(base + '/bookTextBodies').get()).docs[0],
    oldBody = body.data(),
    parts = (await body.ref.collection('chunks').orderBy('__name__').get()).docs,
    beforeParts = partProof(parts),
    journalRef = admin.doc(root + '/materializationArtifacts/' + digest(['text-body', body.id])),
    oldJournal = await journalRef.get();
  assert.equal(Object.hasOwn(oldBody, 'sceneSourceEncoding'), false);
  let progress = initial,
    changed,
    request,
    unit = 0;
  while (!progress.preparation.sourceIndexes?.complete) {
    if (unit > 10) throw new Error('Unexpected source migration loop');
    const nextRequest = mutation(id, progress, 'source-index-native-step' + unit++),
      result = await api.advanceBookRestoreSourceIndexes(uid, nextRequest);
    progress = result.progress;
    if (progress.preparation.sourceIndexes.backfilled === 1 && !changed) {
      changed = await body.ref.get();
      request = nextRequest;
    }
  }
  assert.equal(progress.preparation.sourceIndexes.scanned, 2);
  assert.equal(progress.preparation.sourceIndexes.backfilled, 1);
  assert.equal(progress.preparation.schemaVersion, 12);
  assert.equal(progress.preparation.artifactCount, initial.preparation.artifactCount);
  const current = await body.ref.get(),
    journal = await journalRef.get(),
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + request.operationId)
      .get(),
    { sceneSourceEncoding, ...rest } = current.data();
  assert.equal(sceneSourceEncoding.schemaVersion, 1);
  assert.deepEqual(rest, oldBody);
  assert.ok(current.createTime.isEqual(body.createTime));
  assert.ok(current.updateTime.isEqual(changed.updateTime));
  assert.ok(current.updateTime.isEqual(journal.updateTime));
  assert.ok(current.updateTime.isEqual(receipt.createTime));
  assert.ok(journal.createTime.isEqual(oldJournal.createTime));
  assert.equal(journal.data().createdByOperationId, oldJournal.data().createdByOperationId);
  assert.equal(journal.data().lastOperationId, request.operationId);
  assert.deepEqual(
    partProof((await body.ref.collection('chunks').orderBy('__name__').get()).docs),
    beforeParts,
  );
  assert.equal((await admin.doc(base).get()).exists, false);
  assert.equal((await admin.doc(base + '/workProgress/current').get()).data().countReady, false);
  assert.equal(
    (await admin.doc('users/' + uid + '/aiPersonaRestoreBatches/' + initial.bookId).get()).data()
      .state,
    'preparing',
  );
  // Synthetic reader harness, never a restore activation.
  await admin
    .doc(base)
    .create({ authorId: uid, title: 'Migration reader harness', createdAt: 1, updatedAt: 2 });
  const backup = createBookBackupReadService({ db: admin }),
    resources = createBookBackupResourceService({ db: admin }),
    anchor = await backup.getBookBackupSource(uid, { bookId: initial.bookId }),
    scope = { bookId: initial.bookId, kind: 'scene-source', sourceToken: anchor.sourceToken },
    item = (await resources.listBookBackupResources(uid, scope)).items.find(
      (row) => row.id === current.data().resource.id,
    ),
    observer = observeSceneSourcePartReads(admin),
    output = [];
  let count;
  try {
    for (let index = 0; count === undefined || index < count; index++) {
      const value = await resources.readBookBackupResource(uid, { ...scope, ...item, index });
      count = value.chunkCount;
      output.push(Buffer.from(value.chunkBase64, 'base64'));
    }
  } finally {
    observer.stop();
  }
  assert.equal(
    JSON.parse(Buffer.concat(output).toString('utf8')).data.original.content,
    sourceText,
  );
  assert.ok(observer.counts.every((n) => n <= 4));
  t.diagnostic(
    count +
      ' output pages, ' +
      observer.counts.reduce((a, b) => a + b, 0) +
      ' raw-part get requests after migration',
  );
  await admin.doc(base).delete();
  const migratedReceipt = (await api.advanceBookRestoreSourceIndexes(uid, request)).receipt,
    done = await cleanupLegacyRestore(api, uid, id, progress, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal((await body.ref.get()).exists, false);
  assert.equal((await body.ref.collection('chunks').get()).empty, true);
  assert.deepEqual(
    (await api.advanceBookRestoreSourceIndexes(uid, request)).receipt,
    migratedReceipt,
  );
  assert.equal(
    (await admin.doc('users/' + uid + '/aiPersonaRestoreBatches/' + initial.bookId).get()).data()
      .state,
    'cancelled',
  );
});
test('SDK rejects a recreated source part before backfill and cancellation preserves the unproven incarnation', async () => {
  const p = await readyRestoreSourceIndexes(
      oldFactory,
      uid,
      id,
      sourceIndexesRecords({ content: 'x'.repeat(600000) }),
    ),
    base = 'books/' + p.bookId,
    body = (await admin.collection(base + '/bookTextBodies').get()).docs[0],
    ref = body.ref.collection('chunks').doc('000000000000000'),
    before = await ref.get(),
    data = before.data();
  await ref.delete();
  await ref.create(data);
  const recreated = await ref.get();
  assert.equal(recreated.createTime.isEqual(before.createTime), false);
  await assert.rejects(() =>
    api.advanceBookRestoreSourceIndexes(uid, mutation(id, p, 'source-index-native-block01')),
  );
  assert.equal(Object.hasOwn((await body.ref.get()).data(), 'sceneSourceEncoding'), false);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestores/' + id).get()).data().preparation
      .schemaVersion,
    11,
  );
  await assert.rejects(() => cleanupLegacyRestore(api, uid, id, p, { limit: 5 }));
  assert.ok((await ref.get()).createTime.isEqual(recreated.createTime));
  assert.equal((await admin.doc(base).get()).exists, false);
});
