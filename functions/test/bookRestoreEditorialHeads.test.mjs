import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBookRestoreEditorialHead } from '../src/bookRestoreEditorialHeadContracts.mjs';
import {
  editorialStored,
  emptyEditorialContract,
  MAX_EDITORIAL_BYTES,
} from '../src/literaryContracts.mjs';
import { literaryPlan } from '../src/literaryPlanningSchema.mjs';
import { BOOK_RESTORE_METHODS } from '../src/bookRestoreUploadContracts.mjs';
import { bookRestoreEditorialAddress } from '../src/bookRestoreEditorialInventory.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { uid } from './helpers/bookRestoreEditorialFixture.mjs';
import {
  context,
  currentContract,
  currentPlan,
  readyEditableEditorial as fixture,
  editorialState as state,
  finishEditableEditorial as finishHeads,
} from './helpers/bookRestoreEditorialHeadsFixture.mjs';
test('contract projection keeps decision relations and historical choice while disabling continuous collaboration', () => {
  const source = currentContract();
  source.content.decisions = [
    {
      id: 'first',
      text: 'Original',
      category: 'requirement',
      status: 'approved',
      source: 'author',
      supersedes: null,
    },
    {
      id: 'second',
      text: 'Replacement',
      category: 'preference',
      status: 'proposal',
      source: 'author',
      supersedes: 'first',
    },
  ];
  const projected = projectBookRestoreEditorialHead(source, context, 1000);
  assert.equal(projected.writes.length, 3);
  const native = editorialStored(projected.writes[0].value),
    review = projected.writes[2].value;
  assert.deepEqual(native.contract.decisions, source.content.decisions);
  assert.equal(native.contract.collaborationPolicy.mode, 'guidance');
  assert.equal(review.historicalCollaboration.mode, 'continuous');
  assert.equal(review.review, 'required');
  assert.equal(review.execution, 'disabled');
  assert.equal(review.nativeRevision, 1);
  assert.equal(review.nativeContentHash, digest(native.contract));
  assert.equal(source.content.collaborationPolicy.mode, 'continuous');
  assert.equal(JSON.stringify(projected).includes(context.jobToken), false);
});
test('plan projection keeps unresolved tokenless references separate from a native editable proposal', () => {
  const source = currentPlan();
  const value = projectBookRestoreEditorialHead(source, context, 1000);
  assert.equal(literaryPlan(value.writes[0].value.plan).status, 'proposal');
  assert.deepEqual(value.writes[0].value.plan.references, []);
  assert.equal(value.writes[0].value.plan.fields.function, 'Own function');
  const pending = value.writes[2].value;
  assert.equal(pending.historicalStatus, 'approved');
  assert.equal(pending.nativeRevision, 1);
  assert.equal(pending.nativeContentHash, digest(value.writes[0].value.plan));
  assert.equal(pending.pendingReferences[0].id, context.bookId);
  assert.equal(Object.hasOwn(pending.pendingReferences[0], 'sourceToken'), false);
  assert.equal(value.writes[1].id, digest({ id: value.id, revision: 1 }));
  assert.equal(source.content.status, 'approved');
});
for (const mode of ['unavailable', 'version', 'no-lineage'])
  test('a ' + mode + ' artifact never becomes an editable current state implicitly', () => {
    const source = currentContract();
    if (mode === 'unavailable') {
      source.availability = { state: 'unavailable', reason: 'source-unavailable' };
      source.content = null;
    } else if (mode === 'version') source.lineage.role = 'version';
    else delete source.lineage;
    assert.equal(projectBookRestoreEditorialHead(source, context, 1000), null);
  });
test('absent collaboration policy stays absent at the exact original contract byte limit', () => {
  const contract = emptyEditorialContract();
  // Construct a legal payload at the actual public byte limit, without padding fields.
  while (Buffer.byteLength(JSON.stringify(contract)) < MAX_EDITORIAL_BYTES) {
    const remaining = MAX_EDITORIAL_BYTES - Buffer.byteLength(JSON.stringify(contract));
    const row = {
      id: 'decision-' + contract.decisions.length,
      text: '',
      category: 'requirement',
      status: 'proposal',
      source: 'a',
      supersedes: null,
    };
    const trial = { ...contract, decisions: [...contract.decisions, row] };
    const overhead =
      Buffer.byteLength(JSON.stringify(trial)) - Buffer.byteLength(JSON.stringify(contract));
    if (remaining < overhead + 1) {
      contract.decisions.at(-1).source += 's'.repeat(remaining);
      break;
    }
    row.text = 'x'.repeat(Math.min(4000, remaining - overhead));
    contract.decisions.push(row);
  }
  const source = currentContract();
  source.content = contract;
  const projected = projectBookRestoreEditorialHead(source, context, 1000);
  assert.equal(
    Buffer.byteLength(JSON.stringify(projected.writes[0].value.contract)),
    MAX_EDITORIAL_BYTES,
  );
  assert.equal(Object.hasOwn(projected.writes[0].value.contract, 'collaborationPolicy'), false);
  assert.deepEqual(projected.writes[0].value.contract, contract);
});
test('current native plan identities are stable within the job and distinct in another restoration', () => {
  const source = currentPlan();
  const one = projectBookRestoreEditorialHead(source, context, 1000);
  assert.equal(one.id, projectBookRestoreEditorialHead(source, context, 1001).id);
  assert.notEqual(
    one.id,
    projectBookRestoreEditorialHead(source, { ...context, jobToken: 'b'.repeat(64) }, 1000).id,
  );
});
test('native preparation creates current/version/review together and preserves every historical body', async () => {
  const f = await fixture(),
    base = f.p.preparation.artifactCount;
  const historical = structuredClone(
    [...f.records].filter(([path]) => path.startsWith('books/' + f.p.bookId + '/literaryArchive')),
  );
  const p = await finishHeads(f);
  assert.equal(p.preparation.artifactCount, base + 6);
  assert.equal(state(f).heads.created, 6);
  assert.equal(state(f).heads.plans, 1);
  assert.equal(state(f).heads.contracts, 1);
  const current = f.records.get('books/' + p.bookId + '/literaryProduction/current');
  assert.equal(editorialStored(current).revision, 1);
  const plan = [...f.records].find(([path]) =>
    path.startsWith('books/' + p.bookId + '/literaryPlans/'),
  );
  assert.equal(literaryPlan(plan[1].plan).status, 'proposal');
  assert.deepEqual(
    [...f.records].filter(([path]) => path.startsWith('books/' + p.bookId + '/literaryArchive')),
    historical,
  );
  assert.equal(f.records.has('books/' + p.bookId), false);
  const metadata = await f
    .factory()
    .getBookRestoreEditorial(uid, { restoreId: f.id, jobToken: p.jobToken });
  assert.equal(metadata.heads.phase, 'prepared');
  assert.equal(JSON.stringify(metadata).includes('Own function'), false);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreEditorialHeads'), false);
});
test('historical replay after later preparation does not duplicate native states or their versions', async () => {
  const f = await fixture(),
    request = mutation(f.id, f.p, f.id + '-lost-heads');
  const first = await f.factory().advanceBookRestoreEditorialHeads(uid, request);
  const p = await finishHeads(f, first.progress),
    before = structuredClone([...f.records]);
  const replay = await f.factory().advanceBookRestoreEditorialHeads(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.checkpoint, p.checkpoint);
  assert.deepEqual([...f.records], before);
});
test('native head transaction rollback preserves all current/version/review artifacts and permits exact retry', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction;
  let armed = true;
  f.db.runTransaction = (operation) =>
    run((tx) =>
      operation({
        ...tx,
        update(ref, value) {
          if (
            armed &&
            ref.path === f.root &&
            value.preparation?.artifactCount > f.p.preparation.artifactCount
          ) {
            armed = false;
            throw Error('head rollback');
          }
          return tx.update(ref, value);
        },
      }),
    );
  const request = mutation(f.id, f.p, f.id + '-rollback-heads');
  await assert.rejects(
    () => f.factory().advanceBookRestoreEditorialHeads(uid, request),
    /head rollback/,
  );
  assert.deepEqual([...f.records], before);
  const result = await f.factory().advanceBookRestoreEditorialHeads(uid, request);
  assert.equal(result.progress.preparation.artifactCount, f.p.preparation.artifactCount + 3);
});
for (const kind of ['editorial-contract', 'editorial-contract-version', 'editorial-review'])
  test('a recreated ' + kind + ' cannot confirm the original head preparation', async () => {
    const f = await fixture();
    const p = (
      await f
        .factory()
        .advanceBookRestoreEditorialHeads(uid, mutation(f.id, f.p, f.id + '-first-head'))
    ).progress;
    const last = state(f).heads.last.find((value) => value.kind === kind);
    const path = bookRestoreEditorialAddress(
      { ref: f.db.doc(f.root), job: f.records.get(f.root) },
      kind,
      last.id,
    );
    const metadata = f.metadata.get(path);
    f.metadata.set(path, {
      ...metadata,
      createdAtNanoseconds: metadata.createdAtNanoseconds + 100000,
    });
    const before = structuredClone([...f.records]);
    await assert.rejects(() =>
      f
        .factory()
        .advanceBookRestoreEditorialHeads(uid, mutation(f.id, p, f.id + '-recreated-head')),
    );
    assert.deepEqual([...f.records], before);
  });
test('multiple current contracts are refused by native semantic validation before preparing an arbitrary winner', async () => {
  const other = currentContract();
  other.id = '9'.repeat(64);
  other.lineage.id = '8'.repeat(64);
  await assert.rejects(
    () => fixture({ contracts: [currentContract(), other] }),
    /Editorial fixture rejected/,
  );
});
test('an existing native head is preserved and never adopted as a prepared restoration artifact', async () => {
  const f = await fixture(),
    path = 'books/' + f.p.bookId + '/literaryProduction/current';
  f.records.set(path, { foreign: true });
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.factory().advanceBookRestoreEditorialHeads(uid, mutation(f.id, f.p, f.id + '-foreign-head')),
  );
  assert.deepEqual([...f.records], before);
});
test('cancellation drains every native editable copy under the same protected inventory', async () => {
  const f = await fixture(),
    p = await finishHeads(f);
  const done = await cleanupLegacyRestore(f.factory(), uid, f.id, p, { limit: 1 });
  assert.equal(done.state, 'cancelled');
  for (const path of f.records.keys())
    assert.equal(path.startsWith('books/' + p.bookId + '/literary'), false);
  assert.equal(f.records.has('books/' + p.bookId), false);
});
