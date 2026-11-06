export const LITERARY_INTEGRATION_AXES: readonly string[];
export interface IntegrationEvidence {
  sourceId: string;
  quote: string;
  offset: number;
}
export interface IntegrationReading {
  complete: true;
  report: string;
  findings: Array<{
    severity: 'blocking' | 'warning' | 'suggestion';
    problem: string;
    action: string;
    evidence: IntegrationEvidence[];
    status: 'open';
  }>;
  matrix: Array<{
    axis: string;
    subject: string;
    observation: string;
    certainty: 'established' | 'interpretation' | 'uncertain';
    evidence: IntegrationEvidence[];
    status: 'proposal';
  }>;
  coverage: {
    scope: 'unit-segment' | 'chapter-boundary' | 'architecture-segment';
    wholeChapter: false;
    wholeAct: false;
    wholeBook: false;
  };
}
export function normalizeLiteraryIntegrationReading(
  raw: unknown,
  options: {
    documents: Array<{ id: string; text: string; offsetBase?: number }>;
    scope?: 'unit-segment' | 'chapter-boundary' | 'architecture-segment';
  },
): IntegrationReading;
export function normalizeLiteraryIntegrationSynthesis(
  raw: unknown,
  options: { evidenceIds: string[] },
): {
  complete: true;
  report: string;
  findings: Array<{
    severity: 'blocking' | 'warning' | 'suggestion';
    problem: string;
    action: string;
    evidenceIds: string[];
    status: 'open';
  }>;
  conclusions: Array<{
    axis: string;
    observation: string;
    evidenceIds: string[];
    status: 'proposal';
  }>;
  coverage: { scope: 'evidence-synthesis'; wholeChapter: false; wholeAct: false; wholeBook: false };
};
export interface IntegrationCoverage {
  sourceToken: string;
  sourceCharacters: number;
  segmentCount: number;
  nextSegment: number;
  covered: number;
  complete: boolean;
}
export function advanceLiteraryIntegrationCoverage(
  previous: IntegrationCoverage | null,
  coverage: {
    sourceToken: string;
    sourceCharacters: number;
    segment: number;
    segmentCount: number;
    coreStart: number;
    coreEnd: number;
  },
): IntegrationCoverage;
