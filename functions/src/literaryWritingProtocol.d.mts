export type LiteraryWritingReference = {
  kind: 'act' | 'chapter' | 'scene' | 'arc' | 'event' | 'localLore' | 'globalLore' | 'volumeUnit';
  id: string;
  scopeId: string | null;
  sourceToken: string;
  revision: number;
  purpose: 'source' | 'subject';
};
export type LiteraryWritingManifest = {
  version: 1;
  target: { kind: 'book'; id: string };
  resource: { kind: 'chapter' | 'scene'; id: string };
  bookToken: string;
  selection: 'automatic' | 'explicit';
  contractRevision: number;
  planIds: string[];
  plans: Array<{ id: string; identityToken: string; revision: number }>;
  references: Array<{
    reference: LiteraryWritingReference;
    identityToken: string;
    versionToken: string;
  }>;
};
export type LiteraryWritingSnapshot = {
  version: 1;
  manifest: LiteraryWritingManifest;
  stateToken: string;
  mode: 'chat' | 'autocomplete';
  instruction: string;
  documents: Array<{ id: string; label: string; revision: number; text: string }>;
  coverage: {
    scope: 'selected-editorial-sources';
    completeForSelection: boolean;
    wholeBook: false;
    omittedFields: string[];
  };
};
export function normalizeLiteraryWritingManifest(value: unknown): LiteraryWritingManifest;
export function normalizeLiteraryWritingSnapshot(value: unknown): LiteraryWritingSnapshot;
