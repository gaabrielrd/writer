import type { ComparisonReadEnvelope } from '@/features/campaign-comparisons';
export interface AdoptionIdentity {
  schemaVersion: 1;
  ownerId: string;
  adoptionId: string;
  campaignId: string;
  campaignToken: string;
  comparisonId: string;
  currentBaseId: string;
  candidateBaseId: string;
  loreGenerationId: string;
  expectedCollectionRevision: number;
}
export type AdoptionState =
  'reviewing' | 'preparing' | 'ready' | 'adopted' | 'aborted' | 'deleting' | 'deleted';
export type AdoptionPhase =
  'review' | 'operations' | 'overlays' | 'authorization' | 'complete' | 'cleanup';
export type AdoptionChoice = 'keep-local' | 'use-candidate' | 'discard-local';
export interface AdoptionProgress extends AdoptionIdentity {
  state: AdoptionState;
  phase: AdoptionPhase;
  checkpoint: number;
  processed: number | null;
  sourceAvailable: boolean;
  cleanupComplete: boolean;
  reason: string | null;
  createdAt: number;
  updatedAt: number;
}
export interface StartAdoptionInput {
  operationId: string;
  campaignId: string;
  campaignToken: string;
  comparisonId: string;
  currentBaseId: string;
  candidateBaseId: string;
  expectedCollectionRevision: number;
}
export interface StepAdoptionInput {
  adoptionId: string;
  operationId: string;
  expectedCheckpoint: number;
}
export interface DecideAdoptionInput extends StepAdoptionInput {
  sourceKey: string;
  expectedRevision: number;
  choice: AdoptionChoice;
}
export type AdoptionAction = 'start' | 'decide' | 'prepare' | 'advance' | 'activate' | 'cancel';
export interface AdoptionReceipt {
  operationId: string;
  action: AdoptionAction;
  expectedCheckpoint: number | null;
  confirmedCheckpoint: number;
  outcome: 'confirmed' | 'reauthorization-required';
  sourceKey?: string;
  expectedRevision?: number;
  choice?: AdoptionChoice;
}
export interface AdoptionMutationResult {
  receipt: AdoptionReceipt;
  progress: AdoptionProgress;
}
export interface StartAdoptionCanceled {
  kind: 'canceled';
  schemaVersion: 1;
  ownerId: string;
  request: StartAdoptionInput;
}
export type StartAdoptionResult = AdoptionMutationResult | StartAdoptionCanceled;
export type ResolveAdoptionStartResult =
  ({ kind: 'confirmed' } & AdoptionMutationResult) | StartAdoptionCanceled;
export interface AdoptionDecision {
  sourceKey: string;
  revision: number;
  mode: 'base' | 'override' | 'removed';
  legacy: boolean;
  current: { name: string; category: 'character' | 'location' | 'concept' | 'other' };
  candidate:
    | { present: false }
    | { present: true; name: string; category: 'character' | 'location' | 'concept' | 'other' };
  choice: AdoptionChoice | null;
  required: boolean;
  impediments: string[];
}
export interface AdoptionDecisionsPage extends AdoptionIdentity {
  currentCapturedAt: number;
  candidateCapturedAt: number;
  checkpoint: number;
  projectionToken: string;
  items: AdoptionDecision[];
  nextCursor: string | null;
}
export interface AdoptionList {
  items: AdoptionProgress[];
  nextCursor: string | null;
}
export interface ListAdoptionsInput {
  campaignId?: string;
  cursor?: string;
  limit?: number;
}
export interface StartAdoptionPending {
  schemaVersion: 1;
  ownerId: string;
  scope: { kind: 'start'; campaignId: string };
  phase: 'request' | 'cancel-start';
  input: StartAdoptionInput;
  expected: Omit<AdoptionIdentity, 'schemaVersion' | 'ownerId' | 'loreGenerationId'>;
}
export interface StepAdoptionPending {
  schemaVersion: 1;
  ownerId: string;
  scope: { kind: 'job'; campaignId: string; adoptionId: string };
  method: Exclude<AdoptionAction, 'start'>;
  input: StepAdoptionInput | DecideAdoptionInput;
  expected: AdoptionIdentity;
}
export interface KnownAdoptionControl {
  schemaVersion: 1;
  ownerId: string;
  scope: { kind: 'known'; campaignId: string; adoptionId: string };
  expected: AdoptionIdentity;
  checkpoint: number;
}
export type PendingAdoption = StartAdoptionPending | StepAdoptionPending;
export type AdoptionControl = PendingAdoption | KnownAdoptionControl;
export interface AdoptionSelection {
  campaignId: string;
  adoptionId?: string;
  expected?: AdoptionIdentity;
  context?: ComparisonReadEnvelope;
}
