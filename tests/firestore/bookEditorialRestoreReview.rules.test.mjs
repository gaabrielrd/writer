import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  readyRestoreReview,
  reviewRequest,
  selectCurrentAct,
  uid,
} from '../../functions/test/helpers/bookEditorialRestoreReviewFixture.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as names } from '../../functions/src/bookEditorialStorage.mjs';
import { createLiteraryPlanningService } from '../../functions/src/literaryPlanning.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-editorial-restore-review';
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
// Real source2 activation, current source selection and native timestamps. No HTTP/Auth/AppCheck or public UI claim.
test('native reference reconciliation commits plan/version/index and acknowledgement atomically, keeps SDK private and deletes both review stores', async () => {
  const f = await readyRestoreReview({ db: admin }),
    reference = await selectCurrentAct(f);
  const request = await reviewRequest(f, {
    decision: 'reconcile-references',
    references: [reference],
  });
  const result = await f.factory().reviewBookEditorialRestore(uid, request);
  const root = 'books/' + f.p.bookId;
  const plan = await admin.doc(root + '/literaryPlans/' + f.planId).get();
  const resolution = await admin.doc(root + '/' + names.resolutions + '/' + f.planId).get();
  const operation = await admin
    .doc(root + '/' + names.operations + '/' + request.operationId)
    .get();
  const book = await admin.doc(root).get();
  assert.equal(plan.data().revision, 2);
  assert.deepEqual(plan.data().plan.references, [reference]);
  assert.equal(resolution.createTime.isEqual(operation.createTime), true);
  assert.equal(plan.updateTime.isEqual(operation.createTime), true);
  assert.equal(book.updateTime.isEqual(operation.createTime), true);
  assert.equal(
    (await f.factory().getBookEditorialRestoreReview(uid, { bookId: f.p.bookId, id: f.planId }))
      .reviewState,
    'acknowledged',
  );
  for (const actor of [uid, 'other']) {
    const sdk = environment.authenticatedContext(actor).firestore();
    for (const path of [resolution.ref.path, operation.ref.path]) {
      await assertFails(getDoc(doc(sdk, path)));
      await assertFails(setDoc(doc(sdk, path), { forged: true }));
    }
  }
  await admin.doc(root + '/acts/' + reference.id).delete();
  assert.deepEqual(await f.factory().reviewBookEditorialRestore(uid, request), result);
  const native = await createLiteraryPlanningService({ db: admin }).getLiteraryPlan(uid, {
    target: f.target,
    id: f.planId,
  });
  assert.equal(native.sources[0].available, false);
  await admin.doc(root).update({ deleting: true });
  let complete = false;
  for (let unit = 0; unit < 1000; unit++) {
    const response = await createScenesService({ db: admin, now: () => 12000 }).deleteSceneBook(
      uid,
      { target: f.target, operationId: 'sdk-delete-acknowledged-copy', limit: 10 },
    );
    if (response.complete) {
      complete = true;
      break;
    }
  }
  assert.equal(complete, true);
  for (const name of [names.resolutions, names.operations])
    assert.equal(
      (
        await admin
          .collection(root + '/' + name)
          .limit(1)
          .get()
      ).empty,
      true,
    );
});

test('native stale basis and source revocation refuse writes, while concurrent acknowledgements commit only one resolution', async () => {
  const f = await readyRestoreReview({ db: admin }),
    reference = await selectCurrentAct(f);
  const old = await reviewRequest(f);
  const api = createLiteraryPlanningService({ db: admin, now: () => 11000 });
  const path = 'books/' + f.p.bookId + '/literaryPlans/' + f.planId;
  const current = (await admin.doc(path).get()).data();
  await api.saveLiteraryPlan(uid, {
    target: f.target,
    id: f.planId,
    operationId: 'sdk-own-edit-before-review',
    expectedRevision: 1,
    plan: { ...current.plan, title: 'Own newer title' },
  });
  await assert.rejects(() => f.factory().reviewBookEditorialRestore(uid, old));
  const request = await reviewRequest(f, {
    decision: 'reconcile-references',
    references: [reference],
  });
  await admin.doc('books/' + f.p.bookId + '/acts/' + reference.id).delete();
  const before = await admin.doc(path).get();
  await assert.rejects(() => f.factory().reviewBookEditorialRestore(uid, request));
  assert.equal((await admin.doc(path).get()).updateTime.isEqual(before.updateTime), true);
  const keep = await reviewRequest(f, { operationId: 'sdk-concurrent-review-a' });
  const results = await Promise.allSettled([
    f.factory().reviewBookEditorialRestore(uid, keep),
    f
      .factory()
      .reviewBookEditorialRestore(uid, { ...keep, operationId: 'sdk-concurrent-review-b' }),
  ]);
  assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(
    (
      await admin
        .collection('books/' + f.p.bookId + '/' + names.resolutions)
        .limit(2)
        .get()
    ).size,
    1,
  );
});
