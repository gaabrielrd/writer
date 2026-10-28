// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { inventoryFixture } from './adventureInventoryFixture.mjs';
import { uid } from '../../../../functions/test/helpers/editorChatFixture.mjs';
import {
  resourceReady,
  resourceFinish,
} from '../../../../functions/test/helpers/adventureRestoreResourcesFixture.mjs';
import {
  cleanup,
  mutation,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { createAdventureLoreService } from '../../../../functions/src/adventureLore.mjs';
import {
  adventureIdentityToken,
  storedMetadata,
  storedBody,
} from '../../../../functions/src/adventureLoreContracts.mjs';
import { createVerifiedAdventureRestoreContent } from '../../../../functions/src/adventureRestoreContentRead.mjs';
import { digest } from '../../../../functions/src/sceneContracts.mjs';
let captured;
async function ready() {
  captured ??= (async () => {
    const f = await inventoryFixture(2),
      lore = createAdventureLoreService({ db: f.db, now: () => 3000 });
    const adventureToken = adventureIdentityToken(uid, f.id, await f.db.doc(f.path).get());
    const base = {
      name: 'PRIVATE_SECOND',
      aliases: ['PRIVATE_ALIAS'],
      category: 'other',
      summary: 'PRIVATE_SUMMARY',
      details: 'PRIVATE_DETAILS',
      structuredDetails: {
        appearance: 'PRIVATE_APPEARANCE',
        personality: '',
        history: '',
        notes: '',
      },
      relations: [],
      isPublic: false,
    };
    for (const id of ['native-lore-second-0001', 'native-lore-deleted-0001'])
      await lore.saveAdventureLore(uid, {
        adventureId: f.id,
        adventureToken,
        entityId: id,
        operationId: id,
        expectedRevision: 0,
        expectedCollectionRevision: f.records.get(f.path).loreVersion,
        entity: base,
      });
    await lore.deleteAdventureLore(uid, {
      adventureId: f.id,
      adventureToken,
      entityId: 'native-lore-deleted-0001',
      operationId: 'native-lore-deletion-0001',
      expectedRevision: 1,
      expectedCollectionRevision: f.records.get(f.path).loreVersion,
    });
    const head = f.records.get(f.path + '/lore/inventory-lore-0001'),
      body = f.records.get(f.path + '/loreBodies/inventory-lore-0001');
    await lore.saveAdventureLore(uid, {
      adventureId: f.id,
      adventureToken,
      entityId: 'inventory-lore-0001',
      operationId: 'native-lore-relation-0001',
      expectedRevision: head.revision,
      expectedCollectionRevision: f.records.get(f.path).loreVersion,
      entity: {
        ...base,
        name: head.name,
        summary: head.summary,
        details: body.details,
        structuredDetails: body.structuredDetails,
        relations: [
          {
            targetEntityId: 'adventure:' + f.id + ':native-lore-second-0001',
            relationType: 'ally',
            description: 'PRIVATE_RELATION',
          },
        ],
      },
    });
    const sceneId = 'inventory-scene-00001',
      binding = await f.call({ action: 'getAdventurePersonaBinding', adventureId: f.id, sceneId });
    await f.mutate({
      action: 'setAdventurePersonaBinding',
      adventureId: f.id,
      sceneId,
      adventureToken: binding.adventureToken,
      expectedBindingToken: binding.bindingToken,
      value: {
        personaComplement: {
          personaId: 'preset-atmospheric',
          overrides: [{ traitId: 'sensory', value: 73 }],
        },
      },
      operationId: 'native-persona-second-0001',
    });
    const chunks = [];
    for await (const bytes of streamAdventureArchive(f.id, f.scanApi, { guard: () => {} }))
      chunks.push(bytes);
    return Buffer.concat(chunks);
  })();
  const { f, p } = await resourceReady({ bytes: await captured });
  return { f, p: await resourceFinish(f, p) };
}
async function finish(f, p) {
  for (let n = 0; p.staging.phase !== 'profiles-ready'; n++) {
    if (n > 1000) throw Error('unbounded profiles');
    p = (
      await f.api.advanceAdventureRestoreProfiles(
        f.uid,
        mutation(p, 'native-profile-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  return p;
}
it('restores actual native lore pairs/tombstones and complete persona snapshots without exposing the library', async () => {
  const { f, p } = await ready(),
    end = await finish(f, p),
    root = 'adventures/' + p.adventureId;
  expect([
    end.staging.loreHeads,
    end.staging.loreBodies,
    end.staging.personaAdventureBindings,
    end.staging.personaSceneBindings,
    end.staging.personaProfiles,
  ]).toEqual([3, 2, 1, 2, 1]);
  const reader = await createVerifiedAdventureRestoreContent({
      db: f.db,
      uid: f.uid,
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    }),
    context = {
      uid: f.uid,
      adventureId: p.adventureId,
      adventureToken: adventureIdentityToken(f.uid, p.adventureId, await f.db.doc(root).get()),
      collectionRevision: 3,
    };
  const sources = await Promise.all(
    Array.from({ length: end.staging.itemIndex - p.staging.itemIndex }, (_, i) =>
      reader.readMappedItem(p.staging.itemIndex + i),
    ),
  );
  for (const unit of sources) {
    const v = unit.value;
    if (unit.record.kind === 'adventure-lore') {
      const h = f.records.get(root + '/lore/' + v.id);
      expect(storedMetadata(h, context, v.id)).toMatchObject(v.data);
      if (!h.deleted)
        expect(storedBody(f.records.get(root + '/loreBodies/' + v.id), context, h)).toBeDefined();
      else expect(f.records.has(root + '/loreBodies/' + v.id)).toBe(false);
    }
    if (unit.record.kind === 'adventure-lore-body')
      expect(f.records.get(root + '/loreBodies/' + v.id)).toMatchObject(v.data);
    if (unit.record.kind === 'adventure-persona') {
      const binding = f.records.get(f.path + '/preparedRoot/binding-' + unit.record.id);
      expect(binding).toMatchObject({
        scope: v.scope,
        bindingId: v.bindingId,
        personaId: v.personaId,
      });
      if (v.profile !== null)
        expect(f.records.get(f.path + '/preparedRoot/persona-' + v.personaId)).toMatchObject({
          profile: v.profile,
          profileHash: digest(v.profile),
        });
    }
  }
  const sceneBindings = sources.filter(
    (u) => u.record.kind === 'adventure-persona' && u.value.scope === 'scene',
  );
  expect(sceneBindings[0].value.personaId).toBe(sceneBindings[1].value.personaId);
  expect([...f.records.keys()].some((k) => k.includes('/aiPersonas/'))).toBe(false);
  expect(f.records.get(root)).not.toHaveProperty('ownerId');
  expect(f.records.get(root + '/workProgress/current').countReady).toBe(false);
}, 60000);
it('cleans the actual native writer lore and private persona corpus without leaving definitions or activating the adventure', async () => {
  const { f, p } = await ready(),
    end = await finish(f, p),
    cancelled = await cleanup(f, end, 2);
  expect(cancelled.staging.cleanedArtifacts).toBe(end.staging.artifactCount);
  expect(
    [...f.records.keys()].filter(
      (k) => k.startsWith('adventures/' + p.adventureId + '/') || k.startsWith(f.path + '/'),
    ),
  ).toEqual([]);
  expect(f.records.get('adventures/' + p.adventureId).kind).toBe('adventure-restore-retired');
}, 60000);

it('installs actual Writer persona snapshots once per profile and keeps native bindings/private availability through cancellation', async () => {
  const { readAvailablePersonaMetadata, readPersonaRestoreBatchProof } =
      await import('../../../../functions/src/personaAvailability.mjs'),
    { finishPersonaLibrary } =
      await import('../../../../functions/test/helpers/adventureRestorePersonaLibraryFixture.mjs'),
    { f, p: initial } = await ready();
  let p = await finish(f, initial);
  for (let n = 0; p.staging.phase !== 'history-ready'; n++)
    p = (
      await f.api.advanceAdventureRestoreHistory(
        f.uid,
        mutation(p, 'native-library-history-' + String(n).padStart(6, '0')),
      )
    ).progress;
  p = (await f.api.finalizeAdventureRestoreDraft(f.uid, mutation(p, 'native-library-final-draft')))
    .progress;
  p = (await f.api.advanceAdventureRestoreUniverse(f.uid, mutation(p, 'native-library-universe')))
    .progress;
  const definitions = [...f.records].filter(
      ([k, v]) => k.startsWith(f.path + '/preparedRoot/') && v.kind === 'adventure-restore-persona',
    ),
    before = new Map([...f.records].filter(([k]) => k.startsWith('adventures/'))),
    end = await finishPersonaLibrary(f, p),
    rows = [...f.records].filter(([k]) => k.startsWith('users/' + f.uid + '/aiPersonas/'));
  expect(end.staging.personaLibraryInstalled).toBe(1);
  expect(rows).toHaveLength(1);
  expect(rows[0][1]).toEqual({
    ...definitions[0][1].profile,
    restoreOrigin: {
      schemaVersion: 2,
      target: { kind: 'adventure', id: p.adventureId },
      restoreId: p.restoreId,
      jobToken: p.jobToken,
    },
  });
  for (const [k, v] of before) expect(f.records.get(k)).toEqual(v);
  expect(
    await f.db.runTransaction((tx) => readAvailablePersonaMetadata(tx, f.db, f.uid, rows[0][1].id)),
  ).toBeNull();
  const cancelled = await cleanup(f, end, 50);
  expect(cancelled.staging.cleanedArtifacts).toBe(end.staging.artifactCount);
  expect(f.records.has(rows[0][0])).toBe(false);
  expect(
    await f.db.runTransaction((tx) =>
      readPersonaRestoreBatchProof(tx, f.db, f.uid, rows[0][1].restoreOrigin, 'cancelled'),
    ),
  ).not.toBeNull();
  expect(f.records.get('adventures/' + p.adventureId).kind).toBe('adventure-restore-retired');
}, 60000);
