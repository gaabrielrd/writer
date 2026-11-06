import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_RESTORE_METHODS, preparationProgress } from '../src/bookRestoreUploadContracts.mjs';
import {
  BOOK_RESTORE_AUDIT_LAYOUT,
  BOOK_RESTORE_EDITORIAL_AUDIT_LAYOUT,
} from '../src/bookRestoreAuditInventory.mjs';
import { bookRestoreEditorialAddress } from '../src/bookRestoreEditorialInventory.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
import {
  readyEditableEditorial,
  finishEditableEditorial,
  editorialState,
} from './helpers/bookRestoreEditorialHeadsFixture.mjs';
import { uid } from './helpers/bookRestoreEditorialFixture.mjs';
async function fixture() {
  const f = await readyEditableEditorial();
  f.p = await finishEditableEditorial(f);
  return f;
}
async function step(f, p, operationId) {
  return f.factory().advanceBookRestoreEditorialAudit(uid, mutation(f.id, p, operationId));
}
async function finish(f, start = f.p, onStep) {
  let p = start;
  for (let unit = 0; unit < 1000; unit++) {
    if (editorialState(f).census?.phase === 'done') return p;
    p = (await step(f, p, f.id + '-census-' + unit)).progress;
    await onStep?.(p);
  }
  throw Error('Editorial census did not finish');
}
async function certificate(f, p) {
  return f
    .factory()
    .openVerifiedBookRestoreEditorialAudit(uid, { restoreId: f.id, jobToken: p.jobToken });
}
test('the base certificate stays exact while editorial contribution and full ledger grow atomically', async () => {
  const f = await fixture(),
    job = f.records.get(f.root),
    p = preparationProgress(job.preparation);
  assert.ok(p.editorialAddedArtifacts > 6);
  assert.equal(
    p.audit.checkedArtifacts,
    p.artifactCount - (p.retiredArtifacts ?? 0) - p.editorialAddedArtifacts,
  );
  assert.equal(p.artifactCount - p.editorialAddedArtifacts, editorialState(f).baseArtifacts);
  const changed = structuredClone(p);
  changed.editorialAddedArtifacts--;
  assert.throws(() => preparationProgress(changed));
  const p1 = await finish(f);
  const current = f.records.get(f.root).preparation;
  assert.deepEqual(current.audit, p.audit);
  assert.equal(current.editorialAddedArtifacts, p.editorialAddedArtifacts);
  assert.equal(p1.state, 'content-verified');
});
test('full metadata census covers every frozen base/editorial target with bounded pages and no root activation', async () => {
  const f = await fixture(),
    start = f.reads.length;
  const p = await finish(f, f.p, (current) => {
    assert.equal(f.records.has('books/' + current.bookId), false);
    assert.notEqual(editorialState(f).census.anchor?.kind, 'editorial-control');
  });
  const state = editorialState(f),
    live = p.preparation.artifactCount - (p.preparation.retiredArtifacts ?? 0);
  assert.equal(state.census.family, BOOK_RESTORE_EDITORIAL_AUDIT_LAYOUT.length);
  assert.equal(state.census.checkedArtifacts, live);
  assert.equal(state.census.checkedPhysical, live);
  assert.equal(state.heads.phase, 'prepared');
  assert.ok(f.reads.slice(start).every((query) => query.maximum <= 8));
  const port = await certificate(f, p);
  assert.equal(port.checkedArtifacts, live);
  assert.equal(port.checkedPhysical, live);
  await f.db.runTransaction((tx) => port.verify(tx));
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreEditorialAudit'), false);
  assert.equal(BOOK_RESTORE_METHODS.includes('openVerifiedBookRestoreEditorialAudit'), false);
});
test('the mutable census control is authenticated each step without invalidating its own frozen anchor', async () => {
  const f = await fixture();
  let sawControlFamily = false;
  await finish(f, f.p, () => {
    const p = editorialState(f).census;
    if (BOOK_RESTORE_EDITORIAL_AUDIT_LAYOUT[p.family]?.kind === 'editorial-control')
      sawControlFamily = true;
    assert.notEqual(p.anchor?.kind, 'editorial-control');
  });
  assert.equal(sawControlFamily, true);
});
test('an unregistered physical editorial target prevents a terminal certificate and remains untouched', async () => {
  const f = await fixture(),
    path = 'books/' + f.p.bookId + '/literaryArchiveParts/' + '9'.repeat(64) + ':000000000000000';
  f.records.set(path, { foreign: true });
  await assert.rejects(() => finish(f));
  assert.deepEqual(f.records.get(path), { foreign: true });
  assert.notEqual(editorialState(f).census?.phase, 'done');
  await assert.rejects(() => certificate(f, f.p));
});
test('a missing journal target prevents counting absent bytes or sealing an incomplete copy', async () => {
  const f = await fixture(),
    path = [...f.records.keys()].find((path) =>
      path.startsWith('books/' + f.p.bookId + '/literaryArchiveBodies/'),
    );
  f.records.delete(path);
  await assert.rejects(() => finish(f));
  assert.notEqual(editorialState(f).census?.phase, 'done');
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
for (const selected of ['target', 'journal'])
  test(
    'recreating the last editorial ' + selected + ' cannot inherit its native census anchor',
    async () => {
      const f = await fixture();
      let p = f.p;
      for (let unit = 0; unit < 1000; unit++) {
        p = (await step(f, p, f.id + '-seek-anchor-' + unit)).progress;
        const anchor = editorialState(f).census.anchor;
        if (
          editorialState(f).census.phase === 'physical' &&
          editorialState(f).census.family >= BOOK_RESTORE_AUDIT_LAYOUT.length &&
          anchor?.kind.startsWith('editorial-') &&
          anchor.kind !== 'editorial-control'
        )
          break;
      }
      const anchor = editorialState(f).census.anchor;
      assert.ok(anchor?.kind.startsWith('editorial-'));
      const target = bookRestoreEditorialAddress(
        { ref: f.db.doc(f.root), job: f.records.get(f.root) },
        anchor.kind,
        anchor.id,
      );
      const journal = [...f.records].find(
        ([path, value]) =>
          path.startsWith(f.root + '/materializationArtifacts/') &&
          value.kind === anchor.kind &&
          value.id === anchor.id,
      );
      assert.ok(journal);
      const path = selected === 'target' ? target : journal[0],
        metadata = f.metadata.get(path);
      f.metadata.set(path, {
        ...metadata,
        createdAtNanoseconds: metadata.createdAtNanoseconds + 100000,
      });
      const before = structuredClone([...f.records]);
      await assert.rejects(() => step(f, p, f.id + '-recreated-anchor'));
      assert.deepEqual([...f.records], before);
    },
  );
test('a recreated base audit receipt cannot be substituted after historical copying started', async () => {
  const f = await fixture(),
    path = 'users/' + uid + '/bookRestoreOperations/' + f.p.preparation.audit.sealOperationId;
  const metadata = f.metadata.get(path),
    controlMetadata = f.metadata.get(f.root + '/preparedEditorial/current');
  f.metadata.set(path, {
    ...metadata,
    createdAtNanoseconds: controlMetadata.createdAtNanoseconds + 100000,
    updatedAtNanoseconds: controlMetadata.createdAtNanoseconds + 100000,
  });
  await assert.rejects(() => step(f, f.p, f.id + '-changed-base-seal'));
  assert.equal(editorialState(f).census, undefined);
});
test('failed census commit rolls back cursor, mutable control, job and receipt for exact retry', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction;
  let armed = true;
  f.db.runTransaction = (operation) =>
    run((tx) =>
      operation({
        ...tx,
        update(ref, value) {
          if (armed && ref.path === f.root) {
            armed = false;
            throw Error('census rollback');
          }
          return tx.update(ref, value);
        },
      }),
    );
  const request = mutation(f.id, f.p, f.id + '-rollback-census');
  await assert.rejects(
    () => f.factory().advanceBookRestoreEditorialAudit(uid, request),
    /census rollback/,
  );
  assert.deepEqual([...f.records], before);
  const result = await f.factory().advanceBookRestoreEditorialAudit(uid, request);
  assert.equal(result.progress.checkpoint, f.p.checkpoint + 1);
});
test('a lost census reply replays its original receipt after the terminal unit without scanning again', async () => {
  const f = await fixture(),
    request = mutation(f.id, f.p, f.id + '-held-census');
  const first = await f.factory().advanceBookRestoreEditorialAudit(uid, request);
  const p = await finish(f, first.progress),
    before = structuredClone([...f.records]);
  const replay = await f.factory().advanceBookRestoreEditorialAudit(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.checkpoint, p.checkpoint);
  assert.deepEqual([...f.records], before);
});
test('the final certificate is consumed inside the writer transaction and expires on cancellation', async () => {
  const f = await fixture(),
    p = await finish(f),
    port = await certificate(f, p);
  const cancelled = await f
    .factory()
    .cancelBookRestore(uid, mutation(f.id, p, f.id + '-cancel-certified'));
  const before = structuredClone([...f.records]);
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      await port.verify(tx);
      tx.create(f.db.doc('books/' + p.bookId), { unauthorized: true });
    }),
  );
  assert.deepEqual([...f.records], before);
  const done = await cleanupLegacyRestore(f.factory(), uid, f.id, cancelled.progress, { limit: 1 });
  assert.equal(done.state, 'cancelled');
  assert.equal(f.records.has('books/' + p.bookId), false);
});
test('cross-account, extra client fields and a nonterminal control cannot obtain a certificate', async () => {
  const f = await fixture(),
    input = { restoreId: f.id, jobToken: f.p.jobToken };
  await assert.rejects(() => f.factory().openVerifiedBookRestoreEditorialAudit('other', input));
  await assert.rejects(() =>
    f.factory().openVerifiedBookRestoreEditorialAudit(uid, { ...input, activation: true }),
  );
  await assert.rejects(() => f.factory().openVerifiedBookRestoreEditorialAudit(uid, input));
});

test('native operational history is never adopted from a nonempty collection outside the prepared editable inventory', async () => {
  const f = await fixture();
  const family = BOOK_RESTORE_EDITORIAL_AUDIT_LAYOUT.find(
    (value) => value.forbidden && value.collection !== 'literaryPlanLinks',
  );
  assert.ok(family);
  const path = 'books/' + f.p.bookId + '/' + family.collection + '/foreign-operation';
  f.records.set(path, { foreign: true, status: 'running' });
  await assert.rejects(() => finish(f));
  assert.deepEqual(f.records.get(path), { foreign: true, status: 'running' });
  assert.notEqual(editorialState(f).census?.phase, 'done');
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
