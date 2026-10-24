import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createBookLoreReadService,
  setBookLoreReadHeaders,
  BOOK_LORE_READ_METHODS,
} from '../src/bookLoreRead.mjs';
import { openBookLoreRecord, readBookLoreRecordPart } from '../src/bookLoreStorageRead.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { seedBookLoreRead, readLoreSection } from './helpers/bookLoreReadFixture.mjs';
const sha = (v) => createHash('sha256').update(v).digest('hex');
function setup() {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, api: createBookLoreReadService({ db: f.db }) };
}
const scope = (f) => ({ bookId: f.bookId, id: f.id });
const request = (view, section = 'base', page = 0, index = 0) => ({
  bookId: view.bookId,
  id: view.id,
  readToken: view.readToken,
  section,
  page,
  index,
});
test('payload base and every relation page preserve complete literal data without exposing physical pointers in headers', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db),
    view = await f.api.getBookLoreRead(seed.uid, scope(seed));
  assert.equal(view.mode, 'payload');
  assert.deepEqual(view.relations, { present: true, count: 130, pages: 3 });
  for (const field of ['bodyId', 'merkleRoot', 'expectedBirth', 'payloadStorage', 'snapshot'])
    assert.equal(JSON.stringify(view).includes(field), false);
  const data = await readLoreSection(f.api, seed.uid, view);
  assert.equal(sha(data.details), sha(seed.data.details));
  assert.deepEqual(data.aliases, seed.data.aliases);
  assert.equal(data.bookId, seed.bookId);
  assert.equal(Object.hasOwn(data, 'relations'), false);
  const values = [];
  for (let page = 0; page < view.relations.pages; page++)
    values.push(...(await readLoreSection(f.api, seed.uid, view, 'relations', page)));
  assert.deepEqual(values, seed.data.relations);
  assert.equal(f.commits.at(-1).length, 0);
});
for (const mode of ['absent', 'empty'])
  test('inline legacy and payload preserve ' + mode + ' relations and missing fields', async () => {
    const f = setup(),
      data = { name: 'Literal', category: 'other', ...(mode === 'empty' ? { relations: [] } : {}) };
    for (const inline of [true, false]) {
      const seed = await seedBookLoreRead(f.db, {
          id: inline ? 'inline' : 'payload',
          inline,
          data,
        }),
        view = await f.api.getBookLoreRead(seed.uid, scope(seed)),
        value = await readLoreSection(f.api, seed.uid, view);
      if (inline) {
        assert.equal(view.relations, null);
        assert.equal(Object.hasOwn(value, 'relations'), mode === 'empty');
        assert.equal(Object.hasOwn(value, 'createdAt'), false);
      } else assert.deepEqual(view.relations, { present: mode === 'empty', count: 0, pages: 0 });
      assert.equal(Object.hasOwn(value, 'summary'), false);
    }
  });
test('more than 8 MiB and 128 parts are readable without a smaller transport ceiling', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, {
      data: { name: 'A', category: 'other', details: 'x'.repeat(9 * 1024 * 1024) },
    }),
    view = await f.api.getBookLoreRead(seed.uid, scope(seed));
  assert.ok(view.base.chunkCount > 128);
  const value = await readLoreSection(f.api, seed.uid, view);
  assert.equal(sha(value.details), sha(seed.data.details));
});
test('list pages include payload stubs without names, use only native metadata and impose no total cap', async () => {
  const f = setup();
  for (let index = 0; index < 137; index++)
    await seedBookLoreRead(f.db, {
      id: 'id-' + String(index).padStart(3, '0'),
      inline: true,
      data: { name: 'same', category: 'other' },
    });
  // Stub without a name must be listed by ID, without opening it.
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc('books/book/lore/zzz-stub'), { payloadStorage: { pending: true } });
  });
  f.reads.length = 0;
  f.metadataReads.length = 0;
  let cursor = null,
    listToken;
  const ids = [];
  do {
    const page = await f.api.listBookLoreRead('author', {
      bookId: 'book',
      limit: 17,
      cursor,
      ...(listToken ? { listToken } : {}),
    });
    listToken = page.listToken;
    ids.push(...page.items.map((i) => i.id));
    cursor = page.nextCursor;
    assert.ok(page.items.length <= 17);
  } while (cursor);
  assert.equal(ids.length, 138);
  assert.equal(ids.at(-1), 'zzz-stub');
  assert.equal(new Set(ids).size, 138);
  assert.ok(f.reads.every((r) => r.fields?.length === 0 && r.maximum === 18));
  assert.ok(
    f.metadataReads.every((r) => r.path === 'books/book' && r.fields.includes('localLoreVersion')),
  );
});
test('a list item token pins the same entity for its opening and every byte', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, { inline: true, data: { name: 'A', category: 'other' } }),
    listed = await f.api.listBookLoreRead(seed.uid, { bookId: seed.bookId }),
    item = listed.items[0],
    view = await f.api.getBookLoreRead(seed.uid, { ...scope(seed), readToken: item.readToken });
  assert.equal(view.readToken, item.readToken);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(seed.path), { name: 'Changed' });
  });
  await assert.rejects(() =>
    f.api.getBookLoreRead(seed.uid, { ...scope(seed), readToken: item.readToken }),
  );
  await assert.rejects(() => f.api.readBookLorePart(seed.uid, request(view)));
});
test('missing entity returns null only without a previously pinned identity', async () => {
  const f = setup();
  await seedBookLoreRead(f.db, { inline: true });
  assert.equal(await f.api.getBookLoreRead('author', { bookId: 'book', id: 'missing' }), null);
  await assert.rejects(() =>
    f.api.getBookLoreRead('author', { bookId: 'book', id: 'missing', readToken: 'a'.repeat(64) }),
  );
});
for (const mode of [
  'missing-book',
  'wrong-owner',
  'book-deleting',
  'lore-deleting',
  'invalid-clock',
  'invalid-state',
])
  test('authorization/state rejects ' + mode + ' without returning bytes', async () => {
    const f = setup(),
      seed = await seedBookLoreRead(f.db);
    if (mode === 'missing-book')
      await f.db.runTransaction(async (tx) => {
        tx.delete(f.db.doc(seed.bookPath));
      });
    if (mode === 'wrong-owner')
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc(seed.bookPath), { authorId: 'other' });
      });
    if (mode === 'book-deleting')
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc(seed.bookPath), { deleting: true });
      });
    if (mode === 'lore-deleting')
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc(seed.path), { deleting: true });
      });
    if (mode === 'invalid-clock')
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc(seed.bookPath), { localLoreVersion: -1 });
      });
    if (mode === 'invalid-state')
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc(seed.bookPath), { deleting: null });
      });
    await assert.rejects(() => f.api.getBookLoreRead('author', scope(seed)));
  });
test('anonymous actor and scope injection fail before any project data read', async () => {
  const f = setup();
  for (const actor of [undefined, '', 'bad/actor'])
    await assert.rejects(() => f.api.listBookLoreRead(actor, { bookId: 'book' }));
  for (const input of [
    { bookId: '../bad' },
    { bookId: 'book', target: { kind: 'universe', id: 'secret' } },
    { bookId: 'book', limit: 51 },
    { bookId: 'book', cursor: 'wrong' },
  ])
    await assert.rejects(() => f.api.listBookLoreRead('author', input));
  assert.equal(f.reads.length, 0);
});
test('book clock invalidates list/read tokens; unrelated project writes do not', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, { inline: true }),
    view = await f.api.getBookLoreRead(seed.uid, scope(seed)),
    list = await f.api.listBookLoreRead(seed.uid, { bookId: seed.bookId });
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(seed.bookPath), { title: 'Unrelated', updatedAt: 2000 });
  });
  assert.equal((await f.api.getBookLoreRead(seed.uid, scope(seed))).readToken, view.readToken);
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(seed.bookPath), { localLoreVersion: 1 });
  });
  await assert.rejects(() =>
    f.api.listBookLoreRead(seed.uid, { bookId: seed.bookId, listToken: list.listToken }),
  );
  await assert.rejects(() => f.api.readBookLorePart(seed.uid, request(view)));
});
for (const target of [
  'book',
  'lore',
  'base-body',
  'base-part',
  'segment',
  'relation-body',
  'relation-part',
])
  test(
    'recreated ' + target + ' invalidates an old opening even with identical bytes',
    async () => {
      const f = setup(),
        seed = await seedBookLoreRead(f.db),
        view = await f.api.getBookLoreRead(seed.uid, scope(seed)),
        partIndex = '000000000000000',
        path =
          target === 'book'
            ? seed.bookPath
            : target === 'lore'
              ? seed.path
              : target === 'base-body'
                ? seed.base.path
                : target === 'base-part'
                  ? 'books/book/bookResourceChunks/' +
                    seed.base.prepared.manifest.bodyId +
                    ':' +
                    partIndex
                  : target === 'segment'
                    ? seed.segments[0].path
                    : target === 'relation-body'
                      ? seed.segments[0].payload.path
                      : 'books/book/bookResourceChunks/' +
                        seed.segments[0].payload.prepared.manifest.bodyId +
                        ':' +
                        partIndex,
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction(async (tx) => {
        tx.delete(f.db.doc(path));
      });
      await f.db.runTransaction(async (tx) => {
        tx.create(f.db.doc(path), value);
      });
      const section = target.startsWith('relation') || target === 'segment' ? 'relations' : 'base';
      await assert.rejects(() => f.api.readBookLorePart(seed.uid, request(view, section)));
    },
  );
test('invalid part and relation page indices never read a native chunk', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db),
    view = await f.api.getBookLoreRead(seed.uid, scope(seed)),
    paths = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run(async (tx) =>
      fn({
        ...tx,
        get(ref) {
          paths.push(ref.path);
          return tx.get(ref);
        },
      }),
    );
  for (const input of [
    { ...request(view), index: -1 },
    { ...request(view), index: 1.5 },
    { ...request(view), index: view.base.chunkCount },
    request(view, 'base', 1),
    request(view, 'relations', 3),
    request(view, 'relations', 0, 10000),
  ]) {
    paths.length = 0;
    await assert.rejects(() => f.api.readBookLorePart(seed.uid, input));
    assert.equal(
      paths.some((path) => path?.includes('/bookResourceChunks/')),
      false,
    );
  }
});
test('cross-book/actor tokens and malformed cursors cannot be reused', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, { inline: true });
  await seedBookLoreRead(f.db, { bookId: 'other', inline: true });
  const page = await f.api.listBookLoreRead(seed.uid, { bookId: 'book', limit: 1 }),
    view = await f.api.getBookLoreRead(seed.uid, scope(seed));
  await assert.rejects(() => f.api.readBookLorePart('other', request(view)));
  await assert.rejects(() =>
    f.api.readBookLorePart('author', { ...request(view), bookId: 'other' }),
  );
  for (const cursor of [
    '%%%',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(
      JSON.stringify({ schemaVersion: 1, bookId: 'other', listToken: page.listToken, after: 'x' }),
    ).toString('base64url'),
  ])
    await assert.rejects(() =>
      f.api.listBookLoreRead('author', { bookId: 'book', listToken: page.listToken, cursor }),
    );
});
test('an internal opening is bound to its authorized transaction and cannot be replayed as a DTO', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db);
  const opened = await f.db.runTransaction(async (tx) =>
    openBookLoreRecord(
      tx,
      { ...seed, db: f.db, path: seed.bookPath },
      await tx.get(f.db.doc(seed.path)),
    ),
  );
  await f.db.runTransaction(async (tx) => {
    await assert.rejects(() => readBookLoreRecordPart(tx, opened, 'base', 0, 0));
    await assert.rejects(() => readBookLoreRecordPart(tx, { ...opened }, 'base', 0, 0));
  });
});
test('private read headers are no-store and unrelated methods are untouched', () => {
  const values = [],
    request = { rawRequest: { res: { setHeader: (...args) => values.push(args) } } };
  for (const method of BOOK_LORE_READ_METHODS) setBookLoreReadHeaders(method, request);
  assert.equal(values.length, 6);
  assert.ok(
    values.filter((v) => v[0] === 'Cache-Control').every((v) => v[1] === 'private, no-store'),
  );
  setBookLoreReadHeaders('updateScene', request);
  assert.equal(values.length, 6);
});

test('a private prepared payload without a book root is never readable or listed', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, { root: false });
  await assert.rejects(() => f.api.listBookLoreRead(seed.uid, { bookId: seed.bookId }));
  await assert.rejects(() => f.api.getBookLoreRead(seed.uid, scope(seed)));
  assert.equal(f.records.has(seed.bookPath), false);
});
test('absence of a legacy book clock is baseline zero, never an empty collection', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, {
      inline: true,
      data: { name: 'Legacy', category: 'other' },
    });
  await f.db.runTransaction(async (tx) => {
    tx.set(f.db.doc(seed.bookPath), { authorId: seed.uid, deleting: false });
  });
  const page = await f.api.listBookLoreRead(seed.uid, { bookId: seed.bookId });
  assert.equal(page.items.length, 1);
  const view = await f.api.getBookLoreRead(seed.uid, {
    ...scope(seed),
    readToken: page.items[0].readToken,
  });
  assert.equal((await readLoreSection(f.api, seed.uid, view)).name, 'Legacy');
});
for (const target of ['base-body', 'base-part', 'segment'])
  test(
    'actual metadata ABA of ' + target + ' is refused even after restoring its former value',
    async () => {
      const f = setup(),
        seed = await seedBookLoreRead(f.db),
        view = await f.api.getBookLoreRead(seed.uid, scope(seed)),
        path =
          target === 'base-body'
            ? seed.base.path
            : target === 'base-part'
              ? 'books/book/bookResourceChunks/' +
                seed.base.prepared.manifest.bodyId +
                ':000000000000000'
              : seed.segments[0].path,
        field = target === 'base-body' ? 'createdAt' : target === 'base-part' ? 'index' : 'count',
        before = f.records.get(path)[field];
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc(path), { [field]: before + 1 });
      });
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc(path), { [field]: before });
      });
      await assert.rejects(() =>
        f.api.readBookLorePart(
          seed.uid,
          request(view, target === 'segment' ? 'relations' : 'base'),
        ),
      );
    },
  );
test('a malformed present pointer and mixed legacy/payload fields fail without an inline fallback', async () => {
  const f = setup(),
    broken = await seedBookLoreRead(f.db, { storageTransform: () => null });
  await assert.rejects(() => f.api.getBookLoreRead(broken.uid, scope(broken)));
  const mixed = await seedBookLoreRead(f.db, { id: 'mixed' });
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(mixed.path), { name: 'Do not use this truncated name' });
  });
  await assert.rejects(() => f.api.getBookLoreRead(mixed.uid, scope(mixed)));
});
for (const field of ['loreId', 'count'])
  test(
    'a segment born with wrong ' + field + ' is rejected before reading its body bytes',
    async () => {
      const f = setup(),
        seed = await seedBookLoreRead(f.db, {
          segmentTransform: (s) => ({ ...s, [field]: field === 'count' ? s.count + 1 : 'other' }),
        }),
        view = await f.api.getBookLoreRead(seed.uid, scope(seed)),
        reads = [],
        run = f.db.runTransaction.bind(f.db);
      f.db.runTransaction = (fn) =>
        run(async (tx) =>
          fn({
            ...tx,
            get(ref) {
              reads.push(ref.path);
              return tx.get(ref);
            },
          }),
        );
      await assert.rejects(() => f.api.readBookLorePart(seed.uid, request(view, 'relations')));
      assert.equal(
        reads.some((path) => path?.includes('/bookResourceChunks/')),
        false,
      );
    },
  );
test('a segment born after the claimed seal is refused even when it is immutable', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, {
      storageTransform: (s) => ({ ...s, sealBirth: s.base.expectedBirth }),
    }),
    view = await f.api.getBookLoreRead(seed.uid, scope(seed));
  await assert.rejects(() => f.api.readBookLorePart(seed.uid, request(view, 'relations')));
});
test('a genuine pointer from another entity or book never authorizes its payload', async () => {
  const f = setup(),
    other = await seedBookLoreRead(f.db, { id: 'other' }),
    foreign = await seedBookLoreRead(f.db, { bookId: 'foreign', uid: 'other-author' }),
    sameBook = await seedBookLoreRead(f.db, {
      id: 'same-book-wrong',
      storageTransform: (s) => ({ ...s, base: other.storage.base }),
    }),
    otherBook = await seedBookLoreRead(f.db, {
      id: 'other-book-wrong',
      storageTransform: (s) => ({ ...s, base: foreign.storage.base }),
    });
  await assert.rejects(() => f.api.getBookLoreRead('author', scope(sameBook)));
  await assert.rejects(() => f.api.getBookLoreRead('author', scope(otherBook)));
});

test('a random base part uses five native reads and a relation part uses seven, including the deletion fence and one raw chunk each', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db),
    view = await f.api.getBookLoreRead(seed.uid, scope(seed)),
    run = f.db.runTransaction.bind(f.db),
    paths = [];
  f.db.runTransaction = (fn) =>
    run(async (tx) =>
      fn({
        ...tx,
        get(ref) {
          paths.push(ref.path);
          return tx.get(ref);
        },
        getAll(ref, ...args) {
          paths.push(ref.path);
          return tx.getAll(ref, ...args);
        },
      }),
    );
  for (const [section, index, expected] of [
    ['base', 7, 5],
    ['relations', 0, 7],
  ]) {
    paths.length = 0;
    const part = await f.api.readBookLorePart(seed.uid, request(view, section, 0, index));
    assert.equal(paths.length, expected);
    assert.equal(
      paths.filter((p) => p === 'books/' + seed.bookId + '/bookLoreTombstones/' + seed.id).length,
      1,
    );
    assert.equal(paths.filter((p) => p.includes('/bookResourceChunks/')).length, 1);
    assert.ok(Buffer.from(part.chunkBase64, 'base64').length <= 65536);
  }
});
test('an older native lore birthday does not reject segments protected by the later explicit seal', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, { olderLore: true }),
    view = await f.api.getBookLoreRead(seed.uid, scope(seed));
  assert.ok(
    f.metadata.get(seed.path).createdAtNanoseconds <
      f.metadata.get(seed.segments[0].path).createdAtNanoseconds,
  );
  const page = await readLoreSection(f.api, seed.uid, view, 'relations', 0);
  assert.deepEqual(page, seed.data.relations.slice(0, 64));
});
