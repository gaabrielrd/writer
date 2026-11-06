import type { EditorialStatus } from './editorial';

export type LiteraryReferenceKind =
  'act' | 'chapter' | 'scene' | 'arc' | 'event' | 'localLore' | 'globalLore' | 'volumeUnit';
export const referenceLabels: Record<LiteraryReferenceKind, string> = {
  act: 'Atos',
  chapter: 'Capítulos',
  scene: 'Cenas',
  arc: 'Arcos',
  event: 'Eventos da cronologia',
  localLore: 'Compêndio do livro',
  globalLore: 'Compêndio do universo',
  volumeUnit: 'Unidade de outro volume',
};
export interface LiteraryReference {
  kind: LiteraryReferenceKind;
  id: string;
  scopeId: string | null;
  sourceToken: string;
  revision: number;
  purpose: 'source' | 'subject';
}
export interface LiteraryPlan {
  kind: string;
  title: string;
  status: EditorialStatus;
  fields: Record<string, string>;
  references: LiteraryReference[];
}
export interface LiteraryPlanState {
  schemaVersion: 1;
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  plan: LiteraryPlan;
  sources: Array<{
    reference: LiteraryReference;
    currentReference?: LiteraryReference | null;
    label: string | null;
    available: boolean;
    changed: boolean;
  }>;
}
export interface LiteraryPlanPage {
  schema: Record<string, { label: string; fields: Record<string, string> }>;
  items: Array<{
    id: string;
    title: string;
    kind: string;
    status: EditorialStatus;
    revision: number;
  }>;
  nextAfterId: string | null;
  projectUpdatedAt: number;
}
export interface LiteraryReferencePage {
  items: Array<{ reference: LiteraryReference; label: string }>;
  nextAfterId: string | null;
}
export interface SaveLiteraryPlan {
  target: { kind: 'book'; id: string };
  id: string;
  operationId: string;
  expectedRevision: number;
  plan: LiteraryPlan;
}
