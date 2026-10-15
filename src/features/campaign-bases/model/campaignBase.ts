import type { Campaign } from '@/features/campaigns';
export type CampaignBaseItemKind =
  'part' | 'scene' | 'block' | 'arc' | 'milestone' | 'event' | 'lore';
export type CampaignBaseArchive = 'active' | 'archived' | 'all';
export type CampaignCaptureState =
  'preparing' | 'prepared' | 'activated' | 'aborted' | 'deleting' | 'deleted';
export const capturePhaseLabels = {
  parts: 'Partes',
  scenes: 'Cenas',
  blocks: 'Blocos',
  sceneReferences: 'Referências das cenas',
  arcs: 'Arcos',
  milestones: 'Marcos',
  events: 'Cronologia',
  narrativeLinks: 'Vínculos narrativos',
  lore: 'Lore referenciado',
  images: 'Ilustrações',
  finalizing: 'Conferência final',
  complete: 'Concluída',
  cleanup: 'Limpeza',
} as const;
export type CampaignCapturePhase = keyof typeof capturePhaseLabels;
export interface StartCampaignCaptureInput {
  operationId: string;
  adventureId: string;
  expectedSourceToken: string;
  title: string;
  description: string;
  universeId: string | null;
}
export interface AdvanceCampaignCaptureInput {
  captureId: string;
  operationId: string;
  expectedCheckpoint: number;
}
export type ActivateCampaignCaptureInput = AdvanceCampaignCaptureInput;
export type CancelCampaignCaptureInput = AdvanceCampaignCaptureInput;
export interface CampaignCaptureIdentity {
  campaignId: string;
  baseId: string;
  adventureId: string;
}
export type PendingCampaignCaptureOperation =
  | { method: 'startCampaignCapture'; input: StartCampaignCaptureInput }
  | {
      method: 'advanceCampaignCapture';
      input: AdvanceCampaignCaptureInput;
      expected: CampaignCaptureIdentity;
    }
  | {
      method: 'activateCampaignCapture';
      input: ActivateCampaignCaptureInput;
      expected: CampaignCaptureIdentity;
    }
  | {
      method: 'cancelCampaignCapture';
      input: CancelCampaignCaptureInput;
      expected: CampaignCaptureIdentity;
    };
export interface CampaignBaseManifest {
  field: string;
  sha256: string;
  bytes: number;
  chunkCount: number;
}
export interface CampaignBaseChunk {
  field: string;
  index: number;
  content: string;
}
export type CampaignCaptureCountKind = CampaignBaseItemKind | 'reference' | 'image';
export interface CampaignCaptureSource {
  adventureId: string;
  title: string;
  universeId: string | null;
  sourceToken: string;
  loreSelection: 'referenced';
  counts: Record<CampaignCaptureCountKind, null>;
}
export interface CampaignCaptureRequest {
  adventureId: string;
  title: string;
  description: string;
  universeId: string | null;
}
export interface CampaignCaptureProgress {
  reserved: { campaignId: string; baseId: string };
  captureId: string;
  state: CampaignCaptureState;
  phase: CampaignCapturePhase;
  checkpoint: number;
  processed: number;
  counts: Record<CampaignCaptureCountKind, number> | null;
  sourceAvailable: boolean;
  cleanupComplete: boolean;
  campaignId: string | null;
  reason: 'source-changed' | 'source-unavailable' | null;
  request: CampaignCaptureRequest;
  createdAt: number;
  updatedAt: number;
}
export interface CampaignCaptureList {
  items: CampaignCaptureProgress[];
  nextCursor: string | null;
}
export interface ListCampaignCapturesInput {
  adventureId?: string;
  cursor?: string | null;
  limit?: number;
}
export type CampaignCaptureActivation =
  | { kind: 'activated'; campaign: Campaign }
  | { kind: 'already-activated'; campaignId: string }
  | { kind: 'aborted'; preparation: CampaignCaptureProgress };
export interface CampaignBaseSummary {
  sourceKey: string;
  kind: CampaignBaseItemKind;
  parentKey: string | null;
  title: string;
  archived: boolean;
  orderKey: string;
  stage?: string;
  type?: string;
  audience?: 'creator' | 'gm' | 'players';
  role?: 'main' | 'additional';
  dateLabel?: string;
}
export interface CampaignBaseStructured {
  contentMode?: string;
  wordCount?: number;
  mainWordCount?: number;
  blockWordCount?: number;
  blockCount?: number;
  ownArchived?: boolean;
  aliases?: string[];
  category?: string;
  isPublic?: boolean;
  relations?: { targetKey: string; title: string; relationType: string; description: string }[];
}
export interface CampaignBaseItem extends CampaignBaseSummary {
  fields: CampaignBaseManifest[];
  structured: CampaignBaseStructured;
  image: { imageKey: string; alt: string; caption: string } | null;
}
export interface CampaignBaseList {
  items: CampaignBaseSummary[];
  nextCursor: string | null;
  projectionToken: string;
}
export interface CampaignBaseWindow {
  item: CampaignBaseItem;
  chunks: CampaignBaseChunk[];
  nextCursor: string | null;
  projectionToken: string;
}
export interface CampaignBaseImage {
  dataUrl: string;
  projectionToken: string;
}
export interface ListCampaignBaseItemsInput {
  campaignId: string;
  kind: CampaignBaseItemKind;
  parentKey?: string | null;
  archive?: CampaignBaseArchive;
  cursor?: string | null;
  limit?: number;
}
export interface ReadCampaignBaseItemInput {
  campaignId: string;
  sourceKey: string;
  cursor?: string | null;
  limit?: number;
}
export interface CampaignBase {
  baseId: string;
  capturedAt: number;
  source: { adventureId: string; title: string; synopsis: string; language: string };
  projectionToken: string;
}
export interface CampaignBaseReference {
  key: string;
  kind: 'scene' | 'narrative';
  sourceKey: string;
  targetKey: string | null;
  available: boolean;
}
export interface CampaignBaseReferences {
  items: CampaignBaseReference[];
  nextCursor: string | null;
  projectionToken: string;
}
