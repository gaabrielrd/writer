import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAdventureBackup } from '../src/adventureBackupContainer.mjs';
import {
  ADVENTURE_PACKAGE_SECTIONS,
  adventurePackageHeader,
  adventurePackageEnd,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  inspectAdventureBackupPackage,
  readAdventurePackageStep,
} from '../src/adventureBackupPackage.mjs';
const utf8 = (s) => new TextEncoder().encode(s);
const projectId = '\ufeffaventura-🌙';
function fixture() {
  const counts = createAdventurePackageCounts();
  const kinds = [
    'adventure-metadata',
    'adventure-resources',
    'adventure-lore-end',
    'adventure-personas',
    'adventure-universe',
    'adventure-history',
    'adventure-drafts',
    'adventure-images',
  ];
  const rows = kinds.map((kind, i) => {
    const record = { kind, id: projectId, part: 0, payload: utf8('{}') };
    countAdventurePackageRecord(counts, ADVENTURE_PACKAGE_SECTIONS[i], record);
    return record;
  });
  return [adventurePackageHeader(projectId), ...rows, adventurePackageEnd(projectId, counts)];
}
async function bytes(rows) {
  const chunks = [];
  for await (const b of encodeAdventureBackup(rows)) chunks.push(b);
  return Buffer.concat(chunks);
}
const source = (data) => ({ size: data.length, read: async (o, l) => data.subarray(o, o + l) });
const inspect = async (rows) => inspectAdventureBackupPackage(source(await bytes(rows)));
const change = (r, edit) => ({
  ...r,
  payload: utf8(JSON.stringify(edit(JSON.parse(new TextDecoder().decode(r.payload))))),
});
test('requires eight ordered sections and labels the report as envelope-only, not restored content', async () => {
  // Deliberately opaque payloads; semantic validation belongs to the domain validator.
  const report = await inspect(fixture());
  assert.equal(report.validation, 'envelope-only');
  assert.equal(report.manifest.adventureId, projectId);
  assert.equal(report.manifest.projectKind, 'adventure');
  assert.equal(report.manifest.format, 'writer-adventure-archive');
  assert.equal(report.seal.records, 10);
  assert.deepEqual(Object.keys(report.sections), ADVENTURE_PACKAGE_SECTIONS);
  for (const section of ADVENTURE_PACKAGE_SECTIONS) {
    assert.deepEqual(report.sections[section], { records: 1, payloadBytes: 2 });
    assert.ok(Object.isFrozen(report.sections[section]));
  }
  assert.ok(Object.isFrozen(report));
  assert.ok(Object.isFrozen(report.manifest.sections));
});
test('skipped/reversed/unknown sections, forged counts and cross-domain inner metadata fail despite valid outer hashes', async () => {
  const good = fixture(),
    last = good.length - 1;
  const cases = [
    good.slice(0, -1),
    good.filter((_, i) => i !== 3),
    [good[0], good[2], good[1], ...good.slice(3)],
    [...good.slice(0, -1), good[1], good.at(-1)],
    [...good, good[1]],
    good.map((r, i) => (i === 1 ? { ...r, kind: 'book-metadata' } : r)),
    good.map((r, i) => (i === 1 ? { ...r, kind: 'future-kind' } : r)),
    good.map((r, i) =>
      i === last
        ? change(r, (v) => ({
            ...v,
            sections: { ...v.sections, images: { records: 2, payloadBytes: 2 } },
          }))
        : r,
    ),
    good.map((r, i) => (i === last ? { ...r, id: 'other' } : r)),
    good.map((r, i) => (i === 0 ? change(r, (v) => ({ ...v, projectKind: 'book' })) : r)),
    good.map((r, i) => (i === 0 ? change(r, (v) => ({ ...v, format: 'writer-book-archive' })) : r)),
    good.map((r, i) => (i === 0 ? { ...r, part: 1 } : r)),
    good.map((r, i) => (i === 1 ? { ...r, payload: new Uint8Array(65537) } : r)),
  ];
  for (const rows of cases) await assert.rejects(() => inspect(rows));
});
test('controls are closed and canonical; unsupported versions cannot be guessed', async () => {
  const good = fixture();
  for (const index of [0, good.length - 1]) {
    await assert.rejects(() =>
      inspect(
        good.map((r, i) =>
          i === index ? { ...r, payload: utf8(' ' + new TextDecoder().decode(r.payload)) } : r,
        ),
      ),
    );
    await assert.rejects(() =>
      inspect(good.map((r, i) => (i === index ? change(r, (v) => ({ ...v, extra: true })) : r))),
    );
  }
  for (const version of [2, '1'])
    await assert.rejects(
      () => inspect(good.map((r, i) => (i === 0 ? change(r, (v) => ({ ...v, version })) : r))),
      { code: 'unsupported-version' },
    );
  await assert.rejects(() =>
    inspect(good.map((r, i) => (i === 0 ? change(r, (v) => ({ ...v, adventureId: 'other' })) : r))),
  );
  for (const id of ['', '..', 'a/b', '\ud800']) assert.throws(() => adventurePackageHeader(id));
});
test('the final outer seal and exact EOF are required before any successful report', async () => {
  const data = await bytes(fixture());
  for (const invalid of [
    data.subarray(0, -1),
    data.subarray(0, 32),
    Buffer.concat([data, Buffer.from([0])]),
  ])
    await assert.rejects(() => inspectAdventureBackupPackage(source(invalid)));
  const bad = Buffer.from(data);
  bad[bad.length - 1] ^= 1;
  await assert.rejects(() => inspectAdventureBackupPackage(source(bad)), {
    code: 'integrity-mismatch',
  });
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    () => inspectAdventureBackupPackage(source(data), { signal: abort.signal }),
    { name: 'AbortError' },
  );
});
test('trusted host checkpoints resume through JSON without weakening section order or footer checks', async () => {
  const data = await bytes(fixture()),
    events = [];
  let cursor = null,
    report;
  for (let n = 0; n < 12; n++) {
    const result = await readAdventurePackageStep(source(data), cursor);
    if (result.report) {
      report = result.report;
      break;
    }
    events.push(result.event.type);
    cursor = JSON.parse(JSON.stringify(result.cursor));
  }
  assert.equal(report.validation, 'envelope-only');
  assert.equal(events[0], 'manifest');
  assert.equal(events.at(-1), 'footer');
  assert.equal(events.filter((e) => e === 'record').length, 8);
  assert.equal(report.seal.records, 10);
  await assert.rejects(() => readAdventurePackageStep(source(data), { ...cursor, done: true }));
});
