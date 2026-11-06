import type { LiteraryPlan } from './planning';
import type { EditorialContract } from './editorial';
export interface LiteraryProposalResult {
  plan: LiteraryPlan;
  contractProposal?: EditorialContract;
  rationale: string;
  findings: Array<{
    sourceId: string;
    quote: string;
    problem: string;
    severity: 'blocking' | 'warning' | 'suggestion';
    action: string;
  }>;
  coverage: {
    scope: 'selected-sources';
    completeForSelection: boolean;
    wholeBook: false;
    documentCount: number;
  };
}
export interface LiteraryProposalResponse {
  operationId: string;
  state: 'unconfirmed' | 'running' | 'done' | 'error' | 'stale' | 'canceled';
  result?: LiteraryProposalResult;
  inputPlan?: LiteraryPlan;
  sources?: Array<{ id: string; label: string; revision: number }>;
  message?: string;
  generation?: { effective: { model: string } };
}
export interface StartLiteraryProposal {
  target: { kind: 'book'; id: string };
  operationId: string;
  mode: 'propose' | 'audit' | 'contract';
  plan: LiteraryPlan;
  expectedRevision: number;
  sourcePlanIds: string[];
  instruction: string;
  generation?: unknown;
}
export interface LiteraryProposalPage {
  items: Array<{
    operationId: string;
    state: string;
    createdAt: number;
    mode: 'propose' | 'audit' | 'contract' | null;
  }>;
  nextAfterId: string | null;
}
