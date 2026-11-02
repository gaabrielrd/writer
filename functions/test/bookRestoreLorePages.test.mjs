import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { bookRestoreLoreNextPageSource } from '../src/bookRestoreLorePages.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { indexedLoreData, indexedLoreArchive } from './helpers/bookLoreContentFixture.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import {
  finishLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'native-lore-pages-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
async function fixture(data) {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    { progress } = await uploadArchiveRestore(factory(), uid, id, indexedLoreArchive(data)),
    p = await finishLegacyRestore(factory, uid, id, progress),
    index = [...f.records.values()].find(
      (v) => v.restoreId === id && v.record?.kind === 'book-lore',
    ).index;
  async function open() {
    const reader = await factory().openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    });
    return reader.openMappedIndexedLore(index);
  }
  const mapped = await open(),
    mapper = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: p.jobToken,
      sourceBookId: 'book',
      bookId: p.bookId,
    });
  return { ...f, factory, p, mapped, open, mapper };
}
async function page(f, number, source = null, limit = 65536) {
  const parts = [];
  let cursor = null,
    units = 0,
    refs = 0,
    maximum = 0,
    unit;
  for (;;) {
    const fresh = await f.open(),
      before = f.metadataReads.length;
    unit = await fresh.readRelationPage(number, { cursor, source, limit });
    assert.ok(unit.bytes.length <= 81920 && unit.references <= 64);
    assert.ok(unit.cursor.inputOffset > (cursor?.inputOffset ?? source?.inputOffset ?? 0));
    parts.push(Buffer.from(unit.bytes));
    units++;
    refs += unit.references;
    const marker = JSON.stringify(unit.cursor);
    assert.equal(marker.includes('PRIVATE_PAGE_DESCRIPTION'), false);
    maximum = Math.max(maximum, Buffer.byteLength(marker));
    const at = f.metadataReads.length;
    await f.db.runTransaction(unit.verify);
    const checked = f.metadataReads.slice(at).filter((v) => v.path.startsWith(root + '/chunks/'));
    assert.ok(checked.length <= 4);
    assert.equal(new Set(checked.map((v) => v.path)).size, checked.length);
    assert.ok(f.metadataReads.length - before < 30);
    cursor = JSON.parse(marker);
    if (unit.done) break;
  }
  const bytes = Buffer.concat(parts);
  assert.equal(unit.summary.byteLength, bytes.length);
  assert.equal(unit.summary.contentHash, createHash('sha256').update(bytes).digest('hex'));
  assert.ok(maximum <= 16384);
  return {
    bytes,
    cursor,
    refs,
    units,
    next: bookRestoreLoreNextPageSource(cursor),
    summary: unit.summary,
  };
}
for (const count of [1, 63, 64, 65, 128, 130, 1000])
  test(
    'native pages preserve order and complete-object boundaries at relation count ' + count,
    async () => {
      const data = indexedLoreData({ count }),
        f = await fixture(data);
      let source = null,
        total = 0;
      for (let number = 0; number < Math.ceil(count / 64); number++) {
        const result = await page(f, number, source),
          expected = [];
        for (const value of data.relations.slice(number * 64, (number + 1) * 64))
          expected.push(await f.mapper.mapLoreRelation(value, async () => false));
        assert.deepEqual(JSON.parse(result.bytes), expected);
        assert.equal(result.refs, expected.length);
        assert.equal(result.summary.relations, expected.length);
        total += result.refs;
        source = result.next;
      }
      assert.equal(total, count);
      assert.equal(source.transform.parser.mode, 'done');
      assert.equal(source.transform.targets, count);
      assert.equal(f.records.has('books/' + f.p.bookId), false);
    },
  );
test('a huge description on the 64th relation stays in that page until its object closes', async () => {
  const data = indexedLoreData({ count: 130 });
  data.relations[63] = {
    description: '\ufeff' + 'PRIVATE_PAGE_DESCRIPTION🌙 }],'.repeat(350000),
    relationType: '',
    targetEntityId: 'entity',
  };
  const f = await fixture(data),
    first = await page(f, 0),
    second = await page(f, 1, first.next),
    third = await page(f, 2, second.next);
  assert.ok(first.bytes.length > 8 * 1024 * 1024 && first.units > 128);
  assert.equal(first.cursor.transform.parser.relationCount, 64);
  assert.equal(first.cursor.transform.parser.mode, 'syntax');
  assert.equal(JSON.parse(first.bytes)[63].description, data.relations[63].description);
  assert.equal(JSON.parse(first.bytes)[63].targetEntityId, f.mapped.id);
  assert.equal(second.summary.relations, 64);
  assert.equal(third.summary.relations, 2);
  assert.equal(third.next.transform.parser.mode, 'done');
});
test('target first with a huge trailing description never closes the native page at target completion', async () => {
  const data = indexedLoreData({ count: 65 });
  data.relations[63].description = 'literal 🌙'.repeat(10000);
  const f = await fixture(data),
    result = await page(f, 0);
  assert.equal(JSON.parse(result.bytes)[63].description, data.relations[63].description);
  assert.ok(result.units > 1);
  assert.equal((await page(f, 1, result.next)).summary.relations, 1);
});
test('UTF-8, quotes and misleading delimiters survive byte-sized reads and service reopens', async () => {
  const data = indexedLoreData({ count: 65 });
  data.relations[0] = {
    relationType: '"]},',
    targetEntityId: 'lo🌙"cal',
    description: '}\ufeff🌙]',
  };
  const f = await fixture(data),
    result = await page(f, 0, null, 7);
  assert.deepEqual(JSON.parse(result.bytes)[0], {
    ...data.relations[0],
    targetEntityId: f.mapper.identity('lore', data.relations[0].targetEntityId),
  });
  assert.equal((await page(f, 1, result.next, 1)).summary.relations, 1);
});
test('invalid page, transplanted cursor/source and malformed boundaries do not produce a page', async () => {
  const f = await fixture(indexedLoreData({ count: 130 })),
    first = await page(f, 0);
  for (const number of [-1, 0.5, 3, NaN])
    await assert.rejects(() => f.mapped.readRelationPage(number));
  await assert.rejects(() => f.mapped.readRelationPage(1));
  await assert.rejects(() => f.mapped.readRelationPage(0, { source: first.next }));
  await assert.rejects(() => f.mapped.readRelationPage(2, { source: first.next }));
  await assert.rejects(() => f.mapped.readRelationPage(0, { cursor: first.cursor }));
  await assert.rejects(() =>
    f.mapped.readRelationPage(1, { source: { ...first.next, sourceToken: 'b'.repeat(64) } }),
  );
  await assert.rejects(() =>
    f.mapped.readRelationPage(1, {
      source: { ...first.next, inputOffset: first.next.inputOffset + 1 },
    }),
  );
  await assert.rejects(() => f.mapped.readRelationPage(0, { limit: 65537 }));
  const field = await f.mapped.readField('relations', { limit: 7 });
  await assert.rejects(() => f.mapped.readRelationPage(0, { cursor: field.cursor }));
});
test('cancellation invalidates a pending page, source and next-page resume before consumer writes', async () => {
  const f = await fixture(indexedLoreData({ count: 130 })),
    unit = await f.mapped.readRelationPage(0, { limit: 31 });
  await f.factory().cancelBookRestore(uid, mutation(id, f.p, id + '-cancel'));
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      await unit.verify(tx);
      tx.create(f.db.doc('private-pages/accepted'), { accepted: true });
    }),
  );
  await assert.rejects(() => f.mapped.readRelationPage(0, { cursor: unit.cursor }));
  assert.equal(f.records.has('private-pages/accepted'), false);
});
test('absent and explicitly empty relations have no native page but keep their distinct metadata', async () => {
  for (const present of [false, true]) {
    const data = indexedLoreData({ count: 0 });
    if (!present) delete data.relations;
    const f = await fixture(data);
    assert.equal(f.mapped.sourceMetadata.index.relations.present, present);
    await assert.rejects(() => f.mapped.readRelationPage(0));
  }
});
