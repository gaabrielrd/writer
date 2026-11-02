import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryFixture } from '../../src/features/adventure-portability/tests/adventureInventoryFixture.mjs';
import { imageDataFixture } from '../../src/features/adventure-portability/tests/adventureImageFixture.mjs';
import { ADVENTURE_RESOURCE_DEFINITIONS as definitions } from '../src/adventureBackupResourceDefinitions.mjs';
import { adventureNullPersona } from '../src/adventureArchiveCore.mjs';
import { AdventureContentError } from '../src/adventureContentPrimitives.mjs';
import { createNarrativePlanningService } from '../src/narrativePlanning.mjs';
import {
  validateAdventureStructure,
  validateAdventureResource,
  validateAdventureLore,
  validateAdventurePersona,
  validateAdventureVersion,
  validateAdventureImageAsset,
  validateAdventureImageBinding,
} from '../src/adventureContentSchema.mjs';
async function unit(f, method, request) {
  const chunks = [];
  let first;
  for (let index = 0; !first || index < first.chunkCount; index++) {
    const value = await f.scanApi.call(method, {
      adventureId: f.id,
      sourceToken: f.pin.sourceToken,
      ...request,
      index,
    });
    first ??= value;
    chunks.push(Buffer.from(value.chunkBase64, 'base64'));
  }
  return JSON.parse(Buffer.concat(chunks));
}
async function setup() {
  const f = await inventoryFixture();
  await f.scenes.setSceneReference('author', {
    target: f.target,
    sceneId: f.sceneId,
    operationId: 'semantic-scene-reference-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
    reference: { kind: 'adventure', scopeId: f.id, entityId: 'inventory-lore-0001' },
  });
  await createNarrativePlanningService({ db: f.db, now: () => 2600 }).setNarrativeReference(
    'author',
    {
      target: f.target,
      source: { kind: 'arc', id: 'inventory-arc-0001' },
      reference: { kind: 'scene', sceneId: f.sceneId },
      operationId: 'semantic-narrative-reference-0001',
      expectedRevision: f.records.get(f.path + '/arcs/inventory-arc-0001').revision,
    },
  );
  f.pin = await f.handlers.getAdventureBackupSource('author', { adventureId: f.id });
  return f;
}
test('independent schema accepts all real resource family projections including optional absence and recursive owners', async () => {
  const f = await setup(),
    seen = new Set();
  async function walk(kind, parentId = null) {
    let cursor = null;
    do {
      const page = await f.scanApi.call('listAdventureBackupResources', {
        adventureId: f.id,
        sourceToken: f.pin.sourceToken,
        kind,
        parentId,
        cursor,
        limit: 50,
      });
      for (const row of page.items) {
        const value = await unit(f, 'readAdventureBackupResource', {
          kind,
          parentId,
          id: row.id,
          itemToken: row.itemToken,
        });
        assert.equal(validateAdventureResource(value), value);
        seen.add(kind);
        for (const child of Object.keys(definitions).filter(
          (k) => definitions[k].parent === definitions[kind].path,
        ))
          await walk(child, row.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
  for (const kind of Object.keys(definitions).filter((k) => !definitions[k].parent))
    await walk(kind);
  assert.equal(seen.size, 17);
});
test('native root, part, own lore, used profiles, explicit null and history preserve their declared shape', async () => {
  const f = await setup();
  const root = await unit(f, 'readAdventureBackupStructure', {
    kind: 'adventure',
    id: f.id,
    itemToken: f.pin.sourceToken,
  });
  validateAdventureStructure(root, 'adventure');
  const list = async (method, scope) =>
    f.scanApi.call(method, {
      adventureId: f.id,
      sourceToken: f.pin.sourceToken,
      ...scope,
      limit: 50,
    });
  const parts = await list('listAdventureBackupStructure', { kind: 'part' });
  for (const row of parts.items)
    validateAdventureStructure(
      await unit(f, 'readAdventureBackupStructure', {
        kind: 'part',
        id: row.id,
        itemToken: row.itemToken,
      }),
      'part',
    );
  for (const kind of ['lore', 'lore-body']) {
    const page = await list('listAdventureBackupLore', { kind });
    for (const row of page.items)
      validateAdventureLore(
        await unit(f, 'readAdventureBackupLore', { kind, id: row.id, itemToken: row.itemToken }),
        kind,
      );
  }
  for (const scope of ['adventure', 'scene']) {
    const page = await list('listAdventureBackupPersonaBindings', { scope });
    for (const row of page.items)
      validateAdventurePersona(
        row.personaId === null
          ? adventureNullPersona(scope, row.id)
          : await unit(f, 'readAdventureBackupPersona', {
              scope,
              id: row.id,
              itemToken: row.itemToken,
            }),
      );
  }
  const versions = await list('listAdventureBackupHistory', {
    kind: 'version',
    parentId: null,
    parentToken: null,
  });
  for (const row of versions.items)
    validateAdventureVersion(
      await unit(f, 'readAdventureBackupHistory', {
        kind: 'version',
        parentId: null,
        parentToken: null,
        id: row.id,
        itemToken: row.itemToken,
      }),
    );
});
test('unknown provenance, malformed parents and secret profile fields cannot be silently projected away', async () => {
  const f = await setup();
  const page = await f.scanApi.call('listAdventureBackupResources', {
    adventureId: f.id,
    sourceToken: f.pin.sourceToken,
    kind: 'scene',
    parentId: null,
    limit: 50,
  });
  const row = page.items[0],
    value = await unit(f, 'readAdventureBackupResource', {
      kind: 'scene',
      parentId: null,
      id: row.id,
      itemToken: row.itemToken,
    });
  for (const forged of [
    { ...value, sourceToken: 'hidden' },
    { ...value, parentId: 'other' },
    { ...value, data: { ...value.data, ownerId: 'other' } },
  ])
    assert.throws(() => validateAdventureResource(forged), AdventureContentError);
  const bindings = await f.scanApi.call('listAdventureBackupPersonaBindings', {
    adventureId: f.id,
    sourceToken: f.pin.sourceToken,
    scope: 'scene',
    limit: 50,
  });
  const binding = bindings.items.find((row) => row.personaId !== null);
  const profile = await unit(f, 'readAdventureBackupPersona', {
    scope: 'scene',
    id: binding.id,
    itemToken: binding.itemToken,
  });
  assert.throws(
    () =>
      validateAdventurePersona({
        ...profile,
        profile: { ...profile.profile, apiKey: 'DO_NOT_COPY' },
      }),
    AdventureContentError,
  );
  const extra = structuredClone(profile);
  extra.profile.traits[0].provider = 'DO_NOT_COPY';
  assert.throws(() => validateAdventurePersona(extra), AdventureContentError);
});
test('image asset schema keeps metadata while refusing operational storage fields', async () => {
  const f = await imageDataFixture();
  const pin = await f.handlers.getAdventureBackupSource('author', { adventureId: f.id });
  const page = await f.handlers.listAdventureBackupImageBindings('author', {
    adventureId: f.id,
    sourceToken: pin.sourceToken,
    kind: 'scene',
    limit: 50,
  });
  const row = page.items[0],
    source = await f.handlers.getAdventureBackupImage('author', {
      adventureId: f.id,
      sourceToken: pin.sourceToken,
      kind: 'scene',
      id: row.id,
      bindingToken: row.bindingToken,
    });
  const { kind, alt, caption, ...metadata } = source.image;
  void kind;
  const asset = { schemaVersion: 1, assetId: 'a'.repeat(64), ...metadata };
  validateAdventureImageAsset(asset);
  validateAdventureImageBinding({
    schemaVersion: 1,
    resource: { kind: 'scene', id: row.id },
    image: { assetId: asset.assetId, imageId: asset.imageId, alt, caption },
  });
  assert.throws(
    () => validateAdventureImageAsset({ ...asset, generation: '12' }),
    AdventureContentError,
  );
  assert.throws(
    () => validateAdventureImageAsset({ ...asset, path: 'private-path' }),
    AdventureContentError,
  );
});
