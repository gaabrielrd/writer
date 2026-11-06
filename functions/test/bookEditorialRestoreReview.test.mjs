import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readyRestoreReview,
  reviewRequest,
  selectCurrentAct,
  uid,
} from './helpers/bookEditorialRestoreReviewFixture.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { BOOK_RESTORE_METHODS } from '../src/bookRestoreUploadContracts.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as names } from '../src/bookEditorialStorage.mjs';
import {
  readyEditorialActivation,
  activateEditorial,
} from './helpers/bookRestoreEditorialActivationFixture.mjs';
import { finishEditorialSourceCleanup } from './helpers/bookEditorialHistoryFixture.mjs';
const root = (f) => 'books/' + f.p.bookId;
const planPath = (f) => root(f) + '/literaryPlans/' + f.planId;
const state = (f, id = f.planId) =>
  f.factory().getBookEditorialRestoreReview(uid, { bookId: f.p.bookId, id });
const apply = (f, request) => f.factory().reviewBookEditorialRestore(uid, request);
const snapshot = (f) => structuredClone([...f.records]);
const pending = (f) =>
  structuredClone(
    [...f.records].filter(([path]) =>
      /\/(literaryArchive|literaryArchiveBodies|literaryArchiveParts|literaryRestoreReviews)\//.test(
        path,
      ),
    ),
  );

test('keep-current acknowledges once without changing current text, contract mode, plan or historical bytes', async () => {
  const f = await readyRestoreReview(),
    before = pending(f),
    plan = structuredClone(f.records.get(planPath(f)));
  const book = structuredClone(f.records.get(root(f))),
    request = await reviewRequest(f);
  const result = await apply(f, request),
    after = await state(f);
  assert.equal(result.receipt.planChanged, false);
  assert.equal(result.receipt.nativeRevision, 1);
  assert.equal(after.reviewState, 'acknowledged');
  assert.equal(after.canUseOriginalDraft, false);
  assert.equal(after.currentChangedSinceAcknowledgement, false);
  assert.deepEqual(f.records.get(planPath(f)), plan);
  assert.deepEqual(pending(f), before);
  assert.equal(f.records.get(root(f)).literaryRevision, book.literaryRevision + 1);
  assert.equal(f.records.get(root(f)).literaryContextRevision, book.literaryContextRevision);
  assert.deepEqual(await apply(f, request), result);
  assert.equal(BOOK_RESTORE_METHODS.includes('reviewBookEditorialRestore'), false);
  assert.equal(BOOK_RESTORE_METHODS.includes('getBookEditorialRestoreReviewOperation'), false);
  const metadata = f.records.get(root(f) + '/' + names.resolutions + '/' + f.planId);
  assert.equal(Object.hasOwn(metadata, 'references'), false);
  assert.equal(Object.hasOwn(metadata, 'plan'), false);
});

test('fresh selected references use the normal native plan writer and commit version, index, clocks and acknowledgement together', async () => {
  const f = await readyRestoreReview(),
    reference = await selectCurrentAct(f),
    before = pending(f);
  const previous = structuredClone(f.records.get(planPath(f)));
  const request = await reviewRequest(f, {
    decision: 'reconcile-references',
    references: [reference],
  });
  const result = await apply(f, request),
    current = f.records.get(planPath(f));
  assert.equal(result.receipt.planChanged, true);
  assert.equal(current.revision, 2);
  assert.deepEqual(current.plan, { ...previous.plan, references: [reference] });
  assert.deepEqual(pending(f), before);
  const links = [...f.records].filter(([path]) => path.startsWith(root(f) + '/literaryPlanLinks/'));
  assert.equal(links.length, 1);
  assert.equal(links[0][1].refId, reference.id);
  assert.equal((await state(f)).currentChangedSinceAcknowledgement, false);
  const writes = f.commits.findLast((rows) =>
    rows.some((row) => row.path === root(f) + '/' + names.resolutions + '/' + f.planId),
  );
  for (const prefix of [
    planPath(f),
    root(f) + '/literaryPlanVersions/',
    root(f) + '/literaryPlanLinks/',
    root(f) + '/' + names.resolutions + '/',
    root(f) + '/' + names.operations + '/',
  ])
    assert.ok(writes.some((row) => row.path.startsWith(prefix)));
  assert.ok(writes.some((row) => row.path === root(f)));
});

test('reconciliation preserves manual fields and status rather than restoring the original proposal over them', async () => {
  const f = await readyRestoreReview(),
    reference = await selectCurrentAct(f);
  const plan = structuredClone(f.records.get(planPath(f)).plan);
  plan.title = 'Own later title';
  plan.fields.function = 'Own later function';
  const api = createLiteraryPlanningService({ db: f.db, now: () => 10000 });
  await api.saveLiteraryPlan(uid, {
    target: f.target,
    id: f.planId,
    operationId: 'manual-before-review',
    expectedRevision: 1,
    plan,
  });
  const request = await reviewRequest(f, {
    decision: 'reconcile-references',
    references: [reference],
  });
  await apply(f, request);
  assert.deepEqual(f.records.get(planPath(f)).plan, { ...plan, references: [reference] });
  assert.equal(f.records.get(planPath(f)).revision, 3);
});

test('an old basis cannot acknowledge after a normal plan edit', async () => {
  const f = await readyRestoreReview(),
    request = await reviewRequest(f);
  const plan = { ...f.records.get(planPath(f)).plan, title: 'Changed after review' };
  await createLiteraryPlanningService({ db: f.db }).saveLiteraryPlan(uid, {
    target: f.target,
    id: f.planId,
    operationId: 'edit-after-review',
    expectedRevision: 1,
    plan,
  });
  const before = snapshot(f);
  await assert.rejects(() => apply(f, request));
  assert.deepEqual(snapshot(f), before);
});

test('missing current plan can be explicitly kept absent and is never recreated by acknowledgement', async () => {
  const f = await readyRestoreReview();
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(planPath(f))));
  const reconcile = await reviewRequest(f, { decision: 'reconcile-references' });
  await assert.rejects(() => apply(f, reconcile));
  const request = await reviewRequest(f, { operationId: 'keep-missing-plan' });
  const result = await apply(f, request),
    after = await state(f);
  assert.equal(result.receipt.nativeRevision, null);
  assert.equal(after.state, 'missing');
  assert.equal(after.currentChangedSinceAcknowledgement, false);
  assert.equal(f.records.has(planPath(f)), false);
});

test('contract acknowledgement keeps guidance and rejects reference reconciliation', async () => {
  const f = await readyRestoreReview(),
    request = await reviewRequest(f, { id: 'contract' });
  const invalid = await reviewRequest(f, {
    id: 'contract',
    decision: 'reconcile-references',
    operationId: 'cannot-reconcile-contract',
  });
  await assert.rejects(() => apply(f, invalid));
  await apply(f, request);
  assert.equal(
    f.records.get(root(f) + '/literaryProduction/current').contract.collaborationPolicy.mode,
    'guidance',
  );
  assert.equal((await state(f, 'contract')).reviewState, 'acknowledged');
});

test('portable historical references without fresh native authorization cannot be applied', async () => {
  const f = await readyRestoreReview(),
    current = await state(f),
    before = snapshot(f);
  const request = await reviewRequest(f, {
    decision: 'reconcile-references',
    references: current.pendingReferences,
  });
  await assert.rejects(() => apply(f, request));
  assert.deepEqual(snapshot(f), before);
});

for (const change of ['update', 'delete', 'recreate'])
  test(
    'a selected source changed by ' + change + ' cannot be adopted or acknowledged',
    async () => {
      const f = await readyRestoreReview(),
        reference = await selectCurrentAct(f);
      const request = await reviewRequest(f, {
        decision: 'reconcile-references',
        references: [reference],
      });
      const path = root(f) + '/acts/' + reference.id,
        value = structuredClone(f.records.get(path));
      if (change === 'update')
        await f.db.runTransaction((tx) =>
          tx.update(f.db.doc(path), { updatedAt: reference.revision + 1 }),
        );
      else {
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
        if (change === 'recreate')
          await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      }
      const before = snapshot(f);
      await assert.rejects(() => apply(f, request));
      assert.deepEqual(snapshot(f), before);
    },
  );

test('historical receipt replays after later edits and source revocation without granting live source access', async () => {
  const f = await readyRestoreReview(),
    reference = await selectCurrentAct(f);
  const request = await reviewRequest(f, {
    decision: 'reconcile-references',
    references: [reference],
  });
  const result = await apply(f, request);
  const api = createLiteraryPlanningService({ db: f.db, now: () => 11000 });
  const plan = { ...f.records.get(planPath(f)).plan, title: 'Later own plan' };
  await api.saveLiteraryPlan(uid, {
    target: f.target,
    id: f.planId,
    operationId: 'later-native-edit',
    expectedRevision: 2,
    plan,
  });
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(root(f) + '/acts/' + reference.id)));
  assert.deepEqual(await apply(f, request), result);
  assert.deepEqual(
    (
      await f.factory().getBookEditorialRestoreReviewOperation(uid, {
        bookId: f.p.bookId,
        operationId: request.operationId,
      })
    ).receipt,
    result.receipt,
  );
  const after = await state(f);
  assert.equal(after.reviewState, 'acknowledged');
  assert.equal(after.currentChangedSinceAcknowledgement, true);
  assert.equal(after.canUseOriginalDraft, false);
  assert.equal(
    (await api.getLiteraryPlan(uid, { target: f.target, id: f.planId })).sources[0].available,
    false,
  );
});

test('same operation with changed intent is rejected and a second acknowledgement cannot overwrite the first', async () => {
  const f = await readyRestoreReview(),
    request = await reviewRequest(f);
  await apply(f, request);
  const before = snapshot(f);
  await assert.rejects(() =>
    apply(f, { ...request, decision: 'reconcile-references', references: [] }),
  );
  const fresh = await reviewRequest(f, { operationId: 'second-review-cannot-overwrite' });
  await assert.rejects(() => apply(f, fresh));
  assert.deepEqual(snapshot(f), before);
});

test('competing acknowledgements accept one exact operation and leave one immutable resolution', async () => {
  const f = await readyRestoreReview(),
    request = await reviewRequest(f),
    initial = f.records.get(root(f)).literaryRevision;
  const values = await Promise.allSettled([
    apply(f, request),
    apply(f, { ...request, operationId: 'competing-review' }),
  ]);
  assert.equal(values.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(f.records.get(root(f)).literaryRevision, initial + 1);
  assert.equal(
    [...f.records.keys()].filter((path) => path.startsWith(root(f) + '/' + names.resolutions + '/'))
      .length,
    1,
  );
});

test('failure after plan preparation rolls back every native and acknowledgement effect before exact retry', async () => {
  const f = await readyRestoreReview(),
    reference = await selectCurrentAct(f);
  const request = await reviewRequest(f, {
    decision: 'reconcile-references',
    references: [reference],
  });
  const before = snapshot(f),
    run = f.db.runTransaction.bind(f.db),
    failure = Error('ack write failure');
  let inject = true;
  f.db.runTransaction = (operation) =>
    run((tx) => {
      const update = tx.update.bind(tx);
      tx.update = (ref, ...args) => {
        if (inject && ref.path === root(f)) throw failure;
        return update(ref, ...args);
      };
      return operation(tx);
    });
  await assert.rejects(
    () => apply(f, request),
    (error) => error === failure,
  );
  assert.deepEqual(snapshot(f), before);
  inject = false;
  assert.equal((await apply(f, request)).receipt.nativeRevision, 2);
});

for (const collection of ['resolutions', 'operations'])
  test(
    'recreated equal ' + collection + ' metadata cannot inherit the original acknowledgement',
    async () => {
      const f = await readyRestoreReview(),
        request = await reviewRequest(f);
      await apply(f, request);
      const path =
        root(f) +
        '/' +
        names[collection] +
        '/' +
        (collection === 'resolutions' ? f.planId : request.operationId);
      const value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      await assert.rejects(() => state(f));
      await assert.rejects(() => apply(f, request));
    },
  );

for (const collection of ['resolutions', 'operations'])
  test(
    'missing ' +
      collection +
      ' is not treated as permission to silently repeat the acknowledgement',
    async () => {
      const f = await readyRestoreReview(),
        request = await reviewRequest(f);
      await apply(f, request);
      const path =
        root(f) +
        '/' +
        names[collection] +
        '/' +
        (collection === 'resolutions' ? f.planId : request.operationId);
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      const before = snapshot(f);
      await assert.rejects(() => apply(f, request));
      await assert.rejects(() => state(f));
      await assert.rejects(() =>
        f.factory().getBookEditorialRestoreReviewOperation(uid, {
          bookId: f.p.bookId,
          operationId: request.operationId,
        }),
      );
      assert.deepEqual(snapshot(f), before);
    },
  );

test('lost acknowledgement metadata cannot replay an old keep-current wire against the advanced editorial clock', async () => {
  const f = await readyRestoreReview(),
    request = await reviewRequest(f);
  await apply(f, request);
  await f.db.runTransaction((tx) => {
    tx.delete(f.db.doc(root(f) + '/' + names.resolutions + '/' + f.planId));
    tx.delete(f.db.doc(root(f) + '/' + names.operations + '/' + request.operationId));
  });
  const before = snapshot(f);
  await assert.rejects(() => apply(f, request));
  assert.deepEqual(snapshot(f), before);
});

test('empty selected references acknowledge explicitly without adding a needless native plan revision', async () => {
  const f = await readyRestoreReview(),
    before = structuredClone(f.records.get(planPath(f)));
  const request = await reviewRequest(f, { decision: 'reconcile-references', references: [] });
  const result = await apply(f, request);
  assert.equal(result.receipt.planChanged, false);
  assert.deepEqual(f.records.get(planPath(f)), before);
});

test('current owner and deleting guards still apply to receipt queries and mutation replays', async () => {
  const f = await readyRestoreReview(),
    request = await reviewRequest(f);
  await apply(f, request);
  await assert.rejects(() => f.factory().reviewBookEditorialRestore('other', request));
  await f.db.runTransaction((tx) => tx.update(f.db.doc(root(f)), { deleting: true }));
  await assert.rejects(() => apply(f, request));
  await assert.rejects(() =>
    f.factory().getBookEditorialRestoreReviewOperation(uid, {
      bookId: f.p.bookId,
      operationId: request.operationId,
    }),
  );
});

test('source cleanup preserves acknowledgement and whole-book deletion removes both metadata namespaces', async () => {
  const f = await readyRestoreReview(),
    request = await reviewRequest(f),
    result = await apply(f, request);
  assert.equal((await finishEditorialSourceCleanup(f)).phase, 'done');
  assert.deepEqual(await apply(f, request), result);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(root(f)), { deleting: true });
  });
  let removed = false;
  for (let unit = 0; unit < 1000; unit++) {
    const response = await createScenesService({ db: f.db, now: () => 12000 }).deleteSceneBook(
      uid,
      { target: f.target, operationId: 'delete-reviewed-copy', limit: 5 },
    );
    if (response.complete) {
      removed = true;
      break;
    }
  }
  assert.equal(removed, true);
  for (const name of [names.resolutions, names.operations])
    assert.equal(
      [...f.records.keys()].some((path) => path.startsWith(root(f) + '/' + name + '/')),
      false,
    );
});

for (const collection of ['resolutions', 'operations'])
  test('rootless activation cannot inherit preexisting review ' + collection, async () => {
    const f = await readyEditorialActivation(),
      path = 'books/' + f.p.bookId + '/' + names[collection] + '/foreign';
    await f.db.runTransaction((tx) => tx.create(f.db.doc(path), { preserve: 'FOREIGN' }));
    const before = snapshot(f);
    await assert.rejects(() => activateEditorial(f));
    assert.deepEqual(snapshot(f), before);
  });

test('closed requests and explicit choices never accept whole plans, publication or historical grants', async () => {
  const f = await readyRestoreReview(),
    request = await reviewRequest(f),
    before = snapshot(f);
  for (const patch of [
    { decision: 'approve-all' },
    { references: [] },
    { plan: {} },
    { authorId: 'other' },
    { publication: true },
    { expectedRevision: 0 },
    { reviewToken: 'forged' },
  ])
    await assert.rejects(() => apply(f, { ...request, ...patch }));
  assert.deepEqual(snapshot(f), before);
});

test('reference reconciliation reauthorizes an external volume instead of inheriting its historical availability', async () => {
  const f = await readyRestoreReview(),
    bookId = 'source-volume';
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc('books/' + bookId), {
      authorId: uid,
      title: 'Own other volume',
      createdAt: 1,
      updatedAt: 1,
    });
    tx.create(f.db.doc('books/' + bookId + '/acts/own-act'), {
      name: 'Own source act',
      order: 0,
      updatedAt: 1,
    });
  });
  const rows = await createLiteraryPlanningService({ db: f.db }).listLiteraryReferences(uid, {
    target: f.target,
    kind: 'volumeUnit',
    sourceBookId: bookId,
    unitKind: 'act',
    purpose: 'source',
    limit: 10,
    afterId: null,
  });
  const request = await reviewRequest(f, {
    decision: 'reconcile-references',
    references: [rows.items[0].reference],
  });
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/' + bookId), { authorId: 'other' }));
  const before = snapshot(f);
  await assert.rejects(() => apply(f, request));
  assert.deepEqual(snapshot(f), before);
});
