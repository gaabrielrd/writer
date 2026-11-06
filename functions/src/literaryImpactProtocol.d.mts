export type LiteraryImpactKind =
  | 'book'
  | 'act'
  | 'chapter'
  | 'scene'
  | 'arc'
  | 'architecture'
  | 'arcMilestone'
  | 'event'
  | 'localLore'
  | 'globalLore'
  | 'contract'
  | 'plan'
  | 'preparation'
  | 'draft'
  | 'milestone'
  | 'review'
  | 'prose'
  | 'integration'
  | 'finding'
  | 'publication'
  | 'publicationPart'
  | 'readerGuide'
  | 'workflow'
  | 'sequence'
  | 'inspection'
  | 'generation'
  | 'chat'
  | 'autocomplete'
  | 'persona'
  | 'personaBinding';
export type LiteraryImpactNode = {
  kind: LiteraryImpactKind;
  id: string;
  scopeKind: 'book' | 'universe' | 'user';
  scopeId: string;
};
export type LiteraryImpactRelation =
  'source' | 'composition' | 'subject' | 'narrative' | 'target' | 'preserves';
export type LiteraryImpactCapture = {
  scheme?:
    | 'unknown'
    | 'reference'
    | 'writing-plan'
    | 'editorial-revision'
    | 'history-source'
    | 'content-hash'
    | 'finding-target'
    | 'architecture-source'
    | 'prose-assembly'
    | 'persona-profile'
    | 'persona-binding'
    | 'native-chat-target'
    | 'native-chat-lore'
    | 'native-chat-turn'
    | 'application-source'
    | 'native-chat-application-source'
    | 'legacy-chat-application-source'
    | 'artifact-origin'
    | 'integration-chapter'
    | 'publication-integration'
    | 'integration-unit'
    | 'sequence-workflow'
    | 'guide-dependency';
  originToken: string | null;
  identityToken: string | null;
  versionToken: string | null;
  revision: number | null;
};
export type LiteraryImpactLink = {
  from: LiteraryImpactNode;
  to: LiteraryImpactNode;
  relation: LiteraryImpactRelation;
  record: { collection: string; id: string };
  capture: LiteraryImpactCapture | null;
};
export type LiteraryImpactVisit = {
  node: LiteraryImpactNode;
  source: LiteraryImpactNode;
  effect: 'changed' | 'dependency-check' | 'association-check' | 'preservation-check';
  depth: number;
};
export type LiteraryImpactInventory = {
  scopeKind: 'book' | 'universe' | 'user';
  scopeId: string;
  collection: string;
};
export type LiteraryImpactCensus = {
  inventory: LiteraryImpactInventory;
  scanComplete: boolean;
  verified: boolean;
  records: number;
  unavailable: number;
  unsupported: number;
};
export const LITERARY_IMPACT_KINDS: readonly LiteraryImpactKind[];
export const LITERARY_IMPACT_RELATIONS: readonly LiteraryImpactRelation[];
export function literaryImpactArcMilestoneId(arcId: string, milestoneId: string): string;
export function literaryImpactPersonaBindingId(
  scopeKind: 'book' | 'chapter',
  scopeId: string,
): string;
export function readLiteraryImpactPersonaBindingId(value: string): {
  scopeKind: 'book' | 'chapter';
  scopeId: string;
};
export function normalizeLiteraryImpactNode(value: unknown): LiteraryImpactNode;
export function literaryImpactNodeKey(value: unknown): string;
export function normalizeLiteraryImpactLink(value: unknown): LiteraryImpactLink;
export function literaryImpactLinkKey(value: unknown): string;
export function normalizeLiteraryImpactVisit(value: unknown): LiteraryImpactVisit;
export function literaryImpactVisitKey(value: unknown): string;
export function advanceLiteraryImpactVisit(
  value: unknown,
  links: unknown[],
): Array<{
  visit: LiteraryImpactVisit;
  visitKey: string;
  link: LiteraryImpactLink;
  linkKey: string;
}>;
export function literaryImpactInventoryKey(value: unknown): string;
export function literaryImpactCoverage(
  expected: LiteraryImpactInventory[],
  observed: LiteraryImpactCensus[],
  fence: { before: string; after: string },
): {
  scope: 'registered-dependencies';
  complete: boolean;
  concurrentChange: boolean;
  missing: string[];
  pending: string[];
  unavailable: Array<{ inventory: string; count: number }>;
  unsupported: Array<{ inventory: string; count: number }>;
  semanticCompleteness: false;
  authorAccepted: false;
  publicationReady: false;
};
