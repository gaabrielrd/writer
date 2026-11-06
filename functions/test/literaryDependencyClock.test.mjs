import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import {
  prepareLiteraryDependencyWrite,
  prepareLiteraryDependencyCleanup,
} from '../src/literaryDependencyClock.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
const target = { kind: 'book', id: 'book' };
function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    updatedAt: 10,
    sceneRevision: 2,
    literaryRevision: 3,
    literaryContextRevision: 4,
    localLoreVersion: 5,
    historyRevision: 6,
    wordCount: 7,
  });
  return { ...f, c: workScope(f.db, 'author', { target }, []) };
}
test('relational writes advance their own clock, leaving semantic clocks, prose and credits untouched', async () => {
  const f = fixture(),
    before = structuredClone(f.records.get('books/book'));
  f.records.set('users/author', { credits: 9 });
  await f.db.runTransaction(async (tx) => {
    const first = await prepareLiteraryDependencyWrite(tx, f.c);
    const second = await prepareLiteraryDependencyWrite(tx, f.c);
    tx.create(f.db.doc('books/book/literaryReviewJobs/new'), { chapterId: 'c' });
    first.commit();
    first.commit();
    second.commit();
  });
  const root = f.records.get('books/book');
  assert.equal(root.literaryDependencyRevision, 1);
  assert.equal(root.hasLiteraryResources, true);
  for (const [key, value] of Object.entries(before)) assert.deepEqual(root[key], value);
  assert.equal(f.records.get('users/author').credits, 9);
  await f.db.runTransaction(async (tx) => {
    const write = await prepareLiteraryDependencyWrite(tx, f.c);
    write.commit();
  });
  assert.equal(f.records.get('books/book').literaryDependencyRevision, 2);
});
test('a reused transaction identity across retries prepares a fresh revision and commit', async () => {
  let root = { authorId: 'author', literaryDependencyRevision: 4 },
    writes = [];
  // The object is deliberately reused while its attempt is reset.
  const tx = {
    get: async () => ({ exists: true, data: () => root }),
    update: (_ref, value) => writes.push(value),
  };
  const c = { target, uid: 'author', ref: { path: 'books/book' } };
  const aborted = await prepareLiteraryDependencyWrite(tx, c);
  aborted.commit();
  root = { ...root, literaryDependencyRevision: 9 };
  writes = [];
  const retried = await prepareLiteraryDependencyWrite(tx, c);
  retried.commit();
  assert.equal(retried.revision, 10);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].literaryDependencyRevision, 10);
});
test('unauthorized or deleting parents and invalid clock values cannot produce dependency records', async () => {
  for (const patch of [
    { authorId: 'other' },
    { deleting: true },
    { literaryDependencyRevision: -1 },
    { literaryDependencyRevision: Number.MAX_SAFE_INTEGER },
    { literaryDependencyRevision: 1.5 },
  ]) {
    const f = fixture();
    f.records.set('books/book', { ...f.records.get('books/book'), ...patch });
    await assert.rejects(
      f.db.runTransaction(async (tx) => {
        const write = await prepareLiteraryDependencyWrite(tx, f.c);
        tx.create(f.db.doc('books/book/literaryReviewJobs/new'), { chapterId: 'c' });
        write.commit();
      }),
    );
    assert.equal(f.records.has('books/book/literaryReviewJobs/new'), false);
  }
});
test('expiration advances a live book clock but never recreates a removed parent', async () => {
  for (const state of ['live', 'deleting', 'missing']) {
    const f = fixture();
    if (state === 'deleting')
      f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
    if (state === 'missing') f.records.delete('books/book');
    f.records.set('books/book/literaryAutocompleteRequests/old', { expiresAt: 1 });
    await f.db.runTransaction(async (tx) => {
      const write = await prepareLiteraryDependencyCleanup(tx, f.db, 'books/book');
      tx.delete(f.db.doc('books/book/literaryAutocompleteRequests/old'));
      write.commit();
    });
    assert.equal(f.records.has('books/book/literaryAutocompleteRequests/old'), false);
    if (state === 'live') assert.equal(f.records.get('books/book').literaryDependencyRevision, 1);
    if (state === 'deleting')
      assert.equal(f.records.get('books/book').literaryDependencyRevision, undefined);
    if (state === 'missing') assert.equal(f.records.has('books/book'), false);
  }
  const f = fixture();
  await assert.rejects(
    f.db.runTransaction((tx) => prepareLiteraryDependencyCleanup(tx, f.db, 'users/author')),
    { code: 'failed-precondition' },
  );
});
test('starting integration updates impact topology once without invalidating its own semantic source', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/c', {
    bookId: 'book',
    title: 'Capítulo',
    order: 1,
    content: '<p>A carta chegou.</p>',
    updatedAt: 10,
  });
  const api = createLiteraryIntegrationService({
    db: f.db,
    now: () => 100,
    generator: async () => {
      throw new Error('No model call is expected while starting the job');
    },
  });
  const command = {
    target,
    jobId: 'dependency-integration-job',
    level: 'book',
    instruction: 'Conferir continuidade.',
  };
  const first = await api.startLiteraryIntegration('author', command);
  assert.equal(first.state, 'planning');
  assert.equal(f.records.get('books/book').literaryDependencyRevision, 1);
  const replay = await api.startLiteraryIntegration('author', command);
  assert.deepEqual(replay, first);
  assert.equal(f.records.get('books/book').literaryDependencyRevision, 1);
  const current = await api.getLiteraryIntegration('author', { target, jobId: command.jobId });
  assert.equal(current.state, 'planning');
  assert.equal(current.sourceToken, first.sourceToken);
});
