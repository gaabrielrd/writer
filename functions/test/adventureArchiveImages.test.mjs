import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adventureImageAddressLine,
  adventureImagesManifest,
} from '../src/adventureArchiveImages.mjs';
test('image address binds the resource family and preserves Unicode', () => {
  assert.equal(
    adventureImageAddressLine('scene', 'private-🌙'),
    JSON.stringify(['writer-adventure-image-v1', 'scene', 'private-🌙']),
  );
  assert.notEqual(
    adventureImageAddressLine('scene', 'same'),
    adventureImageAddressLine('block', 'same'),
  );
  for (const pair of [
    ['other', 'id'],
    ['scene', '../id'],
    ['scene', '\ud800'],
  ])
    assert.throws(() => adventureImageAddressLine(...pair));
});
test('image section counters are complete and cannot silently invent or omit bytes', () => {
  const h = 'a'.repeat(64);
  assert.deepEqual(adventureImagesManifest(3, 2, 16, h), {
    schemaVersion: 1,
    bindings: 3,
    assets: 2,
    bytes: 16,
    digest: h,
  });
  assert.equal(adventureImagesManifest(0, 0, 0, h).assets, 0);
  for (const tuple of [
    [1, 2, 16, h],
    [1, 0, 1, h],
    [1, 1, 7, h],
    [-1, 0, 0, h],
    [0, 0, 0, 'bad'],
  ])
    assert.throws(() => adventureImagesManifest(...tuple));
});
