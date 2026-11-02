import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureDraftsManifest } from '../src/adventureArchiveDrafts.mjs';
test('explicit draft manifest distinguishes no draft from an empty retained draft', () => {
  const h = 'a'.repeat(64);
  assert.deepEqual(adventureDraftsManifest(0, 0, h), {
    schemaVersion: 1,
    count: 0,
    bytes: 0,
    digest: h,
  });
  assert.equal(adventureDraftsManifest(1, 0, h).count, 1);
  for (const tuple of [
    [2, 1, h],
    [0, 1, h],
    [1, -1, h],
    [1, 1, 'bad'],
  ])
    assert.throws(() => adventureDraftsManifest(...tuple));
});
