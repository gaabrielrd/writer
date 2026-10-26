import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  adventureCoreRecordIdentity as identity,
  adventureCoreCounts,
  adventureCoreManifest,
  adventureNullPersona,
  adventureCoreDigestLine,
  adventureCoreDigestSeed,
} from '../src/adventureArchiveCore.mjs';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('file addresses match independent Node SHA and disambiguate kind, parent and binding scope', async () => {
  const scope = { family: 'resources', kind: 'scene-body', parentId: 'scene-first' };
  const result = await identity(scope, 'current');
  assert.deepEqual(result, {
    kind: 'adventure-resource',
    id: hash(['writer-adventure-core-v1', 'resources', 'scene-body', 'scene-first', 'current']),
  });
  assert.notEqual(
    (await identity({ ...scope, parentId: 'scene-second' }, 'current')).id,
    result.id,
  );
  assert.notEqual((await identity({ ...scope, kind: 'scene-planning' }, 'current')).id, result.id);
  const persona = await identity({ family: 'personas', scope: 'scene' }, 'source-id');
  assert.equal(persona.id, hash(['writer-adventure-core-v1', 'personas', 'scene', 'source-id']));
  assert.notEqual(
    (await identity({ family: 'personas', scope: 'adventure' }, 'source-id')).id,
    persona.id,
  );
});
test('native root/part/lore IDs preserve raw UTF-8 including BOM and decomposed characters', async () => {
  for (const [family, kind, record] of [
    ['structure', 'adventure', 'adventure-metadata'],
    ['structure', 'part', 'adventure-part'],
    ['lore', 'lore', 'adventure-lore'],
    ['lore', 'lore-body', 'adventure-lore-body'],
  ]) {
    assert.deepEqual(await identity({ family, kind }, '\ufeffe\u0301-🌙'), {
      kind: record,
      id: '\ufeffe\u0301-🌙',
    });
  }
  assert.deepEqual(await identity({ family: 'universe' }, 'origin'), {
    kind: 'adventure-universe',
    id: 'origin',
  });
});
test('unknown types and unsafe file addresses fail instead of inventing a kind', async () => {
  for (const scope of [
    { family: 'resources', kind: '__proto__', parentId: null },
    { family: 'resources', kind: 'scene-body', parentId: null },
    { family: 'lore', kind: 'other' },
    { family: 'personas', scope: 'player' },
    { family: 'history' },
  ]) {
    await assert.rejects(() => identity(scope, 'source-id'), TypeError);
  }
  for (const id of ['', '..', 'a/b', '\ud800'])
    await assert.rejects(() => identity({ family: 'structure', kind: 'part' }, id), TypeError);
});
test('section manifests include every supported kind and reject mismatched counts without aliasing input', () => {
  const counts = adventureCoreCounts('resources');
  counts.scene = 2;
  const manifest = adventureCoreManifest('resources', 2, 'a'.repeat(64), counts);
  assert.equal(Object.keys(manifest.counts).length, 17);
  counts.scene = 9;
  assert.equal(manifest.counts.scene, 2);
  assert.throws(() => adventureCoreManifest('resources', 3, 'a'.repeat(64), counts), TypeError);
  const bad = { ...counts, unknown: 0 };
  assert.throws(() => adventureCoreManifest('resources', 9, 'a'.repeat(64), bad), TypeError);
  assert.throws(() => adventureCoreManifest('resources', 9, 'not-a-hash', counts), TypeError);
  assert.throws(() => adventureCoreCounts('history'), TypeError);
});
test('null persona markers contain no invented profile and digest receipts have stable canonical bytes', () => {
  assert.deepEqual(adventureNullPersona('scene', 'scene-id'), {
    schemaVersion: 1,
    kind: 'persona',
    scope: 'scene',
    bindingId: 'scene-id',
    personaId: null,
    profile: null,
  });
  assert.throws(() => adventureNullPersona('players', 'scene-id'), TypeError);
  assert.equal(adventureCoreDigestSeed('lore'), 'writer-adventure-core-v1:lore\n');
  assert.equal(
    adventureCoreDigestLine(
      { kind: 'adventure-lore', id: 'lore-id' },
      { byteLength: 65537, chunkCount: 2, contentHash: 'a'.repeat(64) },
    ),
    JSON.stringify(['unit', 'adventure-lore', 'lore-id', 65537, 2, 'a'.repeat(64)]) + '\n',
  );
  assert.throws(
    () =>
      adventureCoreDigestLine(
        { kind: 'adventure-lore', id: 'lore-id' },
        { byteLength: 65537, chunkCount: 1, contentHash: 'a'.repeat(64) },
      ),
    TypeError,
  );
});
