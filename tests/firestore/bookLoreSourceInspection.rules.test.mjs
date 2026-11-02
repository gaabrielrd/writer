import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  sourceInspectionFixture,
  inspectionControl,
  finishSourceInspection,
  sourceInspectionMetadata,
  cancelSourceInspection,
} from '../../functions/test/helpers/bookLoreSourceInspectionFixture.mjs';
import { resourcePayloadChunkPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-source-inspection';
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
test('SDK inspection reads 141 native units, retries a concurrent request and never changes the source; private state remains denied', async () => {
  const f = await sourceInspectionFixture(admin, {
      data: {
        name: 'N',
        category: 'other',
        details: '\ufeff' + '🌙'.repeat(2300000),
        isPublic: true,
      },
    }),
    source = await admin.doc(f.seed.path).get(),
    root = await admin.doc(f.seed.bookPath).get(),
    begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    request = inspectionControl(f, begin),
    results = await Promise.all([
      f.factory().advanceBookLoreSourceInspection(f.uid, request),
      f.factory().advanceBookLoreSourceInspection(f.uid, request),
    ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].progress.nextIndex, 1);
  const client = env.authenticatedContext(f.uid).firestore();
  for (const path of [
    f.c.path,
    f.c.stateRef.path,
    f.c.path + '/operations/' + request.operationId,
    f.c.path + '/operationProofs/' + request.operationId,
  ]) {
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { forged: true }));
  }
  const p = await finishSourceInspection(f, results[0].progress),
    metadata = await sourceInspectionMetadata(f, p);
  assert.ok(p.totalParts > 128);
  assert.equal(p.nextIndex, p.totalParts);
  assert.equal(p.phase, 'ready');
  assert.deepEqual(metadata.isPublic, { present: true, value: true });
  assert.equal((await admin.doc(f.c.stateRef.path).get()).exists, false);
  assert.equal((await admin.doc(f.seed.path).get()).updateTime.isEqual(source.updateTime), true);
  assert.equal((await admin.doc(f.seed.bookPath).get()).updateTime.isEqual(root.updateTime), true);
  await assertFails(getDoc(doc(client, f.c.certificateRef.path)));
  await admin.doc(f.seed.bookPath).delete();
  await cancelSourceInspection(f, p);
  const replay = await f.factory().advanceBookLoreSourceInspection(f.uid, request);
  assert.deepEqual(replay.receipt, results[0].receipt);
  assert.equal(replay.progress.phase, 'cancelled');
  await assert.rejects(() => sourceInspectionMetadata(f, p));
});
test('SDK v2 privacy and date presence are resolved from the source, then revocation blocks reuse', async () => {
  const f = await sourceInspectionFixture(admin, {
      mode: 'v2',
      fields: { isPublic: false, summary: null },
      dates: { updatedAt: 2000 },
    }),
    begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    step = (await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, begin)))
      .progress;
  assert.equal(step.phase, 'privacy');
  assert.equal((await admin.doc(f.c.stateRef.path).get()).exists, false);
  const p = await finishSourceInspection(f, step),
    m = await sourceInspectionMetadata(f, p);
  assert.deepEqual(m.isPublic, { present: true, value: false });
  assert.deepEqual(m.dates, { updatedAt: 2000 });
  assert.equal(m.fields.includes('summary'), false);
  await admin.doc(f.seed.bookPath).update({ authorId: 'other' });
  await assert.rejects(() => sourceInspectionMetadata(f, p));
  assert.equal((await cancelSourceInspection(f, p)).progress.phase, 'cancelled');
});
test('SDK native source recreation interrupts scanning; own cancellation and an early fence remain safe', async () => {
  const f = await sourceInspectionFixture(admin, {
      data: { name: 'N', category: 'other', details: 'x'.repeat(90000) },
    }),
    begin = await f.factory().startBookLoreSourceInspection(f.uid, f.intent),
    first = (await f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, begin)))
      .progress,
    part = admin.doc(resourcePayloadChunkPath(f.bookId, f.seed.base.prepared.manifest.bodyId, 1)),
    data = (await part.get()).data();
  await part.delete();
  await part.create(data);
  await assert.rejects(() =>
    f.factory().advanceBookLoreSourceInspection(f.uid, inspectionControl(f, first)),
  );
  await cancelSourceInspection(f, first);
  assert.equal((await admin.doc(f.c.stateRef.path).get()).exists, false);
  const early = await sourceInspectionFixture(admin, {
      bookId: 'early-book',
      inspectionId: 'early-inspection',
    }),
    fence = await early.factory().cancelBookLoreSourceInspection(early.uid, {
      inspectionId: early.inspectionId,
      startHash: early.startHash,
      operationId: 'early-cancel',
    });
  assert.equal(fence.progress.phase, 'cancelled');
  assert.equal(
    (await early.factory().startBookLoreSourceInspection(early.uid, early.intent)).phase,
    'cancelled',
  );
  assert.equal((await admin.doc(early.c.stateRef.path).get()).exists, false);
});
test('SDK a recreated metadata certificate cannot be rebound to its original completed job', async () => {
  const f = await sourceInspectionFixture(admin),
    p = await finishSourceInspection(f);
  assert.equal((await sourceInspectionMetadata(f, p)).isPublic.value, true);
  const ref = admin.doc(f.c.certificateRef.path),
    old = (await ref.get()).data();
  await ref.delete();
  await ref.create(old);
  await assert.rejects(() => sourceInspectionMetadata(f, p));
});
