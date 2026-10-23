import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../../functions/src/bookBackupResourceRead.mjs';
import { serializeBookBackupResource } from '../../functions/src/bookBackupResources.mjs';
import {
  seedIndexedSceneSource,
  observeSceneSourcePartReads,
} from '../../functions/test/helpers/bookSceneSourceEncodingFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-source-encoding';
let admin;
before(() => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(host ?? '')) throw new Error('Dedicated local emulator required.');
  admin = new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await admin.recursiveDelete(admin.collection('books'));
});
after(async () => {
  await admin?.terminate();
});
async function context(content) {
  const f = await seedIndexedSceneSource(admin, content),
    root = createBookBackupReadService({ db: admin }),
    api = createBookBackupResourceService({ db: admin }),
    anchor = await root.getBookBackupSource(f.uid, { bookId: f.bookId }),
    scope = { bookId: f.bookId, sourceToken: anchor.sourceToken, kind: 'scene-source' },
    item = (await api.listBookBackupResources(f.uid, scope)).items[0];
  return { ...f, api, scope, item };
}
test('SDK stores a near-8 MiB indexed source and reconstructs its exact JSON with bounded range reads', async (t) => {
  const f = await context('\ufeff' + 'x'.repeat(8 * 1024 * 1024 - 4096)),
    expected = serializeBookBackupResource('scene-source', null, f.sourceId, f.source),
    observer = observeSceneSourcePartReads(admin),
    chunks = [];
  let count;
  try {
    for (let index = 0; count === undefined || index < count; index++) {
      const r = await f.api.readBookBackupResource(f.uid, { ...f.scope, ...f.item, index });
      count = r.chunkCount;
      chunks.push(Buffer.from(r.chunkBase64, 'base64'));
    }
  } finally {
    observer.stop();
  }
  assert.deepEqual(Buffer.concat(chunks), Buffer.from(expected.bytes));
  assert.equal(count, 128);
  assert.ok(observer.counts.every((n) => n <= 4));
  const body = await admin.doc(f.bodyPath).get();
  assert.equal(body.data().sceneSourceEncoding.offsets.length, 129);
  t.diagnostic(
    count +
      ' output pages, ' +
      observer.counts.reduce((a, b) => a + b, 0) +
      ' raw-part get requests',
  );
});
test('SDK backup proof rejects changed/recreated body while source and root remain identical', async () => {
  const f = await context('source exact '.repeat(60000)),
    bodyRef = admin.doc(f.bodyPath),
    body = await bodyRef.get(),
    value = body.data();
  await bodyRef.update({ pins: 2 });
  await assert.rejects(() =>
    f.api.readBookBackupResource(f.uid, { ...f.scope, ...f.item, index: 0 }),
  );
  await bodyRef.update({ pins: 1 });
  await assert.rejects(() =>
    f.api.readBookBackupResource(f.uid, { ...f.scope, ...f.item, index: 0 }),
  );
  const currentItem = (await f.api.listBookBackupResources(f.uid, f.scope)).items[0],
    parts = (await bodyRef.collection('chunks').get()).docs;
  const remove = admin.batch();
  remove.delete(bodyRef);
  for (const d of parts) remove.delete(d.ref);
  await remove.commit();
  const create = admin.batch();
  create.create(bodyRef, value);
  for (const d of parts) create.create(d.ref, d.data());
  await create.commit();
  assert.equal((await bodyRef.get()).createTime.isEqual(body.createTime), false);
  await assert.rejects(() =>
    f.api.readBookBackupResource(f.uid, { ...f.scope, ...currentItem, index: 0 }),
  );
  const fresh = (await f.api.listBookBackupResources(f.uid, f.scope)).items[0];
  assert.notEqual(fresh.itemToken, currentItem.itemToken);
  await f.api.readBookBackupResource(f.uid, { ...f.scope, ...fresh, index: 0 });
});
