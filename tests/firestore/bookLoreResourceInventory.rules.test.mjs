import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { resourcePayloadChunkPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
import {
  resourceInventoryFixture,
  registerInventorySource,
  replaceInventorySource,
  retireInventoryGeneration,
  collectInventoryBody,
  drainInventoryBody,
  installInventoryRelationHead,
} from '../../functions/test/helpers/bookLoreResourceInventoryFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-resource-inventory';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
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
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK source inventory protects active bodies, deduplicates concurrent registration and collects 141 parts with header last', async () => {
  const f = await resourceInventoryFixture(admin, {
      data: { name: 'N', category: 'other', details: '🌙'.repeat(2300000) },
    }),
    source = await admin.doc(f.seed.path).get();
  await f.factory().registerBookLoreSourceReference(f.uid, f.request);
  await f.factory().registerBookLoreSourceReference(f.uid, f.request);
  const results = await Promise.all([registerInventorySource(f), registerInventorySource(f)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(
    (await admin.doc(f.controlPath + '/state/current').get()).data().referenceRevision,
    1,
  );
  assert.equal((await admin.doc(f.seed.path).get()).updateTime.isEqual(source.updateTime), true);
  assert.equal((await collectInventoryBody(f)).reason, 'active-head');
  const client = env.authenticatedContext(f.uid).firestore();
  for (const path of [
    f.generationPath,
    f.generationPath + '/state/current',
    f.controlPath,
    f.controlPath + '/state/current',
    f.controlPath + '/events/0000000000000001',
    f.controlPath + '/proofs/0000000000000001',
    f.controlPath + '/references/' + f.generationId,
  ]) {
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { forged: true }));
  }
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  await collectInventoryBody(f);
  const count = f.body.prepared.manifest.chunkCount;
  assert.ok(count > 128);
  let removed = 0;
  while (removed < count) {
    const step = await collectInventoryBody(f);
    assert.ok(step.processed > 0 && step.processed <= 16);
    removed += step.processed;
    assert.equal((await admin.doc(f.body.path).get()).exists, true);
  }
  assert.equal(removed, count);
  assert.equal((await collectInventoryBody(f)).complete, true);
  assert.equal((await admin.doc(f.body.path).get()).exists, false);
  assert.equal((await admin.doc(f.controlPath + '/state/current').get()).data().phase, 'collected');
  assert.equal(
    (await admin.doc(f.controlPath + '/references/' + f.generationId).get()).exists,
    true,
  );
});
test('SDK a recreated native header or chunk is preserved instead of being collected', async () => {
  for (const artifact of ['header', 'chunk']) {
    const f = await resourceInventoryFixture(admin, { bookId: 'case-' + artifact }),
      api = createBookLoreReadService({ db: admin }),
      view = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: f.id });
    await api.readBookLorePart(f.uid, {
      bookId: f.bookId,
      id: f.id,
      readToken: view.readToken,
      section: 'base',
      page: 0,
      index: 0,
    });
    await registerInventorySource(f);
    await replaceInventorySource(f);
    await retireInventoryGeneration(f);
    await collectInventoryBody(f);
    const path =
        artifact === 'header' ? f.body.path : resourcePayloadChunkPath(f.bookId, f.bodyId, 0),
      ref = admin.doc(path),
      value = (await ref.get()).data();
    await ref.delete();
    await ref.create(value);
    await assert.rejects(() => collectInventoryBody(f));
    assert.equal((await ref.get()).exists, true);
    assert.equal((await admin.doc(f.body.path).get()).exists, true);
  }
});
test('SDK current v2 relation generation and any upload lease protect their body', async () => {
  const f = await resourceInventoryFixture(admin, {
    mode: 'v2',
    selector: { section: 'relations', page: 0 },
    relations: Array.from({ length: 128 }, () => ({
      targetEntityId: 't',
      relationType: 'r',
      description: 'literal 🌙',
    })),
  });
  await registerInventorySource(f);
  await installInventoryRelationHead(
    f,
    [
      { pointer: f.seed.newSegments[1].body.pointer, count: 64 },
      { pointer: f.seed.newSegments[0].body.pointer, count: 64 },
    ],
    'moved-after-first-batch',
  );
  await retireInventoryGeneration(f);
  assert.equal((await collectInventoryBody(f, 1)).headScanned, 1);
  const sameHead = (await admin.doc(f.seed.path).get()).data();
  await admin.doc(f.seed.path).delete();
  await admin.doc(f.seed.path).create(sameHead);
  assert.deepEqual((await admin.doc(f.seed.path).get()).data(), sameHead);
  assert.equal((await collectInventoryBody(f, 1)).headScanned, 1);
  assert.equal((await collectInventoryBody(f, 1)).reason, 'active-head');
  assert.equal(
    (await admin.doc(resourcePayloadChunkPath(f.bookId, f.bodyId, 0)).get()).exists,
    true,
  );
  await replaceInventorySource(f);
  const lease = admin.doc('books/' + f.bookId + '/bookResourceLeases/' + f.bodyId);
  await lease.create({ phase: 'adopted' });
  assert.equal((await collectInventoryBody(f)).reason, 'lease');
  await lease.delete();
  await drainInventoryBody(f);
  assert.equal((await admin.doc(f.body.path).get()).exists, false);
});
test('SDK a recreated reference cannot reuse the original immutable ledger event', async () => {
  const f = await resourceInventoryFixture(admin);
  await registerInventorySource(f);
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  const ref = admin.doc(f.controlPath + '/references/' + f.generationId),
    old = (await ref.get()).data();
  await ref.delete();
  await ref.create(old);
  await assert.rejects(() => collectInventoryBody(f));
  assert.equal((await admin.doc(f.body.path).get()).exists, true);
  assert.equal(
    (await admin.doc(resourcePayloadChunkPath(f.bookId, f.bodyId, 0)).get()).exists,
    true,
  );
});
