import type {
  SceneDocument,
  SceneGroup,
  SceneJob,
  ScenePlanning,
  SceneProject,
  SceneReferenceView,
  SceneSummary,
} from '../../../src/features/scenes/model/scene';
import { countWords, type Chapter } from '../../../src/features/books/model/chapter';
import { fixtureOwner } from './studioStore';
import { getAdventure } from './adventureService';
import { fixtureReadChapters, fixtureWriteBook, fixtureWriteChapter, getBook } from './bookService';
import { FIXTURE_TIME } from './data';

export interface FixtureSceneState {
  target: SceneProject;
  ownerId: string;
  title: string;
  universeId: string | null;
  revision: number;
  scenes: Record<string, SceneSummary>;
  bodies: Record<string, string>;
  planning: Record<string, ScenePlanning>;
  references: Record<string, SceneReferenceView[]>;
  groups: Record<string, SceneGroup>;
  sources: Record<
    string,
    {
      content: string;
      hash: string;
      version: string;
      original: Record<string, unknown>;
      converted?: boolean;
    }
  >;
  receipts: Record<
    string,
    { fingerprint: string; sceneId?: string; revision?: number; groupId?: string }
  >;
  jobs: Record<string, { job: SceneJob; ids: string[]; groupIds: string[] }>;
  removedGroupIds?: string[];
}
const storageKey = 'writer.visual.scenes';
const states = new Map<string, FixtureSceneState>();
const saved = sessionStorage.getItem(storageKey);
if (saved) {
  const records = JSON.parse(saved) as [string, FixtureSceneState][];
  records.forEach(([key, value]) => states.set(key, value));
}
const groupKey = (id: string | null) => id ?? '$unassigned';
const projectKey = (target: SceneProject) => `${fixtureOwner()}:${target.kind}:${target.id}`;
export const fixtureHash = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0').repeat(8);
};
export async function fixtureContentHash(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function fixtureSceneError(message = 'A composição mudou. Atualize antes de continuar.') {
  return Object.assign(new Error(message), {
    code: 'functions/failed-precondition',
    details: { reason: 'revision-conflict' },
  });
}
function unassigned(target: SceneProject): SceneGroup {
  return {
    id: null,
    title: target.kind === 'book' ? 'Sem capítulo' : 'Sem parte',
    kind: 'unassigned',
    contentMode: 'scenes',
    assemblyRevision: 0,
    structureRevision: 0,
    wordCount: 0,
    sceneCount: 0,
    rankSlot: 'A',
    order: 0,
    updatedAt: FIXTURE_TIME,
  };
}
export function fixtureChapterGroup(
  chapter: Chapter & {
    contentMode?: string;
    assemblyRevision?: number;
    structureRevision?: number;
    sceneCount?: number;
    rankSlot?: 'A' | 'B';
  },
): SceneGroup {
  return {
    id: chapter.id,
    title: chapter.title,
    kind: 'chapter',
    contentMode: chapter.contentMode === 'scenes' ? 'scenes' : 'legacy',
    assemblyRevision: chapter.assemblyRevision ?? 0,
    structureRevision: chapter.structureRevision ?? 0,
    wordCount: chapter.wordCount,
    sceneCount: chapter.sceneCount ?? 0,
    rankSlot: chapter.rankSlot ?? 'A',
    order: chapter.order,
    actId: chapter.actId ?? null,
    updatedAt: chapter.updatedAt,
  };
}
let initializationQueue = Promise.resolve();
export function fixtureSceneState(target: SceneProject): Promise<FixtureSceneState> {
  const next = initializationQueue.then(() => loadFixtureSceneState(target));
  initializationQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
async function loadFixtureSceneState(target: SceneProject): Promise<FixtureSceneState> {
  const project = target.kind === 'book' ? await getBook(target.id) : await getAdventure(target.id);
  const ownerId = project && ('authorId' in project ? project.authorId : project.ownerId);
  if (!project || ownerId !== fixtureOwner())
    throw Object.assign(new Error('Projeto indisponível.'), {
      code: 'functions/permission-denied',
    });
  const key = projectKey(target);
  let state = states.get(key);
  if (!state) {
    state = {
      target: structuredClone(target),
      ownerId,
      title: project.title,
      universeId: project.universeId ?? null,
      revision: 0,
      scenes: {},
      bodies: {},
      planning: {},
      references: {},
      groups: { $unassigned: unassigned(target) },
      sources: {},
      receipts: {},
      jobs: {},
    };
    states.set(key, state);
  }
  if (target.kind === 'book') {
    for (const chapter of fixtureReadChapters(target.id)) {
      if (!state.groups[chapter.id]) state.groups[chapter.id] = fixtureChapterGroup(chapter);
      if (state.groups[chapter.id].contentMode === 'legacy' && !state.groups[chapter.id].deleting) {
        state.groups[chapter.id] = fixtureChapterGroup(chapter);
        const { content, ...original } = chapter;
        state.sources[chapter.id] = {
          content,
          hash: await fixtureContentHash(content),
          version: fixtureHash(chapter),
          original,
        };
      }
    }
  }
  if (sessionStorage.getItem('writer.visual.scene-pagination') === 'true' && state.revision === 0) {
    const count = sessionStorage.getItem('writer.visual.scene-job-pages') === 'true' ? 64 : 28;
    const id = 'visual-scene-group';
    state.groups[id] = {
      id,
      title: 'As histórias entre as ilhas',
      kind: target.kind === 'book' ? 'chapter' : 'part',
      contentMode: 'scenes' as const,
      assemblyRevision: 1,
      structureRevision: 1,
      wordCount: 0,
      sceneCount: count,
      rankSlot: 'A',
      order: 4,
      updatedAt: FIXTURE_TIME,
    };
    for (let index = 0; index < count; index += 1) {
      const sceneId = `visual-scene-${index + 1}`;
      const content = `<p>História de exemplo da cena ${index + 1}, com ação e memória.</p>`;
      const body = await fixtureBody(content);
      state.scenes[sceneId] = {
        id: sceneId,
        ownerId: state.ownerId,
        schemaVersion: 1,
        revision: 1,
        title: `Cena das ilhas ${index + 1}`,
        parentId: id,
        stage: index === 0 ? 'writing' : 'planned',
        archived: false,
        rank: fixtureRank(index),
        ...body,
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      };
      state.bodies[sceneId] = content;
      state.planning[sceneId] = {
        objective: 'Nota privada do planejamento.',
        conflict: '',
        pointOfView: 'Lia',
      };
      state.references[sceneId] = [];
      state.groups[id].wordCount += body.wordCount;
    }
    state.revision = 1;
    fixtureSaveScenes();
  }
  fixtureSyncSceneBook(state);
  return state;
}
export function fixtureSyncSceneBook(state: FixtureSceneState) {
  if (state.target.kind !== 'book' || state.revision === 0) return;
  const chapters = fixtureReadChapters(state.target.id);
  for (const group of Object.values(state.groups)) {
    if (group.kind !== 'chapter' || group.id === null || group.contentMode !== 'scenes') continue;
    const old = chapters.find((chapter) => chapter.id === group.id);
    const chapter = {
      ...(old ?? {
        id: group.id,
        bookId: state.target.id,
        createdAt: FIXTURE_TIME,
        content: state.sources[group.id]?.content ?? '',
      }),
      title: group.title,
      order: group.order,
      actId: group.actId,
      contentMode: 'scenes' as const,
      assemblyRevision: group.assemblyRevision,
      structureRevision: group.structureRevision,
      sceneCount: group.sceneCount,
      deleting: group.deleting,
      rankSlot: group.rankSlot,
      wordCount: group.wordCount,
      updatedAt: group.updatedAt,
    };
    fixtureWriteChapter(chapter);
  }
  const patch = {
    wordCount: fixtureReadChapters(state.target.id).reduce(
      (total, chapter) => total + chapter.wordCount,
      0,
    ),
    sceneRevision: state.revision,
    hasSceneResources: state.revision > 0,
    updatedAt: FIXTURE_TIME + state.revision,
  };
  fixtureWriteBook(state.target.id, patch);
}
export function fixtureSaveScenes() {
  sessionStorage.setItem(storageKey, JSON.stringify([...states.entries()]));
}
export function fixtureGroup(state: FixtureSceneState, parentId: string | null): SceneGroup {
  const group = state.groups[groupKey(parentId)];
  if (!group || group.deleting) throw new Error('Agrupador indisponível.');
  return group;
}
export function fixtureScene(state: FixtureSceneState, sceneId: string): SceneSummary {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error('Cena indisponível.');
  return scene;
}
export function fixtureSceneDocument(state: FixtureSceneState, scene: SceneSummary): SceneDocument {
  return structuredClone({
    ...scene,
    content: state.bodies[scene.id],
    planning: state.planning[scene.id],
    project: { ...state.target, title: state.title, universeId: state.universeId },
    group: state.groups[groupKey(scene.parentId)] ?? null,
    projectRevision: state.revision,
  });
}
export function fixtureOrdered(
  state: FixtureSceneState,
  parentId: string | null,
  archived = false,
) {
  return Object.values(state.scenes)
    .filter((scene) => scene.parentId === parentId && scene.archived === archived)
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.id.localeCompare(b.id));
}
export function fixtureRank(index: number) {
  return String(index + 1).padStart(10, '0');
}
export function fixtureUpdateCounts(
  state: FixtureSceneState,
  parentIds: (string | null)[],
  structure = false,
) {
  for (const parentId of new Set(parentIds)) {
    const group = state.groups[groupKey(parentId)];
    if (!group) continue;
    const active = fixtureOrdered(state, parentId);
    group.wordCount = active.reduce((sum, scene) => sum + scene.wordCount, 0);
    group.sceneCount = active.length;
    group.assemblyRevision += 1;
    if (structure) group.structureRevision += 1;
    group.updatedAt = FIXTURE_TIME + state.revision;
  }
  state.revision += 1;
  fixtureSyncSceneBook(state);
  fixtureSaveScenes();
}
export async function fixtureBody(content: string) {
  const bodyBytes = new TextEncoder().encode(content).length;
  if (bodyBytes > 800_000 || new TextEncoder().encode(JSON.stringify({ content })).length > 900_000)
    throw Object.assign(new Error('Divida o texto: a cena excede o limite de conteúdo.'), {
      code: 'functions/resource-exhausted',
    });
  return { bodyHash: await fixtureContentHash(content), bodyBytes, wordCount: countWords(content) };
}
export function fixtureCas(scene: SceneSummary, expected: number) {
  if (scene.revision !== expected) throw fixtureSceneError();
}
export function fixturePage<T>(
  state: FixtureSceneState,
  values: T[],
  input: { cursor?: string | null; limit?: number },
  scope: string,
) {
  const limit = input.limit ?? 25;
  if (limit < 1 || limit > 50) throw new Error('Página inválida.');
  const cursor = input.cursor
    ? (JSON.parse(atob(input.cursor)) as {
        revision: number;
        offset: number;
        scope: string;
        owner: string;
      })
    : null;
  if (
    cursor &&
    (cursor.revision !== state.revision ||
      cursor.scope !== scope ||
      cursor.owner !== fixtureOwner())
  )
    throw fixtureSceneError();
  const offset = cursor?.offset ?? 0;
  return {
    items: structuredClone(values.slice(offset, offset + limit)),
    projectRevision: state.revision,
    nextCursor:
      offset + limit < values.length
        ? btoa(
            JSON.stringify({
              revision: state.revision,
              offset: offset + limit,
              scope,
              owner: fixtureOwner(),
            }),
          )
        : null,
  };
}
export function fixtureReceipt(state: FixtureSceneState, operationId: string, payload: unknown) {
  const fingerprint = fixtureHash(payload);
  const receipt = state.receipts[operationId];
  if (receipt && receipt.fingerprint !== fingerprint)
    throw Object.assign(new Error('A operação já foi usada com outros dados.'), {
      code: 'functions/invalid-argument',
    });
  return { fingerprint, receipt };
}
