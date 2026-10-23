import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../../functions/src/bookBackupResourceRead.mjs';
import {
  largeSceneSourceFixture,
  sourceText,
} from '../../functions/test/helpers/bookSceneSourceFixture.mjs';
import {
  readyRestoreCounts,
  finishRestoreCounts,
} from '../../functions/test/helpers/bookRestoreCountsFixture.mjs';
import { cleanupLegacyRestore } from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { observeSceneSourcePartReads } from '../../functions/test/helpers/bookSceneSourceEncodingFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-scene-source-text',
  uid = 'author',
  id = 'scene-source-sdk01';
let env, admin;
const factory = () => createBookRestoreUploadService({ db: admin });
async function ready() {
  return finishRestoreCounts(
    factory,
    uid,
    id,
    await readyRestoreCounts(factory, uid, id, largeSceneSourceFixture()),
  );
}
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
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});

test('SDK restores a >1 MiB frozen source, serves exact pages/backup and cancels through existing inventories', async (t) => {
  const p = await ready(),
    base = 'books/' + p.bookId,
    source = (await admin.collection(base + '/sceneSources').get()).docs[0],
    descriptor = source.data().original.contentStorage,
    body = await admin.doc(base + '/bookTextBodies/' + descriptor.bodyId).get(),
    chunks = (await body.ref.collection('chunks').orderBy('__name__').get()).docs;
  assert.equal(source.data().original.content, null);
  assert.equal((await admin.doc(base).get()).exists, false);
  assert.equal((await admin.doc(base + '/workProgress/current').get()).data().countReady, false);
  assert.ok(body.createTime.isEqual(source.createTime));
  assert.equal(body.data().sceneSourceEncoding.schemaVersion, 1);
  assert.ok(chunks.every((d) => d.createTime.isEqual(source.createTime)));
  const own = env.authenticatedContext(uid).firestore();
  await assertFails(getDoc(doc(own, body.ref.path)));
  await assertFails(getDoc(doc(own, chunks[0].ref.path)));
  // Synthetic authorized root only exercises readers; no restore activation is claimed.
  const root = admin.doc(base),
    rootValue = {
      authorId: uid,
      title: 'Source harness',
      createdAt: 1,
      updatedAt: 2,
      sceneRevision: 0,
    };
  await root.create(rootValue);
  const scenes = createScenesService({ db: admin }),
    target = { kind: 'book', id: p.bookId },
    row = (await scenes.listSceneSources(uid, { target, expectedProjectRevision: 0 })).items[0],
    bytes = [];
  for (let index = 0; index < row.contentStorage.chunkCount; index++) {
    const result = await scenes.readSceneSourceText(uid, {
      target,
      sourceId: row.id,
      sourceToken: row.sourceToken,
      expectedProjectRevision: 0,
      index,
    });
    bytes.push(Buffer.from(result.chunkBase64, 'base64'));
  }
  assert.equal(
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(bytes)),
    sourceText,
  );
  const backup = createBookBackupReadService({ db: admin }),
    resources = createBookBackupResourceService({ db: admin }),
    start = await backup.getBookBackupSource(uid, { bookId: p.bookId }),
    scope = { bookId: p.bookId, kind: 'scene-source', sourceToken: start.sourceToken },
    item = (await resources.listBookBackupResources(uid, scope)).items[0],
    parts = [];
  let count;
  const observer = observeSceneSourcePartReads(admin);
  try {
    for (let index = 0; count === undefined || index < count; index++) {
      const result = await resources.readBookBackupResource(uid, { ...scope, ...item, index });
      count = result.chunkCount;
      parts.push(Buffer.from(result.chunkBase64, 'base64'));
    }
  } finally {
    observer.stop();
  }
  assert.ok(observer.counts.every((n) => n <= 4));
  t.diagnostic(
    count +
      ' output pages, ' +
      observer.counts.reduce((a, b) => a + b, 0) +
      ' raw-part get requests',
  );
  const portable = JSON.parse(Buffer.concat(parts).toString('utf8'));
  assert.equal(portable.data.original.content, sourceText);
  assert.equal('contentStorage' in portable.data.original, false);
  await root.delete();
  await root.create(rootValue);
  await assert.rejects(() =>
    scenes.readSceneSourceText(uid, {
      target,
      sourceId: row.id,
      sourceToken: row.sourceToken,
      expectedProjectRevision: 0,
      index: 0,
    }),
  );
  await root.delete();
  const done = await cleanupLegacyRestore(factory(), uid, id, p, { limit: 5 });
  assert.equal(done.state, 'cancelled');
  assert.equal((await admin.collection(base + '/bookTextBodies').get()).empty, true);
  assert.equal((await body.ref.collection('chunks').get()).empty, true);
});

test('SDK source cancellation preserves a recreated native chunk instead of inheriting its old journal', async () => {
  const p = await ready(),
    base = 'books/' + p.bookId,
    source = (await admin.collection(base + '/sceneSources').get()).docs[0],
    ref = admin.doc(
      base +
        '/bookTextBodies/' +
        source.data().original.contentStorage.bodyId +
        '/chunks/000000000000000',
    ),
    before = await ref.get(),
    value = before.data();
  await ref.delete();
  await ref.create(value);
  const recreated = await ref.get();
  assert.equal(recreated.createTime.isEqual(before.createTime), false);
  await assert.rejects(() => cleanupLegacyRestore(factory(), uid, id, p, { limit: 5 }));
  const current = await ref.get();
  assert.ok(current.createTime.isEqual(recreated.createTime));
  assert.deepEqual(current.data(), value);
  assert.equal((await admin.doc(base).get()).exists, false);
});

test('SDK keeps source bodies private with an existing owned root while the server reader remains authorized', async () => {
  const { prepareRestoredBookSceneSource } =
      await import('../../functions/src/bookSceneSourceText.mjs'),
    { digest } = await import('../../functions/src/sceneContracts.mjs'),
    bookId = 'existing-source-book',
    sourceId = 'chapter',
    plan = prepareRestoredBookSceneSource({
      uid,
      bookId,
      sourceId,
      operationId: 'source-rules-plan01',
      timestamp: 1,
      source: {
        hash: digest(sourceText),
        original: { title: 'Original', order: 1, content: sourceText },
      },
    });
  await admin.runTransaction(async (tx) => {
    tx.create(admin.doc('books/' + bookId), {
      authorId: uid,
      title: 'Existing',
      sceneRevision: 0,
      createdAt: 1,
      updatedAt: 2,
    });
    tx.create(admin.doc('books/' + bookId + '/sceneSources/' + sourceId), plan.value);
    for (const w of plan.writes) {
      const [bodyId, index] = w.id.split(':');
      tx.create(
        admin.doc(
          'books/' + bookId + '/bookTextBodies/' + bodyId + (index ? '/chunks/' + index : ''),
        ),
        w.value,
      );
    }
  });
  const path = 'books/' + bookId + '/bookTextBodies/' + plan.value.original.contentStorage.bodyId;
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    await assertFails(getDoc(doc(actor.firestore(), path)));
    await assertFails(getDoc(doc(actor.firestore(), path + '/chunks/000000000000000')));
  }
  const scenes = createScenesService({ db: admin }),
    target = { kind: 'book', id: bookId },
    row = (await scenes.listSceneSources(uid, { target, expectedProjectRevision: 0 })).items[0],
    part = await scenes.readSceneSourceText(uid, {
      target,
      sourceId,
      expectedProjectRevision: 0,
      sourceToken: row.sourceToken,
      index: 0,
    });
  assert.equal(Buffer.from(part.chunkBase64, 'base64').length, 65536);
  await admin.doc('books/' + bookId).update({ deleting: true });
  await assert.rejects(() =>
    scenes.readSceneSourceText(uid, {
      target,
      sourceId,
      expectedProjectRevision: 0,
      sourceToken: row.sourceToken,
      index: 0,
    }),
  );
});
