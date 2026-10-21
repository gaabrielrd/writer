import type {
  CreateNarrativeItemInput,
  DeleteNarrativeItemInput,
  EntityNarrativeListInput,
  MoveNarrativeItemInput,
  NarrativeItem,
  NarrativeJobInput,
  NarrativeListInput,
  NarrativeLoreListInput,
  NarrativeMutationResult,
  NarrativeReference,
  NarrativeReferenceInput,
  NarrativeReferenceListInput,
  NarrativeReferenceView,
  NarrativeResource,
  NarrativeSource,
  NarrativeTarget,
  RebalanceNarrativeRanksInput,
  UpdateNarrativeItemInput,
} from '../../../src/features/narrative-planning/model/narrative';
import { getLoreEntity, listLoreEntities } from './loreService';
import { fixtureGetLocalAdventureLore, listAdventureLore } from './adventureLoreFixture';
import { getScene } from './sceneService';
import {
  fixtureHash,
  fixtureRank,
  fixtureSaveScenes,
  fixtureSceneLoreLink,
  fixtureSceneState,
} from './sceneStore';
import { FIXTURE_TIME } from './data';
import {
  fixtureNarrativeCas,
  fixtureNarrativeChanged,
  fixtureNarrativeContext,
  fixtureNarrativeError,
  fixtureNarrativeFingerprint,
  fixtureNarrativeItem,
  fixtureNarrativeLostResponse,
  fixtureNarrativeOrdered,
  fixtureNarrativePage,
  fixtureNarrativeReorder,
  fixtureNarrativeResourceKey,
  fixtureNarrativeSave,
  fixtureNarrativeSequence,
  fixtureNarrativeSourceKey,
  fixtureNarrativeState,
  fixtureNarrativeSummary,
  type FixtureNarrativeState,
} from './narrativeStore';

function resource(source: NarrativeSource): NarrativeResource {
  return source.kind === 'milestone'
    ? { kind: source.kind, arcId: source.arcId }
    : { kind: source.kind };
}
function source(item: NarrativeItem): NarrativeSource {
  return item.kind === 'milestone'
    ? { kind: item.kind, arcId: item.arcId, id: item.id }
    : { kind: item.kind, id: item.id };
}
async function result(
  state: FixtureNarrativeState,
  item: NarrativeItem,
): Promise<NarrativeMutationResult> {
  const context = await fixtureNarrativeContext(state);
  return {
    item: fixtureNarrativeSummary(item),
    projectRevision: state.revision,
    sceneRevision: context.sceneRevision,
    sequence: structuredClone(fixtureNarrativeSequence(state, resource(item))),
  };
}
function previous(state: FixtureNarrativeState, operationId: string, input: unknown) {
  const fingerprint = fixtureNarrativeFingerprint(input);
  const receipt = state.receipts[operationId];
  if (receipt && receipt.fingerprint !== fingerprint)
    throw Object.assign(new Error('Operação utilizada com outros dados.'), {
      code: 'functions/invalid-argument',
    });
  if (receipt) {
    const item = fixtureNarrativeItem(state, receipt.source);
    fixtureNarrativeCas(item, receipt.revision);
    return { item, fingerprint };
  }
  return { item: null, fingerprint };
}
function receipt(
  state: FixtureNarrativeState,
  operationId: string,
  input: unknown,
  item: NarrativeItem,
) {
  state.receipts[operationId] = {
    fingerprint: fixtureNarrativeFingerprint(input),
    source: source(item),
    revision: item.revision,
  };
}
function structural(state: FixtureNarrativeState, sequence: NarrativeResource) {
  if (fixtureNarrativeSequence(state, sequence).rebalancing)
    throw fixtureNarrativeError('A reorganização está em andamento.');
  if (sequence.kind === 'milestone')
    fixtureNarrativeItem(state, { kind: 'arc', id: sequence.arcId });
}
function validate(item: NarrativeItem) {
  if (!item.title.trim() || item.title.length > 300)
    throw new Error('Informe um título de até300 caracteres.');
  const fields =
    item.kind === 'arc'
      ? [item.initialState, item.objective, item.plannedOutcome]
      : item.kind === 'event'
        ? [item.description]
        : [item.notes];
  if (fields.some((text) => text.length > 4000))
    throw new Error('O planejamento excede4000 caracteres.');
  if (item.kind === 'event' && item.dateLabel.length > 300)
    throw new Error('A data livre excede300 caracteres.');
  if (new TextEncoder().encode(JSON.stringify(item)).length > 900_000)
    throw new Error('Item excede o orçamento.');
}
export async function getNarrativeContext(input: { target: NarrativeTarget }) {
  return fixtureNarrativeContext(await fixtureNarrativeState(input.target));
}
export async function createNarrativeItem(input: CreateNarrativeItemInput) {
  const state = await fixtureNarrativeState(input.target);
  if (sessionStorage.getItem('writer.visual.narrative-delay-create') === 'true')
    await new Promise((resolve) => setTimeout(resolve, 600));
  const old = previous(state, input.operationId, input);
  if (old.item) return result(state, old.item);
  structural(state, input.resource);
  const base = {
    id: input.operationId,
    ownerId: state.ownerId,
    schemaVersion: 1 as const,
    revision: 1,
    title: input.title.trim(),
    rank: fixtureRank(fixtureNarrativeOrdered(state, input.resource).length),
    referenceCount: 0,
    createdAt: FIXTURE_TIME + state.revision,
    updatedAt: FIXTURE_TIME + state.revision,
  };
  const item: NarrativeItem =
    input.resource.kind === 'arc'
      ? {
          ...base,
          kind: 'arc',
          initialState: ('initialState' in input ? input.initialState : '') ?? '',
          objective: ('objective' in input ? input.objective : '') ?? '',
          plannedOutcome: ('plannedOutcome' in input ? input.plannedOutcome : '') ?? '',
        }
      : input.resource.kind === 'event'
        ? {
            ...base,
            kind: 'event',
            description: ('description' in input ? input.description : '') ?? '',
            dateLabel: ('dateLabel' in input ? input.dateLabel : '') ?? '',
          }
        : {
            ...base,
            kind: 'milestone',
            arcId: input.resource.arcId,
            notes: ('notes' in input ? input.notes : '') ?? '',
          };
  validate(item);
  state.items[fixtureNarrativeSourceKey(item)] = item;
  state.references[fixtureNarrativeSourceKey(item)] = [];
  receipt(state, input.operationId, input, item);
  await fixtureNarrativeChanged(state, input.resource, true);
  fixtureNarrativeLostResponse('createNarrativeItem');
  return result(state, item);
}
export async function updateNarrativeItem(input: UpdateNarrativeItemInput) {
  const state = await fixtureNarrativeState(input.target);
  const old = previous(state, input.operationId, input);
  if (old.item) return result(state, old.item);
  const item = fixtureNarrativeItem(state, input.source);
  if (sessionStorage.getItem('writer.visual.narrative-conflict') === 'true') {
    sessionStorage.removeItem('writer.visual.narrative-conflict');
    item.title = 'Título remoto confirmado';
    item.revision += 1;
    await fixtureNarrativeChanged(state, resource(item));
  }
  fixtureNarrativeCas(item, input.expectedRevision);
  const updated = {
    ...item,
    ...input.patch,
    title: input.patch.title?.trim() ?? item.title,
    revision: item.revision + 1,
    updatedAt: FIXTURE_TIME + state.revision + 1,
  } as NarrativeItem;
  validate(updated);
  state.items[fixtureNarrativeSourceKey(item)] = updated;
  receipt(state, input.operationId, input, updated);
  await fixtureNarrativeChanged(state, resource(item));
  fixtureNarrativeLostResponse('updateNarrativeItem');
  return result(state, updated);
}
export async function getNarrativeItem(input: {
  target: NarrativeTarget;
  source: NarrativeSource;
}) {
  const state = await fixtureNarrativeState(input.target);
  return structuredClone(state.items[fixtureNarrativeSourceKey(input.source)] ?? null);
}
export async function listNarrativeItems(input: NarrativeListInput) {
  const state = await fixtureNarrativeState(input.target);
  if (sessionStorage.getItem('writer.visual.narrative-list-error') === input.resource.kind)
    throw Object.assign(new Error('Falha simulada de conexão. Tente novamente.'), {
      code: 'functions/unavailable',
    });
  return fixtureNarrativePage(
    state,
    fixtureNarrativeOrdered(state, input.resource).map(fixtureNarrativeSummary),
    input,
    fixtureNarrativeResourceKey(input.resource),
    input.resource,
  );
}
export async function moveNarrativeItem(input: MoveNarrativeItemInput) {
  const state = await fixtureNarrativeState(input.target);
  const old = previous(state, input.operationId, input);
  if (old.item) return result(state, old.item);
  const item = fixtureNarrativeItem(state, input.source);
  structural(state, resource(item));
  fixtureNarrativeCas(item, input.expectedRevision);
  if (
    fixtureNarrativeSequence(state, resource(item)).structureRevision !==
    input.expectedStructureRevision
  )
    throw fixtureNarrativeError();
  if (sessionStorage.getItem('writer.visual.narrative-rank-exhausted') === 'true') {
    sessionStorage.removeItem('writer.visual.narrative-rank-exhausted');
    throw fixtureNarrativeError('As posições precisam ser reorganizadas.', 'rank-exhausted');
  }
  const ordered = fixtureNarrativeOrdered(state, resource(item)).filter(
    (value) => value.id !== item.id,
  );
  const anchor = input.beforeId ?? input.afterId;
  const index = anchor ? ordered.findIndex((value) => value.id === anchor) : ordered.length;
  if (anchor && index < 0) throw fixtureNarrativeError('Posição indisponível.');
  ordered.splice(index + Number(!!input.afterId), 0, item);
  fixtureNarrativeReorder(ordered);
  item.revision += 1;
  receipt(state, input.operationId, input, item);
  await fixtureNarrativeChanged(state, resource(item), true);
  fixtureNarrativeLostResponse('moveNarrativeItem');
  return result(state, item);
}
async function lore(
  state: FixtureNarrativeState,
  reference: Extract<NarrativeReference, { kind: 'lore' }>['reference'],
) {
  const context = await fixtureNarrativeContext(state);
  const allowed =
    reference.kind === 'book'
      ? state.target.kind === 'book' && reference.scopeId === state.target.id
      : reference.kind === 'adventure'
        ? state.target.kind === 'adventure' && reference.scopeId === state.target.id
        : reference.scopeId === context.universeId;
  if (
    !allowed ||
    sessionStorage.getItem('writer.visual.narrative-unavailable-reference') === 'true'
  )
    return null;
  if (reference.kind === 'adventure')
    return fixtureGetLocalAdventureLore(reference.scopeId, reference.entityId);
  return getLoreEntity(
    { kind: reference.kind, id: reference.scopeId },
    reference.kind === 'universe'
      ? `universe:${reference.scopeId}:${reference.entityId}`
      : reference.entityId,
  );
}
async function referenceView(
  state: FixtureNarrativeState,
  id: string,
  reference: NarrativeReference,
): Promise<NarrativeReferenceView> {
  const base = { id, reference: structuredClone(reference), available: false };
  if (sessionStorage.getItem('writer.visual.narrative-unavailable-reference') === 'true')
    return base;
  if (reference.kind === 'lore') {
    const entity = await lore(state, reference.reference);
    return entity
      ? { ...base, available: true, label: entity.name, category: entity.category }
      : base;
  }
  if (reference.kind === 'event') {
    const event = state.items[`event:${reference.eventId}`];
    return event && !event.deleting ? { ...base, available: true, label: event.title } : base;
  }
  const scene = await getScene({ target: state.target, sceneId: reference.sceneId });
  return scene ? { ...base, available: true, label: scene.title, archived: scene.archived } : base;
}
export async function setNarrativeReference(input: NarrativeReferenceInput) {
  const state = await fixtureNarrativeState(input.target);
  const old = previous(state, input.operationId, input);
  if (old.item) return result(state, old.item);
  const item = fixtureNarrativeItem(state, input.source);
  fixtureNarrativeCas(item, input.expectedRevision);
  const id = fixtureHash(input.reference);
  if (!input.remove && !(await referenceView(state, id, input.reference)).available)
    throw fixtureNarrativeError('Referência indisponível.');
  const key = fixtureNarrativeSourceKey(item);
  const refs = (state.references[key] ?? []).filter((ref) => ref.id !== id);
  if (!input.remove) refs.push({ id, reference: structuredClone(input.reference) });
  state.references[key] = refs;
  item.referenceCount = refs.length;
  item.revision += 1;
  receipt(state, input.operationId, input, item);
  await fixtureNarrativeChanged(state, resource(item));
  fixtureNarrativeLostResponse('setNarrativeReference');
  return result(state, item);
}
export async function listNarrativeReferences(input: NarrativeReferenceListInput) {
  const state = await fixtureNarrativeState(input.target);
  const refs = state.references[fixtureNarrativeSourceKey(input.source)] ?? [];
  const values = await Promise.all(refs.map((ref) => referenceView(state, ref.id, ref.reference)));
  return fixtureNarrativePage(
    state,
    values,
    input,
    `refs:${fixtureNarrativeSourceKey(input.source)}`,
    undefined,
    fixtureHash(values),
  );
}
export async function listNarrativeLoreOptions(input: NarrativeLoreListInput) {
  const state = await fixtureNarrativeState(input.target);
  const context = await fixtureNarrativeContext(state);
  if (input.scope === 'adventure') {
    if (input.target.kind !== 'adventure') throw fixtureNarrativeError('Origem inválida.');
    const result = await listAdventureLore({
      adventureId: input.target.id,
      scope: 'adventure',
      cursor: input.cursor,
      limit: input.limit,
    });
    return {
      items: result.items.map((entity) => ({
        reference: entity.reference,
        name: entity.name,
        category: entity.category,
      })),
      nextCursor: result.nextCursor,
    };
  }
  const scopeId =
    input.scope === 'book'
      ? input.target.kind === 'book'
        ? input.target.id
        : null
      : context.universeId;
  const values = scopeId
    ? (await listLoreEntities({ kind: input.scope, id: scopeId })).map((entity) => ({
        reference: {
          kind: input.scope,
          scopeId,
          entityId:
            input.scope === 'universe' ? entity.id.replace(`universe:${scopeId}:`, '') : entity.id,
        },
        name: entity.name,
        category: entity.category,
      }))
    : [];
  return fixtureNarrativePage(
    state,
    values,
    input,
    `lore:${input.scope}:${scopeId ?? ''}`,
    undefined,
    fixtureHash(values),
  );
}
export async function listEntityScenes(input: EntityNarrativeListInput) {
  const state = await fixtureNarrativeState(input.target);
  const scenes = await fixtureSceneState(input.target);
  if (!scenes.sceneLoreIndexReady)
    throw fixtureNarrativeError('Prepare as referências existentes.', 'index-not-ready');
  const allowed = await lore(state, input.reference);
  const values = Object.entries(scenes.sceneLoreLinks ?? {})
    .filter(([, link]) => fixtureHash(link.reference) === fixtureHash(input.reference))
    .map(([id, link]) => {
      const scene = scenes.scenes[link.sceneId];
      return allowed && scene
        ? {
            id,
            sceneId: link.sceneId,
            available: true,
            title: scene.title,
            archived: scene.archived,
            parentId: scene.parentId,
          }
        : { id, sceneId: link.sceneId, available: false };
    });
  return fixtureNarrativePage(
    state,
    values,
    input,
    `entity-scenes:${fixtureHash(input.reference)}`,
    undefined,
    fixtureHash(allowed),
  );
}
export async function listEntityNarrativeItems(input: EntityNarrativeListInput) {
  const state = await fixtureNarrativeState(input.target);
  const allowed = await lore(state, input.reference);
  const values = allowed
    ? Object.entries(state.references).flatMap(([key, refs]) => {
        const item = state.items[key];
        return item &&
          !item.deleting &&
          refs.some(
            (view) =>
              view.reference.kind === 'lore' &&
              fixtureHash(view.reference.reference) === fixtureHash(input.reference),
          )
          ? [fixtureNarrativeSummary(item)]
          : [];
      })
    : [];
  return fixtureNarrativePage(
    state,
    values,
    input,
    `entity-items:${fixtureHash(input.reference)}`,
    undefined,
    fixtureHash(allowed),
  );
}
function interrupted(kind: string) {
  if (sessionStorage.getItem('writer.visual.narrative-job-interrupted') === kind) {
    sessionStorage.removeItem('writer.visual.narrative-job-interrupted');
    throw Object.assign(new Error('Operação interrompida. Retome o pedido original.'), {
      code: 'functions/unavailable',
    });
  }
}
export async function prepareEntitySceneIndex(input: NarrativeJobInput) {
  const state = await fixtureNarrativeState(input.target);
  const scenes = await fixtureSceneState(input.target);
  let pending = state.jobs[input.operationId];
  if (!pending) {
    pending = {
      job: {
        kind: 'prepare-entity-scenes',
        input: structuredClone(input),
        progress: { complete: false, processed: 0 },
      },
      ids: Object.entries(scenes.references).flatMap(([sceneId, refs]) =>
        refs.map((ref) => `${sceneId}\u0000${ref.id}`),
      ),
    };
    state.jobs[input.operationId] = pending;
    scenes.sceneLoreIndexOperationId = input.operationId;
  }
  if (
    pending.job.kind !== 'prepare-entity-scenes' ||
    fixtureNarrativeFingerprint({ ...pending.job.input, limit: null }) !==
      fixtureNarrativeFingerprint({ ...input, limit: null })
  )
    throw new Error('Operação utilizada com outros dados.');
  if (pending.job.progress.complete) return structuredClone(pending.job.progress);
  const end = Math.min(pending.ids.length, pending.job.progress.processed + (input.limit ?? 50));
  for (const key of pending.ids.slice(pending.job.progress.processed, end)) {
    const [sceneId, refId] = key.split('\u0000');
    const ref = scenes.references[sceneId]?.find((value) => value.id === refId);
    if (ref && scenes.scenes[sceneId]) fixtureSceneLoreLink(scenes, sceneId, ref.reference);
  }
  pending.job.progress = { complete: end === pending.ids.length, processed: end };
  if (pending.job.progress.complete) {
    scenes.sceneLoreIndexReady = true;
    delete scenes.sceneLoreIndexOperationId;
  }
  fixtureSaveScenes();
  await fixtureNarrativeChanged(state);
  interrupted('prepare-entity-scenes');
  return structuredClone(pending.job.progress);
}
export async function rebalanceNarrativeRanks(input: RebalanceNarrativeRanksInput) {
  const state = await fixtureNarrativeState(input.target);
  let pending = state.jobs[input.operationId];
  if (!pending) {
    structural(state, input.resource);
    pending = {
      job: {
        kind: 'rebalance',
        input: structuredClone(input),
        progress: { complete: false, processed: 0 },
      },
      ids: fixtureNarrativeOrdered(state, input.resource).map((item) =>
        fixtureNarrativeSourceKey(item),
      ),
    };
    state.jobs[input.operationId] = pending;
    const sequence = fixtureNarrativeSequence(state, input.resource);
    state.sequences[fixtureNarrativeResourceKey(input.resource)] = {
      ...sequence,
      rebalancing: true,
      rebalanceOperationId: input.operationId,
    };
  }
  if (
    pending.job.kind !== 'rebalance' ||
    fixtureNarrativeFingerprint({ ...pending.job.input, limit: null }) !==
      fixtureNarrativeFingerprint({ ...input, limit: null })
  )
    throw new Error('Operação utilizada com outros dados.');
  if (pending.job.progress.complete) return structuredClone(pending.job.progress);
  const progress = pending.job.progress;
  progress.processed = Math.min(pending.ids.length, progress.processed + (input.limit ?? 50));
  progress.complete = progress.processed === pending.ids.length;
  if (progress.complete) {
    fixtureNarrativeReorder(pending.ids.map((key) => state.items[key]));
    const sequence = fixtureNarrativeSequence(state, input.resource);
    state.sequences[fixtureNarrativeResourceKey(input.resource)] = {
      resource: input.resource,
      structureRevision: sequence.structureRevision,
      rankSlot: sequence.rankSlot === 'A' ? 'B' : 'A',
      rebalancing: false,
    };
    await fixtureNarrativeChanged(state, input.resource, true);
  }
  fixtureNarrativeSave();
  interrupted('rebalance');
  return structuredClone(progress);
}
export async function deleteNarrativeItem(input: DeleteNarrativeItemInput) {
  const state = await fixtureNarrativeState(input.target);
  let pending = state.jobs[input.operationId];
  if (!pending) {
    const item = fixtureNarrativeItem(state, input.source);
    structural(state, resource(item));
    fixtureNarrativeCas(item, input.expectedRevision);
    const children =
      item.kind === 'arc'
        ? fixtureNarrativeOrdered(state, { kind: 'milestone', arcId: item.id })
        : [];
    const keys = [fixtureNarrativeSourceKey(item), ...children.map(fixtureNarrativeSourceKey)];
    pending = {
      job: {
        kind: 'delete-item',
        input: structuredClone(input),
        progress: { complete: false, processed: 0 },
      },
      sourceKeys: keys,
      ids: keys
        .flatMap((key) => (state.references[key] ?? []).map((ref) => `${key}\u0000${ref.id}`))
        .concat(children.map((child) => fixtureNarrativeSourceKey(child))),
    };
    state.jobs[input.operationId] = pending;
    item.deleting = true;
    item.deletionOperationId = input.operationId;
    await fixtureNarrativeChanged(state, resource(item), true);
  }
  if (
    pending.job.kind !== 'delete-item' ||
    fixtureNarrativeFingerprint({ ...pending.job.input, limit: null }) !==
      fixtureNarrativeFingerprint({ ...input, limit: null })
  )
    throw new Error('Operação utilizada com outros dados.');
  if (pending.job.progress.complete) return structuredClone(pending.job.progress);
  const end = Math.min(pending.ids.length, pending.job.progress.processed + (input.limit ?? 50));
  for (const key of pending.ids.slice(pending.job.progress.processed, end)) {
    const [sourceKey, refId] = key.split('\u0000');
    if (refId)
      state.references[sourceKey] = (state.references[sourceKey] ?? []).filter(
        (ref) => ref.id !== refId,
      );
    else {
      delete state.items[sourceKey];
      delete state.references[sourceKey];
    }
  }
  pending.job.progress = { complete: end === pending.ids.length, processed: end };
  if (pending.job.progress.complete) {
    delete state.items[fixtureNarrativeSourceKey(input.source)];
    delete state.references[fixtureNarrativeSourceKey(input.source)];
    await fixtureNarrativeChanged(state, resource(input.source), true);
  }
  fixtureNarrativeSave();
  interrupted('delete-item');
  return structuredClone(pending.job.progress);
}
export async function getNarrativeJob(input: { target: NarrativeTarget; operationId: string }) {
  const state = await fixtureNarrativeState(input.target);
  return structuredClone(state.jobs[input.operationId]?.job ?? null);
}
