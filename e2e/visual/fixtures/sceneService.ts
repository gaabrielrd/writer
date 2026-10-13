import type {
  ArchiveSceneInput,
  ConvertChapterInput,
  CreateSceneGroupInput,
  CreateSceneInput,
  DeleteSceneGroupInput,
  DeleteSceneGroupsInput,
  MoveSceneInput,
  SceneAssemblyInput,
  SceneAssemblyPage,
  SceneDocument,
  SceneGroupDetail,
  SceneGroupListInput,
  SceneJobInput,
  SceneJob,
  SceneJobProgress,
  SceneListInput,
  SceneMutationResult,
  SceneProject,
  SceneReferenceInput,
  SceneSourceListInput,
  UpdateSceneInput,
} from '../../../src/features/scenes/model/scene';
import { getLoreEntity } from './loreService';
import { fixtureRemoveChapter } from './bookService';
import { FIXTURE_TIME } from './data';
import {
  fixtureBody,
  fixtureContentHash,
  fixtureCas,
  fixtureGroup,
  fixtureHash,
  fixtureOrdered,
  fixturePage,
  fixtureRank,
  fixtureReceipt,
  fixtureSaveScenes,
  fixtureScene,
  fixtureSceneDocument,
  fixtureSceneError,
  fixtureSceneState,
  fixtureSceneLoreLink,
  fixtureSyncSceneBook,
  fixtureUpdateCounts,
  type FixtureSceneState,
} from './sceneStore';

const summaryResult = (
  state: FixtureSceneState,
  sceneId: string,
  parents: (string | null)[],
): SceneMutationResult => ({
  scene: structuredClone(fixtureScene(state, sceneId)),
  groups: [...new Set(parents)].map((id) => structuredClone(fixtureGroup(state, id))),
  projectRevision: state.revision,
});
function lostResponse(method: string) {
  if (sessionStorage.getItem('writer.visual.scene-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.scene-lost-response');
    throw Object.assign(new Error('Resposta não confirmada. Verifique a mesma operação.'), {
      code: 'functions/unavailable',
    });
  }
}
function receiptResult(state: FixtureSceneState, operationId: string, payload: unknown) {
  const result = fixtureReceipt(state, operationId, payload);
  if (result.receipt?.sceneId) {
    const scene = fixtureScene(state, result.receipt.sceneId);
    if (scene.revision !== result.receipt.revision) throw fixtureSceneError();
    return { ...result, result: summaryResult(state, scene.id, [scene.parentId]) };
  }
  return { ...result, result: null };
}
export async function createScene(input: CreateSceneInput): Promise<SceneMutationResult> {
  const state = await fixtureSceneState(input.target);
  const previous = receiptResult(state, input.operationId, input);
  if (previous.result) return previous.result;
  const parentId = input.parentId ?? null;
  const group = fixtureGroup(state, parentId);
  if (group.rebalancing) throw new Error('A reorganização das posições está em andamento.');
  if (group.contentMode === 'legacy') throw new Error('Converta o capítulo antes de criar cenas.');
  const content = input.content ?? '';
  const body = await fixtureBody(content);
  const id = input.operationId;
  state.scenes[id] = {
    id,
    ownerId: state.ownerId,
    schemaVersion: 1,
    revision: 1,
    title: input.title.trim(),
    parentId,
    stage: 'planned',
    archived: false,
    rank: fixtureRank(fixtureOrdered(state, parentId).length),
    ...body,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  state.bodies[id] = content;
  state.planning[id] = { objective: '', conflict: '', pointOfView: '', ...input.planning };
  state.references[id] = [];
  state.receipts[input.operationId] = {
    fingerprint: previous.fingerprint,
    sceneId: id,
    revision: 1,
  };
  fixtureUpdateCounts(state, [parentId], true);
  lostResponse('createScene');
  return summaryResult(state, id, [parentId]);
}
export async function updateScene(input: UpdateSceneInput): Promise<SceneMutationResult> {
  if (sessionStorage.getItem('writer.visual.scene-write-error') === 'true')
    throw Object.assign(new Error('Conexão simulada indisponível. O texto não foi enviado.'), {
      code: 'functions/unavailable',
    });
  const state = await fixtureSceneState(input.target);
  const previous = receiptResult(state, input.operationId, input);
  if (previous.result) return previous.result;
  const scene = fixtureScene(state, input.sceneId);
  if (sessionStorage.getItem('writer.visual.scene-conflict') === 'true') {
    sessionStorage.removeItem('writer.visual.scene-conflict');
    scene.revision += 1;
    state.bodies[scene.id] = '<p>Versão remota: outro caminho entre as ilhas.</p>';
    Object.assign(scene, await fixtureBody(state.bodies[scene.id]));
    fixtureUpdateCounts(state, [scene.parentId]);
  }
  fixtureCas(scene, input.expectedRevision);
  if (input.patch.content !== undefined) {
    const body = await fixtureBody(input.patch.content);
    state.bodies[scene.id] = input.patch.content;
    Object.assign(scene, body);
  }
  if (input.patch.title !== undefined) scene.title = input.patch.title.trim();
  if (input.patch.stage !== undefined) scene.stage = input.patch.stage;
  if (input.patch.planning) Object.assign(state.planning[scene.id], input.patch.planning);
  scene.revision += 1;
  scene.updatedAt = FIXTURE_TIME + scene.revision;
  state.receipts[input.operationId] = {
    fingerprint: previous.fingerprint,
    sceneId: scene.id,
    revision: scene.revision,
  };
  fixtureUpdateCounts(state, [scene.parentId]);
  lostResponse('updateScene');
  return summaryResult(state, scene.id, [scene.parentId]);
}
export async function moveScene(input: MoveSceneInput): Promise<SceneMutationResult> {
  const state = await fixtureSceneState(input.target);
  const previous = receiptResult(state, input.operationId, input);
  if (previous.result) return previous.result;
  const scene = fixtureScene(state, input.sceneId);
  fixtureCas(scene, input.expectedRevision);
  const source = fixtureGroup(state, scene.parentId);
  const target = fixtureGroup(state, input.parentId);
  if (source.rebalancing || target.rebalancing)
    throw new Error('A reorganização das posições está em andamento.');
  if (
    source.structureRevision !== input.expectedSourceStructureRevision ||
    target.structureRevision !== input.expectedTargetStructureRevision
  )
    throw fixtureSceneError();
  if (target.contentMode === 'legacy') throw new Error('Converta o capítulo de destino.');
  const oldParent = scene.parentId;
  if (fixtureGroup(state, oldParent).rebalancing)
    throw new Error('A reorganização das posições está em andamento.');
  const ordered = fixtureOrdered(state, input.parentId).filter((item) => item.id !== scene.id);
  let position = ordered.length;
  if (input.beforeId) position = ordered.findIndex((item) => item.id === input.beforeId);
  else if (input.afterId) position = ordered.findIndex((item) => item.id === input.afterId) + 1;
  if (position < 0) throw fixtureSceneError();
  ordered.splice(position, 0, scene);
  ordered.forEach((item, index) => {
    item.rank = fixtureRank(index);
  });
  scene.parentId = input.parentId;
  scene.revision += 1;
  state.receipts[input.operationId] = {
    fingerprint: previous.fingerprint,
    sceneId: scene.id,
    revision: scene.revision,
  };
  fixtureUpdateCounts(state, [oldParent, input.parentId], true);
  lostResponse('moveScene');
  return summaryResult(state, scene.id, [oldParent, input.parentId]);
}
export async function archiveScene(input: ArchiveSceneInput): Promise<SceneMutationResult> {
  const state = await fixtureSceneState(input.target);
  const previous = receiptResult(state, input.operationId, input);
  if (previous.result) return previous.result;
  const scene = fixtureScene(state, input.sceneId);
  fixtureCas(scene, input.expectedRevision);
  const oldParent = scene.parentId;
  scene.archived = input.archived;
  if (!input.archived) {
    const available = state.groups[scene.parentId ?? '$unassigned'];
    if (!available || available.deleting) scene.parentId = null;
    scene.rank = fixtureRank(
      fixtureOrdered(state, scene.parentId).filter((item) => item.id !== scene.id).length,
    );
  }
  scene.revision += 1;
  state.receipts[input.operationId] = {
    fingerprint: previous.fingerprint,
    sceneId: scene.id,
    revision: scene.revision,
  };
  fixtureUpdateCounts(state, [oldParent, scene.parentId], true);
  lostResponse('archiveScene');
  return summaryResult(state, scene.id, [oldParent, scene.parentId]);
}
export async function getScene(input: {
  target: SceneProject;
  sceneId: string;
}): Promise<SceneDocument | null> {
  try {
    const state = await fixtureSceneState(input.target);
    const scene = state.scenes[input.sceneId];
    return scene ? fixtureSceneDocument(state, scene) : null;
  } catch {
    return null;
  }
}
export async function listScenes(input: SceneListInput) {
  const state = await fixtureSceneState(input.target);
  const group = fixtureGroup(state, input.parentId);
  if (sessionStorage.getItem('writer.visual.scene-list-error') === 'true')
    throw new Error('Falha simulada ao carregar cenas.');
  const values = fixtureOrdered(state, input.parentId, input.archived ?? false).filter(
    (scene) => !input.stage || input.stage === 'all' || scene.stage === input.stage,
  );
  return {
    ...fixturePage(
      state,
      values,
      input,
      JSON.stringify([input.target, input.parentId, input.stage ?? 'all', input.archived ?? false]),
    ),
    group: structuredClone(group),
  };
}
export async function listSceneGroups(input: SceneGroupListInput) {
  const state = await fixtureSceneState(input.target);
  return fixturePage(
    state,
    Object.values(state.groups)
      .filter((group) => group.id !== null)
      .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '')),
    input,
    JSON.stringify(input.target),
  );
}
export async function getSceneGroup(input: {
  target: SceneProject;
  parentId: string | null;
}): Promise<SceneGroupDetail | null> {
  const state = await fixtureSceneState(input.target);
  const group = state.groups[input.parentId ?? '$unassigned'];
  if (!group) return null;
  const source = input.parentId ? state.sources[input.parentId] : null;
  return {
    group: structuredClone(group),
    sourceVersion: source?.version ?? fixtureHash(group),
    legacy:
      group.contentMode === 'legacy' && source
        ? { content: source.content, hash: source.hash }
        : null,
  };
}
export async function createSceneGroup(input: CreateSceneGroupInput) {
  const state = await fixtureSceneState(input.target);
  const { receipt, fingerprint } = fixtureReceipt(state, input.operationId, input);
  if (receipt?.groupId) return structuredClone(fixtureGroup(state, receipt.groupId));
  const id = input.operationId;
  state.groups[id] = {
    id,
    title: input.title.trim(),
    kind: input.target.kind === 'book' ? 'chapter' : 'part',
    contentMode: 'scenes',
    assemblyRevision: 0,
    structureRevision: 0,
    wordCount: 0,
    sceneCount: 0,
    rankSlot: 'A',
    order: Object.values(state.groups).length,
    actId: input.actId ?? null,
    updatedAt: FIXTURE_TIME,
  };
  state.receipts[input.operationId] = { fingerprint, groupId: id };
  state.revision += 1;
  fixtureSyncSceneBook(state);
  fixtureSaveScenes();
  lostResponse('createSceneGroup');
  return structuredClone(state.groups[id]);
}
export async function convertChapterToScenes(
  input: ConvertChapterInput,
): Promise<SceneMutationResult> {
  const state = await fixtureSceneState(input.target);
  const previous = receiptResult(state, input.operationId, input);
  if (previous.result) return previous.result;
  const group = fixtureGroup(state, input.parentId);
  const source = state.sources[input.parentId];
  if (!source || source.version !== input.expectedSourceVersion || group.contentMode !== 'legacy')
    throw fixtureSceneError();
  await fixtureBody(source.content);
  source.converted = true;
  group.contentMode = 'scenes';
  const result = await createScene({
    target: input.target,
    operationId: `${input.operationId}-scene`,
    parentId: input.parentId,
    title: group.title,
    content: source.content,
  });
  state.receipts[input.operationId] = {
    fingerprint: previous.fingerprint,
    sceneId: result.scene.id,
    revision: result.scene.revision,
  };
  fixtureSaveScenes();
  lostResponse('convertChapterToScenes');
  return result;
}
export async function setSceneReference(input: SceneReferenceInput): Promise<SceneMutationResult> {
  const state = await fixtureSceneState(input.target);
  const previous = receiptResult(state, input.operationId, input);
  if (previous.result) return previous.result;
  const scene = fixtureScene(state, input.sceneId);
  fixtureCas(scene, input.expectedRevision);
  const id = fixtureHash(input.reference);
  const refs = (state.references[scene.id] ?? []).filter((ref) => ref.id !== id);
  if (!input.remove)
    refs.push({ id, reference: structuredClone(input.reference), available: true });
  state.references[scene.id] = refs;
  fixtureSceneLoreLink(state, scene.id, input.reference, input.remove);
  scene.revision += 1;
  state.receipts[input.operationId] = {
    fingerprint: previous.fingerprint,
    sceneId: scene.id,
    revision: scene.revision,
  };
  fixtureUpdateCounts(state, [scene.parentId]);
  const { fixtureNarrativeState, fixtureNarrativeChanged } = await import('./narrativeStore');
  await fixtureNarrativeChanged(await fixtureNarrativeState(input.target));
  return summaryResult(state, scene.id, [scene.parentId]);
}
export async function listSceneReferences(input: {
  target: SceneProject;
  sceneId: string;
  cursor?: string | null;
  limit?: number;
}) {
  const state = await fixtureSceneState(input.target);
  const values = await Promise.all(
    (state.references[input.sceneId] ?? []).map(async (view) => {
      const reference = view.reference;
      const permitted =
        reference.kind === 'book'
          ? input.target.kind === 'book' && reference.scopeId === input.target.id
          : reference.scopeId === state.universeId;
      const entity =
        permitted && sessionStorage.getItem('writer.visual.scene-unavailable-reference') !== 'true'
          ? await getLoreEntity(
              { kind: reference.kind, id: reference.scopeId },
              reference.kind === 'universe'
                ? `universe:${reference.scopeId}:${reference.entityId}`
                : reference.entityId,
            )
          : null;
      return {
        id: view.id,
        reference,
        available: !!entity,
        ...(entity ? { name: entity.name, category: entity.category } : {}),
      };
    }),
  );
  return fixturePage(state, values, input, input.sceneId);
}
export async function readSceneAssembly(input: SceneAssemblyInput): Promise<SceneAssemblyPage> {
  const state = await fixtureSceneState(input.target);
  const group = fixtureGroup(state, input.parentId);
  if (group.assemblyRevision !== input.expectedAssemblyRevision) throw fixtureSceneError();
  const ordered = fixtureOrdered(state, input.parentId);
  const cursor = input.cursor ? (JSON.parse(atob(input.cursor)) as { offset: number }) : null;
  const candidates = ordered.slice(
    cursor?.offset ?? 0,
    (cursor?.offset ?? 0) + (input.limit ?? 25),
  );
  let bytes = 0;
  let included = 0;
  for (const scene of candidates) {
    const content = state.bodies[scene.id];
    if ((await fixtureContentHash(content)) !== scene.bodyHash)
      throw fixtureSceneError('O corpo da cena mudou.');
    const size = new TextEncoder().encode(
      JSON.stringify({
        content,
        id: scene.id,
        revision: scene.revision,
        hash: scene.bodyHash,
        wordCount: scene.wordCount,
      }),
    ).length;
    if (bytes + size > 1_000_000) break;
    bytes += size;
    included += 1;
  }
  const page = fixturePage(
    state,
    ordered,
    { ...input, limit: included || input.limit },
    'assembly:' + input.parentId,
  );
  return {
    ...page,
    assemblyRevision: group.assemblyRevision,
    items: page.items.map((scene) => ({
      id: scene.id,
      revision: scene.revision,
      content: state.bodies[scene.id],
      hash: scene.bodyHash,
      wordCount: scene.wordCount,
    })),
  };
}
export async function rebalanceSceneRanks(input: SceneJobInput): Promise<SceneJobProgress> {
  const state = await fixtureSceneState(input.target);
  state.jobs ??= {};
  let pending = state.jobs[input.operationId];
  if (
    pending &&
    (pending.job.kind !== 'rebalance' ||
      fixtureHash({ ...pending.job.input, limit: null }) !== fixtureHash({ ...input, limit: null }))
  )
    throw new Error('Operação utilizada com outros dados.');
  if (!pending) {
    const group = fixtureGroup(state, input.parentId ?? null);
    pending = {
      job: {
        kind: 'rebalance',
        input: structuredClone(input),
        progress: { complete: false, processed: 0 },
      },
      ids: fixtureOrdered(state, group.id).map((scene) => scene.id),
      groupIds: [group.id ?? '$unassigned'],
    };
    state.jobs[input.operationId] = pending;
    group.rebalancing = true;
    group.rebalanceOperationId = input.operationId;
  }
  if (pending.job.progress.complete) return structuredClone(pending.job.progress);
  const group = state.groups[pending.groupIds[0]];
  pending.job.progress.processed = Math.min(
    pending.ids.length,
    pending.job.progress.processed + (input.limit ?? 50),
  );
  pending.job.progress.complete = pending.job.progress.processed === pending.ids.length;
  if (pending.job.progress.complete) {
    pending.ids.forEach((id, index) => {
      state.scenes[id].rank = fixtureRank(index);
    });
    group.rankSlot = group.rankSlot === 'A' ? 'B' : 'A';
    group.rebalancing = false;
    delete group.rebalanceOperationId;
    fixtureUpdateCounts(state, [group.id], true);
  }
  fixtureSaveScenes();
  if (sessionStorage.getItem('writer.visual.scene-job-interrupted') === 'rebalance') {
    sessionStorage.removeItem('writer.visual.scene-job-interrupted');
    throw new Error('Reorganização interrompida. Retome o mesmo pedido.');
  }
  return structuredClone(pending.job.progress);
}
export async function deleteSceneGroup(input: DeleteSceneGroupInput): Promise<SceneJobProgress> {
  return deleteSceneGroups({
    target: input.target,
    operationId: input.operationId,
    groups: [{ id: input.parentId, expectedUpdatedAt: input.expectedUpdatedAt }],
    limit: input.limit,
  });
}
export async function deleteSceneGroups(input: DeleteSceneGroupsInput): Promise<SceneJobProgress> {
  const state = await fixtureSceneState(input.target);
  state.jobs ??= {};
  let pending = state.jobs[input.operationId];
  if (
    pending &&
    (pending.job.kind !== 'delete-groups' ||
      fixtureHash({ ...pending.job.input, limit: null }) !== fixtureHash({ ...input, limit: null }))
  )
    throw new Error('Operação utilizada com outros dados.');
  if (!pending) {
    for (const item of input.groups)
      if (fixtureGroup(state, item.id).updatedAt !== item.expectedUpdatedAt)
        throw fixtureSceneError();
    const groupIds = input.groups.map((item) => item.id);
    pending = {
      job: {
        kind: 'delete-groups',
        input: structuredClone(input),
        progress: { complete: false, processed: 0 },
      },
      ids: Object.values(state.scenes)
        .filter((scene) => scene.parentId !== null && groupIds.includes(scene.parentId))
        .map((scene) => scene.id),
      groupIds,
    };
    state.jobs[input.operationId] = pending;
    for (const id of groupIds) {
      const group = state.groups[id];
      group.deleting = true;
      group.deletionOperationId = input.operationId;
      group.wordCount = 0;
    }
    state.revision += 1;
  }
  if (pending.job.progress.complete) return structuredClone(pending.job.progress);
  const progress = pending.job.progress;
  const ids = pending.ids.slice(progress.processed, progress.processed + (input.limit ?? 50));
  ids.forEach((id) => {
    const scene = state.scenes[id];
    scene.formerParentId = scene.parentId;
    scene.parentId = null;
    scene.rank = fixtureRank(fixtureOrdered(state, null).length);
    scene.revision += 1;
  });
  progress.processed += ids.length;
  progress.complete = progress.processed === pending.ids.length;
  if (progress.complete)
    for (const id of pending.groupIds) {
      delete state.groups[id];
      state.removedGroupIds = [...(state.removedGroupIds ?? []), id];
      if (input.target.kind === 'book') fixtureRemoveChapter(input.target.id, id);
    }
  fixtureUpdateCounts(state, [null], true);
  if (sessionStorage.getItem('writer.visual.scene-job-interrupted') === 'delete-groups') {
    sessionStorage.removeItem('writer.visual.scene-job-interrupted');
    throw new Error('Remoção interrompida. Retome o mesmo pedido.');
  }
  return structuredClone(progress);
}
export async function deleteSceneBook(input: SceneJobInput): Promise<SceneJobProgress> {
  const state = await fixtureSceneState(input.target);
  const processed = Object.keys(state.scenes).length;
  state.scenes = {};
  state.bodies = {};
  state.planning = {};
  state.references = {};
  state.sceneLoreLinks = {};
  const { fixtureDeleteNarrativeProject } = await import('./narrativeStore');
  fixtureDeleteNarrativeProject(input.target);
  fixtureSaveScenes();
  return { complete: true, processed };
}
export async function getSceneJob(input: {
  target: SceneProject;
  operationId: string;
}): Promise<SceneJob | null> {
  const state = await fixtureSceneState(input.target);
  return structuredClone(state.jobs?.[input.operationId]?.job ?? null);
}
export async function listSceneSources(input: SceneSourceListInput) {
  const state = await fixtureSceneState(input.target);
  if (state.revision !== input.expectedProjectRevision) throw fixtureSceneError();
  const values = Object.entries(state.sources)
    .filter(([, source]) => source.converted)
    .map(([id, source]) => ({
      id,
      content: source.content,
      hash: source.hash,
      original: structuredClone(source.original),
    }));
  return fixturePage(state, values, input, 'sources');
}
