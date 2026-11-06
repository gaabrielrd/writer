export interface LiteraryGateCriterion {
  id: string;
  result: 'pass' | 'fail' | 'gap' | 'notApplicable';
  rationale: string;
  evidence: Array<{ documentId: string; quote: string }>;
}
export interface LiteraryGate {
  criteria: LiteraryGateCriterion[];
  authorAccepted: boolean;
  notes: string;
}
export const LITERARY_GATE_OPTIONAL_CRITERIA: readonly string[];
export const LITERARY_GATE_CRITERIA: Readonly<Record<string, string>>;
export function normalizeLiteraryGate(value: unknown): LiteraryGate;
export function literaryGateReady(value: LiteraryGate): boolean;
export function verifyLiteraryGateEvidence(
  value: LiteraryGate,
  documents: Array<{ id: string; text: string }>,
): void;
