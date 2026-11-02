import type { SceneDocument, SceneGroup, SceneGroupDetail, SceneSummary } from '../model/scene';
export const target = { kind: 'book' as const, id: 'book' };
export const group: SceneGroup = {
  id: 'chapter',
  title: 'A última luz',
  kind: 'chapter',
  contentMode: 'scenes',
  assemblyRevision: 1,
  structureRevision: 1,
  wordCount: 2,
  sceneCount: 1,
  rankSlot: 'A',
  order: 1,
  updatedAt: 100,
};
export const groupDetail: SceneGroupDetail = { group, sourceVersion: 'source', legacy: null };
export const summary: SceneSummary = {
  id: 'scene',
  ownerId: 'owner',
  schemaVersion: 1,
  revision: 1,
  title: 'A chegada de Lia',
  parentId: 'chapter',
  stage: 'planned',
  archived: false,
  rank: 'U',
  wordCount: 2,
  bodyHash: 'hash',
  bodyBytes: 15,
  createdAt: 100,
  updatedAt: 100,
};
export const document: SceneDocument = {
  ...summary,
  content: '<p>Texto original</p>',
  planning: { objective: 'Consertar o farol', conflict: 'Tempestade', pointOfView: 'Lia' },
  project: { ...target, title: 'O farol', universeId: null },
  group,
  projectRevision: 1,
};
export const mutation = { scene: summary, groups: [group], projectRevision: 1 };
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
export function conflict() {
  return Object.assign(new Error('A revisão mudou.'), {
    code: 'functions/failed-precondition',
    details: { reason: 'revision-conflict' },
  });
}
