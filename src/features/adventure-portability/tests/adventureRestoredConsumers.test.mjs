// @vitest-environment node
import { it, expect } from 'vitest';
import { captureAdventure, restoreAdventure } from './adventureRoundtripFixture.mjs';
import { assertRestoredAdventureDeletion } from './adventureRestoredDeletionFixture.mjs';
import { adventureBackupExportFixture } from '../../../../functions/test/helpers/adventureBackupExportFixture.mjs';
import { createStudioService } from '../../../../functions/src/studio.mjs';
import { createImageLibraryService } from '../../../../functions/src/imageLibrary.mjs';
import { createScenesService } from '../../../../functions/src/scenes.mjs';
import { createAdventureBlocksService } from '../../../../functions/src/adventureBlocks.mjs';
import { createAdventureLoreService } from '../../../../functions/src/adventureLore.mjs';
import { createNarrativePlanningService } from '../../../../functions/src/narrativePlanning.mjs';
import { createWorkProgressService } from '../../../../functions/src/workProgress.mjs';
import { createWorkHistoryService } from '../../../../functions/src/workHistory.mjs';
import { createEditorChatContextService } from '../../../../functions/src/editorChatContext.mjs';
import { signed, hash } from '../../../../functions/test/helpers/editorChatFixture.mjs';
const uid = 'author';
const services = (f) => ({
  studio: createStudioService({ db: f.db, now: () => 6000 }),
  scenes: createScenesService({ db: f.db, now: () => 6000 }),
  blocks: createAdventureBlocksService({ db: f.db, now: () => 6000 }),
  lore: createAdventureLoreService({ db: f.db, now: () => 6000 }),
  narrative: createNarrativePlanningService({ db: f.db, now: () => 6000 }),
  progress: createWorkProgressService({ db: f.db, now: () => 6000 }),
  history: createWorkHistoryService({ db: f.db, now: () => 6000 }),
  context: createEditorChatContextService({
    db: f.db,
    now: () => 6000,
    randomBytes: () => Buffer.alloc(32, 7),
  }),
});
async function versions(api, target) {
  const rows = [];
  let cursor = null;
  do {
    const page = await api.listWorkVersions(uid, { target, cursor, limit: 1 });
    rows.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}
async function readVersion(api, target, versionId) {
  let cursor = null,
    text = '';
  do {
    const page = await api.readWorkVersion(uid, { target, versionId, cursor, limit: 1 });
    text += page.chunks.map((v) => v.content).join('');
    cursor = page.nextCursor;
  } while (cursor);
  return text;
}
it('ordinary capture and full restoration remain usable after source collection, including editing, lore, context, history and recapture', async () => {
  const original = await adventureBackupExportFixture(),
    s = services(original);
  const partId = 'export-fixture-part-0001',
    scene = await s.scenes.getScene(uid, { target: original.target, sceneId: original.sceneId });
  const groups = await s.scenes.listSceneGroups(uid, { target: original.target });
  const group = groups.items.find((v) => v.id === partId);
  const unassigned = original.records.get(original.path + '/sceneControls/unassigned');
  await s.scenes.moveScene(uid, {
    target: original.target,
    operationId: 'roundtrip-place-scene-0001',
    sceneId: scene.id,
    expectedRevision: scene.revision,
    parentId: partId,
    expectedSourceStructureRevision: unassigned.structureRevision,
    expectedTargetStructureRevision: group.structureRevision,
  });
  const arc = await s.narrative.createNarrativeItem(uid, {
    target: original.target,
    resource: { kind: 'arc' },
    operationId: 'roundtrip-arc-0001',
    title: 'Arco privado',
    initialState: 'Começo',
    objective: 'Objetivo',
  });
  await s.narrative.createNarrativeItem(uid, {
    target: original.target,
    resource: { kind: 'milestone', arcId: arc.item.id },
    operationId: 'roundtrip-milestone-0001',
    title: 'Marco',
    notes: 'Notas do marco',
  });
  await s.narrative.createNarrativeItem(uid, {
    target: original.target,
    resource: { kind: 'event' },
    operationId: 'roundtrip-event-0001',
    title: 'Evento',
    dateLabel: '3º dia do inverno',
    description: 'Acontecimento',
  });
  await s.progress.createWorkChecklistItem(uid, {
    target: original.target,
    operationId: 'roundtrip-checklist-0001',
    title: 'Preparar mapa',
  });
  await s.scenes.setSceneReference(uid, {
    target: original.target,
    sceneId: scene.id,
    operationId: 'roundtrip-scene-lore-link-0001',
    expectedRevision: original.records.get(original.path + '/scenes/' + scene.id).revision,
    reference: { kind: 'adventure', scopeId: original.id, entityId: 'export-fixture-lore-0001' },
  });
  await s.narrative.setNarrativeReference(uid, {
    target: original.target,
    source: { kind: 'arc', id: arc.item.id },
    operationId: 'roundtrip-arc-scene-link-0001',
    expectedRevision: arc.item.revision,
    reference: { kind: 'scene', sceneId: scene.id },
  });
  const before = structuredClone(original.records);
  const first = await captureAdventure(original, original.id, original.assets, {
    adventureId: original.id,
    resource: { kind: 'scene', id: scene.id },
    content: 'Rascunho distinto 🐉',
    baseRevision: scene.revision,
    savedAt: 4000,
  });
  const f = await restoreAdventure(first.bytes),
    api = services(f),
    target = f.target;
  expect(original.records).toEqual(before);
  expect((await api.studio.getAdventure(uid, { id: target.id })).ownerId).toBe(uid);
  const restoredGroups = await api.scenes.listSceneGroups(uid, { target });
  const restoredPart = restoredGroups.items.find((v) => v.title === 'Parte privada');
  const list = await api.scenes.listScenes(uid, {
    target,
    parentId: restoredPart.id,
    archived: false,
    limit: 50,
  });
  const restoredScene = list.items.find((v) => v.title === 'Cena');
  expect(restoredScene).toBeDefined();
  let current = await api.scenes.getScene(uid, { target, sceneId: restoredScene.id });
  expect(current.content).toBe(original.text);
  expect(current.parentId).not.toBe(partId);
  const blocks = await api.blocks.listAdventureBlocks(uid, {
    adventureId: target.id,
    sceneId: current.id,
    limit: 50,
  });
  const block = blocks.items.find((v) => v.resource.kind === 'block');
  expect(
    await api.blocks.getAdventureBlock(uid, { adventureId: target.id, resource: block.resource }),
  ).toMatchObject({ content: '<p>Texto do bloco.</p>', audience: 'creator' });
  expect((await api.progress.getWorkProgress(uid, { target })).manuscript.ready).toBe(true);
  expect((await api.progress.listWorkChecklist(uid, { target })).items.map((v) => v.title)).toEqual(
    ['Preparar mapa'],
  );
  const events = await api.narrative.listNarrativeItems(uid, {
    target,
    resource: { kind: 'event' },
  });
  expect(events.items[0].dateLabel).toBe('3º dia do inverno');
  const arcs = await api.narrative.listNarrativeItems(uid, { target, resource: { kind: 'arc' } }),
    arcSource = { kind: 'arc', id: arcs.items[0].id };
  expect(
    (await api.narrative.getNarrativeItem(uid, { target, source: arcSource })).initialState,
  ).toBe('Começo');
  const milestones = await api.narrative.listNarrativeItems(uid, {
    target,
    resource: { kind: 'milestone', arcId: arcSource.id },
  });
  expect(
    (
      await api.narrative.getNarrativeItem(uid, {
        target,
        source: { kind: 'milestone', id: milestones.items[0].id, arcId: arcSource.id },
      })
    ).notes,
  ).toBe('Notas do marco');
  const sceneLinks = await api.scenes.listSceneReferences(uid, { target, sceneId: current.id });
  expect(sceneLinks.items[0].reference).toMatchObject({ kind: 'adventure', scopeId: target.id });
  const narrativeLinks = await api.narrative.listNarrativeReferences(uid, {
    target,
    source: arcSource,
  });
  expect(narrativeLinks.items[0].reference).toMatchObject({ kind: 'scene', sceneId: current.id });
  const image = await api.blocks.getAdventureBlockImage(uid, {
    adventureId: target.id,
    resource: block.resource,
  });
  expect(image.image.imageId).not.toBe(original.imageId);
  const library = await createImageLibraryService({ db: f.db, assets: f.assets }).list(uid, {});
  expect(typeof library.images.find((v) => v.id === image.image.imageId).url).toBe('string');
  const restoredVersions = await versions(api.history, target);
  expect(restoredVersions).toHaveLength(3);
  const draftVersion = restoredVersions.find((v) => v.label === 'Rascunho recuperado do backup');
  expect(await readVersion(api.history, target, draftVersion.id)).toBe('Rascunho distinto 🐉');

  await api.scenes.updateScene(uid, {
    target,
    sceneId: current.id,
    operationId: 'roundtrip-edit-scene-0001',
    expectedRevision: current.revision,
    patch: { content: '<p>Vigia da Torre atravessa a ponte.</p>' },
  });
  await api.blocks.updateAdventureBlock(uid, {
    adventureId: target.id,
    resource: block.resource,
    operationId: 'roundtrip-edit-block-0001',
    expectedRevision: block.revision,
    patch: { content: '<p>Bloco reescrito.</p>', audience: 'gm' },
  });
  const saved = await api.history.getWorkVersionSource(uid, {
    target,
    resource: { kind: 'scene', id: current.id },
  });
  await api.history.restoreWorkVersion(uid, {
    target,
    resource: { kind: 'scene', id: current.id },
    versionId: draftVersion.id,
    expectedSourceToken: saved.sourceToken,
    operationId: 'roundtrip-restore-version-0001',
  });
  current = await api.scenes.getScene(uid, { target, sceneId: current.id });
  expect(current.content).toBe('Rascunho distinto 🐉');
  const allVersions = await versions(api.history, target),
    previous = allVersions.find((v) => v.reason === 'before-restore');
  expect(await readVersion(api.history, target, previous.id)).toBe(
    '<p>Vigia da Torre atravessa a ponte.</p>',
  );

  const loreList = await api.lore.listAdventureLore(uid, {
      adventureId: target.id,
      scope: 'adventure',
    }),
    entry = loreList.items[0];
  const lore = (
    await api.lore.getAdventureLore(uid, {
      adventureId: target.id,
      adventureToken: loreList.adventureToken,
      reference: entry.reference,
      expectedContextToken: loreList.contextToken,
      expectedEntityToken: entry.entityToken,
    })
  ).item;
  await api.lore.saveAdventureLore(uid, {
    adventureId: target.id,
    adventureToken: loreList.adventureToken,
    entityId: entry.reference.entityId,
    operationId: 'roundtrip-edit-lore-0001',
    expectedRevision: lore.revision,
    expectedCollectionRevision: loreList.collectionRevision,
    entity: {
      name: lore.name,
      aliases: lore.aliases,
      category: lore.category,
      summary: lore.summary,
      details: 'Lore alterado na cópia',
      structuredDetails: lore.structuredDetails,
      relations: [],
      isPublic: false,
    },
  });
  const scope = { target, resource: { kind: 'scene', id: current.id } },
    base = await api.history.getWorkVersionSource(uid, scope);
  let context = (
    await api.context.dispatch(
      uid,
      await signed({
        action: 'prepareContext',
        ...scope,
        operationId: 'roundtrip-context-0001',
        contextId: 'roundtrip-context-0001',
        base: {
          sourceToken: base.sourceToken,
          revision: base.revision,
          bodyHash: base.contentHash,
        },
        capture: {
          source: 'selection',
          editorHash: hash('b'),
          from: 0,
          to: 14,
          text: 'Vigia da Torre',
          surroundingText: '',
          truncated: false,
        },
      }),
    )
  ).current;
  for (let n = 0; context.phase !== 'ready'; n++) {
    expect(n).toBeLessThan(10);
    context = (
      await api.context.dispatch(
        uid,
        await signed({
          action: 'advanceContext',
          ...scope,
          contextId: context.contextId,
          contextToken: context.contextToken,
          expectedRevision: context.revision,
          operationId: 'roundtrip-context-step-' + n,
        }),
      )
    ).current;
  }
  const inspected = await api.context.dispatch(uid, {
    action: 'inspectContext',
    ...scope,
    contextId: context.contextId,
    contextToken: context.contextToken,
    expectedRevision: context.revision,
  });
  expect(inspected.frozen.lore[0].detailsExcerpt).toBe('Lore alterado na cópia');
  expect(inspected.frozen.persona.complement.id).toMatch(/^custom-/);
  const second = await captureAdventure(f, target.id, f.backupAssets),
    again = await restoreAdventure(second.bytes),
    againApi = services(again);
  const againGroups = await againApi.scenes.listSceneGroups(uid, { target: again.target });
  const againScenes = await againApi.scenes.listScenes(uid, {
    target: again.target,
    parentId: againGroups.items[0].id,
    archived: false,
  });
  expect(
    (
      await againApi.scenes.getScene(uid, {
        target: again.target,
        sceneId: againScenes.items[0].id,
      })
    ).content,
  ).toBe('Rascunho distinto 🐉');
  expect(await versions(againApi.history, again.target)).toHaveLength(4);
  const secondCopy = structuredClone(again.records);
  await assertRestoredAdventureDeletion(f, {
    scope,
    context,
    scene: current,
    blockResource: block.resource,
    imageId: image.image.imageId,
  });
  expect(again.records).toEqual(secondCopy);
  expect(original.records).toEqual(before);
}, 60000);

it('a genuinely empty adventure captured from Studio restores without invented scenes, groups, history or media', async () => {
  const { adventureImportDb } =
    await import('../../../../functions/test/helpers/adventureImportDb.mjs');
  const original = adventureImportDb({ nativeUpdates: true }),
    id = 'roundtrip-empty-0001';
  await services(original).studio.createAdventure(uid, {
    operationId: id,
    title: 'Aventura vazia',
  });
  const before = structuredClone(original.records),
    capture = await captureAdventure(original, id, {}),
    f = await restoreAdventure(capture.bytes),
    api = services(f);
  expect((await api.scenes.listSceneGroups(uid, { target: f.target })).items).toEqual([]);
  expect((await api.scenes.listScenes(uid, { target: f.target, parentId: null })).items).toEqual(
    [],
  );
  expect(await versions(api.history, f.target)).toEqual([]);
  expect((await api.progress.getWorkProgress(uid, { target: f.target })).manuscript).toMatchObject({
    ready: true,
    wordCount: 0,
  });
  expect([...f.records.keys()].filter((p) => p.startsWith('users/author/imageLibrary/'))).toEqual(
    [],
  );
  await assertRestoredAdventureDeletion(f);
  expect(original.records).toEqual(before);
}, 30000);

it('deleted block remains only in history after capture/restore and cannot be recreated by restoring its old version', async () => {
  const original = await adventureBackupExportFixture(),
    source = services(original);
  const removed = await source.blocks.getAdventureBlock(uid, {
    adventureId: original.id,
    resource: { kind: 'block', id: original.blockId },
  });
  const request = {
    adventureId: original.id,
    blockId: original.blockId,
    operationId: 'roundtrip-delete-block-0001',
    expectedRevision: removed.revision,
  };
  let deletion;
  for (let n = 0; !deletion?.complete; n++) {
    expect(n).toBeLessThan(10);
    deletion = await source.blocks.deleteAdventureBlock(uid, request);
  }
  const before = structuredClone(original.records),
    capture = await captureAdventure(original, original.id),
    f = await restoreAdventure(capture.bytes),
    api = services(f);
  const history = await versions(api.history, f.target),
    historical = history.find((v) => v.resource.kind === 'block');
  expect(await readVersion(api.history, f.target, historical.id)).toBe('<p>Texto do bloco.</p>');
  expect(
    await api.blocks.getAdventureBlock(uid, {
      adventureId: f.target.id,
      resource: historical.resource,
    }),
  ).toBeNull();
  expect(
    (await api.scenes.listScenes(uid, { target: f.target, parentId: null })).items,
  ).toHaveLength(1);
  await expect(
    api.history.restoreWorkVersion(uid, {
      target: f.target,
      resource: historical.resource,
      versionId: historical.id,
      operationId: 'roundtrip-absent-restore-0001',
      expectedSourceToken: 'a'.repeat(64),
    }),
  ).rejects.toThrow();
  expect(
    await api.blocks.getAdventureBlock(uid, {
      adventureId: f.target.id,
      resource: historical.resource,
    }),
  ).toBeNull();
  const second = await captureAdventure(f, f.target.id, f.backupAssets),
    again = await restoreAdventure(second.bytes);
  expect(await versions(services(again).history, again.target)).toHaveLength(2);
  expect(original.records).toEqual(before);
}, 60000);

it('legacy part prose, archived scene and orphan grouping stay distinct through normal consumers and a second backup', async () => {
  const original = await adventureBackupExportFixture(),
    source = services(original),
    legacy = 'Texto legado preservado 🌙';
  // Historical input can contain legacy part text and an orphan scene; target is still built exclusively by restoration.
  await original.db.runTransaction((tx) => {
    tx.update(original.db.doc(original.path + '/parts/export-fixture-part-0001'), {
      contentMode: 'legacy',
      content: legacy,
    });
    tx.update(original.db.doc(original.path + '/scenes/' + original.sceneId), {
      parentId: 'historical-missing-part-0001',
    });
  });
  const archived = await source.scenes.createScene(uid, {
    target: original.target,
    operationId: 'roundtrip-archived-scene-0001',
    title: 'Cena arquivada',
    content: 'Texto privado arquivado',
    parentId: null,
  });
  await source.scenes.archiveScene(uid, {
    target: original.target,
    sceneId: archived.scene.id,
    expectedRevision: archived.scene.revision,
    operationId: 'roundtrip-archive-scene-0001',
    archived: true,
  });
  const before = structuredClone(original.records),
    capture = await captureAdventure(original, original.id),
    f = await restoreAdventure(capture.bytes),
    api = services(f);
  const groups = await api.scenes.listSceneGroups(uid, { target: f.target });
  expect(groups.items).toHaveLength(1);
  const group = await api.scenes.getSceneGroup(uid, {
    target: f.target,
    parentId: groups.items[0].id,
  });
  expect(group.legacy.content).toBe(legacy);
  const active = await api.scenes.listOrphanScenes(uid, { target: f.target }),
    archive = await api.scenes.listScenes(uid, {
      target: f.target,
      parentId: null,
      archived: true,
    });
  expect(active.items).toHaveLength(1);
  expect(archive.items).toHaveLength(1);
  const own = await api.scenes.getScene(uid, { target: f.target, sceneId: active.items[0].id });
  expect(own.group).toBeNull();
  expect(own.content).toBe(original.text);
  const recovery = {
    target: f.target,
    sceneId: own.id,
    expectedRevision: own.revision,
    expectedMissingParentId: own.parentId,
    operationId: 'roundtrip-recover-orphan-0001',
  };
  const recovered = await api.scenes.recoverOrphanScene(uid, recovery);
  expect(recovered.scene.parentId).toBeNull();
  expect(recovered.scene.formerParentId).toBe(own.parentId);
  expect(await api.scenes.recoverOrphanScene(uid, recovery)).toEqual(recovered);
  expect((await api.scenes.listOrphanScenes(uid, { target: f.target })).items).toEqual([]);
  await api.scenes.updateScene(uid, {
    target: f.target,
    sceneId: own.id,
    operationId: 'roundtrip-edit-recovered-0001',
    expectedRevision: recovered.scene.revision,
    patch: { content: 'Texto recuperado e editável' },
  });
  expect((await api.scenes.getScene(uid, { target: f.target, sceneId: own.id })).content).toBe(
    'Texto recuperado e editável',
  );
  expect((await api.scenes.listSceneGroups(uid, { target: f.target })).items).toHaveLength(1);
  let stored = await api.scenes.getScene(uid, { target: f.target, sceneId: archive.items[0].id });
  expect(stored.content).toBe('Texto privado arquivado');
  await api.scenes.archiveScene(uid, {
    target: f.target,
    sceneId: stored.id,
    expectedRevision: stored.revision,
    operationId: 'roundtrip-unarchive-scene-0001',
    archived: false,
  });
  stored = await api.scenes.getScene(uid, { target: f.target, sceneId: stored.id });
  expect(stored.archived).toBe(false);
  expect(stored.parentId).toBeNull();
  const second = await captureAdventure(f, f.target.id, f.backupAssets),
    again = await restoreAdventure(second.bytes),
    againApi = services(again);
  const againGroups = await againApi.scenes.listSceneGroups(uid, { target: again.target });
  expect(againGroups.items).toHaveLength(1);
  expect(
    (
      await againApi.scenes.getSceneGroup(uid, {
        target: again.target,
        parentId: againGroups.items[0].id,
      })
    ).legacy.content,
  ).toBe(legacy);
  expect(
    (
      await againApi.scenes.listScenes(uid, {
        target: again.target,
        parentId: null,
        archived: false,
      })
    ).items,
  ).toHaveLength(2);
  expect(original.records).toEqual(before);
}, 60000);

it('an archive referring to an unavailable original universe restores own text without copying global prose or inventing access', async () => {
  const { adventureImportDb } =
    await import('../../../../functions/test/helpers/adventureImportDb.mjs');
  const { createUniverseService } = await import('../../../../functions/src/universes.mjs');
  const original = adventureImportDb({ nativeUpdates: true }),
    id = 'roundtrip-world-adventure-0001',
    world = 'roundtrip-world-0001';
  await createUniverseService({ db: original.db, now: () => 1000 }).createUniverse(uid, {
    creationId: world,
    name: 'DO_NOT_COPY_WORLD_NAME',
    description: 'DO_NOT_COPY_GLOBAL_PROSE',
  });
  await services(original).studio.createAdventure(uid, {
    operationId: id,
    title: 'Aventura vinculada',
    universeId: world,
  });
  await services(original).scenes.createScene(uid, {
    target: { kind: 'adventure', id },
    operationId: 'roundtrip-world-scene-0001',
    title: 'Cena própria',
    content: 'Texto próprio permanece',
    parentId: null,
  });
  const before = structuredClone(original.records),
    capture = await captureAdventure(original, id, {});
  expect(capture.bytes.includes(Buffer.from('DO_NOT_COPY_GLOBAL_PROSE'))).toBe(false);
  const f = await restoreAdventure(capture.bytes),
    api = services(f);
  expect((await api.studio.getAdventure(uid, { id: f.target.id })).universeId).toBeNull();
  expect([...f.records.keys()].some((path) => path.startsWith('universes/'))).toBe(false);
  const scenes = await api.scenes.listScenes(uid, { target: f.target, parentId: null });
  expect(
    (await api.scenes.getScene(uid, { target: f.target, sceneId: scenes.items[0].id })).content,
  ).toBe('Texto próprio permanece');
  expect(original.records).toEqual(before);
}, 30000);
