export type LoreClaimKind = 'observed' | 'interpretation' | 'proposal';
export interface LoreClaim {
  field: 'summary' | 'details';
  text: string;
  kind: LoreClaimKind;
  evidence: string;
  rationale: string;
}
export interface LoreClaimSet {
  version: 1;
  items: LoreClaim[];
}
export const LORE_CLAIM_KINDS: readonly LoreClaimKind[];
export function resolveLoreEvidence(source: string, value: unknown): string;
export function normalizeLoreClaims(
  value: unknown,
  entity: { summary: string; details: string },
  source: string,
): LoreClaimSet | undefined;
