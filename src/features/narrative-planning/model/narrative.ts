import type { SceneProject, SceneReference } from '@/features/scenes';

export type NarrativeTarget = SceneProject;
export type NarrativeResource =
  { kind: 'arc' } | { kind: 'event' } | { kind: 'milestone'; arcId: string };
export type NarrativeSource =
  | { kind: 'arc'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'milestone'; arcId: string; id: string };
export type NarrativeReference =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'event'; eventId: string }
  | { kind: 'lore'; reference: SceneReference };
export interface NarrativeBase {
  ownerId: string;
  schemaVersion: 1;
  revision: number;
  title: string;
  rank: string;
  referenceCount: number;
  createdAt: number;
  updatedAt: number;
  deleting?: boolean;
  deletionOperationId?: string;
}
export type NarrativeSummary = NarrativeBase & NarrativeSource & { dateLabel?: string };
export type NarrativeItem =
  | (NarrativeBase & {
      kind: 'arc';
      id: string;
      initialState: string;
      objective: string;
      plannedOutcome: string;
    })
  | (NarrativeBase & { kind: 'milestone'; id: string; arcId: string; notes: string })
  | (NarrativeBase & { kind: 'event'; id: string; description: string; dateLabel: string });
export interface NarrativeContext {
  target: NarrativeTarget;
  ownerId: string;
  title: string;
  universeId: string | null;
  projectRevision: number;
  sceneRevision: number;
  updatedAt: number;
  hasResources: boolean;
  entityIndexReady: boolean;
  entityIndexOperationId?: string;
}
export interface NarrativeSequenceState {
  resource: NarrativeResource;
  structureRevision: number;
  rankSlot: 'A' | 'B';
  rebalancing: boolean;
  rebalanceOperationId?: string;
}
export interface NarrativePage<T> {
  items: T[];
  nextCursor: string | null;
  projectRevision: number;
  sceneRevision: number;
  sequence?: NarrativeSequenceState;
}
export interface NarrativeMutationResult {
  item: NarrativeSummary;
  projectRevision: number;
  sceneRevision: number;
  sequence?: NarrativeSequenceState;
}
export interface NarrativeListInput {
  target: NarrativeTarget;
  resource: NarrativeResource;
  cursor?: string | null;
  limit?: number;
}
export type CreateNarrativeItemInput = {
  target: NarrativeTarget;
  operationId: string;
  title: string;
} & (
  | {
      resource: { kind: 'arc' };
      initialState?: string;
      objective?: string;
      plannedOutcome?: string;
    }
  | { resource: { kind: 'event' }; description?: string; dateLabel?: string }
  | { resource: { kind: 'milestone'; arcId: string }; notes?: string }
);
export interface UpdateNarrativeItemInput {
  target: NarrativeTarget;
  source: NarrativeSource;
  operationId: string;
  expectedRevision: number;
  patch: {
    title?: string;
    initialState?: string;
    objective?: string;
    plannedOutcome?: string;
    description?: string;
    dateLabel?: string;
    notes?: string;
  };
}
export interface MoveNarrativeItemInput {
  target: NarrativeTarget;
  source: NarrativeSource;
  operationId: string;
  expectedRevision: number;
  expectedStructureRevision: number;
  beforeId?: string | null;
  afterId?: string | null;
}
export interface NarrativeJobProgress {
  complete: boolean;
  processed: number;
}
export interface NarrativeJobInput {
  target: NarrativeTarget;
  operationId: string;
  limit?: number;
}
export interface DeleteNarrativeItemInput extends NarrativeJobInput {
  source: NarrativeSource;
  expectedRevision: number;
}
export interface RebalanceNarrativeRanksInput extends NarrativeJobInput {
  resource: NarrativeResource;
}
export type NarrativeJob = (
  | { kind: 'rebalance'; input: RebalanceNarrativeRanksInput }
  | { kind: 'delete-item'; input: DeleteNarrativeItemInput }
  | { kind: 'prepare-entity-scenes'; input: NarrativeJobInput }
) & { progress: NarrativeJobProgress };
export interface NarrativeReferenceInput {
  target: NarrativeTarget;
  source: NarrativeSource;
  operationId: string;
  expectedRevision: number;
  reference: NarrativeReference;
  remove?: boolean;
}
export interface NarrativeReferenceView {
  id: string;
  reference: NarrativeReference;
  available: boolean;
  label?: string;
  category?: string;
  archived?: boolean;
}
export interface NarrativeReferenceListInput {
  target: NarrativeTarget;
  source: NarrativeSource;
  cursor?: string | null;
  limit?: number;
}
export interface NarrativeLoreOption {
  reference: SceneReference;
  name: string;
  category: string;
}
export interface NarrativeLoreListInput {
  target: NarrativeTarget;
  scope: 'book' | 'universe' | 'adventure';
  cursor?: string | null;
  limit?: number;
}
export interface EntityNarrativeListInput {
  target: NarrativeTarget;
  reference: SceneReference;
  cursor?: string | null;
  limit?: number;
}
export interface EntitySceneLink {
  id: string;
  sceneId: string;
  available: boolean;
  title?: string;
  archived?: boolean;
  parentId?: string | null;
}
export function narrativeSource(item: NarrativeSource): NarrativeSource {
  return item.kind === 'milestone'
    ? { kind: item.kind, id: item.id, arcId: item.arcId }
    : { kind: item.kind, id: item.id };
}
export function narrativeResource(source: NarrativeSource): NarrativeResource {
  return source.kind === 'milestone'
    ? { kind: source.kind, arcId: source.arcId }
    : { kind: source.kind };
}
