import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { bookRestoreIndexedLore } from '../src/bookRestoreLoreRead.mjs';
import { BOOK_RESTORE_METHODS, chunkId } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { indexedLoreData, indexedLoreArchive } from './helpers/bookLoreContentFixture.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import {
  finishLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import { uploadLegacyRestore } from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'indexed-lore-reader-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
const input = (p) => ({ restoreId: id, jobToken: p.jobToken });
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
async function ready(f, data = indexedLoreData()) {
  const records = indexedLoreArchive(data),
    { progress, bytes } = await uploadArchiveRestore(f.api, uid, id, records),
    p = await finishLegacyRestore(f.factory, uid, id, progress);
  assert.equal(p.state, 'content-verified');
  const entry = [...f.records].find(
      ([path, value]) =>
        path.startsWith(root + '/validationItems/') && value.record.kind === 'book-lore',
    ),
    pointer = entry[1],
    reader = await f.factory().openVerifiedBookRestoreContent(uid, input(p));
  return {
    p,
    bytes,
    pointer,
    path: entry[0],
    reader,
    index: pointer.index,
    lore: await reader.openIndexedLore(pointer.index),
    logical: Buffer.concat(records.filter((r) => r.kind === 'book-lore').map((r) => r.payload)),
  };
}
async function consume(f, unit, name = 'accepted') {
  await f.db.runTransaction(async (tx) => {
    await unit.verify(tx);
    tx.create(f.db.doc('private-test/' + name), { accepted: true });
  });
}
async function recreate(f, path) {
  const value = structuredClone(f.records.get(path));
  assert.ok(value, path);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
}
function countSourceReads(f) {
  const paths = [],
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (operation) =>
    run((tx) =>
      operation({
        ...tx,
        get: (ref) => {
          if (ref.path?.startsWith(root + '/chunks/')) paths.push(ref.path);
          return tx.get(ref);
        },
      }),
    );
  return paths;
}
test('indexed metadata is immutable, private, read-only and does not download any uploaded body', async () => {
  const f = setup(),
    r = await ready(f),
    paths = countSourceReads(f),
    before = f.commits.length,
    lore = await r.reader.openIndexedLore(r.index);
  assert.equal(paths.length, 0);
  assert.ok(f.commits.slice(before).every((writes) => writes.length === 0));
  assert.equal(Object.isFrozen(lore), true);
  assert.equal(Object.isFrozen(lore.metadata.index.ranges.name), true);
  assert.throws(() => {
    lore.metadata.index.ranges.name.offset = 0;
  }, TypeError);
  assert.equal(lore.record.kind, 'book-lore');
  assert.equal(lore.metadata.id, 'entity');
  assert.equal(lore.metadata.index.dates.createdAt, 0);
  assert.deepEqual(lore.metadata.index.isPublic, { present: true, value: false });
  assert.equal(lore.metadata.index.relations.count, 130);
  assert.equal(JSON.stringify(lore.metadata).includes('PRIVATE_INDEXED_LORE_BODY'), false);
  assert.match(lore.sourceToken, /^[a-f0-9]{64}$/);
  const fresh = await f.api.openVerifiedBookRestoreContent(uid, input(r.p));
  assert.equal((await fresh.openIndexedLore(r.index)).sourceToken, lore.sourceToken);
  await f.db.runTransaction(lore.verify);
  assert.equal(f.records.has('books/' + r.p.bookId), false);
  assert.equal(BOOK_RESTORE_METHODS.includes('openIndexedLore'), false);
});
test('raw ranges and every field preserve exact UTF-8, escapes, optional presence and byte-relative offsets', async () => {
  const data = indexedLoreData({ count: 3 });
  data.details = 'a"b\\c\ufeff🌙\n'.repeat(8000);
  delete data.summary;
  const f = setup(),
    r = await ready(f, data);
  for (const offset of [r.logical.length - 15, 65530, 0]) {
    const length = Math.min(65536, r.logical.length - offset),
      unit = await r.lore.readRange(offset, length);
    assert.deepEqual(Buffer.from(unit.bytes), r.logical.subarray(offset, offset + length));
    assert.equal(unit.offset, offset);
    assert.equal(unit.nextOffset, offset + length);
    assert.equal(unit.done, offset + length === r.logical.length);
    await f.db.runTransaction(unit.verify);
  }
  for (const field of r.lore.metadata.index.fields) {
    const values = [];
    let offset = 0;
    for (;;) {
      const unit = await r.lore.readField(field, { offset, limit: field === 'name' ? 1 : 65536 });
      assert.equal(unit.present, true);
      assert.equal(unit.offset, offset);
      values.push(Buffer.from(unit.bytes));
      offset = unit.nextOffset;
      await f.db.runTransaction(unit.verify);
      if (unit.done) break;
    }
    assert.equal(Buffer.concat(values).toString(), JSON.stringify(data[field]));
    const end = await r.lore.readField(field, { offset });
    assert.equal(end.bytes.length, 0);
    assert.equal(end.done, true);
  }
  const missing = await r.lore.readField('summary');
  assert.deepEqual(Object.keys(missing).sort(), ['field', 'present', 'verify']);
  assert.equal(missing.present, false);
  await f.db.runTransaction(missing.verify);
  assert.equal((await r.lore.readField('isPublic')).present, true);
  assert.equal(f.records.has('books/' + r.p.bookId), false);
});
test('a zero-length range is explicit and bounded while malformed requests never read body bytes', async () => {
  const data = indexedLoreData();
  delete data.summary;
  const f = setup(),
    r = await ready(f, data),
    paths = countSourceReads(f);
  for (const args of [
    [-1, 1],
    [0, 65537],
    [0.5, 1],
    [0, -1],
    [NaN, 1],
    [r.logical.length, 1],
    [Number.MAX_SAFE_INTEGER, 1],
  ])
    await assert.rejects(() => r.lore.readRange(...args));
  for (const [field, options] of [
    ['bookId', {}],
    ['details', { limit: 0 }],
    ['details', { limit: 65537 }],
    ['details', { offset: -1 }],
    ['summary', { offset: 1 }],
    ['name', { offset: r.lore.metadata.index.ranges.name.byteLength + 1 }],
  ])
    await assert.rejects(() => r.lore.readField(field, options));
  assert.equal(paths.length, 0);
  const eof = await r.lore.readRange(r.logical.length, 0);
  assert.equal(eof.done, true);
  assert.equal(eof.bytes.length, 0);
  await f.db.runTransaction(eof.verify);
  assert.equal(paths.length, 0);
});
test('large prose and relation descriptions seek directly and each unit retains only its own bounded chunk proofs', async () => {
  const data = indexedLoreData({ large: true, largeRelation: true }),
    f = setup(),
    r = await ready(f, data),
    reads = countSourceReads(f);
  assert.ok(r.logical.length > 16 * 1024 * 1024);
  await assert.rejects(() => r.reader.readItem(r.index));
  for (const field of ['details', 'relations']) {
    const expected = Buffer.from(JSON.stringify(data[field])),
      range = r.lore.metadata.index.ranges[field];
    assert.ok(range.byteLength > 8 * 1024 * 1024);
    for (const offset of [range.byteLength - 65536, 65530, 0]) {
      reads.length = 0;
      const unit = await r.lore.readField(field, { offset });
      assert.deepEqual(Buffer.from(unit.bytes), expected.subarray(offset, offset + 65536));
      assert.ok(new Set(reads).size <= 4, 'one range must not scan preceding parts');
      const at = f.metadataReads.length;
      await f.db.runTransaction(unit.verify);
      const verified = f.metadataReads
        .slice(at)
        .filter((v) => v.path.startsWith(root + '/chunks/'));
      assert.ok(
        verified.length > 0 && verified.length <= 4,
        'proofs must not accumulate across ranges',
      );
      assert.equal(new Set(verified.map((v) => v.path)).size, verified.length);
    }
  }
  assert.equal(f.records.has('books/' + r.p.bookId), false);
});
test('metadata absence differs from empty strings, empty relations, false and omitted dates', async () => {
  for (const relations of [undefined, []]) {
    const data = { name: '', category: 'other', summary: '', isPublic: false };
    if (relations) data.relations = relations;
    const f = setup(),
      r = await ready(f, data),
      relation = await r.lore.readField('relations');
    assert.equal(relation.present, relations !== undefined);
    assert.equal((await r.lore.readField('createdAt')).present, false);
    assert.deepEqual(r.lore.metadata.index.dates, {});
    assert.equal(Buffer.from((await r.lore.readField('summary')).bytes).toString(), '""');
    assert.equal(Buffer.from((await r.lore.readField('isPublic')).bytes).toString(), 'false');
    if (relations) assert.equal(Buffer.from(relation.bytes).toString(), '[]');
  }
});
test('invalid pointer metadata never becomes a descriptor or a fabricated field', async () => {
  const f = setup(),
    r = await ready(f);
  for (const change of [
    (p) => {
      p.lore = null;
    },
    (p) => {
      p.legacy = null;
    },
    (p) => {
      p.spans = [];
    },
    (p) => {
      p.record.id = 'wrong';
    },
    (p) => {
      p.record.part = 1;
    },
    (p) => {
      p.lore.contentHash = 'bad';
    },
    (p) => {
      p.lore.chunkCount++;
    },
    (p) => {
      p.lore.cursor.done = true;
    },
    (p) => {
      p.lore.metadata.dataOffset = Number.MAX_SAFE_INTEGER;
    },
    (p) => {
      p.lore.metadata.index.fields.reverse();
    },
    (p) => {
      p.lore.metadata.index.ranges.name.offset = 0;
    },
    (p) => {
      p.lore.metadata.index.ranges.name = { ...p.lore.metadata.index.ranges.category };
    },
    (p) => {
      p.lore.metadata.index.dates.createdAt = -1;
    },
    (p) => {
      p.lore.metadata.index.isPublic.value = null;
    },
    (p) => {
      p.lore.metadata.index.relations.count = -1;
    },
  ]) {
    const pointer = structuredClone(r.pointer);
    change(pointer);
    assert.throws(() => bookRestoreIndexedLore(pointer));
  }
});
test('wrong owner/token, prevalidation state and invalid item indices cannot open indexed lore', async () => {
  const f = setup(),
    uploaded = await uploadArchiveRestore(f.api, uid, id, indexedLoreArchive());
  await assert.rejects(() => f.api.openVerifiedBookRestoreContent(uid, input(uploaded.progress)));
  const p = await finishLegacyRestore(f.factory, uid, id, uploaded.progress);
  for (const [actor, request] of [
    [null, input(p)],
    ['other', input(p)],
    [uid, { restoreId: id }],
    [uid, { ...input(p), jobToken: 'f'.repeat(64) }],
  ])
    await assert.rejects(() => f.api.openVerifiedBookRestoreContent(actor, request));
  const reader = await f.api.openVerifiedBookRestoreContent(uid, input(p));
  for (const index of [-1, 0.5, NaN, reader.itemCount])
    await assert.rejects(() => reader.openIndexedLore(index));
  assert.equal(await reader.openIndexedLore(0), null);
});
test('legacy pointers remain explicit compatibility cases without becoming indexed lore', async () => {
  const f = setup(),
    uploaded = await uploadLegacyRestore(f.api, uid, id, bookLegacyFixture(6)),
    p = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
    reader = await f.api.openVerifiedBookRestoreContent(uid, input(p));
  let found = false;
  for (let index = 0; index < reader.itemCount; index++) {
    const item = await reader.readItem(index);
    assert.equal(await reader.openIndexedLore(index), null);
    if (item.record.kind === 'book-lore') found = true;
  }
  assert.equal(found, true);
});
for (const mode of ['pointer', 'receipt', 'birth', 'chunk', 'proof', 'state', 'job'])
  test(
    'native ' +
      mode +
      ' recreation invalidates an already read indexed range before consumer write',
    async () => {
      const f = setup(),
        r = await ready(f),
        unit = await r.lore.readField('details'),
        paths = {
          pointer: r.path,
          receipt: 'users/' + uid + '/bookRestoreOperations/' + r.pointer.createdByOperationId,
          birth:
            'users/' +
            uid +
            '/bookRestoreOperations/' +
            f.records.get(root).validationBirthOperationId,
          chunk: root + '/chunks/' + chunkId(0),
          proof: root + '/integrityProofs/' + chunkId(0),
          state: root + '/validationState/current',
          job: root,
        };
      await recreate(f, paths[mode]);
      await assert.rejects(() => consume(f, unit));
      if (mode !== 'proof') await assert.rejects(() => r.lore.readField('details'));
      assert.equal(f.records.has('private-test/accepted'), false);
      assert.equal(f.records.has('books/' + r.p.bookId), false);
    },
  );
test('cancel after metadata/absence/range preparation prevents all consumers and subsequent reads', async () => {
  const data = indexedLoreData();
  delete data.summary;
  const f = setup(),
    r = await ready(f, data),
    unit = await r.lore.readField('details'),
    missing = await r.lore.readField('summary');
  await f.api.cancelBookRestore(uid, mutation(id, r.p, id + '-cancel'));
  for (const pending of [r.lore, unit, missing]) await assert.rejects(() => consume(f, pending));
  await assert.rejects(() => r.lore.readRange(0, 10));
  await assert.rejects(() => r.lore.readField('summary'));
  assert.equal(f.records.has('private-test/accepted'), false);
});
test('changed source bytes fail both held proofs and fresh range reads with no progress or target write', async () => {
  const f = setup(),
    r = await ready(f),
    unit = await r.lore.readField('details'),
    ref = f.db.doc(root + '/chunks/' + chunkId(0)),
    chunk = f.records.get(ref.path);
  await f.db.runTransaction((tx) =>
    tx.update(ref, {
      ...chunk,
      chunkBase64: Buffer.alloc(chunk.byteLength).toString('base64'),
    }),
  );
  await assert.rejects(() => consume(f, unit));
  await assert.rejects(() => r.lore.readField('details'));
  assert.equal(f.records.get(root).checkpoint, r.p.checkpoint);
  assert.equal(f.records.has('private-test/accepted'), false);
});
test('metadata does not certify body availability and transient read failure permits a fresh retry', async () => {
  const f = setup(),
    r = await ready(f),
    run = f.db.runTransaction.bind(f.db),
    failure = Error('read unavailable'),
    before = structuredClone([...f.records]);
  f.db.runTransaction = async () => {
    throw failure;
  };
  await assert.rejects(
    () => r.lore.readRange(0, 20),
    (e) => e === failure,
  );
  f.db.runTransaction = run;
  assert.deepEqual([...f.records], before);
  assert.deepEqual(Buffer.from((await r.lore.readRange(0, 20)).bytes), r.logical.subarray(0, 20));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(root + '/chunks/' + chunkId(0))));
  const fresh = await f.api.openVerifiedBookRestoreContent(uid, input(r.p)),
    metadata = await fresh.openIndexedLore(r.index);
  await f.db.runTransaction(metadata.verify);
  await assert.rejects(() => metadata.readField('details'));
});
