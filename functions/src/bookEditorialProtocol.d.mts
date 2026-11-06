export const BOOK_EDITORIAL_VERSION: 1;
export const BOOK_EDITORIAL_ITEM_BYTES: number;
export type BookEditorialArtifactKind =
  'contract' | 'plan' | 'document' | 'decision' | 'evidence' | 'report' | 'checkpoint' | 'prose';
export type BookEditorialReferenceKind =
  | 'book'
  | 'act'
  | 'chapter'
  | 'scene'
  | 'arc'
  | 'arcMilestone'
  | 'event'
  | 'lore'
  | 'historyVersion'
  | 'persona'
  | 'image'
  | 'artifact'
  | 'sceneLink'
  | 'narrativeLink'
  | 'narrativeControl';
export type BookEditorialRelation =
  | 'references'
  | 'supersedes'
  | 'supports'
  | 'reviews'
  | 'derives'
  | 'corrects'
  | 'contains'
  | 'publishes';
export const BOOK_EDITORIAL_ARTIFACT_KINDS: readonly BookEditorialArtifactKind[];
export const BOOK_EDITORIAL_REFERENCE_KINDS: readonly BookEditorialReferenceKind[];
export const BOOK_EDITORIAL_RELATIONS: readonly BookEditorialRelation[];
export type BookEditorialStatus = 'proposal' | 'working' | 'approved' | 'gap';
export type BookEditorialCategory = 'requirement' | 'preference' | 'hypothesis';
export interface BookEditorialReference {
  kind: BookEditorialReferenceKind;
  id: string;
  parentId: string | null;
  scope: { kind: 'book' | 'universe' | 'library'; id: string | null };
  revision: number | null;
  contentHash: string | null;
  state: 'recorded' | 'unavailable';
  purpose: 'source' | 'subject' | null;
}
export interface BookEditorialContract {
  schemaVersion: 1;
  fields: Record<string, string>;
  decisions: Array<{
    id: string;
    text: string;
    category: BookEditorialCategory;
    status: BookEditorialStatus;
    source: string;
    supersedes: string | null;
  }>;
  collaborationPolicy?: { version: 1; mode: 'guidance' | 'supervised' | 'continuous' };
  publicationPolicy?: {
    version: 1;
    unit: 'chapter' | 'act' | 'book';
    requirePreviousPublication?: boolean;
  };
}
export interface BookEditorialPlan {
  kind: string;
  title: string;
  status: BookEditorialStatus;
  fields: Record<string, string>;
  references: BookEditorialReference[];
}
export interface BookEditorialPreparation {
  chapter: BookEditorialReference;
  historicalAcceptance: boolean;
  historicalReady: boolean;
  notes: string;
  criteria: Array<{
    id: string;
    result: 'pass' | 'fail' | 'gap' | 'notApplicable';
    rationale: string;
    evidenceIds: string[];
  }>;
}
export interface BookEditorialReaderGuide {
  key: string;
  entry: null | {
    name: string;
    aliases: string[];
    category: 'character' | 'location' | 'concept' | 'other';
    summary: string;
    certainty: 'fact' | 'uncertain';
    disambiguation: string;
    revealAfter: BookEditorialReference;
    evidenceIds: string[];
    facts: Array<{
      text: string;
      certainty: 'fact' | 'uncertain';
      chapter: BookEditorialReference;
      evidenceId: string;
    }>;
    relationships: Array<{
      targetKey: string;
      description: string;
      certainty: 'fact' | 'uncertain';
      chapter: BookEditorialReference;
      evidenceId: string;
    }>;
    appearances: Array<{
      kind: 'direct' | 'document' | 'mention' | 'uncertain';
      chapter: BookEditorialReference;
      evidenceId: string;
    }>;
  };
}
export interface BookEditorialDocument {
  role:
    'architecture' | 'series' | 'preparation' | 'progress' | 'readerGuide' | 'publicationManifest';
  title: string;
  sections: Array<{ label: string; text: string }>;
  references: BookEditorialReference[];
  preparation?: BookEditorialPreparation;
  readerGuide?: BookEditorialReaderGuide;
  editionKey?: string;
  previousEditionKey?: string;
}
export interface BookEditorialDecision {
  status:
    | 'proposal'
    | 'working'
    | 'approved'
    | 'gap'
    | 'needs-review'
    | 'reviewed'
    | 'dismissed'
    | 'open'
    | 'fixed'
    | 'accepted'
    | 'investigating'
    | 'planned'
    | 'retained'
    | 'deferred'
    | 'correctionConfirmed';
  category: BookEditorialCategory | null;
  text: string;
  rationale: string;
  supersedes: string | null;
  evidenceIds: string[];
  references?: BookEditorialReference[];
  annotation?: {
    family: 'finding' | 'impact';
    action: 'investigate' | 'correct' | 'retain' | 'defer' | null;
    state: string;
    targetType: string | null;
    correction?: { note: string | null; confirmedAt: number | null };
  };
}
export interface BookEditorialEvidence {
  context?: { format: 'plain' | 'canonical-json'; documentId: string; offsetBase: number | null };
  source: BookEditorialReference;
  quote: string;
  start: number | null;
  end: number | null;
  offsetUnit: 'utf16' | 'not-recorded';
  classification: 'observed' | 'interpretation' | 'proposal' | 'unclassified';
  rationale: string;
}
export interface BookEditorialReading {
  unit: 'scene';
  sourceCharacters: number;
  segment: number;
  segmentCount: number;
  start: number;
  end: number;
  coreStart: number;
  coreEnd: number;
  completeScene: boolean;
  previousSceneIncluded: boolean;
}
export function normalizeBookEditorialReading(raw: unknown): BookEditorialReading;
export interface BookEditorialReport {
  reading?: BookEditorialReading;
  role: 'review' | 'integration' | 'impact' | 'analysis';
  title: string;
  summary: string;
  findings: Array<{
    id: string;
    severity: 'blocking' | 'warning' | 'suggestion';
    status:
      'proposal' | 'open' | 'needs-review' | 'reviewed' | 'fixed' | 'dismissed' | 'accepted' | null;
    problem: string;
    action: string;
    evidenceIds: string[];
    reportSources?: BookEditorialReference[];
  }>;
  observations: Array<{
    axis: string;
    text: string;
    evidenceIds: string[];
    reportSources?: BookEditorialReference[];
  }>;
  claimedCoverage: {
    scope:
      | 'excerpt'
      | 'unit'
      | 'chapter'
      | 'act'
      | 'book'
      | 'registered-dependencies'
      | 'selected-sources'
      | 'chapter-scenes'
      | 'unit-segment'
      | 'chapter-boundary'
      | 'architecture-segment'
      | 'evidence-synthesis'
      | 'unknown';
    completed: number;
    total: number;
    limitations: string[];
  };
  references: BookEditorialReference[];
}
export interface BookEditorialCheckpoint {
  process:
    | 'planning'
    | 'text-assistance'
    | 'preservation'
    | 'draft'
    | 'review'
    | 'integration'
    | 'workflow'
    | 'sequence'
    | 'publication'
    | 'impact';
  phase: string;
  counters: Partial<
    Record<
      | 'steps'
      | 'applications'
      | 'creditsSpent'
      | 'plannedUnits'
      | 'capturedUnits'
      | 'verifiedUnits'
      | 'reviewedUnits'
      | 'acceptedUnits'
      | 'adoptedUnits'
      | 'completedUnits'
      | 'analyses'
      | 'words',
      number
    >
  >;
  currentUnit: BookEditorialReference | null;
  references: BookEditorialReference[];
  haltReason: string | null;
  nextAction: string | null;
  controlsDisabled: true;
}
export interface BookEditorialProse {
  reading?: BookEditorialReading;
  role: 'proposal' | 'saved-copy' | 'prior-version';
  format: 'plain' | 'html';
  text: string;
  rationale: string;
  source: BookEditorialReference | null;
}
export interface BookEditorialContents {
  contract: BookEditorialContract;
  plan: BookEditorialPlan;
  document: BookEditorialDocument;
  decision: BookEditorialDecision;
  evidence: BookEditorialEvidence;
  report: BookEditorialReport;
  checkpoint: BookEditorialCheckpoint;
  prose: BookEditorialProse;
}
export type BookEditorialArtifact = {
  [K in BookEditorialArtifactKind]: {
    schemaVersion: 1;
    id: string;
    kind: K;
    revision: number | null;
    createdAt: number | null;
    updatedAt: number | null;
    provenance: 'author' | 'ai' | 'mixed' | 'unknown';
    lineage?: K extends 'contract' | 'plan' | 'document' | 'decision'
      ? { id: string; role: 'current' | 'version' }
      : never;
    generation?: {
      snapshot: 'historical';
      provider: 'platform' | 'byok';
      model: string;
      reasoning: string | null;
    };
    availability:
      | { state: 'included' }
      | {
          state: 'unavailable';
          reason:
            'source-unavailable' | 'source-revoked' | 'not-recorded' | 'unsupported-legacy-schema';
        };
    content: BookEditorialContents[K] | null;
  };
}[BookEditorialArtifactKind];
export interface BookEditorialLink {
  schemaVersion: 1;
  id: string;
  from: BookEditorialReference;
  to: BookEditorialReference;
  relation: BookEditorialRelation;
}
export interface BookEditorialControl {
  schemaVersion: 1;
  bookId: string;
  presence: 'captured' | 'absent-in-legacy';
  artifacts: number;
  links: number;
}
export function normalizeBookEditorialReference(raw: unknown): BookEditorialReference;
export function normalizeBookEditorialArtifact(raw: unknown): BookEditorialArtifact;
export function normalizeBookEditorialLink(raw: unknown): BookEditorialLink;
export function normalizeBookEditorialControl(raw: unknown): BookEditorialControl;
export function bookEditorialArtifactReferences(
  raw: unknown,
  bookId: string,
): BookEditorialReference[];
