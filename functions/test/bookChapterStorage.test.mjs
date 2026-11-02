import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookChapterBodyPlan } from '../src/bookChapterStorage.mjs';
import { readHistoryVersion, readHistoryChunk } from '../src/workHistoryContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { chapterWritingFixture } from './helpers/bookChapterStorageFixture.mjs';
const A = '\ufeff' + 'ação 🌙\n'.repeat(60000),
  B = 'novo 🌙\n'.repeat(80000),
  chapterPath = 'books/book/chapters/chapter';
async function fixture() {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, ...(await chapterWritingFixture(f.db)) };
}
const currentBody = (f) =>
  'books/book/bookTextBodies/' + f.records.get(chapterPath).contentStorage.bodyId;
const bodies = (f) =>
  [...f.records.keys()].filter((path) => /^books\/book\/bookTextBodies\/[a-f0-9]{64}$/.test(path));
const pin = (f, path) => f.records.get(path).pins;
test('large writes preserve logical content, CAS, generation reuse, replay and inline transition', async () => {
  const f = await fixture(),
    initial = await f.source(),
    request = {
      bookId: 'book',
      chapterId: 'chapter',
      operationId: 'storage-save-first01',
      content: A,
      expectedContentHash: initial.contentHash,
    };
  assert.equal((await f.api.saveLegacyChapter('author', request)).content, A);
  const first = currentBody(f);
  assert.equal(pin(f, first), 1);
  assert.equal((await f.source()).content, A);
  assert.equal((await f.api.saveLegacyChapter('author', request)).content, A);
  await f.save(A, 'storage-save-same01');
  assert.equal(currentBody(f), first);
  assert.equal(bodies(f).length, 1);
  assert.equal(pin(f, first), 1);
  await f.save(B, 'storage-save-second01');
  assert.equal(f.records.get(first).state, 'unreferenced');
  assert.equal(pin(f, first), 0);
  await assert.rejects(() => f.api.saveLegacyChapter('author', request), {
    code: 'failed-precondition',
  });
  const second = currentBody(f);
  await f.save('Brief', 'storage-save-brief01');
  assert.equal(f.records.get(chapterPath).content, 'Brief');
  assert.equal(f.records.get(chapterPath).contentStorage, null);
  assert.equal(pin(f, second), 0);
  await assert.rejects(() => f.save('stale', 'storage-save-stale01', initial.contentHash), {
    code: 'failed-precondition',
  });
});
test('manual and predecessor versions retain generations; restoration combines deltas once without copying chunks', async () => {
  const f = await fixture();
  await f.save(A, 'history-body-saveA01');
  const bodyA = currentBody(f);
  const { version } = await f.capture('history-body-capture01');
  assert.equal(pin(f, bodyA), 2);
  assert.equal(f.records.get('books/book/workVersions/' + version.id).schemaVersion, 2);
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/book/workVersionBodies/')),
    false,
  );
  await f.save(B, 'history-body-saveB01');
  const bodyB = currentBody(f);
  assert.equal(pin(f, bodyA), 1);
  assert.equal(pin(f, bodyB), 1);
  const token = (await f.source()).sourceToken,
    request = {
      target: f.target,
      resource: f.resource,
      versionId: version.id,
      operationId: 'history-body-restore01',
      expectedSourceToken: token,
    },
    restored = await f.history.restoreWorkVersion('author', request);
  assert.equal(restored.source.content, A);
  assert.equal(currentBody(f), bodyA);
  assert.equal(pin(f, bodyA), 2);
  assert.equal(pin(f, bodyB), 1);
  assert.equal(await f.readVersion(restored.previousVersion.id), B);
  assert.equal((await f.history.restoreWorkVersion('author', request)).source.content, A);
  assert.equal(pin(f, bodyA), 2);
  assert.equal(pin(f, bodyB), 1);
  assert.equal(bodies(f).length, 2);
  const again = await f.restore(version.id, 'history-body-restore02');
  assert.equal(pin(f, bodyA), 3);
  assert.equal(await f.readVersion(again.previousVersion.id), A);
  await f.deleteVersion(again.previousVersion.id, 'history-body-del-prev01');
  assert.equal(pin(f, bodyA), 2);
});
test('chapter deletion drops only its pin; versions remain readable until their own explicit deletion', async () => {
  const f = await fixture();
  await f.save(A, 'delete-body-saveA01');
  const body = currentBody(f);
  const { version } = await f.capture('delete-body-capture01'),
    updatedAt = f.records.get(chapterPath).updatedAt,
    request = {
      bookId: 'book',
      operationId: 'delete-body-chapter01',
      chapters: [{ id: 'chapter', expectedUpdatedAt: updatedAt }],
    };
  await f.api.deleteLegacyChapters('author', request);
  await f.api.deleteLegacyChapters('author', request);
  assert.equal(pin(f, body), 1);
  assert.equal(await f.source(), null);
  assert.equal(await f.readVersion(version.id), A);
  const result = await f.deleteVersion(version.id, 'delete-body-version01');
  assert.deepEqual(result, { complete: true, processed: 0 });
  assert.equal(pin(f, body), 0);
  assert.equal(f.records.get(body).state, 'unreferenced');
  await f.deleteVersion(version.id, 'delete-body-version01');
  assert.equal(pin(f, body), 0);
  await assert.rejects(() => f.readVersion(version.id), { code: 'not-found' });
  assert.ok([...f.records.keys()].some((path) => path.startsWith(body + '/chunks/')));
});
test('UTF-8 history segments read no more than two physical parts and preserve BOM after chapter removal', async () => {
  const f = await fixture();
  await f.save(A, 'segment-body-save01');
  const { version } = await f.capture('segment-body-capture01'),
    context = { uid: 'author', target: f.target, path: 'books/book', ref: f.db.doc('books/book') };
  for (let index = 0; index < version.chunkCount; index++) {
    const seen = [],
      run = f.db.runTransaction.bind(f.db);
    const part = await run(async (tx) => {
      const stored = await readHistoryVersion(tx, f.db, context, version.id),
        wrapped = {
          ...tx,
          get: (ref) => {
            if (ref.path?.includes('/chunks/')) seen.push(ref.path);
            return tx.get(ref);
          },
        };
      return readHistoryChunk(wrapped, f.db, context, stored, index);
    });
    assert.ok(seen.length <= 2);
    assert.ok(Buffer.byteLength(part.content) <= 65536);
    assert.equal(part.content.includes('\ufffd'), false);
  }
  assert.equal(await f.readVersion(version.id), A);
});
for (const mode of ['missing', 'foreign', 'overflow', 'part-aba'])
  test('broken ' + mode + ' body fails before capture/save and preserves references', async () => {
    const f = await fixture();
    await f.save(A, 'corrupt-body-save01');
    let counted;
    do {
      counted = await f.api.prepareWorkWordCount('author', {
        target: f.target,
        operationId: 'corrupt-body-count01',
        limit: 25,
      });
    } while (!counted.complete);
    const body = currentBody(f),
      part = body + '/chunks/000000000000000';
    if (mode === 'missing') f.records.delete(part);
    if (mode === 'foreign') f.records.get(body).ownerId = 'other';
    if (mode === 'overflow') f.records.get(body).pins = Number.MAX_SAFE_INTEGER;
    if (mode === 'part-aba') {
      const data = structuredClone(f.records.get(part));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(part)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(part), data));
    }
    const before = structuredClone([...f.records]);
    await assert.rejects(() => f.capture('corrupt-body-capture01'));
    assert.deepEqual([...f.records], before);
  });
test('an interrupted write rolls back body creation, old pin, ledger and receipt; retry commits once', async () => {
  const f = await fixture();
  await f.save(A, 'rollback-body-save01');
  const old = currentBody(f),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  let interrupt = true;
  f.db.runTransaction = (callback) =>
    run((tx) =>
      callback({
        ...tx,
        set: (ref, ...args) => {
          if (interrupt && ref.path === 'users/author/workOperations/rollback-body-save02')
            throw new Error('interrupted');
          return tx.set(ref, ...args);
        },
      }),
    );
  await assert.rejects(() => f.save(B, 'rollback-body-save02'), /interrupted/);
  assert.deepEqual([...f.records], before);
  interrupt = false;
  await f.save(B, 'rollback-body-save02');
  assert.equal(pin(f, old), 0);
  assert.equal(pin(f, currentBody(f)), 1);
  assert.equal(bodies(f).length, 2);
});
test('concurrent saves have one winner and creation replay refuses a later manuscript', async () => {
  const f = await fixture(),
    base = (await f.source()).contentHash,
    outcomes = await Promise.allSettled([
      f.save(A, 'concurrent-body-save01', base),
      f.save(B, 'concurrent-body-save02', base),
    ]);
  assert.equal(outcomes.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal(bodies(f).length, 1);
  const request = {
      bookId: 'book',
      operationId: 'create-body-chapter01',
      input: { content: A, title: 'New' },
    },
    created = await f.api.createLegacyChapter('author', request);
  assert.equal(created.content, A);
  assert.equal((await f.api.createLegacyChapter('author', request)).content, A);
  await f.api.saveLegacyChapter('author', {
    bookId: 'book',
    chapterId: created.id,
    operationId: 'change-created-text01',
    content: 'Later',
    expectedContentHash: f.hash(A),
  });
  await assert.rejects(() => f.api.createLegacyChapter('author', request), {
    code: 'failed-precondition',
  });
});
test('two near-8-MiB generations restore by reference and keep predecessor without duplicate body writes', async () => {
  const f = await fixture(),
    largeA = 'x'.repeat(8388608 - 4096),
    largeB = 'y'.repeat(8388608 - 8192);
  await f.save(largeA, 'capacity-body-saveA01');
  const bodyA = currentBody(f),
    { version } = await f.capture('capacity-body-capture01');
  await f.save(largeB, 'capacity-body-saveB01');
  const restored = await f.restore(version.id, 'capacity-body-restore01');
  assert.equal(restored.source.content, largeA);
  assert.equal(await f.readVersion(restored.previousVersion.id), largeB);
  assert.equal(bodies(f).length, 2);
  assert.equal(pin(f, bodyA), 2);
});
test('one shared planner nets pin changes and refuses zero-pin resurrection or another resource', async () => {
  const f = await fixture();
  await f.save(A, 'plan-body-save-first01');
  const body = currentBody(f),
    manifest = f.records.get(chapterPath).contentStorage;
  await f.db.runTransaction(async (tx) => {
    const plan = createBookChapterBodyPlan(tx, f.db, { uid: 'author', bookId: 'book' });
    await plan.pin('chapter', manifest, 1);
    await plan.pin('chapter', manifest, -1);
    plan.commit();
  });
  assert.equal(pin(f, body), 1);
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      const plan = createBookChapterBodyPlan(tx, f.db, { uid: 'author', bookId: 'book' });
      await plan.pin('other', manifest, 1);
    }),
  );
  await f.save('Small', 'plan-body-save-small01');
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      const plan = createBookChapterBodyPlan(tx, f.db, { uid: 'author', bookId: 'book' });
      await plan.pin('chapter', manifest, 1);
    }),
  );
});

test('version deletion resumes after cleanup interruption and releases its pin only once', async () => {
  const f = await fixture();
  await f.save(A, 'resume-delete-save01');
  const { version } = await f.capture('resume-delete-capture01'),
    body = currentBody(f),
    versionPath = 'books/book/workVersions/' + version.id,
    run = f.db.runTransaction.bind(f.db);
  let interrupt = true;
  f.db.runTransaction = (callback) =>
    run((tx) =>
      callback({
        ...tx,
        delete: (ref) => {
          if (interrupt && ref.path === versionPath) throw new Error('cleanup-interrupted');
          return tx.delete(ref);
        },
      }),
    );
  await assert.rejects(
    () => f.deleteVersion(version.id, 'resume-delete-version01'),
    /cleanup-interrupted/,
  );
  assert.equal(f.records.get(versionPath).deleting, true);
  assert.equal(pin(f, body), 1);
  await assert.rejects(() => f.readVersion(version.id), { code: 'not-found' });
  interrupt = false;
  assert.equal((await f.deleteVersion(version.id, 'resume-delete-version01')).complete, true);
  assert.equal(pin(f, body), 1);
  assert.equal(f.records.has(versionPath), false);
});
test('foreign version identity and malformed segment manifests cannot release another reference', async () => {
  for (const mode of ['target', 'id', 'segments']) {
    const f = await fixture();
    await f.save(A, 'foreign-version-save01');
    const { version } = await f.capture('foreign-version-capture01'),
      path = 'books/book/workVersions/' + version.id,
      stored = f.records.get(path);
    if (mode === 'target') stored.target = { kind: 'book', id: 'other' };
    if (mode === 'id') stored.id = 'other';
    if (mode === 'segments') stored.partLengths[0]--;
    const before = structuredClone([...f.records]);
    await assert.rejects(() => f.deleteVersion(version.id, 'foreign-version-delete01'));
    assert.deepEqual([...f.records], before);
  }
});
