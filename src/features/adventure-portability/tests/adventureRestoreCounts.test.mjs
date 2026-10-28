// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { imageDataFixture } from './adventureImageFixture.mjs';
import {
  countFixture,
  finishCounts,
} from '../../../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import { createScenesService } from '../../../../functions/src/scenes.mjs';
import { createAdventureBlocksService } from '../../../../functions/src/adventureBlocks.mjs';
it('reconciles a real Writer archive and the first authoring changes apply only their deltas', async () => {
  const source = await imageDataFixture(1, false),
    uid = 'author',
    group = await source.scenes.createSceneGroup(uid, {
      target: source.target,
      operationId: 'counts-native-part',
      title: 'Parte',
    }),
    active = await source.scenes.createScene(uid, {
      target: source.target,
      parentId: group.id,
      operationId: 'counts-native-scene',
      title: 'Cena ativa',
      content: '<p>Um dois</p>',
    }),
    extra = await source.blocks.createAdventureBlock(uid, {
      adventureId: source.id,
      sceneId: active.scene.id,
      operationId: 'counts-native-extra',
      title: 'Extra',
      content: '<p>Três quatro cinco</p>',
      audience: 'gm',
    }),
    parked = await source.blocks.createAdventureBlock(uid, {
      adventureId: source.id,
      sceneId: active.scene.id,
      operationId: 'counts-native-parked',
      title: 'Arquivo',
      content: '<p>Palavras fora do total</p>',
      audience: 'players',
    });
  expect(extra.block.wordCount).toBe(3);
  await source.blocks.archiveAdventureBlock(uid, {
    adventureId: source.id,
    blockId: parked.block.resource.id,
    operationId: 'counts-native-archive-block',
    expectedRevision: parked.block.revision,
    archived: true,
  });
  const archivedScene = await source.scenes.createScene(uid, {
    target: source.target,
    parentId: group.id,
    operationId: 'counts-native-archived-scene',
    title: 'Cena arquivada',
    content: '<p>Texto guardado fora da composição</p>',
  });
  await source.scenes.archiveScene(uid, {
    target: source.target,
    sceneId: archivedScene.scene.id,
    operationId: 'counts-native-archive-scene',
    expectedRevision: archivedScene.scene.revision,
    archived: true,
  });
  const original = structuredClone([...source.records]),
    chunks = [];
  for await (const bytes of streamAdventureArchive(source.id, source.scanApi, { guard: () => {} }))
    chunks.push(bytes);
  const { f, p } = await countFixture(Buffer.concat(chunks)),
    ready = await finishCounts(f, p),
    prefix = 'adventures/' + p.adventureId,
    rows = [...f.records].filter(([k]) => k.startsWith(prefix + '/')),
    main = rows.find(
      ([k, v]) =>
        k.startsWith(prefix + '/scenes/') && !k.includes('/body/') && v.title === 'Cena ativa',
    )[1],
    part = rows.find(([k]) => k.startsWith(prefix + '/parts/'))[1],
    block = rows.find(
      ([k, v]) =>
        k.startsWith(prefix + '/sceneBlocks/') && !k.includes('/body/') && v.title === 'Extra',
    )[1],
    controlPath = prefix + '/workProgress/current';
  expect(ready.staging.countWordCount).toBe(5);
  expect(main.mainWordCount).toBe(2);
  expect(main.blockWordCount).toBe(3);
  expect(main.blockCount).toBe(1);
  expect(main.wordCount).toBe(5);
  expect(main.nextBlockOrder).toBe(
    source.records.get(source.path + '/scenes/' + active.scene.id).nextBlockOrder,
  );
  expect(part.wordCount).toBe(5);
  expect(part.sceneCount).toBe(2);
  expect(f.records.get(prefix + '/scenes/' + main.id + '/body/current').revision).toBe(
    main.revision,
  );
  expect(f.records.get(prefix).ownerId).toBeUndefined();
  expect(f.records.get(controlPath).countReady).toBe(false);
  expect([...source.records]).toEqual(original);

  // Simulate the future activation gate only to exercise existing authoring readers.
  // This is not evidence that the production activation protocol is implemented.
  f.records.set(prefix, structuredClone(f.records.get(f.path + '/preparedRoot/current').value));
  f.records.set(controlPath, { ...f.records.get(controlPath), countReady: true });
  const scenes = createScenesService({ db: f.db, now: () => 4000 }),
    blocks = createAdventureBlocksService({ db: f.db, now: () => 5000 }),
    target = { kind: 'adventure', id: p.adventureId },
    changed = await scenes.updateScene(uid, {
      target,
      sceneId: main.id,
      operationId: 'counts-first-save',
      expectedRevision: main.revision,
      patch: { content: '<p>Um dois três quatro</p>' },
    });
  expect(changed.scene.wordCount).toBe(7);
  expect(f.records.get(controlPath).wordCount).toBe(7);
  const archived = await scenes.archiveScene(uid, {
    target,
    sceneId: main.id,
    operationId: 'counts-first-archive',
    expectedRevision: changed.scene.revision,
    archived: true,
  });
  expect(f.records.get(controlPath).wordCount).toBe(0);
  const restored = await scenes.archiveScene(uid, {
    target,
    sceneId: main.id,
    operationId: 'counts-first-restore',
    expectedRevision: archived.scene.revision,
    archived: false,
  });
  expect(f.records.get(controlPath).wordCount).toBe(7);
  await blocks.archiveAdventureBlock(uid, {
    adventureId: target.id,
    blockId: block.id,
    operationId: 'counts-first-block-archive',
    expectedRevision: block.revision,
    archived: true,
  });
  expect(f.records.get(controlPath).wordCount).toBe(4);
  expect(restored.scene.blockWordCount).toBe(3);
}, 60000);

it('preserves legacy orphan text and its disabled ledger group without inventing a part', async () => {
  const source = await imageDataFixture(1, false),
    scenePath = source.path + '/scenes/' + source.sceneId;
  source.records.set(scenePath, {
    ...source.records.get(scenePath),
    parentId: 'legacy-missing-part-0001',
  });
  const chunks = [];
  for await (const bytes of streamAdventureArchive(source.id, source.scanApi, { guard: () => {} }))
    chunks.push(bytes);
  const { f, p } = await countFixture(Buffer.concat(chunks)),
    ready = await finishCounts(f, p),
    prefix = 'adventures/' + p.adventureId + '/',
    row = [...f.records].find(([k]) => k.startsWith(prefix + 'workWordSources/'))[1],
    group = [...f.records].find(([k]) => k.startsWith(prefix + 'workWordGroups/'))[1];
  expect(ready.staging.countWordCount).toBe(0);
  expect(row.words).toBe(0);
  expect(row.groupId).not.toBeNull();
  expect(group).toEqual({ words: 0, enabled: false });
  expect([...f.records.keys()].some((k) => k.startsWith(prefix + 'parts/'))).toBe(false);
  expect(
    [...f.records].some(
      ([k, v]) =>
        k.startsWith(prefix + 'scenes/') &&
        k.endsWith('/body/current') &&
        v.content.includes('Texto próprio'),
    ),
  ).toBe(true);
}, 60000);
