export interface DeletionIdentity {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  deletionId: string;
}
export interface DeletionSource {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  revision: number;
  title: string;
}
export interface StartDeletionInput {
  campaignId: string;
  campaignToken: string;
  expectedRevision: number;
  operationId: string;
}
export interface AdvanceDeletionInput {
  deletionId: string;
  operationId: string;
  expectedCheckpoint: number;
}
export type DeletionPhase =
  | 'recovery'
  | 'controls'
  | 'bases'
  | 'lore-generations'
  | 'campaign-children'
  | 'activity'
  | 'finalizing'
  | 'complete';
export interface DeletionProgress extends DeletionIdentity {
  state: 'deleting' | 'deleted';
  phase: DeletionPhase;
  checkpoint: number;
  complete: boolean;
  revoked: true;
  createdAt: number;
  updatedAt: number;
}
export interface DeletionReceipt {
  operationId: string;
  action: 'start' | 'advance';
  expectedCheckpoint: number | null;
  confirmedCheckpoint: number;
}
export interface DeletionMutation {
  receipt: DeletionReceipt;
  progress: DeletionProgress;
}
export interface DeletionStartCanceled {
  kind: 'canceled';
  schemaVersion: 1;
  ownerId: string;
  request: StartDeletionInput;
}
export type DeletionLookupInput = { campaignId: string } | { captureId: string };
export interface DeletionLookup {
  schemaVersion: 1;
  ownerId: string;
  lookup: DeletionLookupInput;
  deletion: DeletionProgress | null;
}
export interface DeletionList {
  items: DeletionProgress[];
  nextCursor: string | null;
}
export interface DeletionStartPending {
  schemaVersion: 1;
  ownerId: string;
  kind: 'start';
  phase: 'request' | 'cancel-start';
  input: StartDeletionInput;
}
export interface DeletionStepPending {
  schemaVersion: 1;
  ownerId: string;
  kind: 'step';
  identity: DeletionIdentity;
  input: AdvanceDeletionInput;
}
export interface DeletionKnown {
  schemaVersion: 1;
  ownerId: string;
  kind: 'known';
  identity: DeletionIdentity;
  checkpoint: number;
}
export type DeletionPending = DeletionStartPending | DeletionStepPending;
export type DeletionControl = DeletionPending | DeletionKnown;
