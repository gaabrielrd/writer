import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  readyEditorialActivation,
  activateEditorial,
  uid,
} from '../../functions/test/helpers/bookRestoreEditorialActivationFixture.mjs';
import { createLiteraryProductionService } from '../../functions/src/literaryProduction.mjs';
import { createLiteraryPlanningService } from '../../functions/src/literaryPlanning.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS } from '../../functions/src/bookEditorialStorage.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-editorial-activation';
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

// Internal host switch only. This is not the public HTTP/Auth/AppCheck or UI journey.
test('real v2 activation binds its native census, supports normal editorial writers, keeps archive private and deletes the whole book', async () => {
  const f = await readyEditorialActivation({ db: admin });
  const root = 'books/' + f.p.bookId,
    target = { kind: 'book', id: f.p.bookId };
  assert.equal((await admin.doc(root).get()).exists, false);
  const historical = await admin
    .collection(root + '/literaryArchive')
    .orderBy('__name__')
    .limit(50)
    .get();
  const result = await activateEditorial(f);
  assert.equal(result.progress.state, 'activated');
  assert.ok(result.progress.activation.editorial);
  const activated = await admin.doc(root).get();
  const job = await admin.doc(f.root).get();
  const receipt = await admin
    .doc('users/' + uid + '/bookRestoreOperations/' + f.request.operationId)
    .get();
  assert.equal(activated.createTime.isEqual(job.updateTime), true);
  assert.equal(activated.createTime.isEqual(receipt.createTime), true);
  assert.equal(activated.data().status, 'draft');
  assert.equal(activated.data().hasLiteraryResources, true);
  assert.equal(activated.data().literaryContextRevision, 1);
  const owner = environment.authenticatedContext(uid).firestore();
  await assertSucceeds(getDoc(doc(owner, root)));
  await assertFails(updateDoc(doc(owner, root), { literaryContextRevision: 0 }));
  for (const actor of [uid, 'other']) {
    const sdk = environment.authenticatedContext(actor).firestore();
    for (const item of historical.docs) await assertFails(getDoc(doc(sdk, item.ref.path)));
    await assertFails(getDoc(doc(sdk, root + '/literaryRestoreReviews/contract')));
  }
  const contractApi = createLiteraryProductionService({ db: admin, now: () => 5000 });
  const current = await contractApi.getLiteraryContract(uid, { target });
  const contract = structuredClone(current.contract);
  contract.fields.premise = 'Own edited restored premise';
  assert.equal(
    (
      await contractApi.saveLiteraryContract(uid, {
        target,
        operationId: 'sdk-restored-contract-edit',
        expectedRevision: 1,
        contract,
      })
    ).revision,
    2,
  );
  const plans = await admin
    .collection(root + '/literaryPlans')
    .orderBy('__name__')
    .limit(10)
    .get();
  assert.equal(plans.size, 1);
  const plan = { ...plans.docs[0].data().plan, title: 'Own edited restored plan' };
  assert.equal(plan.status, 'proposal');
  assert.deepEqual(plan.references, []);
  const planApi = createLiteraryPlanningService({ db: admin, now: () => 6000 });
  assert.equal(
    (
      await planApi.saveLiteraryPlan(uid, {
        target,
        id: plans.docs[0].id,
        operationId: 'sdk-restored-plan-edit',
        expectedRevision: 1,
        plan,
      })
    ).revision,
    2,
  );
  assert.equal((await admin.doc(root).get()).data().literaryContextRevision, 3);
  for (const item of historical.docs) {
    const fresh = await item.ref.get();
    assert.equal(fresh.updateTime.isEqual(item.updateTime), true);
    assert.deepEqual(fresh.data(), item.data());
  }
  assert.equal((await admin.doc('publicBooks/' + f.p.bookId).get()).exists, false);
  await admin.doc(root).update({ deleting: true });
  let removed = false;
  for (let unit = 0; unit < 1000; unit++) {
    const outcome = await createScenesService({ db: admin, now: () => 7000 }).deleteSceneBook(uid, {
      target,
      operationId: 'sdk-delete-activated-editorial',
      limit: 10,
    });
    if (outcome.complete) {
      removed = true;
      break;
    }
  }
  assert.equal(removed, true);
  assert.equal((await admin.doc(root).get()).exists, false);
  for (const name of [
    ...Object.values(BOOK_EDITORIAL_HISTORY_COLLECTIONS),
    'literaryProduction',
    'literaryPlans',
    'literaryContractVersions',
    'literaryPlanVersions',
  ])
    assert.equal(
      (
        await admin
          .collection(root + '/' + name)
          .limit(1)
          .get()
      ).empty,
      true,
    );
  assert.deepEqual((await f.factory().activateBookRestore(uid, f.request)).receipt, result.receipt);
});
