import type * as Block from '../../../src/features/adventure-blocks/model/adventureBlock';
import { narrativeTypes } from '../../../src/features/adventure-blocks/model/adventureBlock';
import type {
  AdventureBlockImageState,
  SetAdventureBlockImageInput,
} from '../../../src/features/adventure-blocks/model/adventurePreview';
import {
  fixtureAdventureImageUse,
  fixtureLibraryImage,
  fixtureSetImageUse,
} from './imageLibraryService';
import {
  fixtureAdventureSceneCounts,
  fixtureBody,
  fixtureCas,
  fixtureContentHash,
  fixtureHash,
  fixtureSaveScenes,
  fixtureSceneError,
  fixtureSceneState,
  fixtureSetSceneMainBody,
  fixtureUpdateCounts,
  type FixtureSceneState,
} from './sceneStore';
import { fixtureOwner } from './studioStore';
import { FIXTURE_TIME } from './data';

type Scene = FixtureSceneState['scenes'][string];
type Receipt = NonNullable<FixtureSceneState['adventureBlockReceipts']>[string];
type Extra = NonNullable<FixtureSceneState['adventureBlocks']>[string];
function fail(message: string, code = 'failed-precondition'): never {
  throw Object.assign(new Error(message), { code: `functions/${code}` });
}
function lostResponse(method: string) {
  if (sessionStorage.getItem('writer.visual.block-lost-response') !== method) return;
  sessionStorage.removeItem('writer.visual.block-lost-response');
  fail(
    'Não foi possível confirmar a operação. Confirme o mesmo pedido antes de continuar.',
    'unavailable',
  );
}
async function stateFor(adventureId: string) {
  const state = await fixtureSceneState({ kind: 'adventure', id: adventureId });
  state.adventureBlocks ??= {};
  state.adventureBlockBodies ??= {};
  state.adventureBlockReceipts ??= {};
  return state;
}
function readScene(state: FixtureSceneState, id: string, repair = false): Scene {
  const scene = state.scenes[id];
  if (!scene || scene.ownerId !== fixtureOwner() || ('deleting' in scene && scene.deleting))
    fail('Cena indisponível.', 'not-found');
  if (scene.parentId !== null) {
    const parent = state.groups[scene.parentId];
    if (!parent || (parent.deleting && !scene.archived)) fail('Cena indisponível.', 'not-found');
  }
  fixtureAdventureSceneCounts(scene, repair);
  return scene;
}
function readResource(state: FixtureSceneState, resource: Block.AdventureBlockResource) {
  if (resource.kind === 'scene') return { scene: readScene(state, resource.id), extra: null };
  const extra = state.adventureBlocks?.[resource.id];
  if (!extra || extra.deleting || extra.ownerId !== fixtureOwner())
    fail('Bloco indisponível.', 'not-found');
  return { scene: readScene(state, extra.sceneId), extra };
}
function summary(scene: Scene, extra: Extra | null = null): Block.AdventureBlockSummary {
  if (extra) {
    return structuredClone({
      resource: extra.resource,
      sceneId: extra.sceneId,
      revision: extra.revision,
      title: extra.title,
      narrativeType: extra.narrativeType,
      audience: extra.audience,
      archived: extra.archived,
      order: extra.order,
      wordCount: extra.wordCount,
      bodyHash: extra.bodyHash,
      bodyBytes: extra.bodyBytes,
      createdAt: extra.createdAt,
      updatedAt: extra.updatedAt,
    });
  }
  const counts = fixtureAdventureSceneCounts(scene);
  return {
    resource: { kind: 'scene', id: scene.id },
    sceneId: scene.id,
    revision: scene.revision,
    title: scene.mainBlockTitle ?? 'Texto principal',
    narrativeType: scene.mainBlockType ?? 'scene',
    audience: scene.mainBlockAudience ?? 'creator',
    archived: false,
    order: counts.mainOrder,
    wordCount: counts.main,
    bodyHash: scene.bodyHash,
    bodyBytes: scene.bodyBytes,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  };
}
function totals(scene: Scene): Block.AdventureBlockTotals {
  const counts = fixtureAdventureSceneCounts(scene);
  return {
    sceneRevision: scene.revision,
    sceneWordCount: counts.main + counts.extra,
    structureRevision: counts.structure,
    mainBodyHash: scene.bodyHash,
  };
}
function result(scene: Scene, extra: Extra | null = null): Block.AdventureBlockMutation {
  return { block: summary(scene, extra), ...totals(scene) };
}
function extras(state: FixtureSceneState, sceneId: string) {
  return Object.values(state.adventureBlocks ?? {}).filter(
    (block) => block.sceneId === sceneId && !block.deleting,
  );
}
function ordered(state: FixtureSceneState, scene: Scene, archived = false) {
  const values = extras(state, scene.id)
    .filter((block) => block.archived === archived)
    .map((block) => summary(scene, block));
  if (!archived) values.push(summary(scene));
  return values.sort((a, b) => a.order - b.order || a.resource.id.localeCompare(b.resource.id));
}
function touch(
  state: FixtureSceneState,
  scene: Scene,
  changes: {
    extra?: number;
    count?: number;
    structure?: boolean;
    nextOrder?: number;
  } = {},
  repair = false,
) {
  const old = fixtureAdventureSceneCounts(scene, repair);
  Object.assign(scene, {
    hasBlocks: true,
    mainWordCount: old.main,
    blockWordCount: changes.extra ?? old.extra,
    blockCount: changes.count ?? old.count,
    blocksStructureRevision: old.structure + Number(changes.structure === true),
    nextBlockOrder: changes.nextOrder ?? old.nextOrder,
    revision: scene.revision + 1,
    updatedAt: FIXTURE_TIME + state.revision + 1,
  });
  scene.wordCount = scene.mainWordCount! + scene.blockWordCount!;
  fixtureUpdateCounts(state, [scene.parentId]);
}
function operation(
  state: FixtureSceneState,
  method: string,
  input: { operationId: string },
  payload: unknown = input,
) {
  const fingerprint = fixtureHash({ method, payload });
  const receipt = state.adventureBlockReceipts?.[input.operationId];
  if (receipt && receipt.fingerprint !== fingerprint)
    fail('Operação usada com outros dados.', 'invalid-argument');
  return { fingerprint, receipt };
}
function replay(state: FixtureSceneState, receipt: Receipt): Block.AdventureBlockMutation {
  if (!receipt.resource) throw fixtureSceneError();
  const { scene, extra } = readResource(state, receipt.resource);
  if (
    scene.revision !== receipt.sceneRevision ||
    (extra?.revision ?? scene.revision) !== receipt.revision
  )
    throw fixtureSceneError();
  return result(scene, extra);
}
function remember(
  state: FixtureSceneState,
  operationId: string,
  fingerprint: string,
  response: Block.AdventureBlockMutation,
) {
  state.adventureBlockReceipts![operationId] = {
    fingerprint,
    sceneId: response.block.sceneId,
    resource: response.block.resource,
    revision: response.block.revision,
    sceneRevision: response.sceneRevision,
  };
  fixtureSaveScenes();
}
function validatePatch(patch: Block.AdventureBlockPatch, creating = false) {
  if (!creating && Object.keys(patch).length === 0)
    fail('Informe uma alteração.', 'invalid-argument');
  if (patch.title !== undefined && (!patch.title.trim() || patch.title.length > 300))
    fail('Título inválido.', 'invalid-argument');
  if (patch.narrativeType !== undefined && !narrativeTypes.includes(patch.narrativeType))
    fail('Tipo narrativo inválido.', 'invalid-argument');
  if (patch.audience !== undefined && !['creator', 'gm', 'players'].includes(patch.audience))
    fail('Audiência inválida.', 'invalid-argument');
}
async function append(
  state: FixtureSceneState,
  scene: Scene,
  id: string,
  fields: {
    title: string;
    narrativeType?: Block.AdventureNarrativeType;
    audience?: Block.AdventureBlockAudience;
    content?: string;
    image?: SetAdventureBlockImageInput['image'];
  },
): Promise<Extra> {
  validatePatch(fields, true);
  if (state.adventureBlocks?.[id]) fail('Identificador de bloco já utilizado.', 'already-exists');
  const content = fields.content ?? '',
    body = await fixtureBody(content);
  const counts = fixtureAdventureSceneCounts(scene);
  if (fields.image) fixtureLibraryImage(fields.image.imageId);
  const block: Extra = {
    resource: { kind: 'block', id },
    ownerId: fixtureOwner(),
    sceneId: scene.id,
    revision: 1,
    title: fields.title.trim(),
    narrativeType: fields.narrativeType ?? 'scene',
    audience: fields.audience ?? 'creator',
    ...(fields.image ? { image: structuredClone(fields.image) } : {}),
    archived: false,
    order: counts.nextOrder,
    ...body,
    createdAt: FIXTURE_TIME + state.revision + 1,
    updatedAt: FIXTURE_TIME + state.revision + 1,
  };
  if (fields.image)
    fixtureSetImageUse(
      fixtureAdventureImageUse(state.target.id, block.resource),
      fields.image.imageId,
    );
  state.adventureBlocks![id] = block;
  state.adventureBlockBodies![id] = content;
  touch(state, scene, {
    extra: counts.extra + body.wordCount,
    count: counts.count + 1,
    nextOrder: counts.nextOrder + 1,
    structure: true,
  });
  return block;
}
const paginationSeeds = new Map<string, Promise<void>>();
async function seedPagination(state: FixtureSceneState, scene: Scene) {
  if (
    sessionStorage.getItem('writer.visual.block-pagination') !== 'true' ||
    state.adventureBlockSeededScenes?.includes(scene.id)
  )
    return;
  const key = JSON.stringify([state.ownerId, state.target.id, scene.id]);
  const pending = paginationSeeds.get(key);
  if (pending) return pending;
  // Explicit corpus only: no ordinary list call creates manuscript resources.
  const request = (async () => {
    for (let index = 1; index <= 28; index++) {
      const id = `visual-block-${scene.id}-${String(index).padStart(2, '0')}`;
      const existing = state.adventureBlocks?.[id];
      if (existing) {
        if (existing.ownerId !== state.ownerId || existing.sceneId !== scene.id)
          fail('Identificador do corpus já utilizado por outro bloco.', 'already-exists');
        continue;
      }
      await append(state, scene, id, {
        title: `Bloco de exemplo ${index}`,
        content: `<p>Passagem privada de exemplo ${index}.</p>`,
      });
    }
    state.adventureBlockSeededScenes = [...(state.adventureBlockSeededScenes ?? []), scene.id];
    fixtureSaveScenes();
  })();
  paginationSeeds.set(key, request);
  try {
    await request;
  } finally {
    if (paginationSeeds.get(key) === request) paginationSeeds.delete(key);
  }
}
export async function listAdventureBlocks(input: {
  adventureId: string;
  sceneId: string;
  archived?: boolean;
  cursor?: string | null;
  limit?: number;
}): Promise<Block.AdventureBlockPage> {
  const state = await stateFor(input.adventureId),
    scene = readScene(state, input.sceneId);
  await seedPagination(state, scene);
  await fixtureSeedAdventurePreview(state, scene);
  const limit = input.limit ?? 25,
    archived = input.archived ?? false;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    fail('Página inválida.', 'invalid-argument');
  const counts = fixtureAdventureSceneCounts(scene);
  const scope = JSON.stringify([
    fixtureOwner(),
    input.adventureId,
    scene.id,
    archived,
    scene.revision,
    counts.structure,
  ]);
  type Cursor = { scope: string; order: number; id: string };
  let cursor: Cursor | null = null;
  if (input.cursor) {
    try {
      cursor = JSON.parse(atob(input.cursor)) as Cursor;
    } catch {
      fail('Cursor inválido.', 'invalid-argument');
    }
    if (!cursor || cursor.scope !== scope) throw fixtureSceneError();
  }
  const values = ordered(state, scene, archived).filter(
    (block) =>
      !cursor ||
      block.order > cursor.order ||
      (block.order === cursor.order && block.resource.id > cursor.id),
  );
  const items = values.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    ...totals(scene),
    nextCursor:
      values.length > limit && last
        ? btoa(JSON.stringify({ scope, order: last.order, id: last.resource.id }))
        : null,
  };
}
export async function getAdventureBlockCountStatus(input: {
  adventureId: string;
  sceneId: string;
}): Promise<{
  sceneRevision: number;
  mainBodyHash: string;
  structureRevision: number;
  sceneWordCount: number | null;
  needsVerification: boolean;
  repairable: boolean;
} | null> {
  // Bootstrap reads metadata only, even when list/get cannot validate the aggregate.
  const state = await fixtureSceneState({ kind: 'adventure', id: input.adventureId });
  const scene = state.scenes[input.sceneId];
  if (!scene || scene.ownerId !== fixtureOwner() || ('deleting' in scene && scene.deleting))
    return null;
  if (scene.parentId !== null) {
    const parent = state.groups[scene.parentId];
    if (!parent || (parent.deleting && !scene.archived)) return null;
  }
  const integer = (value: unknown, minimum = 0): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
  const marked = scene.hasBlocks === true;
  const structure = scene.blocksStructureRevision ?? (marked ? undefined : 0);
  if (!integer(scene.revision) || !integer(structure) || !/^[a-f0-9]{64}$/.test(scene.bodyHash))
    fail('A revisão ou o hash da cena está inconsistente.');
  const base = {
    sceneRevision: scene.revision,
    mainBodyHash: scene.bodyHash,
    structureRevision: structure,
  };
  try {
    fixtureAdventureSceneCounts(scene);
    return { ...base, sceneWordCount: scene.wordCount, needsVerification: false, repairable: true };
  } catch {
    const main = scene.mainWordCount ?? (marked ? undefined : scene.wordCount);
    const nextOrder = scene.nextBlockOrder ?? (marked ? undefined : 1);
    const mainOrder = scene.mainBlockOrder ?? 0;
    return {
      ...base,
      sceneWordCount: null,
      needsVerification: true,
      repairable:
        integer(main) && integer(scene.wordCount) && integer(nextOrder, 1) && integer(mainOrder),
    };
  }
}
export async function getAdventureBlock(input: {
  adventureId: string;
  resource: Block.AdventureBlockResource;
}): Promise<Block.AdventureBlockDocument | null> {
  const state = await stateFor(input.adventureId);
  try {
    const { scene, extra } = readResource(state, input.resource);
    const content = extra
      ? state.adventureBlockBodies?.[input.resource.id]
      : state.bodies[scene.id];
    if (
      typeof content !== 'string' ||
      (await fixtureContentHash(content)) !== (extra?.bodyHash ?? scene.bodyHash)
    )
      fail('Corpo do bloco inconsistente.');
    return {
      ...summary(scene, extra),
      ...totals(scene),
      content,
      sceneTitle: scene.title,
      adventureTitle: state.title,
      universeId: state.universeId,
      sceneArchived: scene.archived,
    };
  } catch (cause) {
    if (
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === 'functions/not-found'
    )
      return null;
    throw cause;
  }
}
export async function createAdventureBlock(
  input: Block.CreateAdventureBlockInput,
): Promise<Block.AdventureBlockMutation> {
  const state = await stateFor(input.adventureId),
    prior = operation(state, 'createAdventureBlock', input);
  if (prior.receipt) return replay(state, prior.receipt);
  const scene = readScene(state, input.sceneId),
    block = await append(state, scene, input.operationId, input);
  const response = result(scene, block);
  remember(state, input.operationId, prior.fingerprint, response);
  lostResponse('createAdventureBlock');
  return response;
}
export async function updateAdventureBlock(
  input: Block.UpdateAdventureBlockInput,
): Promise<Block.AdventureBlockMutation> {
  const state = await stateFor(input.adventureId),
    prior = operation(state, 'updateAdventureBlock', input);
  if (prior.receipt) return replay(state, prior.receipt);
  validatePatch(input.patch);
  const { scene, extra } = readResource(state, input.resource);
  fixtureCas(extra ?? scene, input.expectedRevision);
  const body = input.patch.content === undefined ? null : await fixtureBody(input.patch.content);
  const counts = fixtureAdventureSceneCounts(scene);
  if (extra) {
    const oldWords = extra.archived ? 0 : extra.wordCount;
    if (body) {
      state.adventureBlockBodies![extra.resource.id] = input.patch.content!;
      Object.assign(extra, body);
    }
    for (const key of ['title', 'narrativeType', 'audience'] as const)
      if (input.patch[key] !== undefined)
        Object.assign(extra, {
          [key]: key === 'title' ? input.patch.title!.trim() : input.patch[key],
        });
    extra.revision += 1;
    extra.updatedAt = FIXTURE_TIME + state.revision + 1;
    touch(state, scene, {
      extra: counts.extra - oldWords + (extra.archived ? 0 : extra.wordCount),
    });
  } else {
    if (body) fixtureSetSceneMainBody(state, scene, input.patch.content!, body);
    if (input.patch.title !== undefined) scene.mainBlockTitle = input.patch.title.trim();
    if (input.patch.narrativeType !== undefined) scene.mainBlockType = input.patch.narrativeType;
    if (input.patch.audience !== undefined) scene.mainBlockAudience = input.patch.audience;
    touch(state, scene);
  }
  const response = result(scene, extra);
  remember(state, input.operationId, prior.fingerprint, response);
  lostResponse('updateAdventureBlock');
  return response;
}
export async function duplicateAdventureBlock(
  input: Block.DuplicateAdventureBlockInput,
): Promise<Block.AdventureBlockMutation> {
  const state = await stateFor(input.adventureId),
    prior = operation(state, 'duplicateAdventureBlock', input);
  if (prior.receipt) return replay(state, prior.receipt);
  const { scene, extra } = readResource(state, input.resource);
  fixtureCas(extra ?? scene, input.expectedRevision);
  const original = summary(scene, extra),
    content = extra ? state.adventureBlockBodies?.[extra.resource.id] : state.bodies[scene.id];
  if (typeof content !== 'string') fail('Corpo do bloco inconsistente.');
  const image = extra?.image ?? (extra ? null : scene.mainBlockImage);
  const block = await append(state, scene, input.operationId, { ...original, content, image });
  const response = result(scene, block);
  remember(state, input.operationId, prior.fingerprint, response);
  lostResponse('duplicateAdventureBlock');
  return response;
}
export async function moveAdventureBlock(
  input: Block.MoveAdventureBlockInput,
): Promise<Block.AdventureBlockMutation> {
  const state = await stateFor(input.adventureId),
    prior = operation(state, 'moveAdventureBlock', input);
  if (prior.receipt) return replay(state, prior.receipt);
  const { scene, extra } = readResource(state, input.resource);
  fixtureCas(extra ?? scene, input.expectedRevision);
  const counts = fixtureAdventureSceneCounts(scene);
  if (input.expectedStructureRevision !== counts.structure) throw fixtureSceneError();
  if (extra?.archived) fail('Restaure o bloco antes de mudar sua posição.');
  const values = ordered(state, scene),
    index = values.findIndex(
      (block) =>
        block.resource.kind === input.resource.kind && block.resource.id === input.resource.id,
    );
  const current = values[index],
    neighbor = values[index + (input.direction === 'up' ? -1 : 1)];
  if (!current || !neighbor) fail('O bloco já está nessa extremidade.');
  const position = (block: Block.AdventureBlockSummary, order: number) => {
    if (block.resource.kind === 'scene') scene.mainBlockOrder = order;
    else {
      const record = state.adventureBlocks![block.resource.id];
      record.order = order;
      record.revision += 1;
      record.updatedAt = FIXTURE_TIME + state.revision + 1;
    }
  };
  position(current, neighbor.order);
  position(neighbor, current.order);
  touch(state, scene, { structure: true });
  const response = result(scene, extra);
  remember(state, input.operationId, prior.fingerprint, response);
  lostResponse('moveAdventureBlock');
  return response;
}
export async function archiveAdventureBlock(
  input: Block.ArchiveAdventureBlockInput,
): Promise<Block.AdventureBlockMutation> {
  const state = await stateFor(input.adventureId),
    prior = operation(state, 'archiveAdventureBlock', input);
  if (prior.receipt) return replay(state, prior.receipt);
  const { scene, extra } = readResource(state, { kind: 'block', id: input.blockId });
  if (!extra) fail('O texto principal não pode ser arquivado.');
  fixtureCas(extra, input.expectedRevision);
  const counts = fixtureAdventureSceneCounts(scene),
    changed = extra.archived !== input.archived;
  const delta = changed ? (input.archived ? -1 : 1) : 0;
  extra.archived = input.archived;
  extra.revision += 1;
  extra.updatedAt = FIXTURE_TIME + state.revision + 1;
  touch(state, scene, {
    extra: counts.extra + delta * extra.wordCount,
    count: counts.count + delta,
    structure: changed,
  });
  const response = result(scene, extra);
  remember(state, input.operationId, prior.fingerprint, response);
  lostResponse('archiveAdventureBlock');
  return response;
}
export async function deleteAdventureBlock(
  input: Block.DeleteAdventureBlockInput,
): Promise<Block.AdventureBlockJob> {
  const state = await stateFor(input.adventureId),
    prior = operation(state, 'deleteAdventureBlock', input);
  let receipt = prior.receipt;
  if (!receipt) {
    const { scene, extra } = readResource(state, { kind: 'block', id: input.blockId });
    if (!extra) fail('O texto principal não pode ser excluído.');
    fixtureCas(extra, input.expectedRevision);
    const counts = fixtureAdventureSceneCounts(scene);
    fixtureSetImageUse(
      fixtureAdventureImageUse(input.adventureId, { kind: 'block', id: input.blockId }),
      null,
    );
    extra.deleting = true;
    extra.revision += 1;
    touch(state, scene, {
      extra: counts.extra - (extra.archived ? 0 : extra.wordCount),
      count: counts.count - Number(!extra.archived),
      structure: true,
    });
    receipt = { fingerprint: prior.fingerprint, sceneId: scene.id, complete: false, processed: 0 };
    state.adventureBlockReceipts![input.operationId] = receipt;
  }
  const scene = readScene(state, receipt.sceneId);
  if (!receipt.complete) {
    delete state.adventureBlockBodies![input.blockId];
    delete state.adventureBlocks![input.blockId];
    receipt.complete = true;
    receipt.processed = 1;
    fixtureSaveScenes();
  }
  const response = { complete: true, processed: receipt.processed ?? 0, ...totals(scene) };
  lostResponse('deleteAdventureBlock');
  return response;
}
export async function verifyAdventureBlockCount(
  input: Block.VerifyAdventureBlockCountInput,
): Promise<Block.AdventureBlockVerificationProgress> {
  const state = await stateFor(input.adventureId);
  const prior = operation(state, 'verifyAdventureBlockCount', input, {
    adventureId: input.adventureId,
    sceneId: input.sceneId,
    expectedSceneRevision: input.expectedSceneRevision,
  });
  const scene = readScene(state, input.sceneId, true),
    counts = fixtureAdventureSceneCounts(scene, true);
  if (prior.receipt?.complete) {
    if (scene.revision !== prior.receipt.sceneRevision) throw fixtureSceneError();
    return { complete: true, processed: prior.receipt.processed ?? 0, ...totals(scene) };
  }
  fixtureCas(scene, input.expectedSceneRevision);
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    fail('Página inválida.', 'invalid-argument');
  const values = extras(state, scene.id)
    .sort((a, b) => a.resource.id.localeCompare(b.resource.id))
    .filter((block) => !prior.receipt?.cursor || block.resource.id > prior.receipt.cursor);
  const selected = values.slice(0, limit);
  let words = prior.receipt?.words ?? 0,
    count = prior.receipt?.count ?? 0;
  for (const block of selected) {
    if (
      block.ownerId !== fixtureOwner() ||
      !Number.isSafeInteger(block.wordCount) ||
      block.wordCount < 0
    )
      fail('Bloco inconsistente.');
    if (!block.archived) {
      words += block.wordCount;
      count += 1;
    }
  }
  const processed = (prior.receipt?.processed ?? 0) + selected.length;
  if (values.length > limit) {
    state.adventureBlockReceipts![input.operationId] = {
      fingerprint: prior.fingerprint,
      sceneId: scene.id,
      complete: false,
      processed,
      words,
      count,
      cursor: selected.at(-1)!.resource.id,
    };
    fixtureSaveScenes();
    lostResponse('verifyAdventureBlockCount');
    return {
      complete: false,
      processed,
      sceneRevision: scene.revision,
      sceneWordCount: null,
      structureRevision: counts.structure,
      mainBodyHash: scene.bodyHash,
    };
  }
  touch(state, scene, { extra: words, count }, true);
  state.adventureBlockReceipts![input.operationId] = {
    fingerprint: prior.fingerprint,
    sceneId: scene.id,
    complete: true,
    processed,
    sceneRevision: scene.revision,
  };
  fixtureSaveScenes();
  const response = { complete: true as const, processed, ...totals(scene) };
  lostResponse('verifyAdventureBlockCount');
  return response;
}
export async function getAdventureBlockImage(input: {
  adventureId: string;
  resource: Block.AdventureBlockResource;
}): Promise<AdventureBlockImageState> {
  const state = await stateFor(input.adventureId),
    { scene, extra } = readResource(state, input.resource);
  const image = extra ? extra.image : scene.mainBlockImage;
  if (!image) return { revision: extra?.revision ?? scene.revision, image: null };
  const libraryImage = fixtureLibraryImage(image.imageId);
  return {
    revision: extra?.revision ?? scene.revision,
    image: { ...image, name: libraryImage.name },
  };
}
export async function setAdventureBlockImage(
  input: SetAdventureBlockImageInput,
): Promise<Block.AdventureBlockMutation> {
  const state = await stateFor(input.adventureId),
    prior = operation(state, 'setAdventureBlockImage', input);
  if (prior.receipt) return replay(state, prior.receipt);
  const { scene, extra } = readResource(state, input.resource);
  fixtureCas(extra ?? scene, input.expectedRevision);
  if (
    input.image &&
    (!input.image.imageId ||
      typeof input.image.alt !== 'string' ||
      input.image.alt.length > 1000 ||
      typeof input.image.caption !== 'string' ||
      input.image.caption.length > 4000 ||
      Object.keys(input.image).some((key) => !['imageId', 'alt', 'caption'].includes(key)))
  )
    fail('Ilustração inválida.', 'invalid-argument');
  fixtureSetImageUse(
    fixtureAdventureImageUse(input.adventureId, input.resource),
    input.image?.imageId ?? null,
  );
  if (extra) {
    extra.image = structuredClone(input.image);
    extra.revision += 1;
    extra.updatedAt = FIXTURE_TIME + state.revision + 1;
  } else scene.mainBlockImage = structuredClone(input.image);
  touch(state, scene);
  const response = result(scene, extra);
  remember(state, input.operationId, prior.fingerprint, response);
  lostResponse('setAdventureBlockImage');
  return response;
}
const previewSeeds = new Map<string, Promise<void>>();
export async function fixtureSeedAdventurePreview(state: FixtureSceneState, scene: Scene) {
  state.adventureBlocks ??= {};
  state.adventureBlockBodies ??= {};
  state.adventureBlockReceipts ??= {};
  if (
    sessionStorage.getItem('writer.visual.preview-seed') !== 'true' ||
    state.adventurePreviewSeededScenes?.includes(scene.id)
  )
    return;
  const key = JSON.stringify([state.ownerId, state.target.id, scene.id]),
    pending = previewSeeds.get(key);
  if (pending) return pending;
  const request = (async () => {
    const corpus: {
      suffix: string;
      title: string;
      audience: Block.AdventureBlockAudience;
      content: string;
      imageId: string | null;
    }[] = [
      {
        suffix: 'creator',
        title: 'SEGREDO_DO_CRIADOR',
        audience: 'creator' as const,
        content: '<p>SEGREDO_DO_CRIADOR_TEXTO: a chave está com a guardiã.</p>',
        imageId: 'visual-image-000002',
      },
      {
        suffix: 'gm',
        title: 'Orientações do mestre',
        audience: 'gm' as const,
        content: '<p>SEGREDO_DO_MESTRE: a maré sobe quando o sino toca.</p>',
        imageId: null,
      },
      {
        suffix: 'players',
        title: 'Pista na praia',
        audience: 'players' as const,
        content:
          '<p>O caminho leva ao <span data-lore-id="FICHA_SECRETA" data-alias="ALIAS_SECRETO">farol</span>.</p><script>SEGREDO_SCRIPT</script><img src="https://example.invalid/TOKEN_SECRETO">',
        imageId: 'visual-image-000001',
      },
    ];
    if (sessionStorage.getItem('writer.visual.preview-pagination') === 'true')
      for (let index = 1; index <= 28; index++)
        corpus.push({
          suffix: 'page-' + String(index).padStart(2, '0'),
          title: 'Passagem pública ' + index,
          audience: 'players',
          content: '<p>Os aventureiros observam a praia ' + index + '.</p>',
          imageId: null,
        });
    for (const item of corpus) {
      const id = 'visual-preview-' + scene.id + '-' + item.suffix;
      if (state.adventureBlocks?.[id]) continue;
      await append(state, scene, id, {
        ...item,
        image: item.imageId
          ? {
              imageId: item.imageId,
              alt: item.audience === 'creator' ? 'IMAGEM_PRIVADA' : 'Farol sobre a praia',
              caption:
                item.audience === 'creator' ? 'LEGENDA_PRIVADA' : 'A luz indica a passagem segura.',
            }
          : null,
      });
    }
    state.adventurePreviewSeededScenes = [...(state.adventurePreviewSeededScenes ?? []), scene.id];
    fixtureSaveScenes();
  })();
  previewSeeds.set(key, request);
  try {
    await request;
  } finally {
    if (previewSeeds.get(key) === request) previewSeeds.delete(key);
  }
}
