export type LiteraryCollaborationMode = 'guidance' | 'supervised' | 'continuous';
export interface LiteraryCollaborationPolicy {
  version: 1;
  mode: LiteraryCollaborationMode;
}
export interface LiteraryCollaborationBinding extends LiteraryCollaborationPolicy {
  revision: number;
  configured: boolean;
}
export const LITERARY_COLLABORATION_MODES: readonly LiteraryCollaborationMode[];
export function normalizeLiteraryCollaboration(value?: unknown): LiteraryCollaborationPolicy;
export function literaryCollaborationAllowsDraft(
  policy: LiteraryCollaborationPolicy,
  execution: { mode: 'supervised' | 'continuous' },
): boolean;
