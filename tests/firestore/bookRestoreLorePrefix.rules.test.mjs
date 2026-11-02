import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { readBookResourcePayload } from '../../functions/src/bookResourcePayloadRead.mjs';
import { lorePayloadSegmentId } from '../../functions/src/bookRestoreLorePayload.mjs';
import {
  readyLegacyPrefix,
  prefixEntity,
  prefixData,
  mutation,
} from '../../functions/test/helpers/bookRestoreLorePrefixFixture.mjs';
import { finishLargeLore } from '../../functions/test/helpers/bookRestoreLorePayloadFixture.mjs';
import { finishRestoreResources } from '../../functions/test/helpers/bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from '../../functions/test/helpers/bookRestoreCountsFixture.mjs';
import { cleanupLegacyRestore } from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-prefix',
  uid = 'author',
  id = 'lore-prefix-sdk001',
  sha = (value) => createHash('sha256').update(value).digest('hex');
let env, admin, factory;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Dedicated loopback emulator required');
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
  factory = () => createBookRestoreUploadService({ db: admin });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK migrates a genuine native v6 prefix, preserves its birthday/receipt and counts each relation once', async (t) => {
  const old = await readyLegacyPrefix(factory, admin, uid, id, { pages: 2, prior: true }),
    initial = old.progress,
    path = 'books/' + initial.bookId + '/lore/' + prefixEntity(initial),
    ref = admin.doc(path),
    prefix = await ref.get(),
    journalRef = admin.doc(
      'users/' +
        uid +
        '/bookRestores/' +
        id +
        '/materializationArtifacts/' +
        sha(JSON.stringify(['lore', prefixEntity(initial)])),
    ),
    journal = await journalRef.get(),
    first = (
      await factory().advanceBookRestoreLore(uid, mutation(id, initial, 'prefix-sdk-migrate01'))
    ).progress;
  assert.equal(prefix.data().relations.length, 128);
  assert.equal(initial.preparation.loreRelationCount, 130);
  assert.equal(first.preparation.loreRelationCount, 130);
  assert.equal(first.preparation.relationOffset, 0);
  assert.equal((await ref.get()).updateTime.isEqual(prefix.updateTime), true);
  for (const r of old.receipts)
    assert.deepEqual((await factory().advanceBookRestoreLore(uid, r.request)).receipt, r.receipt);
  const done = await finishLargeLore(factory, uid, id, first),
    current = await ref.get(),
    metadata = await journalRef.get();
  assert.equal(done.preparation.loreRelationCount, 202);
  assert.equal(done.preparation.loreCount, 3);
  assert.equal(current.createTime.isEqual(prefix.createTime), true);
  assert.equal(current.updateTime.isEqual(prefix.updateTime), false);
  assert.equal(metadata.createTime.isEqual(journal.createTime), true);
  assert.equal(metadata.updateTime.isEqual(current.updateTime), true);
  assert.equal(metadata.data().createdByOperationId, old.receipts[0].request.operationId);
  const last = await admin
    .doc('users/' + uid + '/bookRestoreOperations/' + metadata.data().lastOperationId)
    .get();
  assert.equal(last.createTime.isEqual(current.updateTime), true);
  const storage = current.data().payloadStorage,
    values = [];
  for (let offset = 0; offset < 200; offset += 64) {
    const segment = (
      await admin
        .doc(
          'books/' +
            done.bookId +
            '/bookLoreSegments/' +
            lorePayloadSegmentId(storage.generationId, offset),
        )
        .get()
    ).data();
    values.push(
      ...(await admin.runTransaction(async (tx) =>
        readBookResourcePayload(tx, admin, {
          uid,
          bookId: done.bookId,
          resource: { kind: 'lore', parentId: null, id: prefixEntity(done) },
          ...segment.payload,
        }),
      )),
    );
  }
  assert.equal(values.length, 200);
  assert.equal(
    sha(JSON.stringify(values.map((v) => v.description))),
    sha(JSON.stringify(old.data.relations.map((v) => v.description))),
  );
  assert.equal(values[0].targetEntityId, prefixEntity(done));
  assert.equal(values[1].targetEntityId, 'universe:gone:external');
  const resources = await finishRestoreResources(factory, uid, id, done),
    counted = await finishRestoreCounts(factory, uid, id, resources);
  assert.equal(counted.preparation.phase, 'personas');
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
  const terminal = await cleanupLegacyRestore(factory(), uid, id, counted, { limit: 5 });
  assert.equal(terminal.preparation.cleanedArtifacts, terminal.preparation.artifactCount);
  assert.equal((await ref.get()).exists, false);
  for (const r of old.receipts)
    assert.deepEqual((await factory().advanceBookRestoreLore(uid, r.request)).receipt, r.receipt);
  t.diagnostic(
    '128-entry inline prefix -> 200 entries in 4 payload pages; global total 130 -> 202 with earlier lore; no activated root',
  );
});
test('SDK refuses a prefix recreated during migration and preserves that incarnation when cleanup blocks', async () => {
  const old = await readyLegacyPrefix(factory, admin, uid, id, {
      data: prefixData({ count: 130, descriptionBytes: 0, details: 'x'.repeat(600000) }),
    }),
    first = (
      await factory().advanceBookRestoreLore(
        uid,
        mutation(id, old.progress, 'prefix-sdk-foreign01'),
      )
    ).progress,
    ref = admin.doc('books/' + first.bookId + '/lore/' + prefixEntity(first)),
    before = await ref.get();
  await ref.delete();
  await ref.create(before.data());
  const foreign = await ref.get();
  assert.equal(foreign.createTime.isEqual(before.createTime), false);
  await assert.rejects(() =>
    factory().advanceBookRestoreLore(uid, mutation(id, first, 'prefix-sdk-refuse01')),
  );
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestores/' + id).get()).data().checkpoint,
    first.checkpoint,
  );
  await assert.rejects(() => cleanupLegacyRestore(factory(), uid, id, first, { limit: 5 }));
  assert.equal((await ref.get()).createTime.isEqual(foreign.createTime), true);
  assert.equal((await admin.doc('books/' + first.bookId).get()).exists, false);
});
