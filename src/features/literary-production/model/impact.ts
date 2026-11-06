import type {
  LiteraryImpactNode,
  LiteraryImpactVisit,
} from '../../../../functions/src/literaryImpactProtocol.mjs';
export type { LiteraryImpactNode };
export type ImpactPhase =
  | 'registering'
  | 'preparing'
  | 'freezing'
  | 'collecting'
  | 'confirming'
  | 'traversing'
  | 'final-census'
  | 'done'
  | 'partial'
  | 'stale'
  | 'canceled';
export const impactClosed = (phase: ImpactPhase) =>
  ['done', 'partial', 'stale', 'canceled'].includes(phase);
export interface ImpactIntent {
  bookIds: string[];
  sources: LiteraryImpactNode[];
  prepareIndices: boolean;
}
export interface ImpactTarget {
  kind: 'book';
  id: string;
}
export interface ImpactScope {
  scopeToken: string;
  bookToken: string;
  bookIds: string[];
  inventoryCount: number;
  registryToken: string;
  maximumBooksPerRun: number;
  scope: 'registered-dependencies';
  historicalOriginCoverage: false;
  publicationReady: false;
}
export interface ImpactFrame extends ImpactIntent {
  jobId: string;
  phase: ImpactPhase;
  revision: number;
  originToken: string;
  bookToken: string;
  current: boolean | null;
  steps: number;
  inventoryIndex: number;
  inventoryCount: number;
  records: number;
  unavailable: number;
  unsupported: number;
  identityUnknown: number;
  graph: { state: string } | null;
  coverage: { complete: boolean; [key: string]: unknown } | null;
  pendingIndex: { bookId: string; versionId: string } | null;
  reason: string | null;
  createdAt: number;
  semanticCompleteness: false;
  publicationReady: false;
  authorAccepted: false;
}
export interface ImpactStart extends ImpactIntent {
  target: ImpactTarget;
  jobId: string;
  expectedBookToken: string;
  expectedScopeToken: string;
  requestHash: string;
}
export interface ImpactAdvance {
  target: ImpactTarget;
  jobId: string;
  operationId: string;
  expectedOriginToken: string;
  expectedRevision: number;
  requestHash: string;
}
export type ImpactDecisionStatus = 'needs-review' | 'reviewed' | 'dismissed';
export interface ImpactResolve extends ImpactAdvance {
  checkId: string;
  observationToken: string;
  expectedDecisionRevision: number;
  status: ImpactDecisionStatus;
  rationale: string;
  evidence: Array<{ note: string }>;
}
export interface ImpactCancel {
  target: ImpactTarget;
  jobId: string;
  operationId: string;
  expectedOriginToken?: string;
  start?: ImpactStart;
  requestHash: string;
}
export interface ImpactCancellation {
  jobId: string;
  phase: 'canceled';
  revision: number;
  originToken: string | null;
  publicationReady: false;
}
export interface ImpactOperationCanceled {
  jobId: string;
  operationId: string;
  operationCanceled: true;
}
export interface ImpactResolution {
  jobId: string;
  decisionId: string;
  decisionRevision: number;
  revision: number;
  status: ImpactDecisionStatus;
  publicationReady: false;
}
export type ImpactMethod = 'advanceLiteraryImpact' | 'resolveLiteraryImpact';
export interface ImpactOperation {
  status: 'unknown' | 'registering' | 'done' | 'canceled';
  method?: 'startLiteraryImpact' | 'cancelLiteraryImpact' | ImpactMethod;
  originToken?: string | null;
  result?: ImpactFrame | ImpactCancellation | ImpactResolution | ImpactOperationCanceled | null;
}
export interface ImpactDecision {
  revision: number;
  status: ImpactDecisionStatus;
  rationale: string;
  evidence: Array<{ note: string }>;
  updatedAt: number;
}
export interface ImpactFacts {
  status: string;
  sourceAvailable?: boolean | null;
  identityMatches?: boolean | null;
  versionMatches?: boolean | null;
  sourceIdentityVerified?: boolean;
  dependencyRecordVerified?: boolean;
  manuscriptRead?: boolean;
  wholeUnitRead?: boolean;
  editorialReview?: boolean;
  byteIntegrityChecked?: boolean;
  reason?: string;
}
export interface ImpactCheck {
  id: string;
  jobId: string;
  from: LiteraryImpactNode;
  to: LiteraryImpactNode;
  relation: string;
  facts: ImpactFacts;
  sourceLabel: string | null;
  targetLabel: string | null;
  observationToken: string;
  decision?: ImpactDecision;
}
export interface ImpactRowMap {
  checks: ImpactCheck;
  nodes: { id: string; node: LiteraryImpactNode; label: string | null; observationToken: string };
  visits: {
    id: string;
    visit: LiteraryImpactVisit;
    label: string | null;
    observationToken: string;
  };
  witnesses: { id: string; observationToken: string; [key: string]: unknown };
  decisions: ImpactDecision & {
    id: string;
    jobId: string;
    checkId: string;
    observationToken: string;
  };
}
export type ImpactPageKind = keyof ImpactRowMap;
export interface ImpactPage<K extends ImpactPageKind> {
  items: ImpactRowMap[K][];
  nextAfterId: string | null;
  labelsAreCurrent: true;
  semanticCompleteness: false;
  publicationReady: false;
}
