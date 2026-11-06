import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBookBackup } from '../src/bookBackupContainer.mjs';
import {
  BOOK_PACKAGE_VERSION,
  BOOK_PACKAGE_SECTIONS,
  bookPackageSections,
  bookPackageHeader,
  bookPackageEnd,
  createBookPackageCounts,
  countBookPackageRecord,
  bookPackageSection,
  inspectBookBackupPackage,
  readBookPackageStep,
} from '../src/bookBackupPackage.mjs';
const utf8 = (value) => new TextEncoder().encode(value),
  bookId = '\ufefflivro-🌙';
const kinds = [
  'book-metadata',
  'book-resources',
  'book-personas',
  'book-universe',
  'work-history',
  'book-draft',
  'book-cover',
];
function fixture(version = 2) {
  const counts = createBookPackageCounts(version),
    rows = [...kinds, ...(version === 2 ? ['book-editorial'] : [])].map((kind) => ({
      kind,
      id: bookId,
      part: 0,
      payload: utf8('{}'),
    }));
  for (const row of rows)
    countBookPackageRecord(counts, bookPackageSection(row.kind), row, version);
  return [bookPackageHeader(bookId, version), ...rows, bookPackageEnd(bookId, counts, version)];
}
async function source(rows) {
  const chunks = [];
  for await (const chunk of encodeBookBackup(rows)) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  return {
    bytes,
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}
const inspect = async (rows) => inspectBookBackupPackage(await source(rows));
const json = (row, update) => ({
  ...row,
  payload: utf8(JSON.stringify(update(JSON.parse(new TextDecoder().decode(row.payload))))),
});

test('the production default remains v1/seven sections while the reader explicitly supports v2/eight', async () => {
  assert.equal(BOOK_PACKAGE_VERSION, 1);
  assert.equal(BOOK_PACKAGE_SECTIONS.length, 7);
  assert.equal(bookPackageSections(2).length, 8);
  assert.equal(Object.hasOwn(createBookPackageCounts(), 'editorial'), false);
  const current = await inspect(fixture(1));
  assert.equal(current.manifest.version, 1);
  assert.equal(Object.keys(current.sections).length, 7);
  const next = await inspect(fixture());
  assert.equal(next.manifest.version, 2);
  assert.equal(next.manifest.bookId, bookId);
  assert.equal(Object.keys(next.sections).length, 8);
  assert.equal(next.validation, 'envelope-only');
  assert.equal(next.seal.records, 10);
});
test('v1 cannot accept an editorial record or be silently upgraded by its payload', async () => {
  const rows = fixture(1),
    extra = { kind: 'book-editorial', id: bookId, part: 0, payload: utf8('{}') };
  await assert.rejects(inspect([...rows.slice(0, -1), extra, rows.at(-1)]), {
    code: 'invalid-record',
  });
});
test('v2 requires the editorial section and its exact physical counts before the footer', async () => {
  const good = fixture();
  await assert.rejects(inspect(good.filter((row) => row.kind !== 'book-editorial')), {
    code: 'invalid-record',
  });
  await assert.rejects(
    inspect(
      good.map((row) =>
        row.kind === 'book-package-end'
          ? json(row, (value) => ({
              ...value,
              sections: { ...value.sections, editorial: { records: 2, payloadBytes: 2 } },
            }))
          : row,
      ),
    ),
    { code: 'invalid-record' },
  );
});
test('v2 rejects reordered sections, a v1 footer and a noncanonical header', async () => {
  const good = fixture(),
    wrong = [...good];
  [wrong[7], wrong[8]] = [wrong[8], wrong[7]];
  await assert.rejects(inspect(wrong));
  await assert.rejects(inspect([...good.slice(0, -1), fixture(1).at(-1)]));
  await assert.rejects(
    inspect(
      good.map((row, index) =>
        index === 0
          ? json(row, (value) => ({ ...value, sections: [...value.sections].reverse() }))
          : row,
      ),
    ),
  );
});
test('a declared v2 version with only the v1 section schema is invalid rather than a fallback to v1', async () => {
  const old = fixture(1);
  await assert.rejects(
    inspect(
      old.map((row, index) =>
        index === 0 ? json(row, (value) => ({ ...value, version: 2 })) : row,
      ),
    ),
    { code: 'invalid-record' },
  );
});
test('v2 parsing resumes from a structured checkpoint with its own section count and exact framing position', async () => {
  const input = await source(fixture());
  let state = null,
    seen = 0,
    report = null;
  for (let step = 0; step < 100 && !report; step++) {
    const result = await readBookPackageStep(input, state);
    state = structuredClone(result.cursor);
    if (result.event?.type === 'record') seen++;
    if (result.report) report = result.report;
  }
  assert.ok(report);
  assert.equal(seen, 8);
  assert.equal(report.manifest.version, 2);
  assert.equal(report.sections.editorial.records, 1);
  assert.ok(Object.isFrozen(report.sections.editorial));
});
test('a complete v2 footer is still provisional until the outer seal and exact EOF are checked', async () => {
  const input = await source(fixture()),
    truncated = input.bytes.subarray(0, input.bytes.length - 1),
    appended = Buffer.concat([input.bytes, utf8('x')]);
  for (const bytes of [truncated, appended])
    await assert.rejects(
      inspectBookBackupPackage({
        size: bytes.length,
        read: async (offset, length) => bytes.subarray(offset, offset + length),
      }),
    );
});
test('unknown versions and record kinds are rejected without accepting metadata as a new capability', async () => {
  const good = fixture();
  await assert.rejects(
    inspect(
      good.map((row, index) =>
        index === 0 ? json(row, (value) => ({ ...value, version: 3 })) : row,
      ),
    ),
    { code: 'unsupported-version' },
  );
  await assert.rejects(
    inspect(
      good.map((row) =>
        row.kind === 'book-editorial' ? { ...row, kind: 'book-editorial-execute' } : row,
      ),
    ),
  );
});
