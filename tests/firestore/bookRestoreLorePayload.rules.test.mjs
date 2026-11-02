import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { readBookResourcePayload } from '../../functions/src/bookResourcePayloadRead.mjs';
import {
  readyLargeLore,
  finishLargeLore,
  largeLoreData,
  mutation,
} from '../../functions/test/helpers/bookRestoreLorePayloadFixture.mjs';
import { finishRestoreResources } from '../../functions/test/helpers/bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from '../../functions/test/helpers/bookRestoreCountsFixture.mjs';
import { cleanupLegacyRestore } from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-large-lore',
  uid = 'author',
  id = 'large-lore-sdk001';
let admin, env, factory;
const sha = (value) => createHash('sha256').update(value).digest('hex');
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
test('SDK restores, reconciles and cancels large lore with native journals and closed private payload access', async (t) => {
  const data = largeLoreData(),
    initial = await readyLargeLore(factory, uid, id, data),
    first = await factory().advanceBookRestoreLore(uid, mutation(id, initial, 'large-sdk-first01'));
  assert.equal((await admin.doc('books/' + initial.bookId).get()).exists, false);
  assert.equal((await admin.collection('books/' + initial.bookId + '/lore').get()).size, 0);
  const p = await finishLargeLore(factory, uid, id, first.progress),
    all = (await admin.collection('books/' + p.bookId + '/lore').get()).docs,
    restored = all.find((d) => d.data().payloadStorage),
    storage = restored.data().payloadStorage;
  assert.deepEqual(storage.relations, { present: true, count: 130, pages: 3 });
  const logical = await admin.runTransaction(async (tx) =>
    readBookResourcePayload(tx, admin, {
      uid,
      bookId: p.bookId,
      resource: { kind: 'lore', parentId: null, id: restored.id },
      ...storage.base,
    }),
  );
  assert.equal(sha(logical.details), sha(data.details));
  assert.deepEqual(logical.aliases, data.aliases);
  const resourcePrefix = 'books/' + p.bookId + '/',
    body = await admin
      .doc(resourcePrefix + 'bookResourceBodies/' + storage.base.manifest.bodyId)
      .get();
  assert.ok(body.createTime.isEqual(body.updateTime));
  const nativePart = (
    await admin
      .collection(resourcePrefix + 'bookResourceChunks')
      .where('bodyId', '==', body.id)
      .limit(1)
      .get()
  ).docs[0];
  assert.ok(nativePart.createTime.isEqual(nativePart.updateTime));
  assert.ok(nativePart.createTime.toMillis() <= body.createTime.toMillis());
  const resources = await finishRestoreResources(factory, uid, id, p),
    counted = await finishRestoreCounts(factory, uid, id, resources);
  assert.equal(counted.preparation.phase, 'personas');
  assert.equal(
    (await admin.doc(resourcePrefix + 'workProgress/current').get()).data().countReady,
    false,
  );
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  // Root only for the Rules harness, never an activation or restore milestone.
  await admin.doc('books/' + p.bookId).create({ authorId: uid, deleting: false });
  const client = env.authenticatedContext(uid).firestore();
  await assertFails(getDoc(doc(client, body.ref.path)));
  await assertFails(getDoc(doc(client, nativePart.ref.path)));
  await assertFails(setDoc(doc(client, body.ref.path), body.data()));
  await admin.doc('books/' + p.bookId).delete();
  const done = await cleanupLegacyRestore(factory(), uid, id, counted, { limit: 5 });
  assert.equal(done.preparation.cleanedArtifacts, done.preparation.artifactCount);
  for (const collection of ['bookResourceBodies', 'bookResourceChunks', 'bookLoreSegments', 'lore'])
    assert.equal(
      (
        await admin
          .collection(resourcePrefix + collection)
          .limit(1)
          .get()
      ).size,
      0,
    );
  t.diagnostic(
    'Full upload/validation/lore/count/cancel; ' +
      storage.relations.pages +
      ' relation pages; root absent before/after Rules harness',
  );
});
test('SDK rejects recreation of an orphan part before header, blocks cleanup and preserves the new incarnation', async () => {
  const initial = await readyLargeLore(factory, uid, id, {
      name: 'x'.repeat(600000),
      category: 'other',
    }),
    first = (
      await factory().advanceBookRestoreLore(uid, mutation(id, initial, 'large-sdk-orphan01'))
    ).progress,
    prefix = 'books/' + first.bookId + '/',
    part = (
      await admin
        .collection(prefix + 'bookResourceChunks')
        .limit(1)
        .get()
    ).docs[0];
  assert.equal((await admin.collection(prefix + 'bookResourceBodies').get()).size, 0);
  const value = part.data();
  await part.ref.delete();
  await part.ref.create(value);
  const replacement = await part.ref.get();
  assert.equal(replacement.createTime.isEqual(part.createTime), false);
  await assert.rejects(() => finishLargeLore(factory, uid, id, first));
  await assert.rejects(() => cleanupLegacyRestore(factory(), uid, id, first, { limit: 5 }));
  assert.equal((await part.ref.get()).createTime.isEqual(replacement.createTime), true);
  assert.equal((await admin.doc('books/' + first.bookId).get()).exists, false);
});
