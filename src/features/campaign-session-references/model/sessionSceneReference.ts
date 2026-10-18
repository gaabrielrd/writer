import type { CampaignBaseManifest, CampaignBaseChunk } from '@/features/campaign-bases';
import type {
  ReadSessionLoreReferenceInput,
  SessionReferenceEnvelope,
  SessionReferenceSourceContext,
  SessionReferenceRow,
  SessionReferencePage,
} from './sessionReference';
export type SessionSceneArchive = 'active' | 'archived' | 'all';
export interface SessionSceneCandidate {
  kind: 'scene';
  sourceKey: string;
  title: string;
  stage: string | null;
  archived: boolean;
}
export type SessionSceneReferenceRow = Omit<SessionReferenceRow, 'available' | 'target'> &
  ({ available: false } | { available: true; target: SessionSceneCandidate });
export type AnySessionReferenceRow = SessionReferenceRow | SessionSceneReferenceRow;
export type SessionSceneReferencePage = SessionReferenceEnvelope & {
  sourceContext: SessionReferenceSourceContext | null;
  nextCursor: string | null;
} & (
    | { view: 'references'; items: SessionSceneReferenceRow[] }
    | { view: 'candidates'; items: SessionSceneCandidate[] }
  );
export type AnySessionReferencePage = SessionReferencePage | SessionSceneReferencePage;
export type SessionSceneReadScope = ReadSessionLoreReferenceInput;
export interface SessionSceneReadEnvelope extends SessionReferenceEnvelope {
  referenceId: string;
  referenceRevision: number;
  sourceContext: SessionReferenceSourceContext | null;
}
export type SessionSceneNarrativeType =
  'introduction' | 'preparation' | 'scene' | 'location' | 'quest' | 'clue' | 'ending';
export interface SessionSceneBlockSummary {
  kind: 'block';
  sourceKey: string;
  parentKey: string;
  title: string;
  orderKey: string;
  type: SessionSceneNarrativeType;
  audience: 'creator' | 'gm' | 'players';
  role: 'main' | 'additional';
  archived: boolean;
  ownArchived: boolean | null;
}
export interface SessionScenePlanItem {
  kind: 'scene-plan';
  sourceKey: string;
  title: string;
  stage: string | null;
  archived: boolean;
  fields: CampaignBaseManifest[];
}
export interface SessionSceneBlockItem extends SessionSceneBlockSummary {
  fields: CampaignBaseManifest[];
  image: { imageKey: string; alt: string; caption: string } | null;
}
export type SessionSceneProjectedItem = SessionScenePlanItem | SessionSceneBlockItem;
export type ListSessionSceneBlocksInput = SessionSceneReadScope & {
  archive?: SessionSceneArchive;
  cursor?: string;
  limit?: number;
};
export interface SessionSceneBlocksPage extends SessionSceneReadEnvelope {
  scene: SessionSceneCandidate | null;
  items: SessionSceneBlockSummary[];
  nextCursor: string | null;
}
export type ReadSessionSceneInput = SessionSceneReadScope & {
  blockKey?: string;
  cursor?: string;
  limit?: number;
};
export interface SessionSceneReadWindow extends SessionSceneReadEnvelope {
  blockKey: string | null;
  resourceKey: string | null;
  resourceKind: 'scene-plan' | 'block';
  material: null | {
    item: SessionSceneProjectedItem;
    chunks: CampaignBaseChunk[];
    nextCursor: string | null;
  };
}
export type ReadSessionSceneImageInput = SessionSceneReadScope & { blockKey: string };
export interface SessionSceneImage extends SessionSceneReadEnvelope {
  blockKey: string;
  imageKey: string | null;
  dataUrl: string | null;
}
