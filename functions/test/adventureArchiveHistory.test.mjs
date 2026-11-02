import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  adventureHistoryBodyManifest as body,
  adventureHistoryDigestLine,
  adventureHistoryManifest,
  ADVENTURE_HISTORY_SEED,
} from '../src/adventureArchiveHistory.mjs';
import { encodeAdventureBackup } from '../src/adventureBackupContainer.mjs';
import {
  adventurePackageHeader,
  adventurePackageEnd,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  inspectAdventureBackupPackage,
} from '../src/adventureBackupPackage.mjs';
const hash = (s) => createHash('sha256').update(s).digest('hex');
test('native Unicode chunk counts remain distinct from the fixed byte layout, including empty text', () => {
  const value = body('version-id', hash('header'), {
    byteLength: 131072,
    chunkCount: 3,
    contentHash: hash('text'),
  });
  assert.deepEqual(value, {
    schemaVersion: 1,
    versionId: 'version-id',
    layout: 'fixed64k',
    headerHash: hash('header'),
    byteLength: 131072,
    contentHash: hash('text'),
    chunkCount: 2,
  });
  assert.equal(
    body('empty-version', hash('header'), { byteLength: 0, chunkCount: 1, contentHash: hash('') })
      .chunkCount,
    1,
  );
});
test('body manifest rejects malformed native counts, extra keys, unsafe IDs and hashes', () => {
  const valid = { byteLength: 1, chunkCount: 1, contentHash: hash('a') };
  for (const patch of [
    { byteLength: -1 },
    { byteLength: NaN },
    { chunkCount: 2 },
    { extra: true },
    { contentHash: 'bad' },
  ])
    assert.throws(() => body('version-id', hash('header'), { ...valid, ...patch }), TypeError);
  for (const id of ['', '..', 'a/b', '\ud800'])
    assert.throws(() => body(id, hash('header'), valid), TypeError);
});
test('history receipts and totals use canonical independent bytes without authorizing a whole file', () => {
  const header = { byteLength: 9, chunkCount: 1, contentHash: hash('header') },
    manifest = body('version-id', header.contentHash, {
      byteLength: 0,
      chunkCount: 1,
      contentHash: hash(''),
    });
  assert.equal(
    adventureHistoryDigestLine('version-id', header, manifest),
    JSON.stringify(['version', 'version-id', 9, 1, header.contentHash, 0, 1, hash('')]) + '\n',
  );
  assert.deepEqual(adventureHistoryManifest(0, 0, 0, hash(ADVENTURE_HISTORY_SEED)), {
    schemaVersion: 1,
    versions: 0,
    nativeRecords: 0,
    textBytes: 0,
    digest: hash(ADVENTURE_HISTORY_SEED),
  });
  for (const args of [
    [0, 1, 0, hash('a')],
    [1, 1, 0, hash('a')],
    [1, 2, -1, hash('a')],
  ])
    assert.throws(() => adventureHistoryManifest(...args), TypeError);
});
test('the internal adventure envelope recognizes a separate version body manifest', async () => {
  const counts = createAdventurePackageCounts(),
    id = 'project',
    rows = [];
  for (const [section, kind] of [
    ['structure', 'adventure-metadata'],
    ['resources', 'adventure-resources'],
    ['lore', 'adventure-lore-end'],
    ['personas', 'adventure-personas'],
    ['universe', 'adventure-universe'],
    ['history', 'adventure-version-body'],
    ['drafts', 'adventure-drafts'],
    ['images', 'adventure-images'],
  ]) {
    const r = { kind, id, part: 0, payload: new TextEncoder().encode('{}') };
    rows.push(r);
    countAdventurePackageRecord(counts, section, r);
  }
  const chunks = [];
  for await (const r of encodeAdventureBackup([
    adventurePackageHeader(id),
    ...rows,
    adventurePackageEnd(id, counts),
  ]))
    chunks.push(r);
  const bytes = Buffer.concat(chunks),
    report = await inspectAdventureBackupPackage({
      size: bytes.length,
      read: async (o, l) => bytes.subarray(o, o + l),
    });
  assert.equal(report.validation, 'envelope-only');
  assert.equal(report.sections.history.records, 1);
});
