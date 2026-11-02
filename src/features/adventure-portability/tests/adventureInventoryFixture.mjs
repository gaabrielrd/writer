import { editorChatFixture, uid } from '../../../../functions/test/helpers/editorChatFixture.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { createAdventureBackupReadService } from '../../../../functions/src/adventureBackupRead.mjs';
import { createAdventureBackupResourceService } from '../../../../functions/src/adventureBackupResourceRead.mjs';
import { createAdventureBackupLoreService } from '../../../../functions/src/adventureBackupLoreRead.mjs';
import { createAdventureBackupHistoryService } from '../../../../functions/src/adventureBackupHistoryRead.mjs';
import { createAdventureBackupPersonaService } from '../../../../functions/src/adventureBackupPersonaRead.mjs';
import { createAdventureBackupImageService } from '../../../../functions/src/adventureBackupImageRead.mjs';
import { createAdventureBackupUniverseService } from '../../../../functions/src/adventureBackupUniverseRead.mjs';
import { createNarrativePlanningService } from '../../../../functions/src/narrativePlanning.mjs';
import { createAdventureLoreService } from '../../../../functions/src/adventureLore.mjs';
import { adventureIdentityToken } from '../../../../functions/src/adventureLoreContracts.mjs';
import { createWorkHistoryService } from '../../../../functions/src/workHistory.mjs';
import { createWorkProgressService } from '../../../../functions/src/workProgress.mjs';
import { DEFAULT_PERSONAS } from '../../../../functions/src/personaProfile.mjs';
export async function inventoryFixture(count = 1) {
  const f = await editorChatFixture('adventure', true, adventureImportDb({ nativeUpdates: true }));
  const id = f.target.id,
    sceneId = 'context-scene-first';
  await f.scenes.createSceneGroup(uid, {
    target: f.target,
    operationId: 'inventory-part-0001',
    title: 'PRIVATE_PART',
  });
  for (let n = 1; n < count; n++)
    await f.scenes.createScene(uid, {
      target: f.target,
      operationId: 'inventory-scene-' + String(n).padStart(5, '0'),
      title: 'PRIVATE_SCENE',
    });
  const narrative = createNarrativePlanningService({ db: f.db, now: () => 2000 });
  await narrative.createNarrativeItem(uid, {
    target: f.target,
    resource: { kind: 'arc' },
    operationId: 'inventory-arc-0001',
    title: 'PRIVATE_ARC',
  });
  await narrative.createNarrativeItem(uid, {
    target: f.target,
    resource: { kind: 'event' },
    operationId: 'inventory-event-0001',
    title: 'PRIVATE_EVENT',
  });
  await narrative.createNarrativeItem(uid, {
    target: f.target,
    resource: { kind: 'milestone', arcId: 'inventory-arc-0001' },
    operationId: 'inventory-milestone-0001',
    title: 'PRIVATE_MILESTONE',
  });
  const lore = createAdventureLoreService({ db: f.db, now: () => 2100 });
  const adventureToken = await f.db.runTransaction(async (tx) =>
    adventureIdentityToken(uid, id, await tx.get(f.db.doc(f.path))),
  );
  await lore.saveAdventureLore(uid, {
    adventureId: id,
    adventureToken,
    entityId: 'inventory-lore-0001',
    operationId: 'inventory-lore-0001',
    expectedRevision: 0,
    expectedCollectionRevision: 0,
    entity: {
      name: 'PRIVATE_NAME',
      aliases: [],
      category: 'other',
      summary: 'PRIVATE_SUMMARY',
      details: 'PRIVATE_DETAILS',
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: [],
      isPublic: false,
    },
  });
  await createWorkProgressService({ db: f.db, now: () => 2200 }).createWorkChecklistItem(uid, {
    target: f.target,
    operationId: 'inventory-checklist-0001',
    title: 'PRIVATE_TASK',
  });
  await f.scenes.updateScene(uid, {
    target: f.target,
    sceneId,
    operationId: 'inventory-scene-text-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + sceneId).revision,
    patch: { content: '<p>' + 'PRIVATE_HISTORY 🌙'.repeat(5000) + '</p>' },
  });
  const history = createWorkHistoryService({ db: f.db, now: () => 2300 });
  const versionSource = await history.getWorkVersionSource(uid, {
    target: f.target,
    resource: { kind: 'scene', id: sceneId },
  });
  await history.createWorkVersion(uid, {
    target: f.target,
    resource: versionSource.resource,
    expectedSourceToken: versionSource.sourceToken,
    operationId: 'inventory-version-0001',
    label: 'PRIVATE_LABEL',
  });
  async function bind(index, operationId) {
    const current = await f.call({
      action: 'getAdventurePersonaBinding',
      adventureId: id,
      sceneId,
    });
    return f.mutate({
      action: 'setAdventurePersonaBinding',
      adventureId: id,
      sceneId,
      adventureToken: current.adventureToken,
      expectedBindingToken: current.bindingToken,
      value: { personaComplement: { personaId: DEFAULT_PERSONAS[index].id, overrides: [] } },
      operationId,
    });
  }
  await bind(0, 'inventory-persona-0001');
  f.events.length = 0;
  return { ...f, id, sceneId, bind, ...inventoryReadHarness(f) };
}
export function inventoryReadHarness(f) {
  const handlers = {
    ...createAdventureBackupReadService(f),
    ...createAdventureBackupResourceService(f),
    ...createAdventureBackupLoreService(f),
    ...createAdventureBackupHistoryService(f),
    ...createAdventureBackupPersonaService(f),
    ...createAdventureBackupImageService({ db: f.db, assets: {} }),
    ...createAdventureBackupUniverseService(f),
  };
  const calls = [];
  let intercept;
  const api = {
    async call(method, input) {
      calls.push({ method, input: structuredClone(input) });
      const run = () => handlers[method](uid, input);
      return intercept ? intercept(method, input, run) : run();
    },
  };
  return {
    handlers,
    calls,
    scanApi: api,
    intercept(fn) {
      intercept = fn;
    },
  };
}
