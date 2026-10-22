import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { BOOK_RESTORE_METHODS, chunkId } from '../src/bookRestoreUploadContracts.mjs';
import { fixture, record, hash, utf8 } from './helpers/bookContentFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';

const uid = 'author',
  id = 'content-reader-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const input = (p) => ({ restoreId: id, jobToken: p.jobToken });
async function ready(f, records = fixture()) {
  const { progress } = await uploadArchiveRestore(f.api, uid, id, records);
  const done = await finishLegacyRestore(f.factory, uid, id, progress);
  assert.equal(done.state, 'content-verified');
  return done;
}
async function writeProof(f, item) {
  await f.db.runTransaction(async (tx) => {
    await item.verify(tx);
    tx.create(f.db.doc('private-test/proof'), { accepted: true });
  });
}
test('internal content reader reproduces every JSON and raw byte without writes or manuscript activation', async () => {
  const f = setup(),
    records = fixture(),
    p = await ready(f, records),
    before = structuredClone([...f.records]),
    reader = await f.factory().openVerifiedBookRestoreContent(uid, input(p));
  assert.equal(reader.bookId, p.bookId);
  assert.equal(reader.sourceBookId, 'book');
  const expected = records.filter(
    (r) => !['work-version-text', 'book-draft-text', 'book-cover-bytes'].includes(r.kind),
  );
  assert.equal(reader.itemCount, expected.length);
  for (let index = 0; index < reader.itemCount; index++) {
    const item = await reader.readItem(index),
      original = expected[index];
    assert.deepEqual(item.record, { kind: original.kind, id: original.id, part: 0 });
    assert.deepEqual(item.value, JSON.parse(new TextDecoder().decode(original.payload)));
    await f.db.runTransaction(item.verify);
    const rawRecords = records.filter(
      (r) =>
        (original.kind === 'work-version' &&
          r.kind === 'work-version-text' &&
          r.id === original.id) ||
        (original.kind === 'book-draft' && r.kind === 'book-draft-text'),
    );
    if (rawRecords.length) {
      const parts = [];
      for await (const part of item.raw()) {
        await f.db.runTransaction(part.verify);
        parts.push(part);
      }
      assert.equal(parts.at(-1).done, true);
      assert.deepEqual(
        parts.map((p) => Buffer.from(p.bytes)),
        rawRecords.map((r) => Buffer.from(r.payload)),
      );
    } else assert.equal(item.raw, null);
  }
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(BOOK_RESTORE_METHODS.includes('openVerifiedBookRestoreContent'), false);
});
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' +
      version +
      ' authenticated readback preserves normalized content without index writes',
    async () => {
      const f = setup(),
        { progress } = await uploadLegacyRestore(f.api, uid, id, bookLegacyFixture(version)),
        p = await finishLegacyRestore(f.factory, uid, id, progress),
        before = structuredClone([...f.records]),
        reader = await f.factory().openVerifiedBookRestoreContent(uid, input(p));
      let prose = false;
      for (let index = 0; index < reader.itemCount; index++) {
        const item = await reader.readItem(index);
        assert.equal(item.raw, null);
        await f.db.runTransaction(item.verify);
        if (JSON.stringify(item.value).includes('Own prose')) prose = true;
      }
      assert.equal(prose, true);
      assert.deepEqual([...f.records], before);
    },
  );
test('reader rejects wrong owner, missing token, prevalidation state and out-of-range items', async () => {
  const f = setup(),
    { progress } = await uploadArchiveRestore(f.api, uid, id, fixture());
  await assert.rejects(() => f.api.openVerifiedBookRestoreContent(uid, input(progress)));
  const p = await finishLegacyRestore(f.factory, uid, id, progress);
  for (const [actor, request] of [
    [null, input(p)],
    ['other', input(p)],
    [uid, { restoreId: id }],
    [uid, { ...input(p), jobToken: 'b'.repeat(64) }],
  ])
    await assert.rejects(() => f.api.openVerifiedBookRestoreContent(actor, request));
  const reader = await f.api.openVerifiedBookRestoreContent(uid, input(p));
  for (const index of [-1, 0.5, NaN, reader.itemCount])
    await assert.rejects(() => reader.readItem(index));
});
test('cancel after JSON/raw preparation blocks every subsequent read and atomic consumer write', async () => {
  const f = setup(),
    p = await ready(f),
    reader = await f.api.openVerifiedBookRestoreContent(uid, input(p));
  const item = await reader.readItem(0),
    history = await reader.readItem(reader.itemCount - 4),
    iterator = history.raw()[Symbol.asyncIterator](),
    part = (await iterator.next()).value;
  await f.api.cancelBookRestore(uid, mutation(id, p, 'reader-cancel-0001'));
  await assert.rejects(() => reader.readItem(0));
  await assert.rejects(() => writeProof(f, item));
  await assert.rejects(() => writeProof(f, part));
  assert.equal(f.records.has('private-test/proof'), false);
  await iterator.return();
});
test('pointer/receipt ABA and changed source proofs fail closed in the consuming transaction', async () => {
  for (const mode of ['pointer', 'receipt', 'birth', 'chunk', 'proof', 'state', 'job']) {
    const f = setup(),
      p = await ready(f),
      reader = await f.api.openVerifiedBookRestoreContent(uid, input(p)),
      item = await reader.readItem(0);
    const pointer = root + '/validationItems/' + chunkId(0),
      receipt =
        'users/' + uid + '/bookRestoreOperations/' + f.records.get(pointer).createdByOperationId,
      path = {
        pointer,
        receipt,
        birth:
          'users/' +
          uid +
          '/bookRestoreOperations/' +
          f.records.get(root).validationBirthOperationId,
        chunk: root + '/chunks/' + chunkId(0),
        proof: root + '/integrityProofs/' + chunkId(0),
        state: root + '/validationState/current',
        job: root,
      }[mode];
    const before = structuredClone(f.records.get(path));
    await f.db.runTransaction((tx) => {
      tx.delete(f.db.doc(path));
    });
    await f.db.runTransaction((tx) => {
      tx.create(f.db.doc(path), before);
    });
    await assert.rejects(() => writeProof(f, item), mode);
    // A recreated proof may still attest the unchanged original chunk on a fresh read.
    if (mode !== 'proof') await assert.rejects(() => reader.readItem(0), mode);
    assert.equal(f.records.has('private-test/proof'), false);
  }
});
test('JSON and raw proofs remain independent and source changes cannot be hidden behind cached data', async () => {
  const f = setup(),
    p = await ready(f),
    reader = await f.api.openVerifiedBookRestoreContent(uid, input(p));
  const item = await reader.readItem(0);
  const chunk = root + '/chunks/' + chunkId(0),
    value = structuredClone(f.records.get(chunk));
  value.chunkBase64 = Buffer.alloc(value.byteLength).toString('base64');
  await f.db.runTransaction((tx) => {
    tx.update(f.db.doc(chunk), value);
  });
  await assert.rejects(() => writeProof(f, item));
  await assert.rejects(() => reader.readItem(0));
});
test('multipart JSON and raw preserve exact BOM/Unicode plus empty history and allow transactional proof use', async () => {
  const records = fixture(),
    text = '\ufeff' + 'ação 🌙\n'.repeat(10000);
  const metadata = JSON.parse(new TextDecoder().decode(records[0].payload));
  metadata.book.synopsis = 'x'.repeat(70000);
  const encoded = record('book-metadata', 'book', metadata);
  records.splice(
    0,
    1,
    ...Array.from({ length: Math.ceil(encoded.payload.length / 65536) }, (_, part) => ({
      ...encoded,
      part,
      payload: encoded.payload.subarray(part * 65536, (part + 1) * 65536),
    })),
  );
  const draftIndex = records.findIndex((r) => r.kind === 'book-draft'),
    draft = JSON.parse(new TextDecoder().decode(records[draftIndex].payload));
  // Split only at valid UTF-8 boundaries, with nonfinal parts >= 65533 bytes.
  const all = utf8(text),
    parts = [];
  let offset = 0;
  while (offset < all.length) {
    let end = Math.min(offset + 65536, all.length);
    while (end < all.length && (all[end] & 0xc0) === 0x80) end--;
    parts.push(all.slice(offset, end));
    offset = end;
  }
  draft.byteLength = all.length;
  draft.chunkCount = parts.length;
  draft.contentHash = hash(all);
  records[draftIndex] = record('book-draft', 'book', draft);
  records.splice(
    draftIndex + 1,
    1,
    ...parts.map((payload, part) => ({
      kind: 'book-draft-text',
      id: draft.chapter.id,
      part,
      payload,
    })),
  );
  const f = setup(),
    p = await ready(f, records),
    reader = await f.api.openVerifiedBookRestoreContent(uid, input(p));
  assert.deepEqual((await reader.readItem(0)).value, metadata);
  let found;
  for (let i = 0; i < reader.itemCount; i++) {
    const item = await reader.readItem(i);
    if (item.record.kind === 'book-draft') found = item;
  }
  const result = [];
  for await (const part of found.raw()) {
    await f.db.runTransaction(part.verify);
    result.push(part.bytes);
  }
  assert.deepEqual(Buffer.concat(result), Buffer.from(all));
  await writeProof(f, found);
  assert.equal(f.records.get('private-test/proof').accepted, true);
});

test('PNG stream yields authenticated bytes without a Storage write', async () => {
  const records = fixture(),
    imageId = 'cover-image-0001',
    png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xkAAAAASUVORK5CYII=',
      'base64',
    ),
    metadata = JSON.parse(new TextDecoder().decode(records[0].payload));
  metadata.book.coverImageId = imageId;
  metadata.cover = { kind: 'library', imageId };
  records[0] = record('book-metadata', 'book', metadata);
  records[records.length - 1] = record('book-cover', 'book', {
    schemaVersion: 1,
    cover: {
      kind: 'library',
      imageId,
      contentType: 'image/png',
      byteLength: png.length,
      chunkCount: 1,
      contentHash: hash(png),
      name: 'Own cover',
    },
  });
  records.push({ kind: 'book-cover-bytes', id: imageId, part: 0, payload: new Uint8Array(png) });
  const f = setup(),
    p = await ready(f, records),
    reader = await f.api.openVerifiedBookRestoreContent(uid, input(p)),
    item = await reader.readItem(reader.itemCount - 1),
    parts = [];
  for await (const part of item.raw()) {
    await f.db.runTransaction(part.verify);
    parts.push(part.bytes);
  }
  assert.deepEqual(Buffer.concat(parts), png);
  assert.equal(f.records.has('books/' + p.bookId), false);
});
test('legacy catalog index alteration invalidates prepared and fresh reads', async () => {
  const f = setup(),
    { progress } = await uploadLegacyRestore(f.api, uid, id, bookLegacyFixture(6)),
    p = await finishLegacyRestore(f.factory, uid, id, progress),
    reader = await f.api.openVerifiedBookRestoreContent(uid, input(p)),
    item = await reader.readItem(0),
    entry = [...f.records].find(
      ([path, value]) =>
        path.startsWith(root + '/validationIndex/') &&
        JSON.stringify(value.key) === JSON.stringify(['legacy', 'book', '0']),
    );
  await f.db.runTransaction((tx) => {
    tx.delete(f.db.doc(entry[0]));
  });
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc(entry[0]), entry[1]);
  });
  await assert.rejects(() => writeProof(f, item));
  await assert.rejects(() => reader.readItem(0));
});
test('transient I/O failure changes no progress and fresh retry reads the same item', async () => {
  const f = setup(),
    p = await ready(f),
    reader = await f.api.openVerifiedBookRestoreContent(uid, input(p)),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('I/O unavailable');
  f.db.runTransaction = async () => {
    throw failure;
  };
  await assert.rejects(
    () => reader.readItem(0),
    (e) => e === failure,
  );
  f.db.runTransaction = run;
  assert.deepEqual((await reader.readItem(0)).value.book.title, 'Livro');
  assert.deepEqual([...f.records], before);
});
