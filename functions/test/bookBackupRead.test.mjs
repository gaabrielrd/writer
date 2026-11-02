import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import {
  BOOK_STRUCTURE_LIMITS,
  serializeBookBackupStructure,
} from '../src/bookBackupStructure.mjs';
import { studioDb } from './helpers/studioDb.mjs';

function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro 🌙',
    status: 'published',
    wordCount: 5,
    coverUrl: 'https://private.invalid/cover?token=secret',
    universeId: 'universe',
    personaId: 'persona',
    createdAt: 1,
    updatedAt: 2,
    privateReceipt: 'secret',
  });
  f.records.set('books/book/acts/ato', { name: null, order: 1, createdAt: 3, updatedAt: 4 });
  f.records.set('books/book/chapters/capítulo', {
    title: 'Capítulo',
    content: '',
    order: 1,
    actId: 'ato',
    contentMode: 'scenes',
    assemblyRevision: 3,
    structureRevision: 4,
    createdAt: 5,
    updatedAt: 6,
    wordCount: 0,
    operationId: 'secret',
    personaComplement: {
      personaId: 'persona',
      overrides: [{ traitId: 'tom', value: 30, secret: 'omit' }],
      apiKey: 'omit',
    },
  });
  return { ...f, api: createBookBackupReadService({ db: f.db }) };
}
const start = (f, extra = {}) => f.api.getBookBackupSource('author', { bookId: 'book', ...extra });
const list = (f, source, extra = {}) =>
  f.api.listBookBackupStructure('author', {
    bookId: 'book',
    sourceToken: source.sourceToken,
    kind: 'chapter',
    ...extra,
  });
const read = (f, source, item, extra = {}) =>
  f.api.readBookBackupStructure('author', {
    bookId: 'book',
    sourceToken: source.sourceToken,
    kind: 'chapter',
    ...item,
    index: 0,
    ...extra,
  });
const change = (f, path, patch) =>
  f.db.runTransaction((tx) => {
    tx.update(f.db.doc(path), patch);
  });
async function reconstruct(f, source, item, kind = 'chapter') {
  const parts = [];
  let first;
  for (let index = 0; !first || index < first.chunkCount; index++) {
    const part = await read(f, source, item, { kind, index });
    first ??= part;
    assert.equal(part.contentHash, first.contentHash);
    assert.equal(part.byteLength, first.byteLength);
    assert.ok(Buffer.from(part.chunkBase64, 'base64').length <= BOOK_STRUCTURE_LIMITS.chunkBytes);
    parts.push(Buffer.from(part.chunkBase64, 'base64'));
  }
  const bytes = Buffer.concat(parts);
  assert.equal(bytes.length, first.byteLength);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), first.contentHash);
  return JSON.parse(bytes.toString('utf8'));
}
test('read-only source preserves metadata/progress and reports legacy cover without leaking URL, receipts or publication', async () => {
  const f = fixture(),
    before = structuredClone(f.records);
  const source = await start(f);
  const book = await reconstruct(f, source, { id: 'book', itemToken: source.sourceToken }, 'book');
  assert.deepEqual(book, {
    book: {
      title: 'Livro 🌙',
      personaId: 'persona',
      universeId: 'universe',
      createdAt: 1,
      updatedAt: 2,
    },
    progress: { editorialState: 'draft', wordGoal: null },
    cover: { kind: 'legacy-unavailable' },
  });
  assert.deepEqual(f.records, before);
  assert.equal(f.records.has('books/book/workProgress/current'), false);
  const item = (await list(f, source)).items[0];
  assert.deepEqual(await reconstruct(f, source, item), {
    title: 'Capítulo',
    order: 1,
    actId: 'ato',
    content: '',
    contentMode: 'scenes',
    assemblyRevision: 3,
    structureRevision: 4,
    createdAt: 5,
    updatedAt: 6,
    personaComplement: { personaId: 'persona', overrides: [{ traitId: 'tom', value: 30 }] },
  });
  const acts = await list(f, source, { kind: 'act' });
  assert.deepEqual(await reconstruct(f, source, acts.items[0], 'act'), {
    name: null,
    order: 1,
    createdAt: 3,
    updatedAt: 4,
  });
});
test('pages cover 118 chapters without reading prose, use ID order and bind cursor to source/kind/book', async () => {
  const f = fixture();
  for (let i = 0; i < 117; i++)
    f.records.set('books/book/chapters/c' + String(i).padStart(3, '0'), {
      content: 'private'.repeat(1000),
    });
  const source = await start(f),
    ids = [];
  let cursor = null,
    first;
  do {
    const page = await list(f, source, { cursor, limit: 50 });
    first ??= page;
    assert.ok(page.items.length <= 50);
    page.items.forEach((item) => assert.deepEqual(Object.keys(item), ['id', 'itemToken']));
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 118);
  assert.equal(new Set(ids).size, 118);
  assert.equal(f.reads.length, 3);
  assert.ok(
    f.reads.every(
      (entry) => entry.maximum === 51 && entry.count <= 51 && entry.fields.length === 0,
    ),
  );
  await assert.rejects(list(f, source, { kind: 'act', cursor: first.nextCursor }), {
    code: 'invalid-argument',
  });
  await assert.rejects(list(f, source, { cursor: first.nextCursor + '=' }), {
    code: 'invalid-argument',
  });
});
test('multi-part Unicode/escape-heavy chapter reassembles byte exactly with canonical base64 and SHA-256', async () => {
  const f = fixture(),
    content = '🌙ação\u0000\n'.repeat(35000);
  f.records.get('books/book/chapters/capítulo').content = content;
  const source = await start(f),
    item = (await list(f, source)).items[0];
  assert.equal((await reconstruct(f, source, item)).content, content);
  const first = await read(f, source, item);
  assert.ok(first.chunkCount > 8);
  assert.equal(first.chunkBase64, Buffer.from(first.chunkBase64, 'base64').toString('base64'));
  await assert.rejects(read(f, source, item, { index: first.chunkCount }), {
    code: 'invalid-argument',
  });
});
test('native control presence/update and root nanoseconds invalidate source even when product date is equal', async () => {
  for (const mutate of [
    async (f) =>
      f.records.set('books/book/workProgress/current', { editorialState: 'draft', wordGoal: 100 }),
    async (f) => f.metadata.set('books/book', { updatedAt: 20, updatedAtNanoseconds: 1 }),
  ]) {
    const f = fixture(),
      source = await start(f);
    await mutate(f);
    assert.notEqual((await start(f)).sourceToken, source.sourceToken);
    await assert.rejects(start(f, { expectedSourceToken: source.sourceToken }), {
      details: { reason: 'book-backup-source-changed' },
    });
    await assert.rejects(list(f, source), { code: 'failed-precondition' });
  }
  const f = fixture();
  f.records.set('books/book/workProgress/current', { editorialState: 'draft', wordGoal: 100 });
  const source = await start(f);
  await change(f, 'books/book/workProgress/current', { wordGoal: 200 });
  assert.equal(f.records.get('books/book').updatedAt, 2);
  await assert.rejects(list(f, source), { details: { reason: 'book-backup-source-changed' } });
});
test('isolated chapter metadata preserves source but invalidates item; content ABA and recreated IDs cannot reuse proof', async () => {
  const f = fixture(),
    source = await start(f),
    item = (await list(f, source)).items[0];
  await change(f, 'books/book/chapters/capítulo', { title: 'Novo título' });
  assert.equal((await start(f)).sourceToken, source.sourceToken);
  assert.notEqual((await list(f, source)).items[0].itemToken, item.itemToken);
  await assert.rejects(read(f, source, item), { details: { reason: 'book-backup-item-changed' } });
  const current = (await list(f, source)).items[0];
  await change(f, 'books/book/chapters/capítulo', { title: 'Capítulo' });
  await assert.rejects(read(f, source, current), { code: 'failed-precondition' });
  const latest = (await list(f, source)).items[0];
  f.metadata.set('books/book/chapters/capítulo', { createdAt: 10, createdAtNanoseconds: 1 });
  await assert.rejects(read(f, source, latest), { code: 'failed-precondition' });
});
test('author-only access is rechecked per method; published, missing, deleting and recreated roots never grant access', async () => {
  const f = fixture(),
    source = await start(f),
    item = (await list(f, source)).items[0];
  for (const uid of [null, 'other']) {
    await assert.rejects(f.api.getBookBackupSource(uid, { bookId: 'book' }), {
      code: uid ? 'not-found' : 'unauthenticated',
    });
    await assert.rejects(
      f.api.listBookBackupStructure(uid, {
        bookId: 'book',
        kind: 'chapter',
        sourceToken: source.sourceToken,
      }),
      { code: uid ? 'not-found' : 'unauthenticated' },
    );
    await assert.rejects(
      f.api.readBookBackupStructure(uid, {
        bookId: 'book',
        kind: 'chapter',
        sourceToken: source.sourceToken,
        ...item,
        index: 0,
      }),
      { code: uid ? 'not-found' : 'unauthenticated' },
    );
  }
  await change(f, 'books/book', { deleting: true });
  await assert.rejects(read(f, source, item), { code: 'not-found' });
  f.records.get('books/book').deleting = false;
  f.metadata.set('books/book', { createdAt: 10, createdAtNanoseconds: 5 });
  await assert.rejects(list(f, source), { code: 'failed-precondition' });
  f.records.delete('books/book');
  await assert.rejects(start(f), { code: 'not-found' });
});
test('closed inputs reject bad tokens, kinds, paths, limits, indexes and unknown properties', async () => {
  const f = fixture(),
    source = await start(f),
    item = (await list(f, source)).items[0];
  for (const extra of [
    { index: -1 },
    { index: 0.5 },
    { kind: 'scene' },
    { id: '../x' },
    { itemToken: 'x' },
    { extra: true },
  ])
    await assert.rejects(read(f, source, item, extra), { code: 'invalid-argument' });
  for (const extra of [
    { limit: 0 },
    { limit: 51 },
    { kind: 'book' },
    { sourceToken: null },
    { cursor: '' },
    { extra: true },
  ])
    await assert.rejects(list(f, source, extra), { code: 'invalid-argument' });
  await assert.rejects(start(f, { expectedSourceToken: null }), { code: 'invalid-argument' });
  await assert.rejects(
    read(f, source, { id: 'book', itemToken: source.sourceToken }, { kind: 'book', id: 'other' }),
    { code: 'invalid-argument' },
  );
});
test('busy, missing and unrepresentable items fail explicitly without partial data or fabricated dates', async () => {
  const f = fixture();
  delete f.records.get('books/book').createdAt;
  delete f.records.get('books/book').updatedAt;
  const source = await start(f),
    item = (await list(f, source)).items[0];
  const book = await reconstruct(f, source, { id: 'book', itemToken: source.sourceToken }, 'book');
  assert.equal('createdAt' in book.book, false);
  assert.equal('updatedAt' in book.book, false);
  f.records.get('books/book/chapters/capítulo').deleting = true;
  await assert.rejects(read(f, source, item), { code: 'failed-precondition' });
  delete f.records.get('books/book/chapters/capítulo').deleting;
  f.records.get('books/book/chapters/capítulo').order = NaN;
  await assert.rejects(read(f, source, item), { code: 'failed-precondition' });
  f.records.delete('books/book/chapters/capítulo');
  await assert.rejects(read(f, source, item), { code: 'failed-precondition' });
});
test('projection preserves existing control/library cover and rejects unsupported JSON, malformed complement and oversized item', () => {
  const encoded = serializeBookBackupStructure(
    'book',
    { title: 'Livro', coverImageId: 'image' },
    { editorialState: 'review', wordGoal: 1500, activity: 'private' },
  );
  assert.deepEqual(JSON.parse(encoded.json), {
    book: { title: 'Livro', coverImageId: 'image' },
    progress: { editorialState: 'review', wordGoal: 1500 },
    cover: { kind: 'library', imageId: 'image' },
  });
  assert.deepEqual(JSON.parse(serializeBookBackupStructure('book', {}, {}).json).cover, {
    kind: 'none',
  });
  assert.throws(() => serializeBookBackupStructure('scene', {}, {}), TypeError);
  for (const value of [
    undefined,
    Infinity,
    1n,
    () => 1,
    new Date(0),
    new Map(),
    { toJSON: () => 'changed' },
  ])
    assert.throws(() => serializeBookBackupStructure('chapter', { content: value }), TypeError);
  assert.throws(
    () => serializeBookBackupStructure('chapter', { personaComplement: { overrides: null } }),
    TypeError,
  );
  assert.throws(
    () =>
      serializeBookBackupStructure('chapter', {
        content: 'x'.repeat(BOOK_STRUCTURE_LIMITS.itemBytes),
      }),
    RangeError,
  );
});
