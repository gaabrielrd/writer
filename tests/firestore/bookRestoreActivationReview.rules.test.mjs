import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import {
  readyAudit,
  finishAudit,
  uid,
} from '../../functions/test/helpers/bookRestoreAuditFixture.mjs';
import { universeRestoreFixture } from '../../functions/test/helpers/bookRestoreUniverseFixture.mjs';
import { born } from '../../functions/src/bookRestoreUploadContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-review';
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
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK activation review preserves native preparation, reauthorizes the universe and rejects a recreated seal', async () => {
  const universe = admin.doc('universes/world');
  await universe.create({ authorId: uid, bookCount: 0, name: 'GLOBAL NAME NOT FOR REVIEW' });
  const origin = { kind: 'reference', id: 'world', created: born(await universe.get()) },
    f = await readyAudit({ db: admin, records: universeRestoreFixture(origin) });
  f.p = await finishAudit(f);
  const job = await admin.doc(f.root).get(),
    control = await admin.doc('books/' + f.p.bookId + '/workProgress/current').get(),
    profiles = await admin
      .collection('books/' + f.p.bookId + '/lore')
      .limit(1)
      .get(),
    input = { restoreId: f.id, jobToken: f.p.jobToken },
    review = () => f.factory().getBookRestoreActivationReview(uid, input),
    first = await review();
  assert.deepEqual(await review(), first);
  assert.equal(first.summary.universe.observed, 'available');
  assert.equal(first.summary.universe.universeId, 'world');
  assert.equal(JSON.stringify(first).includes('GLOBAL'), false);
  for (const original of [job, control]) {
    const current = await original.ref.get();
    assert.deepEqual(current.data(), original.data());
    assert.equal(current.updateTime.isEqual(original.updateTime), true);
  }
  assert.equal((await universe.get()).data().bookCount, 0);
  assert.equal((await admin.doc('books/' + f.p.bookId).get()).exists, false);
  assert.ok(profiles.docs[0]?.exists);
  await assertFails(
    getDoc(doc(env.authenticatedContext(uid).firestore(), profiles.docs[0].ref.path)),
  );
  await universe.update({ authorId: 'other' });
  const unavailable = await review();
  assert.notEqual(first.reviewToken, unavailable.reviewToken);
  assert.equal(unavailable.summary.universe.observed, 'unavailable');
  assert.equal(unavailable.summary.universe.universeId, null);
  const seal = admin.doc(
      'users/' + uid + '/bookRestoreOperations/' + f.p.preparation.audit.sealOperationId,
    ),
    value = (await seal.get()).data();
  await seal.delete();
  await seal.create(value);
  await assert.rejects(review);
  assert.deepEqual((await seal.get()).data(), value);
  assert.equal((await admin.doc(f.root).get()).data().checkpoint, job.data().checkpoint);
  assert.equal((await admin.doc('books/' + f.p.bookId).get()).exists, false);
});
