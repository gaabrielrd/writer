import test from 'node:test';
import assert from 'node:assert/strict';
import { readyEditorialActivation, activateEditorial, uid } from './helpers/bookRestoreEditorialActivationFixture.mjs';
import { readyEditableEditorial, finishEditableEditorial, currentContract } from './helpers/bookRestoreEditorialHeadsFixture.mjs';
import { editorialRecords } from './helpers/bookRestoreEditorialFixture.mjs';
import { legacyMutation as mutation, cleanupLegacyRestore } from './helpers/bookLegacyRestoreFixture.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { jobShape } from '../src/bookRestoreUploadContracts.mjs';
import { validateBookRestoreActivation } from '../src/bookRestoreActivationContracts.mjs';
import { nativeRestoreToken } from '../src/bookRestoreIntegrityRead.mjs';
import { createScenesService } from '../src/scenes.mjs';

const target = f => ({ kind: 'book', id: f.p.bookId });
const bookPath = f => 'books/' + f.p.bookId;
const archive = f => structuredClone([...f.records].filter(([path]) =>
  /\/(literaryArchive|literaryArchiveBodies|literaryArchiveParts|literaryRestoreReviews)\//.test(path)));
const snapshot = f => structuredClone([...f.records]);

test('the default host cannot review or activate a fully prepared editorial copy, and caller flags are rejected', async () => {
  const f = await readyEditorialActivation(), before = snapshot(f), api = f.apiWith(true, f.db, false);
  await assert.rejects(() => api.getBookRestoreActivationReview(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
    error => error.details?.reason === 'editorial-activation-unavailable');
  await assert.rejects(() => api.activateBookRestore(uid, f.request),
    error => error.details?.reason === 'editorial-activation-unavailable');
  await assert.rejects(() => f.factory().activateBookRestore(uid, { ...f.request, editorialActivation: true }));
  assert.deepEqual(snapshot(f), before);
  assert.equal(f.records.has(bookPath(f)), false);
});

test('native editable preparation without the final census cannot reach review or activation', async () => {
  const f = await readyEditableEditorial({ editorialActivation: true });
  f.p = await finishEditableEditorial(f);
  const before = snapshot(f);
  await assert.rejects(() => f.factory().getBookRestoreActivationReview(uid, { restoreId: f.id, jobToken: f.p.jobToken }));
  await assert.rejects(() => f.factory().activateBookRestore(uid,
    { ...mutation(f.id, f.p, f.id + '-too-early'), reviewToken: 'a'.repeat(64) }));
  assert.deepEqual(snapshot(f), before);
});

test('review exposes bounded counts and required review without archive text or an execution grant', async () => {
  const f = await readyEditorialActivation(), value = f.review.summary.editorial;
  assert.deepEqual(value, { artifacts: 3, links: 1, contracts: 1, plans: 1, reviewsRequired: 2,
    historicalExecutions: 'disabled' });
  assert.equal(JSON.stringify(f.review).includes('Own function'), false);
  assert.equal(JSON.stringify(f.review).includes('pendingReferences'), false);
  assert.equal(f.records.has(bookPath(f)), false);
});

test('activation binds the immutable census and atomically creates a private root with native editorial clocks', async () => {
  const f = await readyEditorialActivation(), before = archive(f);
  const control = await f.db.doc(f.root + '/preparedEditorial/current').get();
  const census = control.data().census;
  const seal = await f.db.doc('users/' + uid + '/bookRestoreOperations/' + census.sealOperationId).get();
  const result = await activateEditorial(f), root = f.records.get(bookPath(f));
  assert.equal(result.progress.state, 'activated');
  assert.deepEqual(result.progress.activation.editorial, { schemaVersion: 1,
    contextToken: census.contextToken, controlToken: nativeRestoreToken(control), sealToken: nativeRestoreToken(seal) });
  assert.equal(root.status, 'draft'); assert.equal(root.authorId, uid);
  assert.equal(root.hasLiteraryResources, true); assert.equal(root.literaryRevision, 1);
  assert.equal(root.literaryContextRevision, 1); assert.equal(root.literaryDependencyRevision, 0);
  assert.deepEqual(archive(f), before);
  assert.equal(f.records.get(bookPath(f) + '/literaryProduction/current').contract.collaborationPolicy.mode, 'guidance');
  const plan = [...f.records].find(([path]) => path.startsWith(bookPath(f) + '/literaryPlans/'))[1];
  assert.equal(plan.plan.status, 'proposal'); assert.deepEqual(plan.plan.references, []);
  assert.equal(f.records.has('publicBooks/' + f.p.bookId), false);
  assert.equal(f.records.get(bookPath(f) + '/workProgress/current').countReady, true);
  assert.equal(f.records.get('users/' + uid + '/aiPersonaRestoreBatches/' + f.p.bookId).state, 'active');
  const writes = f.commits.findLast(values => values.some(w => w.path === bookPath(f)));
  for (const path of [bookPath(f), bookPath(f) + '/workProgress/current', f.root,
    'users/' + uid + '/aiPersonaRestoreBatches/' + f.p.bookId,
    'users/' + uid + '/bookRestoreOperations/' + f.request.operationId])
    assert.ok(writes.some(w => w.path === path));
});

test('normal contract and plan writers edit the activated copy and preserve its original private archive', async () => {
  const f = await readyEditorialActivation(); await activateEditorial(f);
  const before = archive(f), contractApi = createLiteraryProductionService({ db: f.db, now: () => 5000 });
  const original = await contractApi.getLiteraryContract(uid, { target: target(f) });
  const contract = structuredClone(original.contract); contract.fields.premise = 'Author edits the restored premise';
  const saved = await contractApi.saveLiteraryContract(uid, { target: target(f), operationId: 'restore-contract-edit',
    expectedRevision: 1, contract });
  assert.equal(saved.revision, 2);
  const [path, value] = [...f.records].find(([path]) => path.startsWith(bookPath(f) + '/literaryPlans/'));
  const planApi = createLiteraryPlanningService({ db: f.db, now: () => 6000 });
  const plan = { ...value.plan, title: 'Author edits the restored plan' };
  const edited = await planApi.saveLiteraryPlan(uid, { target: target(f), id: path.split('/').at(-1),
    operationId: 'restore-plan-edit', expectedRevision: 1, plan });
  assert.equal(edited.revision, 2);
  assert.equal(f.records.get(bookPath(f)).literaryContextRevision, 3);
  assert.deepEqual(archive(f), before);
  await assert.rejects(() => contractApi.saveLiteraryContract('other', { target: target(f),
    operationId: 'restore-contract-foreign', expectedRevision: 2, contract }));
});

test('retiring an uncertain activation advances only the editorial seal and closes that exact activation operation', async () => {
  const f = await readyEditorialActivation(), base = structuredClone(f.records.get(f.root).preparation.audit);
  const api = f.apiWith(true, f.db, false);
  const result = await api.retireBookRestoreActivation(uid, f.request);
  assert.equal(result.receipt.action, 'retireBookRestoreActivation');
  assert.equal(f.records.has(bookPath(f)), false);
  assert.deepEqual(f.records.get(f.root).preparation.audit, base);
  assert.equal(f.records.get(f.root + '/preparedEditorial/current').census.sealOperationId, f.request.operationId);
  assert.deepEqual(await api.activateBookRestore(uid, f.request), result);
  f.p = result.progress;
  await assert.rejects(() => f.factory().activateBookRestore(uid,
    { ...mutation(f.id, f.p, 'stale-review-new-operation'), reviewToken: f.review.reviewToken }));
  f.review = await f.factory().getBookRestoreActivationReview(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  f.request = { ...mutation(f.id, f.p, 'fresh-reviewed-activation'), reviewToken: f.review.reviewToken };
  assert.equal((await activateEditorial(f)).progress.state, 'activated');
});

test('two retirements preserve historical resolution and require a fresh review without rewriting the base audit', async () => {
  const f = await readyEditorialActivation(), firstRequest = { ...f.request };
  const first = await f.factory().retireBookRestoreActivation(uid, firstRequest);
  const secondRequest = { ...mutation(f.id, first.progress, 'second-editorial-retirement'), reviewToken: 'a'.repeat(64) };
  const second = await f.factory().retireBookRestoreActivation(uid, secondRequest);
  const replay = await f.factory().retireBookRestoreActivation(uid, firstRequest);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.checkpoint, second.progress.checkpoint);
  assert.equal((await f.factory().getBookRestoreActivationReview(uid,
    { restoreId: f.id, jobToken: f.p.jobToken })).checkpoint, second.progress.checkpoint);
});

for (const kind of ['control', 'seal']) test('native recreation of the final ' + kind + ' invalidates an existing review', async () => {
  const f = await readyEditorialActivation();
  const controlPath = f.root + '/preparedEditorial/current';
  const path = kind === 'control' ? controlPath : 'users/' + uid + '/bookRestoreOperations/' +
    f.records.get(controlPath).census.sealOperationId;
  const data = structuredClone(f.records.get(path));
  await f.db.runTransaction(tx => tx.delete(f.db.doc(path)));
  await f.db.runTransaction(tx => tx.create(f.db.doc(path), data));
  const before = snapshot(f);
  await assert.rejects(() => activateEditorial(f));
  assert.deepEqual(snapshot(f), before);
  assert.equal(f.records.has(bookPath(f)), false);
});

test('cancellation after review invalidates activation and still drains the v15 resources without a root', async () => {
  const f = await readyEditorialActivation();
  const cancelled = await f.factory().cancelBookRestore(uid, mutation(f.id, f.p, 'cancel-reviewed-editorial'));
  await assert.rejects(() => activateEditorial(f));
  const done = await cleanupLegacyRestore(f.factory(), uid, f.id, cancelled.progress);
  assert.equal(done.state, 'cancelled'); assert.equal(f.records.has(bookPath(f)), false);
});

test('activation rollback preserves every resource and exact retry commits once', async () => {
  const f = await readyEditorialActivation(), before = snapshot(f), run = f.db.runTransaction.bind(f.db);
  const failure = Error('activation write rejected'); let inject = true;
  f.db.runTransaction = operation => run(tx => {
    const update = tx.update.bind(tx);
    tx.update = (ref, ...args) => { if (inject && ref.path === f.root) throw failure; return update(ref, ...args); };
    return operation(tx);
  });
  await assert.rejects(() => activateEditorial(f), error => error === failure);
  assert.deepEqual(snapshot(f), before); inject = false;
  const result = await activateEditorial(f);
  assert.equal(result.progress.state, 'activated');
  assert.deepEqual((await activateEditorial(f)).receipt, result.receipt);
});

test('historical activation confirmation survives normal edits and root removal with new activation disabled', async () => {
  const f = await readyEditorialActivation(), first = await activateEditorial(f);
  await f.db.runTransaction(tx => tx.update(f.db.doc(bookPath(f)), { title: 'Own new title', updatedAt: 5000 }));
  const api = f.apiWith(true, f.db, false), afterEdit = await api.activateBookRestore(uid, f.request);
  assert.deepEqual(afterEdit.receipt, first.receipt);
  await f.db.runTransaction(tx => tx.delete(f.db.doc(bookPath(f))));
  assert.deepEqual((await api.activateBookRestore(uid, f.request)).receipt, first.receipt);
  assert.equal(f.records.has(bookPath(f)), false);
  await assert.rejects(() => api.activateBookRestore(uid, { ...f.request, operationId: 'cannot-reactivate' }));
});

test('activation certificate is mandatory only for v15 and never accepted from the caller', async () => {
  const f = await readyEditorialActivation(); await activateEditorial(f);
  const job = structuredClone(f.records.get(f.root));
  delete job.activation.editorial; assert.throws(() => jobShape(uid, f.id, job));
  const valid = f.records.get(f.root).activation;
  for (const editorial of [null, {}, { ...valid.editorial, controlToken: 'forged' },
    { ...valid.editorial, operationId: 'extra' }])
    assert.throws(() => validateBookRestoreActivation({ ...valid, editorial }));
});

test('an archive without current editable heads activates as history with no fabricated native revision', async () => {
  const f = await readyEditorialActivation({ records: editorialRecords() }); await activateEditorial(f);
  const root = f.records.get(bookPath(f));
  assert.equal(root.hasLiteraryResources, true); assert.equal(root.literaryRevision, 0);
  assert.equal(root.literaryContextRevision, 0);
  assert.equal(f.records.has(bookPath(f) + '/literaryProduction/current'), false);
  assert.equal(f.review.summary.editorial.reviewsRequired, 0);
});

test('foreign account, stale checkpoint and injected certificate cannot mutate a reviewed copy', async () => {
  const f = await readyEditorialActivation(), before = snapshot(f);
  for (const [actor, patch] of [['other', {}], [uid, { expectedCheckpoint: f.p.checkpoint - 1 }],
    [uid, { editorial: { contextToken: 'a'.repeat(64) } }], [uid, { reviewToken: 'a'.repeat(64) }]])
    await assert.rejects(() => f.factory().activateBookRestore(actor, { ...f.request, ...patch }));
  assert.deepEqual(snapshot(f), before);
});


test('normal whole-book deletion drains an activated editorial archive and leaves historical activation confirmation intact', async () => {
  const f = await readyEditorialActivation(), first = await activateEditorial(f);
  const api = createScenesService({ db: f.db, now: () => 7000 });
  let result;
  for (let unit = 0; unit < 1000; unit++) {
    result = await api.deleteSceneBook(uid, { target: target(f), operationId: 'delete-activated-editorial', limit: 5 });
    if (result.complete) break;
  }
  assert.equal(result.complete, true); assert.equal(f.records.has(bookPath(f)), false);
  assert.deepEqual(archive(f), []);
  assert.equal([...f.records.keys()].some(path => path.startsWith(bookPath(f) + '/literaryPlans/')), false);
  assert.deepEqual((await f.factory().activateBookRestore(uid, f.request)).receipt, first.receipt);
});


test('restored publication policy remains an author requirement rather than a public publication', async () => {
  const source = currentContract();
  source.content.publicationPolicy = { version: 1, unit: 'chapter', requirePreviousPublication: true };
  const f = await readyEditorialActivation({ contracts: [source] }); await activateEditorial(f);
  const root = f.records.get(bookPath(f));
  assert.equal(root.hasLiteraryPublications, true); assert.equal(root.status, 'draft');
  assert.deepEqual(f.records.get(bookPath(f) + '/literaryProduction/current').contract.publicationPolicy,
    source.content.publicationPolicy);
  assert.equal(f.records.has('publicBooks/' + f.p.bookId), false);
  assert.equal([...f.records.keys()].some(path => path.startsWith(bookPath(f) + '/literaryPublications/')), false);
});
