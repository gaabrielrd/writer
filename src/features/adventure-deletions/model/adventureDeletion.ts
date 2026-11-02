export interface AdventureDeletionSource {
  schemaVersion: 1;
  ownerId: string;
  adventureId: string;
  adventureToken: string;
  sourceToken: string;
  revision: number;
  title: string;
}
export interface AdventureDeletionIdentity {
  schemaVersion: 1;
  ownerId: string;
  adventureId: string;
  adventureToken: string;
  deletionId: string;
  deletionToken: string;
}
export type AdventureDeletionPhase =
  'quiescence' | 'media' | 'images' | 'children' | 'controls' | 'activity' | 'verify' | 'complete';
export interface AdventureDeletionFloor {
  checkpoint: number;
  deletedDocuments: number;
  createdAt: number;
  updatedAt: number;
  complete: boolean;
  phase: AdventureDeletionPhase;
}
export interface AdventureDeletionProgress
  extends AdventureDeletionIdentity, AdventureDeletionFloor {
  title: string;
  state: 'deleting' | 'deleted';
  revoked: true;
}
export interface StartAdventureDeletionInput {
  adventureId: string;
  adventureToken: string;
  sourceToken: string;
  expectedRevision: number;
  operationId: string;
}
export interface AdvanceAdventureDeletionInput {
  deletionId: string;
  deletionToken: string;
  expectedCheckpoint: number;
  operationId: string;
}
export interface AdventureDeletionReceipt {
  operationId: string;
  action: 'start' | 'advance';
  expectedCheckpoint: number | null;
  confirmedCheckpoint: number;
}
export interface AdventureDeletionMutation {
  receipt: AdventureDeletionReceipt;
  progress: AdventureDeletionProgress;
}
export interface AdventureDeletionCanceled {
  schemaVersion: 1;
  ownerId: string;
  kind: 'canceled';
  request: StartAdventureDeletionInput;
}
export type AdventureDeletionOutcome = AdventureDeletionMutation | AdventureDeletionCanceled;
export interface AdventureDeletionLookup {
  schemaVersion: 1;
  ownerId: string;
  lookup: { adventureId: string };
  deletion: AdventureDeletionProgress | null;
}
export interface AdventureDeletionPage {
  schemaVersion: 1;
  ownerId: string;
  items: AdventureDeletionProgress[];
  nextCursor: string | null;
}
export interface AdventureDeletionStartPending {
  schemaVersion: 1;
  ownerId: string;
  kind: 'start';
  phase: 'request' | 'cancel-start';
  input: StartAdventureDeletionInput;
}
export interface AdventureDeletionStepPending {
  schemaVersion: 1;
  ownerId: string;
  kind: 'step';
  identity: AdventureDeletionIdentity;
  floor: AdventureDeletionFloor;
  input: AdvanceAdventureDeletionInput;
}
export interface AdventureDeletionKnown {
  schemaVersion: 1;
  ownerId: string;
  kind: 'known';
  identity: AdventureDeletionIdentity;
  floor: AdventureDeletionFloor;
}
export type AdventureDeletionPending = AdventureDeletionStartPending | AdventureDeletionStepPending;
export type AdventureDeletionControl = AdventureDeletionPending | AdventureDeletionKnown;
