import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { chunkId } from '../src/bookRestoreUploadContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { indexedLoreData, indexedLoreArchive } from './helpers/bookLoreContentFixture.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import {
  finishLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'lore-projection-reader01',
  root = 'users/' + uid + '/bookRestores/' + id,
  hash = (b) => createHash('sha256').update(b).digest('hex');
async function ready(data = indexedLoreData(), sourceId = 'entity') {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    records = indexedLoreArchive(data, { id: sourceId }),
    { progress } = await uploadArchiveRestore(factory(), uid, id, records),
    p = await finishLegacyRestore(factory, uid, id, progress),
    reader = await factory().openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    }),
    entry = [...f.records].find(
      ([path, v]) => path.startsWith(root + '/validationItems/') && v.record.kind === 'book-lore',
    ),
    lore = await reader.openMappedIndexedLore(entry[1].index),
    mapper = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: p.jobToken,
      sourceBookId: 'book',
      bookId: p.bookId,
    });
  assert.equal(p.state, 'content-verified');
  return {
    ...f,
    factory,
    p,
    reader,
    lore,
    index: entry[1].index,
    pointer: entry[1],
    path: entry[0],
    mapper,
    itemBytes: records
      .filter((r) => r.kind === 'book-lore')
      .reduce((n, r) => n + r.payload.length, 0),
  };
}
async function consume(f, unit) {
  await f.db.runTransaction(async (tx) => {
    await unit.verify(tx);
    tx.create(f.db.doc('private-projection/accepted'), { byteLength: unit.bytes?.length ?? null });
  });
}
async function collect(f, field, { limit = 65536, reopen = false } = {}) {
  let cursor = null,
    maximum = 0,
    refs = 0,
    units = 0,
    last;
  const parts = [];
  for (;;) {
    let lore = f.lore;
    if (reopen) {
      const reader = await f
        .factory()
        .openVerifiedBookRestoreContent(uid, { restoreId: id, jobToken: f.p.jobToken });
      lore = await reader.openMappedIndexedLore(f.index);
      assert.equal(lore.sourceToken, f.lore.sourceToken);
    }
    const unit = await lore.readField(field, { cursor, limit });
    assert.ok(unit.bytes.length <= 80 * 1024 && unit.references <= 64);
    await f.db.runTransaction(unit.verify);
    parts.push(Buffer.from(unit.bytes));
    refs += unit.references;
    units++;
    cursor = JSON.parse(JSON.stringify(unit.cursor));
    const json = JSON.stringify(cursor);
    maximum = Math.max(maximum, Buffer.byteLength(json));
    assert.equal(json.includes('PRIVATE_INDEXED_LORE_BODY'), false);
    last = unit;
    if (unit.done) break;
  }
  const bytes = Buffer.concat(parts);
  assert.equal(last.summary.contentHash, hash(bytes));
  assert.equal(last.summary.byteLength, bytes.length);
  return { bytes, last, cursor, maximum, refs, units };
}
test('mapped descriptor is private/deterministic and small fields agree with the previous remapper without changing prose', async () => {
  const f = await ready(),
    old = await f.reader.readMappedItem(f.index),
    expected = (await old.loreRelations.read(0)).values,
    result = await collect(f, 'relations', { limit: 7, reopen: true });
  assert.equal(f.lore.id, old.value.id);
  assert.equal(f.lore.sourceId, 'entity');
  assert.equal(f.lore.record.id, old.record.id);
  assert.equal(f.lore.sourceMetadata.id, 'entity');
  assert.equal(Object.isFrozen(f.lore), true);
  // The legacy page is 64; all original relations are independently projected here.
  const all = [];
  for (let offset = 0; offset < 130; offset += 64)
    all.push(...(await old.loreRelations.read(offset)).values);
  assert.deepEqual(JSON.parse(result.bytes), all);
  assert.deepEqual(JSON.parse(result.bytes).slice(0, 64), expected);
  assert.equal(result.last.summary.relations, 130);
  for (const field of [
    'name',
    'aliases',
    'summary',
    'details',
    'structuredDetails',
    'isPublic',
    'createdAt',
  ])
    assert.deepEqual(
      (await collect(f, field, { limit: 3 })).bytes,
      Buffer.from(JSON.stringify(indexedLoreData()[field])),
    );
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('qualified local IDs take precedence while absent external targets remain literal', async () => {
  const local = 'universe:world:outside',
    data = indexedLoreData({ count: 3 });
  data.relations = [
    { targetEntityId: local, relationType: '', description: 'universe:world:outside prose' },
    { targetEntityId: 'universe:other:external', relationType: '' },
    { targetEntityId: 'universe:other:external', relationType: '' },
  ];
  const f = await ready(data, local),
    result = await collect(f, 'relations', { limit: 1, reopen: true });
  assert.deepEqual(JSON.parse(result.bytes), [
    { ...data.relations[0], targetEntityId: f.mapper.identity('lore', local) },
    data.relations[1],
    data.relations[2],
  ]);
});
test('dense input resolves at most 64 targets per unit and holds only current unit source/index proofs', async () => {
  const f = await ready(indexedLoreData({ count: 2000 }));
  let cursor = null,
    count = 0;
  for (;;) {
    const at = f.metadataReads.length,
      unit = await f.lore.readField('relations', { cursor });
    assert.ok(unit.references <= 64);
    count += unit.references;
    const beforeVerify = f.metadataReads.length;
    await f.db.runTransaction(unit.verify);
    const chunks = f.metadataReads
      .slice(beforeVerify)
      .filter((v) => v.path.startsWith(root + '/chunks/'));
    assert.ok(chunks.length <= 4);
    assert.equal(new Set(chunks.map((v) => v.path)).size, chunks.length);
    assert.ok(f.metadataReads.length - at < 30);
    cursor = JSON.parse(JSON.stringify(unit.cursor));
    if (unit.done) break;
  }
  assert.equal(count, 2000);
});
test('source below 8 MiB grows past 8 MiB after remapping and remains measured/resumable in bounded units', async () => {
  const data = indexedLoreData({ count: 1000 });
  data.relations = data.relations.map((v) => ({ ...v, targetEntityId: 'entity' }));
  data.relations[0].description = 'PRIVATE_INDEXED_LORE_BODY'.repeat(1000);
  // Test-only sizing: put the relations array just below the old allocation threshold.
  const delta = 8 * 1024 * 1024 - 32768 - Buffer.byteLength(JSON.stringify(data.relations));
  assert.ok(delta > 0);
  data.relations[0].description += 'x'.repeat(delta);
  const f = await ready(data),
    result = await collect(f, 'relations', { reopen: true }),
    expected = Buffer.from(
      JSON.stringify(
        data.relations.map((v) => ({ ...v, targetEntityId: f.mapper.identity('lore', 'entity') })),
      ),
    );
  assert.ok(f.itemBytes < 8 * 1024 * 1024);
  assert.ok(expected.length > 8 * 1024 * 1024);
  assert.deepEqual(result.bytes, expected);
  assert.ok(result.maximum <= 16384 && result.units > 128);
  assert.equal(result.refs, 1000);
  assert.equal(result.last.summary.relations, 1000);
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('prose above 8 MiB stays literal with exact final hash, independent proof per unit and no remap of mentions', async () => {
  const data = indexedLoreData({ large: true }),
    f = await ready(data),
    result = await collect(f, 'details', { reopen: true });
  assert.ok(result.bytes.length > 8 * 1024 * 1024 && result.units > 128);
  assert.deepEqual(result.bytes, Buffer.from(JSON.stringify(data.details)));
  assert.equal(result.refs, 0);
  assert.ok(result.maximum < 2048);
  assert.equal(result.last.summary.contentHash, hash(Buffer.from(JSON.stringify(data.details))));
});
test('omitted fields, empty arrays, empty strings, false and date zero remain distinct', async () => {
  const data = {
      name: '',
      category: 'other',
      summary: '',
      isPublic: false,
      createdAt: 0,
      relations: [],
    },
    f = await ready(data),
    missing = await f.lore.readField('details');
  assert.equal(missing.present, false);
  assert.equal(Object.hasOwn(missing, 'bytes'), false);
  await f.db.runTransaction(missing.verify);
  for (const field of Object.keys(data))
    assert.deepEqual((await collect(f, field)).bytes, Buffer.from(JSON.stringify(data[field])));
  const completed = await collect(f, 'name');
  await assert.rejects(() => f.lore.readField('details', { cursor: completed.cursor }));
});
test('malformed/wrong-field/source cursors and bounds fail closed; cursor is captured before asynchronous hashing', async () => {
  const f = await ready(),
    first = await f.lore.readField('details', { limit: 5 }),
    reference = structuredClone(first.cursor);
  for (const change of [
    (p) => {
      p.contextToken = 'f'.repeat(64);
    },
    (p) => {
      p.field = 'name';
    },
    (p) => {
      p.algorithm = 'other';
    },
    (p) => {
      p.hashState = 'bad';
    },
    (p) => {
      p.inputOffset = -1;
    },
    (p) => {
      p.outputBytes++;
    },
    (p) => {
      p.extra = true;
    },
    (p) => {
      p.relations = {};
    },
  ]) {
    const cursor = structuredClone(reference);
    change(cursor);
    await assert.rejects(() => f.lore.readField('details', { cursor }));
  }
  await assert.rejects(() => f.lore.readField('relations', { cursor: reference }));
  await assert.rejects(() => f.lore.readField('details', { limit: 65537 }));
  const pending = f.lore.readField('details', { cursor: first.cursor, limit: 5 });
  first.cursor.field = 'relations';
  first.cursor.inputOffset = 0;
  first.cursor.contextToken = 'b'.repeat(64);
  const unit = await pending;
  assert.deepEqual(
    Buffer.from(unit.bytes),
    Buffer.from(JSON.stringify(indexedLoreData().details)).subarray(5, 10),
  );
  assert.equal(unit.cursor.field, 'details');
});
for (const mode of ['present', 'absent', 'receipt'])
  test(
    'native ' + mode + ' local-identity observation is revalidated before consumer write',
    async () => {
      const local = mode === 'absent' ? 'entity' : 'universe:world:outside',
        f = await ready(indexedLoreData(), local),
        unit = await f.lore.readField('relations'),
        key = ['node', 'lore', '', 'universe:world:outside'],
        indexPath = root + '/validationIndex/' + digest(key);
      if (mode === 'absent') {
        const existing = [...f.records.values()].find(
          (v) => JSON.stringify(v.key) === JSON.stringify(['node', 'lore', '', 'entity']),
        );
        await f.db.runTransaction((tx) => tx.create(f.db.doc(indexPath), { ...existing, key }));
      } else {
        const path =
            mode === 'present'
              ? indexPath
              : 'users/' +
                uid +
                '/bookRestoreOperations/' +
                f.records.get(indexPath).createdByOperationId,
          value = structuredClone(f.records.get(path));
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
        await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      }
      await assert.rejects(() => consume(f, unit));
      assert.equal(f.records.has('private-projection/accepted'), false);
    },
  );
test('cancellation revokes held source, projected unit, absence and resumed cursor without target writes', async () => {
  const data = indexedLoreData();
  delete data.summary;
  const f = await ready(data),
    unit = await f.lore.readField('relations', { limit: 9 }),
    missing = await f.lore.readField('summary');
  await f.factory().cancelBookRestore(uid, mutation(id, f.p, id + '-cancel'));
  for (const proof of [f.lore, unit, missing]) await assert.rejects(() => consume(f, proof));
  await assert.rejects(() => f.lore.readField('relations', { cursor: unit.cursor }));
  assert.equal(f.records.has('private-projection/accepted'), false);
});
test('source proof recreation after projection blocks consumer writes while a fresh unit may attest the same original chunk', async () => {
  const f = await ready(),
    unit = await f.lore.readField('relations'),
    path = root + '/integrityProofs/' + chunkId(0),
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => consume(f, unit));
  await f.db.runTransaction((await f.lore.readField('relations')).verify);
});
