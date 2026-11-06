export type LiteraryProseMode = 'draftScene' | 'reviseScene' | 'reviewStructure' | 'reviewProse';
export const LITERARY_PROSE_MODES: readonly LiteraryProseMode[];
export interface LiteraryReviewSegment {
  index: number;
  start: number;
  end: number;
  coreStart: number;
  coreEnd: number;
  text: string;
}
export interface LiteraryProseOutput {
  text: string;
  rationale: string;
  complete: true;
  findings: Array<{
    sourceId: string;
    quote: string;
    offset: number;
    problem: string;
    severity: 'blocking' | 'warning' | 'suggestion';
    action: string;
  }>;
}
export function literaryReviewSegments(
  text: string,
  size?: number,
  overlap?: number,
): LiteraryReviewSegment[];
export function normalizeLiteraryProseOutput(
  value: unknown,
  context: {
    mode: LiteraryProseMode;
    documents: Array<{ id: string; text: string }>;
    segment: LiteraryReviewSegment;
  },
): LiteraryProseOutput;
export function literaryPlainProseHTML(value: string): string;
