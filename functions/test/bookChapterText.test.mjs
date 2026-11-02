import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareRestoredChapterText,
  readBookChapterText,
  BOOK_CHAPTER_INLINE_BYTES,
  BOOK_CHAPTER_TEXT_BYTES,
} from '../src/bookChapterText.mjs';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from './helpers/bookRestoreStructureFixture.mjs';
const uid = 'author',
  id = 'text-restore-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const input = (content) => ({
  uid,
  bookId: 'restore-book-0001',
  chapterId: 'restore-chapter01',
  operationId: 'text-operation01',
  timestamp: 1000,
  content,
});
function targetPath(bookId, write) {
  if (write.kind === 'text-body') return 'books/' + bookId + '/bookTextBodies/' + write.id;
  const [body, index] = write.id.split(':');
  return 'books/' + bookId + '/bookTextBodies/' + body + '/chunks/' + index;
}
async function storeBody(f, plan, args) {
  await f.db.runTransaction((tx) => {
    for (const w of plan.writes) tx.create(f.db.doc(targetPath(args.bookId, w)), w.value);
  });
}
const read = (f, args, plan) =>
  f.db.runTransaction((tx) =>
    readBookChapterText(tx, f.db, {
      uid: args.uid,
      bookId: args.bookId,
      chapterId: args.chapterId,
      chapter: { bookId: args.bookId, ownerId: args.uid, ...plan.patch },
    }),
  );
async function readyLarge(f, content = 'x'.repeat(1100000)) {
  const legacy = bookLegacyFixture(1);
  legacy.chapters[0].content = content;
  const { progress } = await uploadLegacyRestore(f.api, uid, id, legacy),
    validated = await finishLegacyRestore(f.factory, uid, id, progress),
    p = await finishRestoreStructure(f.factory, uid, id, validated);
  const chapter = [...f.records].find(([path]) =>
    path.startsWith('books/' + p.bookId + '/chapters/'),
  );
  return { p, chapter, content, validated };
}
test('inline boundary and immutable generation identity preserve exact text without truncation', () => {
  assert.equal(prepareRestoredChapterText(input('')), null);
  assert.equal(prepareRestoredChapterText(input('a'.repeat(BOOK_CHAPTER_INLINE_BYTES))), null);
  const args = input('a'.repeat(BOOK_CHAPTER_INLINE_BYTES + 1)),
    a = prepareRestoredChapterText(args),
    b = prepareRestoredChapterText(args);
  assert.deepEqual(a, b);
  assert.notEqual(
    a.manifest.bodyId,
    prepareRestoredChapterText({ ...args, operationId: 'text-operation02' }).manifest.bodyId,
  );
  assert.equal(a.writes.length, a.manifest.chunkCount + 1);
  assert.equal(a.patch.content, null);
  assert.equal(a.writes[0].value.pins, 1);
  assert.throws(() => prepareRestoredChapterText(input('a'.repeat(BOOK_CHAPTER_TEXT_BYTES + 1))));
  assert.throws(() => prepareRestoredChapterText(input('\ud800')));
});
test('binary parts preserve BOM and UTF-8 split across boundaries through the full logical limit', async () => {
  for (const content of [
    '\ufeff' + '🌙 ação\n'.repeat(100000),
    'x'.repeat(BOOK_CHAPTER_TEXT_BYTES),
  ]) {
    const f = setup(),
      args = input(content),
      plan = prepareRestoredChapterText(args);
    await storeBody(f, plan, args);
    assert.equal(await read(f, args, plan), content);
    assert.ok(plan.manifest.chunkCount <= 128);
    assert.ok(plan.writes.slice(1).every((w) => w.value.bytes.length <= 65536));
  }
});
test('reader handles legacy inline but refuses missing/ambiguous external content rather than returning empty', async () => {
  const f = setup(),
    args = input('large');
  assert.equal(
    await f.db.runTransaction((tx) =>
      readBookChapterText(tx, f.db, { ...args, chapter: { content: '' } }),
    ),
    '',
  );
  await assert.rejects(() =>
    f.db.runTransaction((tx) =>
      readBookChapterText(tx, f.db, { ...args, chapter: { content: null } }),
    ),
  );
  const plan = prepareRestoredChapterText(input('x'.repeat(600000)));
  await assert.rejects(() => read(f, args, plan));
});
test('reader fails closed on corrupted parts, scope, zero pins, descriptor changes and native part recreation', async () => {
  for (const mode of [
    'hash',
    'bytes',
    'missing',
    'owner',
    'index',
    'pins',
    'size',
    'dual',
    'aba',
  ]) {
    const f = setup(),
      args = input('x'.repeat(600000)),
      plan = prepareRestoredChapterText(args);
    await storeBody(f, plan, args);
    const part = targetPath(args.bookId, plan.writes[1]),
      header = targetPath(args.bookId, plan.writes[0]);
    if (mode === 'hash') f.records.get(part).contentHash = '0'.repeat(64);
    if (mode === 'bytes') f.records.get(part).bytes[0] ^= 1;
    if (mode === 'missing') f.records.delete(part);
    if (mode === 'owner') f.records.get(part).ownerId = 'other';
    if (mode === 'index') f.records.get(part).index = 10;
    if (mode === 'pins') f.records.get(header).pins = 0;
    if (mode === 'size') plan.patch.contentStorage.byteLength--;
    if (mode === 'dual') plan.patch.content = 'wrong fallback';
    if (mode === 'aba') {
      const value = structuredClone(f.records.get(part));
      await f.db.runTransaction((tx) => {
        tx.delete(f.db.doc(part));
      });
      await f.db.runTransaction((tx) => {
        tx.create(f.db.doc(part), value);
      });
    }
    await assert.rejects(() => read(f, args, plan), mode);
  }
});
test('1.1 MB source stages text-body, parts, header, ledger and journal without activating the book', async () => {
  const f = setup(),
    { p, chapter, content, validated } = await readyLarge(f);
  assert.equal(f.records.get(root).cleanupVersion, 5);
  assert.equal(f.records.get(root).validationCheckpoint, validated.checkpoint);
  assert.equal(p.preparation.artifactCount, 22);
  assert.equal(chapter[1].content, null);
  assert.equal(chapter[1].wordCount, 1);
  const actual = await f.db.runTransaction((tx) =>
    readBookChapterText(tx, f.db, {
      uid,
      bookId: p.bookId,
      chapterId: chapter[1].id,
      chapter: chapter[1],
    }),
  );
  assert.equal(actual, content);
  assert.equal(f.records.has('books/' + p.bookId), false);
  const reader = await f
    .factory()
    .openVerifiedBookRestoreContent(uid, { restoreId: id, jobToken: p.jobToken });
  assert.equal((await reader.readMappedItem(1)).value.content, content);
});
test('v5 removes parts before body and then old v4 resources, preserving atomic replay and source context', async () => {
  const f = setup(),
    { p, chapter } = await readyLarge(f),
    body = 'books/' + p.bookId + '/bookTextBodies/' + chapter[1].contentStorage.bodyId;
  let current = (await f.api.cancelBookRestore(uid, mutation(id, p, 'text-cancel-0001'))).progress,
    unit = 0;
  assert.equal(current.integrity.cleanupPhase, 'body-artifacts');
  const first = mutation(id, current, 'text-clean-first01', { limit: 3 }),
    step = await f.api.advanceBookRestoreCleanup(uid, first);
  assert.deepEqual(await f.api.advanceBookRestoreCleanup(uid, first), step);
  assert.equal(step.progress.preparation.cleanedArtifacts, 3);
  assert.equal(f.records.has(body), true);
  current = step.progress;
  while (current.state !== 'cancelled') {
    current = (
      await f.api.advanceBookRestoreCleanup(
        uid,
        mutation(id, current, 'text-clean-unit-' + unit++, { limit: 3 }),
      )
    ).progress;
    assert.ok(unit < 200);
  }
  assert.equal(current.preparation.cleanedArtifacts, 22);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/')),
    false,
  );
});
for (const mode of ['changed', 'aba', 'missing-journal', 'missing-parent'])
  test(
    'body cleanup preserves damaged/foreign ' + mode + ' instead of erasing an unproven part',
    async () => {
      const f = setup(),
        { p, chapter } = await readyLarge(f, 'x'.repeat(600000)),
        body = chapter[1].contentStorage.bodyId,
        part = 'books/' + p.bookId + '/bookTextBodies/' + body + '/chunks/000000000000000',
        journal =
          root + '/materializationArtifacts/' + digest(['text-chunk', body + ':000000000000000']);
      if (mode === 'changed')
        await f.db.runTransaction((tx) => {
          tx.update(f.db.doc(part), { index: 99 });
        });
      if (mode === 'aba') {
        const value = structuredClone(f.records.get(part));
        await f.db.runTransaction((tx) => {
          tx.delete(f.db.doc(part));
        });
        await f.db.runTransaction((tx) => {
          tx.create(f.db.doc(part), value);
        });
      }
      if (mode === 'missing-journal') f.records.delete(journal);
      if (mode === 'missing-parent')
        f.records.delete('books/' + p.bookId + '/bookTextBodies/' + body);
      const cancelled = (await f.api.cancelBookRestore(uid, mutation(id, p, 'text-cancel-bad01')))
          .progress,
        before = structuredClone([...f.records]);
      await assert.rejects(() =>
        f.api.advanceBookRestoreCleanup(
          uid,
          mutation(id, cancelled, 'text-clean-bad01', { limit: 2 }),
        ),
      );
      assert.deepEqual([...f.records], before);
      assert.equal(f.records.has(part), true);
    },
  );
test('small v4 preparation remains compatible and never allocates text generations', async () => {
  const f = setup(),
    { progress } = await uploadLegacyRestore(f.api, uid, id, bookLegacyFixture(1)),
    validated = await finishLegacyRestore(f.factory, uid, id, progress),
    p = await finishRestoreStructure(f.factory, uid, id, validated);
  assert.equal(f.records.get(root).cleanupVersion, 4);
  assert.equal(
    [...f.records.keys()].some((k) => k.includes('/bookTextBodies/')),
    false,
  );
  assert.equal((await cleanupLegacyRestore(f.api, uid, id, p)).state, 'cancelled');
});
