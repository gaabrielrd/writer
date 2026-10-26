import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preparedLoreFixture,
  uid,
  loreOnlyRecords,
  loreRecords,
} from './helpers/bookRestorePreparedLoreFixture.mjs';
import { ready, finish, logical } from './helpers/bookRestoreLoreStreamFixture.mjs';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { loreEntityToken, readLoreBook } from '../src/bookLoreReadContracts.mjs';
import { bookBackupIdentity } from '../src/bookBackupContext.mjs';
import { digest } from '../src/sceneContracts.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
const scope = (f) => ({ bookId: f.p.bookId, id: f.entityId });
const header = (f) => f.reader.getBookLoreRead(uid, { ...scope(f), tokenVersion: 2 });
const request = (f, h, field = 'name') => ({
  ...scope(f),
  readToken: h.readToken,
  section: 'field',
  field,
  page: 0,
  index: 0,
});
async function section(f, h, kind, field, page = 0) {
  const parts = [];
  for (let index = 0; ; index++) {
    const r = await f.reader.readBookLorePart(uid, {
      ...scope(f),
      readToken: h.readToken,
      section: kind,
      ...(field ? { field } : {}),
      page,
      index,
    });
    parts.push(Buffer.from(r.chunkBase64, 'base64'));
    if (index + 1 === r.manifest.chunkCount) break;
  }
  return JSON.parse(Buffer.concat(parts).toString());
}
test('prepared port reads small empty fields, missing dates and relations after real drain with no active root', async () => {
  const f = await preparedLoreFixture({
      name: '',
      category: 'other',
      summary: '',
      aliases: ['', 'same', 'same'],
    }),
    list = await f.reader.listBookLoreRead(uid, { bookId: f.p.bookId, tokenVersion: 2, limit: 1 }),
    h = await f.reader.getBookLoreRead(uid, { ...scope(f), readToken: list.items[0].readToken });
  assert.equal(h.schemaVersion, 2);
  assert.deepEqual(h.dates, {});
  assert.deepEqual(h.relations, { present: false, count: 0, pages: 0 });
  assert.equal(await section(f, h, 'field', 'name'), '');
  assert.deepEqual(await section(f, h, 'field', 'aliases'), ['', 'same', 'same']);
  assert.equal(f.records.has('books/' + f.p.bookId), false);
  assert.equal(f.p.preparation.loreStaging.step, 'done');
  assert.equal(list.nextCursor, null);
  for (const text of ['bodyId', 'ownerId', 'jobToken', 'expectedBirth', 'payloadStorage'])
    assert.equal(JSON.stringify([list, h]).includes(text), false, text);
  await assert.rejects(() =>
    createBookLoreReadService({ db: f.db }).getBookLoreRead(uid, scope(f)),
  );
});
for (const dates of [{ createdAt: 0 }, { updatedAt: 0 }, { createdAt: 1, updatedAt: 2 }])
  test(
    'small indexed restoration preserves logical date presence ' + JSON.stringify(dates),
    async () => {
      const f = await preparedLoreFixture({
          name: 'N',
          category: 'other',
          relations: [],
          ...dates,
        }),
        h = await header(f),
        native = f.records.get('books/' + f.p.bookId + '/lore/' + f.entityId);
      assert.deepEqual(h.dates, dates);
      assert.equal(native.createdAt, f.p.preparation.timestamp);
      assert.equal(native.updatedAt, f.p.preparation.timestamp);
      assert.deepEqual(h.relations, { present: true, count: 0, pages: 0 });
    },
  );
test('new-job option false keeps the previous inline protocol and prepared reading still authenticates its head', async () => {
  const f = await preparedLoreFixture(
      { name: 'Previous', category: 'other' },
      { indexedLoreBodies: false },
    ),
    h = await header(f),
    part = await f.reader.readBookLorePart(uid, {
      ...scope(f),
      readToken: h.readToken,
      section: 'base',
      page: 0,
      index: 0,
    });
  assert.equal(h.mode, 'inline');
  assert.equal(h.schemaVersion, 1);
  assert.equal(JSON.parse(Buffer.from(part.chunkBase64, 'base64')).name, 'Previous');
});
test('opening before Counts, another account or destination, and an input attempting to supply authorization are refused', async () => {
  const early = await ready({ name: 'N', category: 'other' });
  await assert.rejects(() =>
    early.factory().openPreparedBookRestoreLore(uid, {
      restoreId: 'restore-lore-stream-0001',
      jobToken: early.p.jobToken,
    }),
  );
  const f = await preparedLoreFixture({ name: 'N', category: 'other' });
  await assert.rejects(() =>
    f.factory().openPreparedBookRestoreLore('other', { restoreId: f.id, jobToken: f.p.jobToken }),
  );
  await assert.rejects(() => f.reader.getBookLoreRead('other', scope(f)));
  await assert.rejects(() => f.reader.getBookLoreRead(uid, { ...scope(f), bookId: 'other' }));
  await assert.rejects(() =>
    f.reader.getBookLoreRead(uid, { ...scope(f), tokenScope: 'a'.repeat(64) }),
  );
});
test('list pages authenticate original heads and collection cursors reject changes of the job checkpoint', async () => {
  const f = await preparedLoreFixture(null, {
      records: loreOnlyRecords([
        ...loreRecords({ name: 'First', category: 'other' }, 'entity'),
        ...loreRecords({ name: 'Second', category: 'other' }, 'second'),
      ]),
    }),
    first = await f.reader.listBookLoreRead(uid, { bookId: f.p.bookId, tokenVersion: 2, limit: 1 });
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  const second = await f.reader.listBookLoreRead(uid, {
    bookId: f.p.bookId,
    tokenVersion: 2,
    limit: 1,
    listToken: first.listToken,
    cursor: first.nextCursor,
  });
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0].id, first.items[0].id);
  assert.equal(second.nextCursor, null);
  await f.factory().advanceBookRestorePersonas(uid, mutation(f.id, f.p, f.id + '-move-personas'));
  await assert.rejects(() =>
    f.reader.listBookLoreRead(uid, {
      bookId: f.p.bookId,
      tokenVersion: 2,
      limit: 1,
      listToken: first.listToken,
      cursor: first.nextCursor,
    }),
  );
});
for (const type of [
  'head',
  'part',
  'header',
  'segment',
  'journal',
  'receipt',
  'job',
  'reservation',
  'marker',
])
  test('prepared reads reject recreated native ' + type, async () => {
    const f = await preparedLoreFixture({
        name: 'N',
        category: 'other',
        relations: [{ targetEntityId: 'entity', relationType: '' }],
      }),
      h = await header(f),
      head = 'books/' + f.p.bookId + '/lore/' + f.entityId,
      body = f.records.get(head).payloadStorage.fields.name.manifest.bodyId,
      journal =
        'users/' +
        uid +
        '/bookRestores/' +
        f.id +
        '/materializationArtifacts/' +
        digest(['lore', f.entityId]);
    let path = {
      head,
      part: 'books/' + f.p.bookId + '/bookResourceChunks/' + body + ':000000000000000',
      header: 'books/' + f.p.bookId + '/bookResourceBodies/' + body,
      journal,
      receipt:
        'users/' + uid + '/bookRestoreOperations/' + f.records.get(journal).createdByOperationId,
      job: 'users/' + uid + '/bookRestores/' + f.id,
      reservation: 'bookRestoreReservations/' + f.p.bookId,
      marker: 'deletedBooks/' + f.p.bookId,
    }[type];
    if (type === 'segment')
      path = [...f.records.keys()].find((v) =>
        v.startsWith('books/' + f.p.bookId + '/bookLoreSegments/'),
      );
    assert.ok(f.records.has(path), path);
    const value = structuredClone(f.records.get(path));
    f.records.delete(path);
    f.metadata.delete(path);
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() =>
      f.reader.readBookLorePart(
        uid,
        type === 'segment'
          ? { ...scope(f), readToken: h.readToken, section: 'relations', page: 0, index: 0 }
          : request(f, h),
      ),
    );
  });
test('a missing original part journal and an unjournaled listed head fail without fallback', async () => {
  const f = await preparedLoreFixture({ name: 'N', category: 'other' }),
    h = await header(f),
    body = f.records.get('books/' + f.p.bookId + '/lore/' + f.entityId).payloadStorage.fields.name
      .manifest.bodyId,
    journal =
      'users/' +
      uid +
      '/bookRestores/' +
      f.id +
      '/materializationArtifacts/' +
      digest(['payload-chunk', body + ':000000000000000']);
  assert.ok(f.records.delete(journal));
  await assert.rejects(() => f.reader.readBookLorePart(uid, request(f, h)));
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/' + f.p.bookId + '/lore/restore-' + 'f'.repeat(64)), {
      name: 'Unjournaled',
      category: 'other',
    }),
  );
  await assert.rejects(() =>
    f.reader.listBookLoreRead(uid, { bookId: f.p.bookId, limit: 50, tokenVersion: 2 }),
  );
});
test('normal tokens keep their exact hashes and prepared tokens are distinct in both versions', async () => {
  const f = await preparedLoreFixture({ name: 'N', category: 'other' });
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/active'), { authorId: uid, localLoreVersion: 0 }),
  );
  const c = { db: f.db, uid, bookId: 'active', path: 'books/active' },
    snapshot = await f.db.doc('books/' + f.p.bookId + '/lore/' + f.entityId).get();
  await f.db.runTransaction(async (tx) => {
    const book = await readLoreBook(tx, c),
      native = bookBackupIdentity(snapshot);
    assert.equal(
      loreEntityToken(c, book, snapshot, 1),
      digest({
        schemaVersion: 1,
        domain: 'book-lore-read',
        uid,
        bookId: 'active',
        listToken: book.listToken,
        id: snapshot.id,
        native,
      }),
    );
    assert.equal(
      loreEntityToken(c, book, snapshot, 2),
      digest({
        schemaVersion: 2,
        domain: 'book-lore-read-entity',
        uid,
        bookId: 'active',
        bookBirth: bookBackupIdentity(book.snapshot).created,
        id: snapshot.id,
        native,
      }),
    );
  });
  for (const tokenVersion of [1, 2]) {
    const h = await f.reader.getBookLoreRead(uid, { ...scope(f), tokenVersion }),
      bare = loreEntityToken(
        { db: f.db, uid, bookId: f.p.bookId, path: 'books/' + f.p.bookId },
        {
          snapshot: await f.db.doc('users/' + uid + '/bookRestores/' + f.id).get(),
          listToken: 'a'.repeat(64),
        },
        snapshot,
        tokenVersion,
      );
    assert.notEqual(h.readToken, bare);
  }
});
test('previously opened port refuses cancellation and a target root appearing later', async () => {
  const f = await preparedLoreFixture({ name: 'N', category: 'other' }),
    h = await header(f);
  await f.factory().cancelBookRestore(uid, mutation(f.id, f.p, f.id + '-cancel'));
  await assert.rejects(() => f.reader.readBookLorePart(uid, request(f, h)));
  await cleanupLegacyRestore(
    f.factory(),
    uid,
    f.id,
    await f.factory().getBookRestore(uid, { restoreId: f.id, jobToken: f.p.jobToken }),
    { limit: 8 },
  );
  await assert.rejects(() => f.reader.getBookLoreRead(uid, scope(f)));
  const g = await preparedLoreFixture(
    { name: 'N', category: 'other' },
    { restoreId: 'prepared-lore-root-0002' },
  );
  await g.db.runTransaction(async (tx) =>
    tx.create(g.db.doc('books/' + g.p.bookId), { authorId: uid }),
  );
  await assert.rejects(() => g.reader.getBookLoreRead(uid, scope(g)));
});

test('missing prepared head returns null only without a pinned identity', async () => {
  const f = await preparedLoreFixture({ name: 'N', category: 'other' }),
    h = await header(f),
    absent = { bookId: f.p.bookId, id: 'restore-' + 'f'.repeat(64) };
  assert.equal(await f.reader.getBookLoreRead(uid, absent), null);
  await assert.rejects(() => f.reader.getBookLoreRead(uid, { ...absent, readToken: h.readToken }));
});
test('prepared field units read one physical part and leave all native data unchanged', async () => {
  const f = await preparedLoreFixture({
      name: 'N',
      category: 'other',
      details: 'x'.repeat(150000),
    }),
    h = await header(f),
    run = f.db.runTransaction.bind(f.db),
    paths = new Set(),
    before = structuredClone([...f.records]);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get(ref) {
          if (ref.path?.includes('/bookResourceChunks/')) paths.add(ref.path);
          return tx.get(ref);
        },
        getAll(ref, ...args) {
          if (ref.path?.includes('/bookResourceChunks/')) paths.add(ref.path);
          return tx.getAll(ref, ...args);
        },
      }),
    );
  const r = await f.reader.readBookLorePart(uid, { ...request(f, h, 'details'), index: 1 });
  assert.equal(paths.size, 1);
  assert.equal(Buffer.from(r.chunkBase64, 'base64').length, 65536);
  assert.deepEqual([...f.records], before);
});
test('an older completed payload job without drainage proof cannot open the new prepared port', async () => {
  const f = await preparedLoreFixture({ name: 'N', category: 'other' }),
    path = 'users/' + uid + '/bookRestores/' + f.id,
    value = structuredClone(f.records.get(path));
  delete value.preparation.loreStaging;
  delete value.preparation.retiredArtifacts;
  f.records.set(path, value);
  await assert.rejects(() => f.open());
});

test('enabling the indexed option preserves a monolithic prefix started with the original policy', async () => {
  const data = { name: 'Previous', category: 'other', details: 'x'.repeat(530000) },
    f = await ready(data, { indexedLoreBodies: false }),
    restoreId = 'restore-lore-stream-0001';
  f.factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  const first = await f
    .factory()
    .advanceBookRestoreLore(uid, mutation(restoreId, f.p, 'previous-prefix-first-0001'));
  assert.ok(first.progress.preparation.lorePayload);
  assert.notEqual(first.progress.preparation.lorePayload.streamed, true);
  f.factory = () =>
    createBookRestoreUploadService({ db: f.db, now: () => 1000, indexedLoreBodies: true });
  const p = await finish(f, first.progress),
    result = await logical(f, p);
  assert.equal(result.native.payloadStorage.schemaVersion, 1);
  assert.equal(result.data.details, data.details);
  assert.equal(f.records.has('books/' + p.bookId), false);
});
