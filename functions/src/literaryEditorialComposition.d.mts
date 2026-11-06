export interface EditorialCompositionDecision {
  id: string;
  text: string;
  category: 'requirement' | 'preference' | 'hypothesis';
  status: 'proposal' | 'working' | 'approved' | 'gap';
  supersedes: string | null;
  source?: string;
}
export function composeEditorialContract<T extends EditorialCompositionDecision>(contract: {
  collaborationPolicy?: { version: 1; mode: 'guidance' | 'supervised' | 'continuous' };
  publicationPolicy?: {
    version: 1;
    unit: 'chapter' | 'act' | 'book';
    requirePreviousPublication?: boolean;
  };
  fields: Record<string, string>;
  decisions: T[];
}): {
  version: 1;
  activeApproved: T[];
  unresolved: T[];
  supersededIds: string[];
  instruction: string;
};
