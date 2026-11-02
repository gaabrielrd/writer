import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBookBackup } from '../src/bookBackupContainer.mjs';
import {
  BOOK_PACKAGE_SECTIONS,
  bookPackageHeader,
  bookPackageEnd,
  createBookPackageCounts,
  countBookPackageRecord,
  inspectBookBackupPackage,
  readBookBackupPackage,
} from '../src/bookBackupPackage.mjs';
const utf8 = (s) => new TextEncoder().encode(s);
const bookId = '\ufefflivro-🌙';
function fixture() {
  const counts = createBookPackageCounts();
  const kinds = [
    'book-metadata',
    'book-resources',
    'book-personas',
    'book-universe',
    'work-history',
    'book-draft',
    'book-cover',
  ];
  // These are envelope fixtures, deliberately not semantically valid section DTOs.
  const records = kinds.map((kind, i) => {
    const record = { kind, id: bookId, part: 0, payload: utf8('{}') };
    countBookPackageRecord(counts, BOOK_PACKAGE_SECTIONS[i], record);
    return record;
  });
  return [bookPackageHeader(bookId), ...records, bookPackageEnd(bookId, counts)];
}
async function bytes(records) {
  const chunks = [];
  for await (const chunk of encodeBookBackup(records)) chunks.push(chunk);
  return Buffer.concat(chunks);
}
function source(data) {
  return {
    size: data.length,
    async read(offset, length) {
      return data.subarray(offset, offset + length);
    },
  };
}
const inspect = async (records) => inspectBookBackupPackage(source(await bytes(records)));
const json = (record, change) => ({
  ...record,
  payload: utf8(JSON.stringify(change(JSON.parse(new TextDecoder().decode(record.payload))))),
});
test('requires the complete seven-section envelope, preserves BOM ID, freezes report and explicitly disclaims semantic validation', async () => {
  const records = fixture(),
    data = await bytes(records),
    report = await inspectBookBackupPackage(source(data));
  assert.equal(report.validation, 'envelope-only');
  assert.equal(report.manifest.bookId, bookId);
  assert.equal(report.seal.records, 9);
  assert.deepEqual(Object.keys(report.sections), BOOK_PACKAGE_SECTIONS);
  for (const section of BOOK_PACKAGE_SECTIONS) {
    assert.deepEqual(report.sections[section], { records: 1, payloadBytes: 2 });
    assert.ok(Object.isFrozen(report.sections[section]));
  }
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.manifest.sections));
  const stream = readBookBackupPackage(source(data));
  assert.equal((await stream.next()).value.type, 'manifest');
  const early = await stream.return(undefined);
  assert.equal(early.value, undefined);
});
test('rejects missing/forged footer, skipped/reordered/repeated sections and unknown kinds despite valid outer seals', async () => {
  const good = fixture();
  const variants = [
    good.slice(0, -1),
    good.filter((_, i) => i !== 3),
    [good[0], good[2], good[1], ...good.slice(3)],
    [...good.slice(0, -1), good[1], good.at(-1)],
    [...good, good[1]],
    good.map((r, i) => (i === 1 ? { ...r, kind: 'future-kind' } : r)),
    good.map((r, i) =>
      i === 8
        ? json(r, (v) => ({
            ...v,
            sections: { ...v.sections, cover: { records: 2, payloadBytes: 2 } },
          }))
        : r,
    ),
    good.map((r, i) => (i === 8 ? { ...r, id: 'other' } : r)),
    good.map((r, i) => (i === 0 ? { ...r, part: 1 } : r)),
    good.map((r, i) => (i === 1 ? { ...r, payload: new Uint8Array(65537) } : r)),
  ];
  for (const records of variants) await assert.rejects(() => inspect(records));
});
test('rejects future versions, noncanonical/extended controls and invalid book identity', async () => {
  const good = fixture();
  for (const index of [0, 8]) {
    await assert.rejects(() =>
      inspect(
        good.map((r, i) =>
          i === index ? { ...r, payload: utf8(' ' + new TextDecoder().decode(r.payload)) } : r,
        ),
      ),
    );
    await assert.rejects(() =>
      inspect(good.map((r, i) => (i === index ? json(r, (v) => ({ ...v, extra: true })) : r))),
    );
  }
  for (const version of [2, '1'])
    await assert.rejects(
      () => inspect(good.map((r, i) => (i === 0 ? json(r, (v) => ({ ...v, version })) : r))),
      { code: 'unsupported-version' },
    );
  await assert.rejects(() =>
    inspect(good.map((r, i) => (i === 0 ? json(r, (v) => ({ ...v, bookId: 'other' })) : r))),
  );
  for (const id of ['', '..', 'a/b', '\ud800']) assert.throws(() => bookPackageHeader(id));
});
test('does not return a trustworthy report until the outer seal and exact EOF pass', async () => {
  const data = await bytes(fixture());
  for (const truncated of [
    data.subarray(0, data.length - 1),
    data.subarray(0, 32),
    Buffer.concat([data, Buffer.from([0])]),
  ])
    await assert.rejects(() => inspectBookBackupPackage(source(truncated)));
  const corrupt = Buffer.from(data);
  corrupt[corrupt.length - 1] ^= 1;
  await assert.rejects(() => inspectBookBackupPackage(source(corrupt)));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => inspectBookBackupPackage(source(data), { signal: controller.signal }),
    { name: 'AbortError' },
  );
});
