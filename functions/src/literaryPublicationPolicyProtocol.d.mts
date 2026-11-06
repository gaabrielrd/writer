export type LiteraryPublicationUnit = 'chapter' | 'act' | 'book';
export interface LiteraryPublicationUnitPolicy {
  version: 1;
  unit: LiteraryPublicationUnit;
  requirePreviousPublication?: boolean;
}
export const LITERARY_PUBLICATION_UNITS: readonly LiteraryPublicationUnit[];
export function normalizeLiteraryPublicationPolicy(
  value?: unknown,
): LiteraryPublicationUnitPolicy | null;
