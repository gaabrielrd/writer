import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareRestoredChapterText } from '../src/bookChapterText.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createLoreAnalysisService } from '../src/loreAnalysis.mjs';
import { countVisibleWords } from '../src/visibleWordCount.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
const uid = 'author',
  bookId = 'book',
  chapterId = 'chapter',
  target = { kind: 'book', id: bookId },
  resource = { kind: 'chapter', id: chapterId };
async function fixture(content = '\ufeff' + 'ação 🌙\n'.repeat(60000)) {
  const f = adventureImportDb({ nativeUpdates: true }),
    body = prepareRestoredChapterText({
      uid,
      bookId,
      chapterId,
      operationId: 'read-text-operation01',
      timestamp: 1000,
      content,
    });
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc('books/book'), {
      authorId: uid,
      title: 'Book',
      createdAt: 1000,
      updatedAt: 1000,
      wordCount: 0,
    });
    tx.create(f.db.doc('books/book/chapters/chapter'), {
      bookId,
      ownerId: uid,
      title: 'Chapter',
      contentMode: 'legacy',
      order: 1,
      createdAt: 1000,
      updatedAt: 1000,
      wordCount: countVisibleWords(content),
      ...body.patch,
    });
    for (const write of body.writes) {
      const [id, index] = write.id.split(':');
      tx.create(
        f.db.doc('books/book/bookTextBodies/' + id + (index ? '/chunks/' + index : '')),
        write.value,
      );
    }
  });
  return {
    ...f,
    content,
    body,
    api: createWorkProgressService({ db: f.db, now: () => 2000 }),
    history: createWorkHistoryService({ db: f.db }),
    backup: createBookBackupReadService({ db: f.db }),
  };
}
const request = (f, extra = {}) => ({
  bookId,
  chapterId,
  bodyId: f.body.manifest.bodyId,
  index: 0,
  ...extra,
});
const read = (f, extra = {}) => f.api.readLegacyChapterText(uid, request(f, extra));
test('paged read preserves split UTF-8/BOM and reads only one physical part per transaction without writes', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    result = [],
    reads = [];
  const original = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (callback) =>
    original((tx) =>
      callback({
        ...tx,
        get: (ref) => {
          if (ref.path) reads.push(ref.path);
          return tx.get(ref);
        },
      }),
    );
  let token;
  for (let index = 0; index < f.body.manifest.chunkCount; index++) {
    const count = reads.length,
      page = await read(f, { index, ...(token ? { sourceToken: token } : {}) });
    token ??= page.sourceToken;
    assert.equal(page.sourceToken, token);
    assert.deepEqual(page.manifest, f.body.manifest);
    assert.equal(reads.slice(count).filter((path) => path.includes('/chunks/')).length, 1);
    result.push(Buffer.from(page.chunkBase64, 'base64'));
    assert.equal('path' in page, false);
  }
  assert.equal(Buffer.concat(result).toString('utf8'), f.content);
  await read(f, { sourceToken: token });
  assert.deepEqual([...f.records], before);
});
for (const mode of [
  'foreign',
  'no-root',
  'deleting-root',
  'deleting-chapter',
  'changed-pointer',
  'changed-header',
  'chapter-aba',
  'root-aba',
  'part-aba',
  'broken-part',
])
  test('each page rejects ' + mode + ' without a partial successful response', async () => {
    const f = await fixture(),
      first = await read(f),
      path = 'books/book/chapters/chapter',
      part = 'books/book/bookTextBodies/' + f.body.manifest.bodyId + '/chunks/000000000000001';
    if (mode === 'foreign') f.records.get('books/book').authorId = 'other';
    if (mode === 'no-root') f.records.delete('books/book');
    if (mode === 'deleting-root') f.records.get('books/book').deleting = true;
    if (mode === 'deleting-chapter') f.records.get(path).deleting = true;
    if (mode === 'changed-pointer') f.records.get(path).contentStorage.bodyId = 'a'.repeat(64);
    if (mode === 'changed-header')
      await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { title: 'changed' }));
    if (['chapter-aba', 'root-aba', 'part-aba'].includes(mode)) {
      const p = mode === 'chapter-aba' ? path : mode === 'root-aba' ? 'books/book' : part,
        value = structuredClone(f.records.get(p));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(p)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(p), value));
    }
    if (mode === 'broken-part') f.records.get(part).bytes[0] ^= 1;
    const before = structuredClone([...f.records]);
    await assert.rejects(() => read(f, { index: 1, sourceToken: first.sourceToken }));
    assert.deepEqual([...f.records], before);
  });
test('owner and closed part requests are checked; inline and prepared bodies are not a public fallback', async () => {
  const f = await fixture();
  await assert.rejects(() => f.api.readLegacyChapterText('other', request(f)), {
    code: 'not-found',
  });
  await assert.rejects(() => f.api.readLegacyChapterText(null, request(f)), {
    code: 'unauthenticated',
  });
  for (const extra of [
    { index: 1 },
    { index: -1 },
    { index: 128 },
    { sourceToken: 'bad' },
    { other: true },
    { bodyId: 'bad' },
    { index: 127 },
  ])
    await assert.rejects(() => read(f, extra));
  f.records.get('books/book/chapters/chapter').content = 'inline';
  delete f.records.get('books/book/chapters/chapter').contentStorage;
  await assert.rejects(() => read(f), { code: 'failed-precondition' });
});
test('history source, bootstrap ledger, backup projection and lore analysis hash use complete logical text', async () => {
  const f = await fixture(),
    original = structuredClone([...f.records]),
    source = await f.history.getWorkVersionSource(uid, { target, resource });
  assert.equal(source.content, f.content);
  assert.equal(source.contentHash, createHash('sha256').update(f.content).digest('hex'));
  const start = await f.backup.getBookBackupSource(uid, { bookId }),
    item = (
      await f.backup.listBookBackupStructure(uid, {
        bookId,
        kind: 'chapter',
        sourceToken: start.sourceToken,
      })
    ).items[0],
    parts = [];
  let total;
  for (let index = 0; total === undefined || index < total; index++) {
    const p = await f.backup.readBookBackupStructure(uid, {
      bookId,
      kind: 'chapter',
      sourceToken: start.sourceToken,
      ...item,
      index,
    });
    total = p.chunkCount;
    parts.push(Buffer.from(p.chunkBase64, 'base64'));
  }
  const backup = JSON.parse(Buffer.concat(parts).toString('utf8'));
  assert.equal(backup.content, f.content);
  assert.equal('contentStorage' in backup, false);
  assert.deepEqual([...f.records], original);
  let prepared;
  do {
    prepared = await f.api.prepareWorkWordCount(uid, {
      target,
      operationId: 'read-count-operation01',
      limit: 1,
    });
  } while (!prepared.complete);
  assert.equal(prepared.wordCount, countVisibleWords(f.content));
  // Analysis input is bounded separately; the saved-source hash still covers every byte.
  // This fixture has no lore; its query port requires an explicit limit.
  const analysisDb = { ...f.db, collection: (path) => f.db.collection(path).limit(501) },
    analysis = createLoreAnalysisService({ db: analysisDb, now: () => 3000 });
  await analysis.prepareBYOKLore(uid, {
    bookId,
    chapterId,
    requestId: 'read-lore-operation01',
    text: 'ação',
    content: 'ação',
    loreVersions: [],
    entities: [],
  });
  assert.equal(
    f.records.get('users/author/loreAnalyses/read-lore-operation01').chapterHash,
    createHash('sha256').update(JSON.stringify(f.content)).digest('hex'),
  );
});
test('missing external text never turns into an empty history, backup or count', async () => {
  const f = await fixture();
  const path = 'books/book/bookTextBodies/' + f.body.manifest.bodyId + '/chunks/000000000000000';
  f.records.delete(path);
  await assert.rejects(() => f.history.getWorkVersionSource(uid, { target, resource }));
  const start = await f.backup.getBookBackupSource(uid, { bookId }),
    item = (
      await f.backup.listBookBackupStructure(uid, {
        bookId,
        kind: 'chapter',
        sourceToken: start.sourceToken,
      })
    ).items[0];
  await assert.rejects(() =>
    f.backup.readBookBackupStructure(uid, {
      bookId,
      kind: 'chapter',
      sourceToken: start.sourceToken,
      ...item,
      index: 0,
    }),
  );
  await assert.rejects(() =>
    f.api.prepareWorkWordCount(uid, { target, operationId: 'missing-read-count01', limit: 1 }),
  );
  assert.equal(f.records.get('books/book').wordCount, 0);
  assert.equal(f.records.get('books/book/workProgress/current').processed, 0);
});

test('count excludes a deleting chapter without loading its already unavailable external body', async () => {
  const f = await fixture();
  f.records.get('books/book/chapters/chapter').deleting = true;
  for (const path of [...f.records.keys()])
    if (path.startsWith('books/book/bookTextBodies/')) f.records.delete(path);
  let result;
  do {
    result = await f.api.prepareWorkWordCount(uid, {
      target,
      operationId: 'deleting-read-count01',
      limit: 1,
    });
  } while (!result.complete);
  assert.equal(result.wordCount, 0);
  assert.equal(await f.history.getWorkVersionSource(uid, { target, resource }), null);
});
