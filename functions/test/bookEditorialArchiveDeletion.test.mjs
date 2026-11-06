import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenesService } from '../src/scenes.mjs';
import { prepareBookEditorialArchiveDeletion } from '../src/bookEditorialArchiveDeletion.mjs';
import { BOOK_EDITORIAL_HISTORY_COLLECTIONS as collections } from '../src/bookEditorialStorage.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
const target = { kind: 'book', id: 'book' },
  operationId = 'editorial-book-delete-0001';
function fixture(parts = 53) {
  const f = adventureImportDb({ nativeUpdates: true });
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Own book',
    status: 'draft',
    deleting: true,
    createdAt: 1,
    updatedAt: 100,
    wordCount: 0,
  });
  seed(f, parts);
  f.records.set('books/other', {
    authorId: 'author',
    title: 'Other',
    createdAt: 1,
    updatedAt: 100,
  });
  f.records.set('books/other/literaryArchiveParts/own', { bytes: 'OTHER_COPY' });
  f.records.set('users/author/aiPersonas/copied', { id: 'copied', instructions: 'OWN_LIBRARY' });
  f.records.set('users/author/bookRestores/source-job', { state: 'activated', metadata: 'RETAIN' });
  const factory = () => createScenesService({ db: f.db, now: () => 1000 });
  return { ...f, factory };
}
function seed(f, parts) {
  for (let index = 0; index < parts; index++)
    f.records.set('books/book/' + collections.parts + '/body:' + String(index).padStart(15, '0'), {
      bytesBase64: 'PRIVATE_' + index,
    });
  f.records.set('books/book/' + collections.bodies + '/body', { contentHash: 'private' });
  f.records.set('books/book/' + collections.records + '/record', { bodyId: 'body' });
  f.records.set('books/book/' + collections.reviews + '/contract', {
    pendingReferences: ['PRIVATE_REFERENCE'],
  });
}
const own = (f) => [...f.records].filter(([path]) => path.startsWith('books/book/'));
const remainingParts = (f) =>
  own(f).filter(([path]) => path.startsWith('books/book/' + collections.parts + '/')).length;
const checkpoint = (f) => f.records.get('users/author/sceneOperations/' + operationId);
const step = (f, limit = 5, uid = 'author') =>
  f.factory().deleteSceneBook(uid, { target, operationId, limit });
async function until(f, phase) {
  for (let unit = 0; unit < 600; unit++) {
    if (checkpoint(f)?.phase === phase) return;
    const result = await step(f, 1);
    if (result.complete) break;
  }
  assert.fail('Missing deletion phase: ' + phase);
}
async function finish(f, limit = 5) {
  for (let unit = 0; unit < 600; unit++) {
    const value = await step(f, limit);
    if (value.complete) return value;
  }
  assert.fail('Book deletion did not finish');
}
test('archive deletion plans bounded metadata pages and never removes a header while a part remains', async () => {
  const f = fixture(),
    root = structuredClone(f.records.get('books/book'));
  let complete = false;
  for (let unit = 0; unit < 100; unit++) {
    const plan = await f.db.runTransaction(async (tx) => {
      const value = await prepareBookEditorialArchiveDeletion(tx, {
        db: f.db,
        uid: 'author',
        bookId: 'book',
        limit: 5,
      });
      assert.ok(value.remove.length <= 5);
      if (remainingParts(f) > 0) assert.equal(value.collection, collections.parts);
      for (const ref of value.remove) tx.delete(ref);
      return value;
    });
    if (remainingParts(f) > 0)
      assert.equal(f.records.has('books/book/' + collections.bodies + '/body'), true);
    if (plan.complete) {
      complete = true;
      break;
    }
  }
  assert.equal(complete, true);
  assert.equal(own(f).length, 0);
  assert.deepEqual(f.records.get('books/book'), root);
  for (const query of f.reads) {
    assert.ok(query.maximum <= 5);
    assert.deepEqual(query.fields, []);
  }
});
test('helper requires owner, deleting state, revoked publication and a closed native page budget', async () => {
  const f = fixture(1),
    initial = structuredClone([...f.records]);
  const run = (options) =>
    f.db.runTransaction((tx) =>
      prepareBookEditorialArchiveDeletion(tx, {
        db: f.db,
        uid: 'author',
        bookId: 'book',
        ...options,
      }),
    );
  await assert.rejects(() => run({ uid: 'other' }));
  await assert.rejects(() => run({ uid: '' }));
  await assert.rejects(() => run({ limit: 51 }));
  await assert.rejects(() => run({ bookId: '../other' }));
  assert.deepEqual([...f.records], initial);
  f.records.get('books/book').deleting = false;
  await assert.rejects(() => run({}));
  f.records.get('books/book').deleting = true;
  f.records.set('publicBooks/book', { title: 'Still public' });
  await assert.rejects(() => run({}));
  assert.equal(remainingParts(f), 1);
});
test('ordinary server book deletion removes archive, native editorial copies and pending reviews while preserving other projects and library copies', async () => {
  const f = fixture();
  for (const [collection, id] of [
    ['literaryProduction', 'current'],
    ['literaryContractVersions', '1'],
    ['literaryPlans', 'plan'],
    ['literaryPlanVersions', 'version'],
  ])
    f.records.set('books/book/' + collection + '/' + id, { private: true });
  const independent = structuredClone(
    [...f.records].filter(([path]) => !path.startsWith('books/book')),
  );
  const result = await finish(f);
  assert.equal(result.complete, true);
  assert.equal(own(f).length, 0);
  assert.equal(f.records.has('books/book'), false);
  assert.equal(f.records.has('deletedBooks/book'), true);
  for (const [path, value] of independent) assert.deepEqual(f.records.get(path), value);
  assert.deepEqual(await step(f), result);
});
test('a late orphan part and review at finish restart the archive phase before root deletion', async () => {
  const f = fixture(0);
  await until(f, 'finish');
  seed(f, 1);
  const result = await step(f, 1);
  assert.equal(result.complete, false);
  assert.equal(checkpoint(f).phase, 'editorial-archive');
  assert.equal(f.records.has('books/book'), true);
  assert.equal(remainingParts(f), 1);
  await finish(f, 1);
  assert.equal(own(f).length, 0);
  assert.equal(f.records.has('books/book'), false);
});
for (const version of [1, 2, 3])
  test(
    'resumed cleanup version ' +
      version +
      ' cannot skip the new archive when its cursor already reached finish',
    async () => {
      const f = fixture(0);
      await until(f, 'finish');
      checkpoint(f).cleanupVersion = version;
      seed(f, 2);
      await step(f, 1);
      assert.equal(checkpoint(f).phase, 'editorial-archive');
      assert.equal(f.records.has('books/book'), true);
      await finish(f, 1);
      assert.equal(own(f).length, 0);
    },
  );
test('rollback after a staged part removal preserves data, count and deletion checkpoint for retry', async () => {
  const f = fixture(4);
  await until(f, 'editorial-archive');
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction;
  let armed = true;
  f.db.runTransaction = (operation) =>
    run((tx) =>
      operation({
        ...tx,
        delete(ref) {
          const result = tx.delete(ref);
          if (armed && ref.path.startsWith('books/book/' + collections.parts + '/')) {
            armed = false;
            throw Error('archive delete rollback');
          }
          return result;
        },
      }),
    );
  await assert.rejects(() => step(f, 1), /archive delete rollback/);
  assert.deepEqual([...f.records], before);
  const count = checkpoint(f).processed;
  await step(f, 1);
  assert.equal(checkpoint(f).processed, count + 1);
  assert.equal(f.records.has('books/book/' + collections.bodies + '/body'), true);
});
