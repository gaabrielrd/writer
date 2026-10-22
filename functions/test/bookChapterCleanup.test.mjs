import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookChapterCleanupHandler,
  createBookChapterCleanupService,
} from '../src/bookChapterCleanup.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { chapterWritingFixture } from './helpers/bookChapterStorageFixture.mjs';
const A = 'x'.repeat(600000),
  B = 'y'.repeat(650000),
  chapter = 'books/book/chapters/chapter';
async function fixture(content = A) {
  const f = adventureImportDb({ nativeUpdates: true }),
    writing = await chapterWritingFixture(f.db);
  await writing.save(content, 'cleanup-save-first01');
  const body = 'books/book/bookTextBodies/' + f.records.get(chapter).contentStorage.bodyId;
  return {
    ...f,
    ...writing,
    body,
    handler: createBookChapterCleanupHandler({ db: f.db }),
    service: createBookChapterCleanupService({ db: f.db }),
    scenes: createScenesService({ db: f.db, now: () => 4000 }),
  };
}
async function event(f) {
  const snapshot = await f.db.doc(f.body).get(),
    data = snapshot.data(),
    after = { ...snapshot, data: () => structuredClone(data) };
  return { params: { bookId: 'book', bodyId: f.body.split('/').at(-1) }, data: { after } };
}
async function unused(f) {
  await f.save('Current', 'cleanup-save-current01');
  return event(f);
}
const remaining = (f) =>
  [...f.records.keys()].filter((path) => path.startsWith(f.body + '/chunks/'));
const bookDelete = (f, id = 'cleanup-delete-book01', limit = 3) =>
  f.scenes.deleteSceneBook('author', { target: f.target, operationId: id, limit });
async function untilBodies(f) {
  f.records.get('books/book').deleting = true;
  for (let i = 0; i < 100; i++) {
    await bookDelete(f);
    if (f.records.get('users/author/sceneOperations/cleanup-delete-book01').phase === 'text-bodies')
      return;
  }
  assert.fail('Book cleanup did not reach text bodies');
}
async function finishBook(f) {
  for (let i = 0; i < 300; i++) {
    const result = await bookDelete(f);
    if (result.complete) return result;
  }
  assert.fail('Book cleanup did not finish');
}
test('worker drains bounded masked child pages, updates its continuation and deletes parent last under repeated events', async () => {
  const f = await fixture('x'.repeat(65536 * 110 + 17)),
    original = await unused(f),
    current = structuredClone(f.records.get(chapter)),
    root = structuredClone(f.records.get('books/book'));
  let calls = 0,
    removed = 0,
    done;
  do {
    const before = remaining(f).length,
      bodyExisted = f.records.has(f.body);
    done = await f.handler(original);
    calls++;
    removed += done.processed;
    assert.ok(done.processed <= 50);
    if (before > 0) {
      assert.equal(f.records.has(f.body), true);
      assert.ok(remaining(f).length < before);
    } else if (bodyExisted) assert.equal(f.records.has(f.body), false);
    assert.ok(calls < 8);
  } while (!done.complete);
  assert.equal(calls, 4);
  assert.equal(removed, 112);
  assert.equal(remaining(f).length, 0);
  assert.deepEqual(await f.handler(original), { complete: true, processed: 0 });
  assert.deepEqual(f.records.get(chapter), current);
  assert.deepEqual(f.records.get('books/book'), root);
  for (const query of f.reads.filter((q) => q.collectionPath === f.body + '/chunks')) {
    assert.equal(query.maximum, 51);
    assert.equal(query.fields.includes('bytes'), false);
  }
  for (const read of f.metadataReads.filter((r) => r.path === f.body))
    assert.equal(read.fields.includes('bytes'), false);
});
test('a remaining manual version prevents collection even after the current chapter changes', async () => {
  const f = await fixture(),
    { version } = await f.capture('cleanup-capture-keep01');
  await f.save('Current', 'cleanup-save-current01');
  const before = structuredClone([...f.records]),
    e = await event(f);
  assert.equal(await f.handler(e), null);
  assert.deepEqual(
    await f.service.collectBookChapterBody({
      bookId: 'book',
      bodyId: f.body.split('/').at(-1),
      expectedBirth: e.data.after.createTime,
    }),
    { complete: true, processed: 0 },
  );
  assert.deepEqual([...f.records], before);
  assert.equal(await f.readVersion(version.id), A);
  await f.deleteVersion(version.id, 'cleanup-remove-version01');
  const after = await event(f);
  let complete = false;
  for (let step = 0; step < 5; step++) {
    if ((await f.handler(after)).complete) {
      complete = true;
      break;
    }
  }
  assert.equal(complete, true);
  assert.equal(f.records.has(f.body), false);
});
for (const mode of ['missing', 'deleting'])
  test('normal collection defers ' + mode + ' root without deleting any body', async () => {
    const f = await fixture(),
      e = await unused(f);
    if (mode === 'missing') f.records.delete('books/book');
    else f.records.get('books/book').deleting = true;
    const before = structuredClone([...f.records]);
    assert.deepEqual(await f.handler(e), { complete: true, processed: 0, deferred: true });
    assert.deepEqual([...f.records], before);
  });
test('late event never deletes a recreated body incarnation even when all bytes and context match', async () => {
  const f = await fixture(),
    e = await unused(f),
    rows = [...f.records]
      .filter(([p]) => p === f.body || p.startsWith(f.body + '/'))
      .map(([p, v]) => [p, structuredClone(v)]);
  await f.db.runTransaction((tx) => {
    for (const [p] of rows) tx.delete(f.db.doc(p));
  });
  await f.db.runTransaction((tx) => {
    for (const [p, v] of rows) tx.create(f.db.doc(p), v);
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(() => f.handler(e), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], before);
});
for (const mode of ['owner', 'part-change', 'part-aba', 'index', 'hash', 'revision'])
  test('invalid ' + mode + ' proof blocks the complete cleanup page', async () => {
    const f = await fixture(),
      e = await unused(f),
      part = remaining(f)[0];
    if (mode === 'owner') f.records.get(f.body).ownerId = 'other';
    if (mode === 'revision') f.records.get(f.body).gcRevision = null;
    if (mode === 'index') f.records.get(part).index = 127;
    if (mode === 'hash') f.records.get(part).contentHash = 'bad';
    if (mode === 'part-change')
      await f.db.runTransaction((tx) => tx.update(f.db.doc(part), { extra: 'changed' }));
    if (mode === 'part-aba') {
      const data = structuredClone(f.records.get(part));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(part)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(part), data));
    }
    const before = structuredClone([...f.records]);
    await assert.rejects(() => f.handler(e));
    assert.deepEqual([...f.records], before);
  });
test('an interrupted continuation update rolls back every child deletion and fresh retry proceeds', async () => {
  const f = await fixture(),
    e = await unused(f),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  let interrupt = true;
  f.db.runTransaction = (callback) =>
    run((tx) =>
      callback({
        ...tx,
        update: (ref, ...args) => {
          if (interrupt && ref.path === f.body) throw new Error('interrupted');
          return tx.update(ref, ...args);
        },
      }),
    );
  await assert.rejects(() => f.handler(e), /interrupted/);
  assert.deepEqual([...f.records], before);
  interrupt = false;
  assert.equal((await f.handler(e)).complete, false);
  assert.equal(remaining(f).length, 0);
  assert.equal(f.records.has(f.body), true);
  assert.equal((await f.handler(e)).complete, true);
});
test('book inventory v2 removes all referenced bodies before root, preserves other books and replays without recreation', async () => {
  const f = await fixture(),
    { version } = await f.capture('cleanup-book-version01');
  await f.save(B, 'cleanup-book-second01');
  const bodyA = f.body;
  f.records.set('books/other', { authorId: 'author', title: 'Other' });
  f.records.set('books/other/bookTextBodies/unrelated', { keep: true });
  await untilBodies(f);
  assert.equal(
    f.records.get('users/author/sceneOperations/cleanup-delete-book01').cleanupVersion,
    2,
  );
  const e = await event(f);
  assert.equal(await f.handler(e), null);
  let result;
  for (let i = 0; i < 60; i++) {
    const before = [...f.records.keys()].filter((p) =>
      /^books\/book\/bookTextBodies\/[a-f0-9]{64}$/.test(p),
    );
    result = await bookDelete(f);
    for (const body of before)
      if (!f.records.has(body))
        assert.equal(
          [...f.records.keys()].some((p) => p.startsWith(body + '/chunks/')),
          false,
        );
    if (result.complete) break;
    assert.equal(f.records.has('books/book'), true);
  }
  assert.equal(result.complete, true);
  assert.equal(
    [...f.records.keys()].some((p) => p.startsWith('books/book/')),
    false,
  );
  assert.equal(f.records.has('deletedBooks/book'), true);
  assert.equal(f.records.get('books/other/bookTextBodies/unrelated').keep, true);
  assert.equal(f.records.has(bodyA), false);
  assert.equal(f.records.has('books/book/workVersions/' + version.id), false);
  const before = structuredClone([...f.records]);
  assert.deepEqual(await bookDelete(f), result);
  assert.deepEqual([...f.records], before);
});
for (const version of [undefined, 1])
  test(
    'legacy ' +
      version +
      ' finish checkpoint cannot remove root before new body inventory is drained',
    async () => {
      const f = await fixture();
      await untilBodies(f);
      const job = f.records.get('users/author/sceneOperations/cleanup-delete-book01');
      job.phase = 'finish';
      if (version === undefined) delete job.cleanupVersion;
      else job.cleanupVersion = version;
      assert.equal((await bookDelete(f)).complete, false);
      assert.equal(
        job === f.records.get('users/author/sceneOperations/cleanup-delete-book01'),
        false,
      );
      assert.equal(f.records.has('books/book'), true);
      assert.equal(
        f.records.get('users/author/sceneOperations/cleanup-delete-book01').phase,
        'text-bodies',
      );
      assert.equal((await finishBook(f)).complete, true);
      assert.equal(remaining(f).length, 0);
    },
  );
for (const patch of [
  { cleanupVersion: 99 },
  { phase: 'unknown' },
  { processed: Number.MAX_SAFE_INTEGER },
])
  test(
    'invalid book checkpoint ' + JSON.stringify(patch) + ' preserves root and body',
    async () => {
      const f = await fixture();
      await untilBodies(f);
      Object.assign(f.records.get('users/author/sceneOperations/cleanup-delete-book01'), patch);
      const before = structuredClone([...f.records]);
      await assert.rejects(() => bookDelete(f), { code: 'failed-precondition' });
      assert.deepEqual([...f.records], before);
    },
  );
test('foreign body blocks book finalization and malformed event scope never initiates deletion', async () => {
  const f = await fixture(),
    e = await unused(f);
  await assert.rejects(() =>
    f.handler({ ...e, params: { bookId: 'other', bodyId: e.params.bodyId } }),
  );
  await untilBodies(f);
  f.records.get(f.body).ownerId = 'other';
  const before = structuredClone([...f.records]);
  await assert.rejects(() => bookDelete(f), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('books/book'), true);
  assert.equal(f.records.has('deletedBooks/book'), false);
  assert.equal(await f.handler({}), null);
});
