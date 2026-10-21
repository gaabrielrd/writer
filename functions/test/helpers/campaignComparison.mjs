import { createStudioService } from '../../src/studio.mjs';
import { createScenesService } from '../../src/scenes.mjs';
import { createUniverseService } from '../../src/universes.mjs';
import { createNarrativePlanningService } from '../../src/narrativePlanning.mjs';
import { createAdventureBlocksService } from '../../src/adventureBlocks.mjs';
import { createCampaignCaptureService } from '../../src/campaignCapture.mjs';
import { createCampaignComparisonService } from '../../src/campaignComparison.mjs';
import { createCampaignComparisonReadService } from '../../src/campaignComparisonRead.mjs';
import { digest } from '../../src/campaignBaseContracts.mjs';
export const uid = 'author',
  adventureId = 'comparison-adventure-001',
  target = { kind: 'adventure', id: adventureId };
export const op = (name) => 'comparison-operation-' + name;
export async function comparisonFixture(
  db,
  assets = {
    metadata: async () => ({ generation: '12345678901234567890', size: 4 }),
    readGeneration: async () => Buffer.from('webp'),
  },
  beforeCapture,
) {
  const studio = createStudioService({ db }),
    scenes = createScenesService({ db }),
    universe = createUniverseService({ db }),
    narrative = createNarrativePlanningService({ db }),
    blocks = createAdventureBlocksService({ db });
  await universe.createUniverse(uid, { creationId: 'world', name: 'Mundo', description: '' });
  await universe.saveUniverseLore(uid, {
    universeId: 'world',
    id: 'hero',
    create: true,
    input: {
      name: 'Heroína',
      aliases: [],
      category: 'character',
      summary: 'Resumo',
      details: 'Ficha 🐉',
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: [],
      isPublic: false,
    },
  });
  await studio.createAdventure(uid, {
    operationId: adventureId,
    title: 'Aventura',
    synopsis: 'Sinopse',
    universeId: 'world',
  });
  const part = await scenes.createSceneGroup(uid, {
    target,
    operationId: op('part'),
    title: 'Parte',
  });
  const scene = (
    await scenes.createScene(uid, {
      target,
      operationId: op('scene'),
      title: 'Cena',
      parentId: part.id,
      content: '<p>Original 🐉</p>',
      planning: { objective: 'Objetivo' },
    })
  ).scene;
  await blocks.createAdventureBlock(uid, {
    adventureId,
    sceneId: scene.id,
    operationId: op('block'),
    title: 'Pista',
    content: '<p>Corpo adicional</p>',
    audience: 'players',
  });
  const arc = await narrative.createNarrativeItem(uid, {
    target,
    operationId: op('arc'),
    resource: { kind: 'arc' },
    title: 'Arco',
    initialState: 'Começo',
    objective: 'Destino',
    plannedOutcome: 'Fim',
  });
  const milestone = await narrative.createNarrativeItem(uid, {
    target,
    operationId: op('milestone'),
    resource: { kind: 'milestone', arcId: arc.item.id },
    title: 'Marco',
    notes: 'Nota',
  });
  const event = await narrative.createNarrativeItem(uid, {
    target,
    operationId: op('event'),
    resource: { kind: 'event' },
    title: 'Evento',
    description: 'Descrição',
    dateLabel: '3º inverno',
  });
  const reference = { kind: 'universe', scopeId: 'world', entityId: 'hero' };
  await scenes.setSceneReference(uid, {
    target,
    sceneId: scene.id,
    operationId: op('scene-ref'),
    expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
    reference,
  });
  await narrative.setNarrativeReference(uid, {
    target,
    operationId: op('arc-ref'),
    source: { kind: 'arc', id: arc.item.id },
    expectedRevision: arc.item.revision,
    reference: { kind: 'lore', reference },
  });
  const imageId = 'comparison-library-image-001';
  await db.runTransaction(async (tx) =>
    tx.create(db.doc('users/' + uid + '/imageLibrary/' + imageId), {
      state: 'active',
      path: 'book-covers/author/comparison.png',
      name: 'Ilustração',
      useCount: 0,
    }),
  );
  await blocks.setAdventureBlockImage(uid, {
    adventureId,
    resource: { kind: 'scene', id: scene.id },
    operationId: op('image'),
    expectedRevision: (await scenes.getScene(uid, { target, sceneId: scene.id })).revision,
    image: { imageId, alt: 'Dragão', caption: 'Legenda' },
  });
  if (beforeCapture)
    await beforeCapture({
      db,
      studio,
      scenes,
      universe,
      narrative,
      blocks,
      part,
      scene,
      arc,
      milestone,
      event,
    });
  const capture = createCampaignCaptureService({ db, assets });
  let p = await capture.startCampaignCapture(uid, {
    operationId: op('base'),
    adventureId,
    expectedSourceToken: (await capture.getCampaignCaptureSource(uid, { adventureId })).sourceToken,
    title: 'Mesa',
    description: 'Descrição própria',
    universeId: 'world',
  });
  for (let n = 0; n < 250 && p.state === 'preparing'; n++)
    p = await capture.advanceCampaignCapture(uid, {
      captureId: p.captureId,
      operationId: digest({ capture: p.captureId, checkpoint: p.checkpoint }),
      expectedCheckpoint: p.checkpoint,
    });
  if (p.state !== 'prepared') throw new Error('Fixture não concluiu captura inicial');
  const campaign = (
    await capture.activateCampaignCapture(uid, {
      captureId: p.captureId,
      operationId: op('activate'),
      expectedCheckpoint: p.checkpoint,
    })
  ).campaign;
  return {
    db,
    assets,
    studio,
    scenes,
    universe,
    narrative,
    blocks,
    part,
    scene,
    arc,
    milestone,
    event,
    imageId,
    campaign,
    api: createCampaignComparisonService({ db, assets }),
    reader: createCampaignComparisonReadService({
      db,
      assets,
      deriveImage: async (bytes) => bytes,
    }),
  };
}
export async function startComparison(f, name = 'candidate') {
  const source = await f.api.getCampaignComparisonSource(uid, {
    campaignId: f.campaign.id,
    currentBaseId: f.campaign.activeBaseId,
  });
  const input = {
    operationId: op(name),
    campaignId: source.campaignId,
    campaignToken: source.campaignToken,
    currentBaseId: source.currentBaseId,
    expectedSourceToken: source.sourceToken,
  };
  return { input, result: await f.api.startCampaignComparison(uid, input) };
}
export async function finishComparison(f, result) {
  for (let n = 0; n < 300 && result.progress.state === 'preparing'; n++) {
    const p = result.progress;
    result = await f.api.advanceCampaignComparison(uid, {
      comparisonId: p.comparisonId,
      operationId: digest({ id: p.comparisonId, checkpoint: p.checkpoint }),
      expectedCheckpoint: p.checkpoint,
    });
  }
  if (result.progress.state !== 'ready') throw new Error('Candidata não ficou pronta');
  return result.progress;
}
export async function comparisonRows(f, p, group, extra = {}) {
  const items = [];
  let cursor;
  for (let n = 0; n < 200; n++) {
    const page = await f.reader.listCampaignComparisonChanges(uid, {
      comparisonId: p.comparisonId,
      group,
      ...extra,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) return items;
  }
  throw new Error('Paginação não terminou');
}
