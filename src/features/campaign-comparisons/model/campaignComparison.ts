import type {
  CampaignBaseItem,
  CampaignBaseItemKind,
  CampaignBaseChunk,
  CampaignBaseReference,
} from '@/features/campaign-bases';
export interface ComparisonIdentity {
  schemaVersion: 1;
  ownerId: string;
  comparisonId: string;
  campaignId: string;
  campaignToken: string;
  currentBaseId: string;
  candidateBaseId: string;
}
export type ComparisonState =
  'preparing' | 'ready' | 'adopted' | 'aborted' | 'deleting' | 'deleted';
export type ComparisonPhase =
  | 'parts'
  | 'scenes'
  | 'blocks'
  | 'sceneReferences'
  | 'arcs'
  | 'milestones'
  | 'events'
  | 'narrativeLinks'
  | 'lore'
  | 'images'
  | 'finalizing'
  | 'complete'
  | 'cleanup';
export type ComparisonReason =
  | 'source-changed'
  | 'source-unavailable'
  | 'campaign-changed'
  | 'campaign-unavailable'
  | 'base-changed'
  | null;
export interface ComparisonProgress extends ComparisonIdentity {
  state: ComparisonState;
  phase: ComparisonPhase;
  checkpoint: number;
  processed: number | null;
  counts: Record<
    'part' | 'scene' | 'block' | 'arc' | 'milestone' | 'event' | 'lore' | 'loreReference' | 'image',
    number
  > | null;
  sourceAvailable: boolean;
  cleanupComplete: boolean;
  reason: ComparisonReason;
  createdAt: number;
  updatedAt: number;
}
export interface ComparisonSource {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  currentBaseId: string;
  currentCapturedAt: number;
  adventureId: string;
  sourceToken: string;
}
export interface StartComparisonInput {
  operationId: string;
  campaignId: string;
  campaignToken: string;
  currentBaseId: string;
  expectedSourceToken: string;
}
export interface StepComparisonInput {
  comparisonId: string;
  operationId: string;
  expectedCheckpoint: number;
}
export interface ComparisonReceipt {
  operationId: string;
  action: 'start' | 'advance' | 'cancel';
  expectedCheckpoint: number | null;
  confirmedCheckpoint: number;
}
export interface ComparisonMutationResult {
  receipt: ComparisonReceipt;
  progress: ComparisonProgress;
}
export interface StartComparisonCanceled {
  kind: 'canceled';
  schemaVersion: 1;
  ownerId: string;
  request: StartComparisonInput;
}
export type StartComparisonResult = ComparisonMutationResult | StartComparisonCanceled;
export type ResolveComparisonStartResult =
  ({ kind: 'confirmed' } & ComparisonMutationResult) | StartComparisonCanceled;
export interface ComparisonReadEnvelope extends ComparisonIdentity {
  currentCapturedAt: number;
  candidateCapturedAt: number;
  collectionRevision: number;
  comparisonToken: string;
}
export type ComparisonGroup = 'source' | 'items' | 'references' | 'images';
export type ComparisonChangeKind = 'added' | 'changed' | 'removed' | 'unchanged';
export type ComparisonSide = 'current' | 'candidate';
export interface ComparisonItemSummary {
  sourceKey: string;
  kind: CampaignBaseItemKind;
  parentKey: string | null;
  title: string;
  archived: boolean;
  orderContext: { previousKey: string | null; nextKey: string | null } | null;
  stage?: string;
  type?: string;
  audience?: 'creator' | 'gm' | 'players';
  role?: 'main' | 'additional';
  dateLabel?: string;
  category?: string;
}
interface ChangeRow<T, G extends ComparisonGroup> {
  key: string;
  group: G;
  change: ComparisonChangeKind;
  currentSummary: T | null;
  candidateSummary: T | null;
}
export type ComparisonChange =
  | ChangeRow<{ title: string; synopsis: string; language: string }, 'source'>
  | (ChangeRow<ComparisonItemSummary, 'items'> & {
      orderContextChanged: boolean;
      local?: { mode: 'base' | 'override' | 'removed'; revision: number } | null;
      requiresReview?: boolean;
    })
  | ChangeRow<CampaignBaseReference, 'references'>
  | ChangeRow<{ imageKey: string; preview: 'unchecked' }, 'images'>;
export interface ListComparisonChangesInput {
  comparisonId: string;
  group: ComparisonGroup;
  kind?: CampaignBaseItemKind;
  change?: ComparisonChangeKind;
  cursor?: string | null;
  limit?: number;
}
export interface ComparisonChangesPage extends ComparisonReadEnvelope {
  items: ComparisonChange[];
  nextCursor: string | null;
}
export interface ComparisonItemWindow extends ComparisonReadEnvelope {
  side: ComparisonSide;
  key: string;
  item: CampaignBaseItem | null;
  chunks: CampaignBaseChunk[];
  nextCursor: string | null;
}
export interface ComparisonImage extends ComparisonReadEnvelope {
  side: ComparisonSide;
  key: string;
  dataUrl: string;
}
export interface ListComparisonsInput {
  campaignId?: string;
  cursor?: string | null;
  limit?: number;
}
export interface ComparisonList {
  items: ComparisonProgress[];
  nextCursor: string | null;
}
export interface StartComparisonPending {
  schemaVersion: 1;
  ownerId: string;
  scope: { kind: 'start'; campaignId: string };
  phase: 'request' | 'cancel-start';
  input: StartComparisonInput;
  expected: {
    comparisonId: string;
    campaignId: string;
    campaignToken: string;
    currentBaseId: string;
  };
}
export interface StepComparisonPending {
  schemaVersion: 1;
  ownerId: string;
  scope: { kind: 'job'; campaignId: string; comparisonId: string };
  method: 'advance' | 'cancel';
  input: StepComparisonInput;
  expected: ComparisonIdentity;
}
export interface KnownComparisonControl {
  schemaVersion: 1;
  ownerId: string;
  scope: { kind: 'known'; campaignId: string; comparisonId: string };
  expected: ComparisonIdentity;
  checkpoint: number;
}
export type ComparisonControl =
  StartComparisonPending | StepComparisonPending | KnownComparisonControl;
export type PendingComparison = StartComparisonPending | StepComparisonPending;
export interface ComparisonSelection {
  campaignId: string;
  comparisonId?: string;
  currentBaseId?: string;
  expected?: ComparisonIdentity;
}
