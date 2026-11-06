import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import {
  createLiteraryPassageInspectionService,
  readLiteraryPassageInspection,
} from '../src/literaryPassageInspection.mjs';

const target = { kind: 'book', id: 'book' },
  inspectionId = 'passage-order-0001';
function fixture(count = 61) {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 1,
  });
  for (let n = 0; n < count; n++) {
    const id = 'chapter-' + String(n).padStart(3, '0');
    f.records.set('books/book/chapters/' + id, {
      title: 'Capítulo ' + n,
      order: n,
      contentMode: 'scenes',
      bookId: 'book',
      ownerId: 'author',
    });
  }
  const api = createLiteraryPassageInspectionService({ db: f.db, now: () => 100 });
  return { ...f, api };
}
const get = (f) => f.api.getLiteraryPassageInspection('author', { target, inspectionId });
const step = (f, job) =>
  f.api.advanceLiteraryPassageInspection('author', {
    target,
    inspectionId,
    expectedOriginToken: job.originToken,
    expectedRevision: job.revision,
  });
const start = async (f, chapterId) => {
  const source = await f.api.getLiteraryPassageInspectionScope('author', { target, chapterId });
  return f.api.startLiteraryPassageInspection('author', {
    target,
    inspectionId,
    chapterId,
    expectedScopeToken: source.scopeToken,
  });
};
async function finish(f) {
  let result = await get(f);
  for (let n = 0; n < 50 && result.state !== 'ready'; n++) result = await step(f, result);
  assert.equal(result.state, 'ready');
  return result;
}
const certificate = (f, chapterId, options) =>
  f.db.runTransaction((tx) =>
    readLiteraryPassageInspection(
      tx,
      workScope(f.db, 'author', { target }, []),
      inspectionId,
      chapterId,
      options,
    ),
  );

test('a book larger than one page proves the immediate predecessor and reconfirms every native chapter', async () => {
  const f = fixture();
  await start(f, 'chapter-060');
  const first = await step(f, await get(f));
  assert.equal(first.scanned, 25);
  assert.equal(first.previous, null);
  const ready = await finish(f);
  assert.equal(ready.scanned, 61);
  assert.equal(ready.verified, 61);
  assert.equal(ready.previous.id, 'chapter-059');
  const proof = await certificate(f, 'chapter-060');
  assert.equal(proof.previous.id, 'chapter-059');
  assert.equal(proof.count, 61);
  assert.equal(Object.hasOwn(proof, 'content'), false);
  const before = structuredClone([...f.records]);
  assert.deepEqual(await start(f, 'chapter-060'), ready);
  assert.deepEqual([...f.records], before);
});

test('act order, chapter ties, empty acts and unassigned chapters follow the canonical reading order', async () => {
  const f = fixture(0);
  for (const [id, order] of [
    ['act-a', 1],
    ['empty-act', 2],
    ['act-b', 3],
  ])
    f.records.set('books/book/acts/' + id, { name: id, order });
  for (const [id, actId, order] of [
    ['a-one', 'act-a', 1],
    ['a-two', 'act-a', 1],
    ['b-first', 'act-b', 0],
    ['unassigned', null, 0],
  ])
    f.records.set('books/book/chapters/' + id, { title: id, order, actId, contentMode: 'scenes' });
  await start(f, 'b-first');
  const ready = await finish(f);
  assert.equal(ready.previous.id, 'a-two');
  assert.equal(ready.previousActTail.id, 'a-two');
  assert.equal(ready.firstInAct, true);
  assert.equal(ready.scanned, 4);
});

test('the first chapter receives an explicit absence proof instead of selecting an older workflow', async () => {
  const f = fixture(33);
  await start(f, 'chapter-000');
  const ready = await finish(f);
  assert.equal(ready.previous, null);
  assert.equal(ready.scanned, 33);
  const proof = await certificate(f, 'chapter-000');
  assert.equal(proof.previous, null);
});

test('lost page ACK is resolved by metadata and a repeated old CAS cannot advance twice', async () => {
  const f = fixture();
  await start(f, 'chapter-060');
  const original = await get(f);
  await step(f, original);
  const before = structuredClone([...f.records]);
  await assert.rejects(step(f, original), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], before);
  assert.equal((await get(f)).scanned, 25);
});

test('changing the root fence marks metadata stale and closing still works without the old structure', async () => {
  const f = fixture();
  await start(f, 'chapter-060');
  f.records.set('books/book', { ...f.records.get('books/book'), updatedAt: 2 });
  const stale = await get(f);
  assert.equal(stale.state, 'stale');
  await assert.rejects(step(f, stale), { code: 'failed-precondition' });
  const closed = await f.api.cancelLiteraryPassageInspection('author', {
    target,
    inspectionId,
    expectedOriginToken: stale.originToken,
    expectedRevision: stale.revision,
  });
  assert.equal(closed.state, 'canceled');
  await assert.rejects(start(f, 'chapter-060'), { code: 'failed-precondition' });
});

test('a chapter changed behind the scan cursor without the root clock fails the independent second pass', async () => {
  const f = fixture();
  await start(f, 'chapter-060');
  await step(f, await get(f));
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book/chapters/chapter-000');
    await tx.get(ref);
    tx.update(ref, { order: 50 });
  });
  await assert.rejects(finish(f), { code: 'failed-precondition' });
  await assert.rejects(certificate(f, 'chapter-060'), { code: 'failed-precondition' });
});

test('entry certificate survives own next-chapter prose but refuses reordered or recreated target', async () => {
  const f = fixture(3);
  await start(f, 'chapter-002');
  await finish(f);
  const proof = await certificate(f, 'chapter-002');
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book/chapters/chapter-002');
    await tx.get(ref);
    tx.update(ref, { assemblyRevision: 1 });
  });
  assert.deepEqual(await certificate(f, 'chapter-002', { entered: true }), proof);
  await assert.rejects(certificate(f, 'chapter-002'), { code: 'failed-precondition' });
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book/chapters/chapter-002');
    await tx.get(ref);
    tx.update(ref, { order: 0 });
  });
  await assert.rejects(certificate(f, 'chapter-002', { entered: true }), {
    code: 'failed-precondition',
  });
});

test('foreign actors, deletion and unknown grants cannot inherit the inspection', async () => {
  const f = fixture(2);
  await start(f, 'chapter-001');
  await finish(f);
  await assert.rejects(f.api.getLiteraryPassageInspection('other', { target, inspectionId }), {
    code: 'not-found',
  });
  await assert.rejects(
    f.api.startLiteraryPassageInspection('author', {
      target,
      inspectionId,
      chapterId: 'chapter-001',
      authorized: true,
    }),
    { code: 'invalid-argument' },
  );
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  await assert.rejects(get(f), { code: 'not-found' });
});

test('a recreated book cannot inherit a completed inspection with the same chapter IDs', async () => {
  const f = fixture(2);
  await start(f, 'chapter-001');
  await finish(f);
  let copy;
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book');
    copy = (await tx.get(ref)).data();
    tx.delete(ref);
  });
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book');
    await tx.get(ref);
    tx.create(ref, copy);
  });
  await assert.rejects(get(f), { code: 'failed-precondition' });
  await assert.rejects(certificate(f, 'chapter-001', { entered: true }), {
    code: 'failed-precondition',
  });
});

test('closing a complete inspection prevents new entry without revoking an already latched native certificate', async () => {
  const f = fixture(2);
  await start(f, 'chapter-001');
  const ready = await finish(f);
  const proof = await certificate(f, 'chapter-001');
  await f.api.cancelLiteraryPassageInspection('author', {
    target,
    inspectionId,
    expectedOriginToken: ready.originToken,
    expectedRevision: ready.revision,
  });
  await assert.rejects(certificate(f, 'chapter-001'), { code: 'failed-precondition' });
  assert.deepEqual(await certificate(f, 'chapter-001', { entered: true }), proof);
});

const originalInspectionWire = async (f, chapterId = 'chapter-001') => ({
  target,
  inspectionId,
  chapterId,
  expectedScopeToken: (
    await f.api.getLiteraryPassageInspectionScope('author', { target, chapterId })
  ).scopeToken,
});

test('an old start scope cannot create an inspection after native book recreation with identical IDs', async () => {
  const f = fixture(2);
  const wire = await originalInspectionWire(f);
  let copy;
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book');
    copy = (await tx.get(ref)).data();
    tx.delete(ref);
  });
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book');
    await tx.get(ref);
    tx.create(ref, copy);
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(f.api.startLiteraryPassageInspection('author', wire), {
    code: 'failed-precondition',
  });
  assert.deepEqual([...f.records], before);
});

test('a missing scope or recreated chapter cannot be silently rebound to a new native origin', async () => {
  const f = fixture(2);
  const wire = await originalInspectionWire(f);
  await assert.rejects(
    f.api.startLiteraryPassageInspection('author', {
      target,
      inspectionId,
      chapterId: wire.chapterId,
    }),
    { code: 'invalid-argument' },
  );
  const ref = f.db.doc('books/book/chapters/' + wire.chapterId);
  let copy;
  await f.db.runTransaction(async (tx) => {
    copy = (await tx.get(ref)).data();
    tx.delete(ref);
  });
  await f.db.runTransaction(async (tx) => {
    await tx.get(ref);
    tx.create(ref, copy);
  });
  await assert.rejects(f.api.startLiteraryPassageInspection('author', wire), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.has('books/book/literaryPassageInspections/' + inspectionId), false);
});

test('canceling an uncertain start creates a permanent negative reservation before any observed registration', async () => {
  const f = fixture(2);
  const wire = await originalInspectionWire(f);
  const closed = await f.api.cancelLiteraryPassageInspection('author', wire);
  assert.equal(closed.state, 'canceled');
  const observed = await get(f);
  assert.equal(observed.state, 'canceled');
  assert.equal(observed.expectedScopeToken, wire.expectedScopeToken);
  const before = structuredClone([...f.records]);
  await assert.rejects(f.api.startLiteraryPassageInspection('author', wire), {
    code: 'failed-precondition',
  });
  await assert.rejects(step(f, observed), { code: 'failed-precondition' });
  assert.deepEqual(await f.api.cancelLiteraryPassageInspection('author', wire), observed);
  assert.deepEqual([...f.records], before);
});

test('original-intent cancellation does not need a deleted chapter or the stale structure fence', async () => {
  const f = fixture(2);
  const wire = await originalInspectionWire(f);
  await f.api.startLiteraryPassageInspection('author', wire);
  f.records.delete('books/book/chapters/' + wire.chapterId);
  f.records.set('books/book', { ...f.records.get('books/book'), updatedAt: 500 });
  const closed = await f.api.cancelLiteraryPassageInspection('author', wire);
  assert.equal(closed.state, 'canceled');
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.cancelLiteraryPassageInspection('author', {
      ...wire,
      publicationId: 'different-edition',
    }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], before);
});
