import type {
  NarrativeContext,
  NarrativeItem,
  NarrativeJob,
  NarrativeReference,
  NarrativeResource,
  NarrativeSequenceState,
  NarrativeSource,
  NarrativeSummary,
  NarrativeTarget,
} from '../../../src/features/narrative-planning/model/narrative';
import { getAdventure } from './adventureService';
import { fixtureWriteBook, getBook } from './bookService';
import { FIXTURE_TIME } from './data';
import { fixtureHash, fixtureRank, fixtureSceneState } from './sceneStore';
import { fixtureOwner } from './studioStore';

export interface FixtureNarrativeState {
  target: NarrativeTarget;
  ownerId: string;
  revision: number;
  updatedAt: number;
  items: Record<string, NarrativeItem>;
  references: Record<string, { id: string; reference: NarrativeReference }[]>;
  sequences: Record<string, NarrativeSequenceState>;
  receipts: Record<string, { fingerprint: string; source: NarrativeSource; revision: number }>;
  jobs: Record<string, { job: NarrativeJob; ids: string[]; sourceKeys?: string[] }>;
}
const storageKey = 'writer.visual.narrative';
const states = new Map<string, FixtureNarrativeState>(
  JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as [string, FixtureNarrativeState][],
);
export const fixtureNarrativeResourceKey = (resource: NarrativeResource) =>
  resource.kind === 'milestone' ? `milestone:${resource.arcId}` : resource.kind;
export const fixtureNarrativeSourceKey = (source: NarrativeSource) =>
  `${fixtureNarrativeResourceKey(source)}:${source.id}`;
export function fixtureNarrativeError(
  message = 'O planejamento mudou. Atualize antes de confirmar novamente.',
  reason = 'revision-conflict',
) {
  return Object.assign(new Error(message), {
    code: 'functions/failed-precondition',
    details: { reason },
  });
}
export async function fixtureNarrativeState(target: NarrativeTarget) {
  const project = target.kind === 'book' ? await getBook(target.id) : await getAdventure(target.id);
  const ownerId = project && ('authorId' in project ? project.authorId : project.ownerId);
  if (!project || ownerId !== fixtureOwner() || ('deleting' in project && project.deleting))
    throw Object.assign(new Error('Projeto indisponível.'), {
      code: 'functions/permission-denied',
    });
  const key = `${fixtureOwner()}:${target.kind}:${target.id}`;
  let state = states.get(key);
  if (!state) {
    state = {
      target: structuredClone(target),
      ownerId,
      revision: 0,
      updatedAt: project.updatedAt,
      items: {},
      references: {},
      sequences: {},
      receipts: {},
      jobs: {},
    };
    states.set(key, state);
    if (sessionStorage.getItem('writer.visual.narrative-pagination') === 'true') {
      const count =
        sessionStorage.getItem('writer.visual.narrative-job-pages') === 'true' ? 64 : 28;
      for (let index = 0; index < count; index += 1) {
        const base = {
          ownerId,
          schemaVersion: 1 as const,
          revision: 1,
          rank: fixtureRank(index),
          referenceCount: 0,
          createdAt: FIXTURE_TIME,
          updatedAt: FIXTURE_TIME,
        };
        const arc: NarrativeItem = {
          ...base,
          kind: 'arc',
          id: `visual-narrative-arc-${index + 1}`,
          title: `Arco das marés ${index + 1}`,
          initialState: 'ESTADO PRIVADO da cartógrafa.',
          objective: 'OBJETIVO PRIVADO: encontrar o atlas.',
          plannedOutcome: 'DESFECHO PRIVADO: retornar às ilhas.',
        };
        const event: NarrativeItem = {
          ...base,
          kind: 'event',
          id: `visual-narrative-event-${index + 1}`,
          title: `Evento das marés ${index + 1}`,
          description: 'DESCRIÇÃO PRIVADA do acontecimento.',
          dateLabel: index === 0 ? '3º dia do inverno' : '',
        };
        const milestone: NarrativeItem = {
          ...base,
          kind: 'milestone',
          arcId: 'visual-narrative-arc-1',
          id: `visual-narrative-milestone-${index + 1}`,
          title: `Marco das marés ${index + 1}`,
          notes: 'NOTA PRIVADA: uma decisão do personagem.',
        };
        for (const item of [arc, event, milestone]) {
          state.items[fixtureNarrativeSourceKey(item)] = item;
          state.references[fixtureNarrativeSourceKey(item)] = [];
        }
      }
      state.revision = 1;
      for (const sequenceResource of [
        { kind: 'arc' as const },
        { kind: 'event' as const },
        { kind: 'milestone' as const, arcId: 'visual-narrative-arc-1' },
      ]) {
        state.sequences[fixtureNarrativeResourceKey(sequenceResource)] = {
          resource: sequenceResource,
          structureRevision: 1,
          rankSlot: 'A',
          rebalancing: false,
        };
      }
      if (target.kind === 'book') {
        const patch = {
          hasNarrativeResources: true,
          narrativeRevision: state.revision,
          updatedAt: state.updatedAt,
        };
        fixtureWriteBook(target.id, patch);
      }
      fixtureNarrativeSave();
    }
  }
  return state;
}
export async function fixtureNarrativeContext(
  state: FixtureNarrativeState,
): Promise<NarrativeContext> {
  const project =
    state.target.kind === 'book'
      ? await getBook(state.target.id)
      : await getAdventure(state.target.id);
  if (!project) throw fixtureNarrativeError('Projeto indisponível.');
  const scenes = await fixtureSceneState(state.target);
  return {
    target: structuredClone(state.target),
    ownerId: state.ownerId,
    title: project.title,
    universeId: project.universeId ?? null,
    projectRevision: state.revision,
    sceneRevision: scenes.revision,
    updatedAt: Math.max(project.updatedAt, state.updatedAt),
    hasResources: state.revision > 0,
    entityIndexReady: scenes.sceneLoreIndexReady === true,
    ...(scenes.sceneLoreIndexOperationId
      ? { entityIndexOperationId: scenes.sceneLoreIndexOperationId }
      : {}),
  };
}
export function fixtureNarrativeSave() {
  sessionStorage.setItem(storageKey, JSON.stringify([...states.entries()]));
}
export function fixtureDeleteNarrativeProject(target: NarrativeTarget) {
  states.delete(`${fixtureOwner()}:${target.kind}:${target.id}`);
  fixtureNarrativeSave();
}
export function fixtureNarrativeSequence(
  state: FixtureNarrativeState,
  resource: NarrativeResource,
) {
  const key = fixtureNarrativeResourceKey(resource);
  return (
    state.sequences[key] ?? {
      resource: structuredClone(resource),
      structureRevision: 0,
      rankSlot: 'A' as const,
      rebalancing: false,
    }
  );
}
export function fixtureNarrativeItem(
  state: FixtureNarrativeState,
  source: NarrativeSource,
  editable = true,
) {
  const item = state.items[fixtureNarrativeSourceKey(source)];
  if (!item || (editable && item.deleting)) throw fixtureNarrativeError('Item indisponível.');
  if (source.kind === 'milestone') {
    const arc = state.items[`arc:${source.arcId}`];
    if (!arc || (editable && arc.deleting)) throw fixtureNarrativeError('Arco indisponível.');
  }
  return item;
}
export function fixtureNarrativeSummary(item: NarrativeItem): NarrativeSummary {
  return {
    id: item.id,
    kind: item.kind,
    ...(item.kind === 'milestone' ? { arcId: item.arcId } : {}),
    ...(item.kind === 'event' ? { dateLabel: item.dateLabel } : {}),
    ownerId: item.ownerId,
    schemaVersion: item.schemaVersion,
    revision: item.revision,
    title: item.title,
    rank: item.rank,
    referenceCount: item.referenceCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.deleting ? { deleting: true } : {}),
    ...(item.deletionOperationId ? { deletionOperationId: item.deletionOperationId } : {}),
  } as NarrativeSummary;
}
export function fixtureNarrativeOrdered(state: FixtureNarrativeState, resource: NarrativeResource) {
  const key = fixtureNarrativeResourceKey(resource);
  return Object.values(state.items)
    .filter((item) => fixtureNarrativeResourceKey(item) === key)
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.id.localeCompare(b.id));
}
export async function fixtureNarrativeChanged(
  state: FixtureNarrativeState,
  resource?: NarrativeResource,
  structure = false,
) {
  state.revision += 1;
  if (resource) {
    const sequence = fixtureNarrativeSequence(state, resource);
    state.sequences[fixtureNarrativeResourceKey(resource)] = {
      ...sequence,
      structureRevision: sequence.structureRevision + Number(structure),
    };
  }
  const context = await fixtureNarrativeContext(state);
  state.updatedAt = Math.max(context.updatedAt + 1, FIXTURE_TIME + state.revision);
  if (state.target.kind === 'book') {
    const patch = {
      hasNarrativeResources: true,
      narrativeRevision: state.revision,
      updatedAt: state.updatedAt,
    };
    fixtureWriteBook(state.target.id, patch);
  }
  fixtureNarrativeSave();
}
export async function fixtureNarrativePage<T>(
  state: FixtureNarrativeState,
  values: T[],
  input: { cursor?: string | null; limit?: number },
  scope: string,
  resource?: NarrativeResource,
  originVersion?: string,
) {
  const context = await fixtureNarrativeContext(state);
  const sequence = resource ? fixtureNarrativeSequence(state, resource) : undefined;
  const cursor = input.cursor
    ? (JSON.parse(atob(input.cursor)) as {
        owner: string;
        target: string;
        scope: string;
        revision: number;
        sceneRevision: number;
        updatedAt: number;
        universeId: string | null;
        originVersion?: string;
        structureRevision?: number;
        slot?: string;
        offset: number;
      })
    : null;
  const target = `${state.target.kind}:${state.target.id}`;
  if (
    cursor &&
    (cursor.owner !== fixtureOwner() || cursor.target !== target || cursor.scope !== scope)
  )
    throw Object.assign(new Error('Cursor de outro contexto.'), {
      code: 'functions/invalid-argument',
    });
  if (
    cursor &&
    (cursor.revision !== state.revision ||
      cursor.sceneRevision !== context.sceneRevision ||
      cursor.updatedAt !== context.updatedAt ||
      cursor.universeId !== context.universeId ||
      cursor.originVersion !== originVersion ||
      cursor.structureRevision !== sequence?.structureRevision ||
      cursor.slot !== sequence?.rankSlot)
  )
    throw fixtureNarrativeError();
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Página inválida.');
  const offset = cursor?.offset ?? 0;
  let bytes = 0;
  const items: T[] = [];
  for (const item of values.slice(offset, offset + limit)) {
    const size = new TextEncoder().encode(JSON.stringify(item)).length;
    if (bytes + size > 1_000_000) break;
    bytes += size;
    items.push(structuredClone(item));
  }
  if (!items.length && offset < values.length) throw new Error('Resposta excede o orçamento.');
  const nextCursor =
    offset + items.length < values.length
      ? btoa(
          JSON.stringify({
            owner: fixtureOwner(),
            target,
            scope,
            revision: state.revision,
            sceneRevision: context.sceneRevision,
            updatedAt: context.updatedAt,
            universeId: context.universeId,
            originVersion,
            structureRevision: sequence?.structureRevision,
            slot: sequence?.rankSlot,
            offset: offset + items.length,
          }),
        )
      : null;
  return {
    items,
    nextCursor,
    projectRevision: state.revision,
    sceneRevision: context.sceneRevision,
    ...(sequence ? { sequence: structuredClone(sequence) } : {}),
  };
}
export function fixtureNarrativeFingerprint(input: unknown) {
  return fixtureHash(input);
}
export function fixtureNarrativeCas(item: NarrativeItem, revision: number) {
  if (item.revision !== revision) throw fixtureNarrativeError();
}
export function fixtureNarrativeLostResponse(method: string) {
  if (sessionStorage.getItem('writer.visual.narrative-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.narrative-lost-response');
    throw Object.assign(new Error('Resposta não confirmada. Verifique a mesma operação.'), {
      code: 'functions/unavailable',
    });
  }
}
export function fixtureNarrativeReorder(items: NarrativeItem[]) {
  items.forEach((item, index) => {
    item.rank = fixtureRank(index);
  });
}
