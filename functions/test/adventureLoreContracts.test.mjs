import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mutationInput,
  adventureLoreRequestHash,
  normalizeAdventureLoreEntity,
  digest,
} from '../src/adventureLoreContracts.mjs';
import {
  assertLoreItemOrigin,
  loreReferenceOrigin,
  loreRelationOrigin,
} from '../src/campaignLoreOrigin.mjs';
const entity = {
  name: '  Dragão  ',
  aliases: ['  Serpente  '],
  category: 'character',
  summary: '  Guardião  ',
  details: '  Prosa 🐉\n',
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
  isPublic: false,
};
const scope = {
  adventureId: 'adventure-lore-fixture',
  adventureToken: 'a'.repeat(64),
  entityId: 'adventure-lore-operation',
  operationId: 'adventure-lore-operation',
  expectedRevision: 0,
  expectedCollectionRevision: 0,
};
test('save wire vector normalizes metadata, preserves Unicode prose and canonicalizes object key order', () => {
  const r = mutationInput('author', { ...scope, entity }, 'save');
  assert.equal(r.entity.name, 'Dragão');
  assert.deepEqual(r.entity.aliases, ['Serpente']);
  assert.equal(r.entity.summary, 'Guardião');
  assert.equal(r.entity.details, '  Prosa 🐉\n');
  assert.equal(
    adventureLoreRequestHash('save', r),
    'e66fbeebc08783c6ec3f5b96eb94643b6ef01e0ba83b242cbced4e87bb0103ec',
  );
  const reversed = Object.fromEntries(Object.entries(r).reverse());
  assert.equal(adventureLoreRequestHash('save', reversed), adventureLoreRequestHash('save', r));
  console.log('save normalized vector: ' + JSON.stringify(r));
});
test('delete wire vector excludes entity and uses action/request envelope', () => {
  const r = mutationInput(
    'author',
    {
      ...scope,
      operationId: 'adventure-lore-delete',
      expectedRevision: 1,
      expectedCollectionRevision: 1,
    },
    'delete',
  );
  assert.equal(
    adventureLoreRequestHash('delete', r),
    '6e3fbcc23dc22ad5f71b56ba86608ef1aef25b54792e814f6593481846bb6927',
  );
  assert.equal('entity' in r, false);
  console.log('delete normalized vector: ' + JSON.stringify(r));
});
test('new local origin preserves old universe hash and refuses corrupt, foreign and extra origins', () => {
  const base = { adventureId: scope.adventureId, universeId: 'universe-legacy' };
  const old = loreReferenceOrigin(
    { kind: 'universe', scopeId: 'universe-legacy', entityId: 'entity-legacy' },
    base,
  );
  const local = loreRelationOrigin('adventure:' + scope.adventureId + ':' + scope.entityId, base);
  assert.equal(digest(old), 'f3e9ef5637f3386e12b3e315900c6a3355ec478f066260ad0361c4ddc78ebf8f');
  assert.equal(digest(local), '00f550362a6a3e14ca673ecb1f29de15896ee13261b44bda476b48559f5f44b7');
  assert.equal(
    assertLoreItemOrigin({ kind: 'lore', origin: old, sourceKey: digest(old) }, base),
    old,
  );
  for (const origin of [
    { ...old, extra: 1 },
    { ...local, adventureId: 'other-adventure-id' },
  ])
    assert.throws(() =>
      assertLoreItemOrigin({ kind: 'lore', origin, sourceKey: digest(origin) }, base),
    );
  assert.throws(() =>
    assertLoreItemOrigin({ kind: 'lore', origin: local, sourceKey: 'a'.repeat(64) }, base),
  );
  assert.equal(loreRelationOrigin('adventure:foreign-adventure-id:' + scope.entityId, base), null);
});
test('closed fields, invalid revisions, UTF8, character/byte bounds and public writes fail before I/O', () => {
  for (const value of [undefined, NaN, -1, Infinity, 1.5]) {
    assert.throws(() =>
      mutationInput('author', { ...scope, expectedRevision: value, entity }, 'save'),
    );
    assert.throws(() =>
      mutationInput('author', { ...scope, expectedCollectionRevision: value, entity }, 'save'),
    );
  }
  for (const bad of [
    { ...entity, isPublic: true },
    { ...entity, extra: 1 },
    { ...entity, details: '\ud800' },
    { ...entity, name: ' ' },
    { ...entity, aliases: Array(21).fill('a') },
    { ...entity, details: 'a'.repeat(150001) },
    { ...entity, structuredDetails: { ...entity.structuredDetails, notes: undefined } },
    {
      ...entity,
      relations: [
        {
          targetEntityId: 'adventure:foreign-adventure-id:entity-long-enough',
          relationType: 'x',
          description: '',
          available: true,
        },
      ],
    },
  ])
    assert.throws(() => normalizeAdventureLoreEntity(bad));
  const big = {
    ...entity,
    details: '龍'.repeat(150000),
    structuredDetails: Object.fromEntries(
      ['appearance', 'personality', 'history', 'notes'].map((k) => [k, '龍'.repeat(150000)]),
    ),
  };
  assert.throws(() => normalizeAdventureLoreEntity(big));
  assert.equal(
    normalizeAdventureLoreEntity({ ...entity, details: 'a'.repeat(150000) }).details.length,
    150000,
  );
});
