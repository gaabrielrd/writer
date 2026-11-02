import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { streamBodyFixture } from '../../functions/test/helpers/bookRestoreStreamBodyFixture.mjs';
import { prepareBookResourcePayload } from '../../functions/src/bookResourcePayload.mjs';
import {
  openBookResourcePayload,
  readBookResourcePayloadPart,
} from '../../functions/src/bookResourcePayloadRead.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
import { bornEqual } from '../../functions/src/bookRestoreUploadContracts.mjs';
import { cleanupLegacyRestore } from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-stream-body';
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
function expected(f, value) {
  return prepareBookResourcePayload({
    uid: f.uid,
    bookId: f.view.bookId,
    resource: { kind: 'lore', parentId: null, id: f.input.entityId },
    operationId: digest(['restore-lore-stream', f.input.generationOperationId, f.input.target]),
    timestamp: f.input.timestamp,
    value,
  });
}
test('SDK stream body: partial staging, odd Merkle tree and immutable final parts match the native codec while all SDK reads stay denied', async () => {
  const value = Array.from({ length: 64 }, (_, i) => ({
      targetEntityId: 'entity',
      relationType: '',
      ...(i === 63 ? { description: '\ufeff' + 'x'.repeat(130000) } : {}),
    })),
    f = await streamBodyFixture(value, { db: admin, field: 'relations' }),
    result = await f.finish(),
    want = expected(
      f,
      value.map((v) => ({ ...v, targetEntityId: f.input.entityId })),
    );
  assert.equal(want.manifest.chunkCount, 3);
  assert.deepEqual(result.pointer.manifest, want.manifest);
  for (let index = 0; index < want.manifest.chunkCount; index++)
    await admin.runTransaction(async (tx) => {
      const opened = await openBookResourcePayload(tx, admin, {
          uid: f.uid,
          bookId: f.view.bookId,
          resource: { kind: 'lore', parentId: null, id: f.input.entityId },
          ...result.pointer,
        }),
        bytes = await readBookResourcePayloadPart(tx, admin, opened, index);
      assert.deepEqual(bytes, want.part(index).bytes);
    });
  const packed = await admin
    .collection('books/' + f.view.bookId + '/bookResourceChunks')
    .where('stageKind', '==', 'restore-lore-stream/packed')
    .limit(10)
    .get();
  assert.ok(
    packed.docs.some((snapshot) => !bornEqual(snapshot, { createTime: snapshot.updateTime })),
  );
  const stage = (
    await admin
      .collection('books/' + f.view.bookId + '/bookResourceChunks')
      .where('stageKind', '==', 'restore-lore-stream/fragment')
      .limit(1)
      .get()
  ).docs[0];
  assert.ok(stage);
  for (const path of [
    stage.ref.path,
    'books/' + f.view.bookId + '/bookResourceBodies/' + result.controlId,
    'books/' + f.view.bookId + '/bookResourceBodies/' + want.manifest.bodyId,
  ]) {
    assert.equal((await admin.doc(path).get()).exists, true);
    for (const actor of [
      env.authenticatedContext(f.uid),
      env.authenticatedContext('other'),
      env.unauthenticatedContext(),
    ])
      await assertFails(getDoc(doc(actor.firestore(), path)));
  }
  assert.equal((await admin.doc('books/' + f.view.bookId).get()).exists, false);
});
test('SDK stream body: empty target fragments preserve updateTime invariants and real cancellation cleans every enrolled namespace', async () => {
  const value = [{ targetEntityId: 'entity', relationType: '' }],
    f = await streamBodyFixture(value, { db: admin, field: 'relations', fragmentLimit: 1 }),
    result = await f.finish(),
    want = expected(f, [{ ...value[0], targetEntityId: f.input.entityId }]);
  assert.deepEqual(result.pointer.manifest, want.manifest);
  const zero = await admin
    .collection('books/' + f.view.bookId + '/bookResourceChunks')
    .where('stageKind', '==', 'restore-lore-stream/fragment')
    .limit(100)
    .get();
  assert.ok(zero.docs.some((s) => s.data().bytes.length === 0));
  const done = await cleanupLegacyRestore(f.factory(), f.uid, f.id, f.view, {
    limit: 5,
    prefix: f.id + '-sdk-clean-',
  });
  assert.equal(done.state, 'cancelled');
  for (const name of ['bookResourceBodies', 'bookResourceChunks', 'bookLoreSegments'])
    assert.equal(
      (
        await admin
          .collection('books/' + f.view.bookId + '/' + name)
          .limit(1)
          .get()
      ).empty,
      true,
    );
  assert.equal(
    (
      await admin
        .collection(f.path + '/materializationArtifacts')
        .limit(1)
        .get()
    ).empty,
    true,
  );
});
test('SDK stream body: recreated native control is neither adopted nor deleted by cancellation cleanup', async () => {
  const f = await streamBodyFixture('literal', { db: admin }),
    first = await f.step(),
    ref = admin.doc('books/' + f.view.bookId + '/bookResourceBodies/' + first.controlId),
    original = await ref.get();
  assert.equal(first.progress.phase, 'pack');
  await ref.delete();
  await ref.create(original.data());
  await assert.rejects(() => f.finish());
  await assert.rejects(() =>
    cleanupLegacyRestore(f.factory(), f.uid, f.id, f.view, {
      limit: 5,
      prefix: f.id + '-sdk-aba-',
    }),
  );
  assert.deepEqual((await ref.get()).data(), original.data());
  assert.equal((await admin.doc('books/' + f.view.bookId).get()).exists, false);
});
