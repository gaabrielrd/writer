export type SceneProject = { kind: 'book' | 'adventure'; id: string };
export type SceneStage = 'planned' | 'writing' | 'review' | 'done';
export type ScenePlanning = { objective: string; conflict: string; pointOfView: string };
export type SceneReference = { kind: 'book' | 'universe'; scopeId: string; entityId: string };
export interface SceneSummary {
  id: string;
  ownerId: string;
  schemaVersion: 1;
  revision: number;
  title: string;
  parentId: string | null;
  formerParentId?: string | null;
  stage: SceneStage;
  archived: boolean;
  rank: string;
  wordCount: number;
  bodyHash: string;
  bodyBytes: number;
  createdAt: number;
  updatedAt: number;
  mainWordCount?: number;
  blockWordCount?: number;
  blockCount?: number;
  blocksStructureRevision?: number;
  nextBlockOrder?: number;
  mainBlockOrder?: number;
  mainBlockTitle?: string;
  mainBlockType?:
    'introduction' | 'preparation' | 'scene' | 'location' | 'quest' | 'clue' | 'ending';
  mainBlockAudience?: 'creator' | 'gm' | 'players';
}
export interface SceneGroup {
  id: string | null;
  title: string;
  kind: 'chapter' | 'part' | 'unassigned';
  contentMode: 'legacy' | 'scenes';
  assemblyRevision: number;
  structureRevision: number;
  wordCount: number;
  sceneCount: number;
  rankSlot: 'A' | 'B';
  order: number;
  actId?: string | null;
  updatedAt: number;
  deleting?: boolean;
  rebalancing?: boolean;
  rebalanceOperationId?: string;
  deletionOperationId?: string;
}
export interface SceneDocument extends SceneSummary {
  content: string;
  planning: ScenePlanning;
  project: SceneProject & { title: string; universeId: string | null };
  group: SceneGroup | null;
  projectRevision: number;
}
export interface SceneGroupDetail {
  group: SceneGroup;
  sourceVersion: string;
  legacy: { content: string; hash: string } | null;
}
export interface SceneReferenceView {
  id: string;
  reference: SceneReference;
  available: boolean;
  name?: string;
  category?: string;
}
export interface ScenePage<T> {
  items: T[];
  nextCursor: string | null;
  projectRevision: number;
}
export interface SceneListInput {
  target: SceneProject;
  parentId: string | null;
  stage?: 'all' | SceneStage;
  archived?: boolean;
  cursor?: string | null;
  limit?: number;
}
export interface SceneGroupListInput {
  target: SceneProject;
  cursor?: string | null;
  limit?: number;
}
export interface SceneMutationResult {
  scene: SceneSummary;
  groups: SceneGroup[];
  projectRevision: number;
}
export interface CreateSceneInput {
  target: SceneProject;
  operationId: string;
  title: string;
  parentId?: string | null;
  planning?: Partial<ScenePlanning>;
  content?: string;
}
export interface UpdateSceneInput {
  target: SceneProject;
  sceneId: string;
  operationId: string;
  expectedRevision: number;
  patch: {
    title?: string;
    stage?: SceneStage;
    planning?: Partial<ScenePlanning>;
    content?: string;
  };
}
export interface MoveSceneInput {
  target: SceneProject;
  sceneId: string;
  operationId: string;
  expectedRevision: number;
  parentId: string | null;
  beforeId?: string | null;
  afterId?: string | null;
  expectedSourceStructureRevision: number;
  expectedTargetStructureRevision: number;
}
export interface ArchiveSceneInput {
  target: SceneProject;
  sceneId: string;
  operationId: string;
  expectedRevision: number;
  archived: boolean;
}
export interface SceneReferenceInput {
  target: SceneProject;
  sceneId: string;
  operationId: string;
  expectedRevision: number;
  reference: SceneReference;
  remove?: boolean;
}
export interface SceneAssemblyInput {
  target: SceneProject;
  parentId: string;
  expectedAssemblyRevision: number;
  cursor?: string | null;
  limit?: number;
}
export interface SceneAssemblyPage {
  items: { id: string; revision: number; content: string; hash: string; wordCount: number }[];
  nextCursor: string | null;
  assemblyRevision: number;
  projectRevision: number;
}
export interface SceneJobInput {
  target: SceneProject;
  operationId: string;
  parentId?: string | null;
  limit?: number;
}
export interface SceneJobProgress {
  complete: boolean;
  processed: number;
}
export interface DeleteSceneGroupsInput {
  target: SceneProject;
  operationId: string;
  groups: { id: string; expectedUpdatedAt: number }[];
  limit?: number;
}
export interface DeleteSceneGroupInput {
  target: SceneProject;
  operationId: string;
  parentId: string;
  expectedUpdatedAt: number;
  limit?: number;
}
export type SceneJob = (
  | { kind: 'rebalance'; input: SceneJobInput }
  | { kind: 'delete-groups'; input: DeleteSceneGroupsInput }
  | { kind: 'delete-book'; input: SceneJobInput }
) & { progress: SceneJobProgress };
export interface SceneSource {
  id: string;
  content: string;
  hash: string;
  /** Remaining original fields. Reconstruct the source with {...original, content}. */
  original: Record<string, unknown>;
}
export interface SceneSourceListInput extends SceneGroupListInput {
  expectedProjectRevision: number;
}
export interface ConvertChapterInput {
  target: SceneProject;
  parentId: string;
  operationId: string;
  expectedSourceVersion: string;
}
export interface CreateSceneGroupInput {
  target: SceneProject;
  operationId: string;
  title: string;
  actId?: string | null;
}
export const sceneStages: SceneStage[] = ['planned', 'writing', 'review', 'done'];
export const sceneStageLabels: Record<SceneStage, string> = {
  planned: 'Planejada',
  writing: 'Em escrita',
  review: 'Em revisão',
  done: 'Concluída',
};
export function sceneRoute(target: SceneProject, sceneId: string): string {
  return `/${target.kind === 'book' ? 'books' : 'adventures'}/${encodeURIComponent(target.id)}/scenes/${encodeURIComponent(sceneId)}`;
}
