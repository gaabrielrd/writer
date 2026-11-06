import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  readyEditableEditorial,
  finishEditableEditorial,
} from '../../functions/test/helpers/bookRestoreEditorialHeadsFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { uid } from '../../functions/test/helpers/bookRestoreEditorialFixture.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-editorial-census';
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use somente o emulador demo local.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(() => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
// Real native Admin/SDK metadata and transactions; private host option only.
// This does not expose v2, exercise HTTP Auth/AppCheck or activate a project.
test('real native v2 upload through editable preparation and final census remains private, then cancellation invalidates the certificate and drains all resources', async () => {
  const f = await readyEditableEditorial({ db: admin });
  let p = await finishEditableEditorial(f);
  for (let unit = 0; unit < 1000; unit++) {
    const metadata = await f
      .factory()
      .getBookRestoreEditorial(uid, { restoreId: f.id, jobToken: p.jobToken });
    if (metadata.audit?.phase === 'done') break;
    p = (
      await f
        .factory()
        .advanceBookRestoreEditorialAudit(uid, mutation(f.id, p, f.id + '-sdk-census-' + unit))
    ).progress;
  }
  const current = (await admin.doc(f.root + '/preparedEditorial/current').get()).data();
  const job = (await admin.doc(f.root).get()).data();
  assert.equal(current.census?.phase, 'done');
  assert.equal(
    current.census.checkedPhysical,
    job.preparation.artifactCount - (job.preparation.retiredArtifacts ?? 0),
  );
  assert.equal(
    job.preparation.audit.checkedArtifacts,
    current.baseArtifacts - (job.preparation.retiredArtifacts ?? 0),
  );
  assert.equal(
    job.preparation.editorialAddedArtifacts,
    job.preparation.artifactCount - current.baseArtifacts,
  );
  const [control, seal, jobSnapshot] = await admin.getAll(
    admin.doc(f.root + '/preparedEditorial/current'),
    admin.doc('users/' + uid + '/bookRestoreOperations/' + current.census.sealOperationId),
    admin.doc(f.root),
  );
  assert.ok(control.updateTime.isEqual(seal.createTime));
  assert.ok(control.updateTime.isEqual(jobSnapshot.updateTime));
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  for (const actor of [uid, 'other']) {
    const sdk = environment.authenticatedContext(actor).firestore();
    for (const path of [
      f.root + '/preparedEditorial/current',
      'books/' + p.bookId + '/literaryProduction/current',
      'books/' + p.bookId + '/literaryRestoreReviews/contract',
    ]) {
      await assertFails(getDoc(doc(sdk, path)));
      await assertFails(setDoc(doc(sdk, path), { injected: true }));
    }
  }
  const proof = await f
    .factory()
    .openVerifiedBookRestoreEditorialAudit(uid, { restoreId: f.id, jobToken: p.jobToken });
  await admin.runTransaction((tx) => proof.verify(tx));
  p = (await f.factory().cancelBookRestore(uid, mutation(f.id, p, f.id + '-sdk-cancel'))).progress;
  await assert.rejects(() =>
    admin.runTransaction(async (tx) => {
      await proof.verify(tx);
      tx.create(admin.doc('books/' + p.bookId), { unauthorized: true });
    }),
  );
  p = await cleanupLegacyRestore(f.factory(), uid, f.id, p, { limit: 50 });
  assert.equal(p.state, 'cancelled');
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  for (const name of [
    'literaryArchive',
    'literaryArchiveBodies',
    'literaryArchiveParts',
    'literaryProduction',
    'literaryContractVersions',
    'literaryPlans',
    'literaryPlanVersions',
    'literaryRestoreReviews',
  ])
    assert.equal(
      (
        await admin
          .collection('books/' + p.bookId + '/' + name)
          .limit(1)
          .get()
      ).empty,
      true,
    );
});
