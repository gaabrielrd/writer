export interface LiteraryDraftExecution {
  version: 1;
  mode: 'supervised' | 'continuous';
  maxApplications: number | null;
  maxCredits: number | null;
}
export const SUPERVISED_DRAFT_EXECUTION: Readonly<LiteraryDraftExecution>;
export function normalizeLiteraryDraftExecution(value?: unknown): LiteraryDraftExecution;
export function literaryDraftBudgetReached(
  execution: LiteraryDraftExecution,
  applications: number,
  credits: number,
  cost?: number,
): boolean;
