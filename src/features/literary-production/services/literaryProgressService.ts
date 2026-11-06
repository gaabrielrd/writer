import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
export const progressStages = [
  { value: 'contract', label: 'Contrato e decisões' },
  { value: 'planning', label: 'Planejamento' },
  { value: 'preparation', label: 'Preparação' },
  { value: 'drafting', label: 'Redação' },
  { value: 'versions', label: 'Versões preservadas' },
  { value: 'review', label: 'Revisão' },
  { value: 'integration', label: 'Integração' },
  { value: 'publication', label: 'Publicação' },
] as const;
export type ProgressStage = (typeof progressStages)[number]['value'];
export interface ProgressArtifact {
  stage: ProgressStage;
  id: string;
  collection: string;
  nativeOrigin: string;
  sourceToken: string;
  noteId: string;
  resource: { kind: 'book' | 'chapter' | 'act'; id: string };
  title: string | null;
  kind: string | null;
  state: string;
  revision: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  authorAccepted: boolean;
  preservationState: string | null;
  versionId: string | null;
  counters: Record<string, number>;
  active: boolean;
  sourceCurrentness: 'not-rechecked';
  qualityCertified: false;
  publicationCertified: false;
}
export interface ProgressNote {
  id: string;
  revision: number;
  blockers: string[];
  nextStep: string;
  updatedAt: number | null;
  artifactChanged: boolean;
}
export interface ProgressDetail {
  artifact: ProgressArtifact;
  note: ProgressNote;
}
export interface ProgressPage {
  stage: ProgressStage;
  items: Array<
    ProgressArtifact & {
      note: {
        revision: number;
        updatedAt: number | null;
        artifactChanged: boolean;
        blockerCount: number;
        hasNextStep: boolean;
      };
    }
  >;
  nextAfterId: string | null;
  wholeBookComplete: false;
  sourceCurrentness: 'not-rechecked';
}
export interface SaveProgressNote {
  target: { kind: 'book'; id: string };
  stage: ProgressStage;
  id: string;
  sourceToken: string;
  expectedRevision: number;
  operationId: string;
  notes: { blockers: string[]; nextStep: string };
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method)(input)
  ).data;
}
export const listLiteraryProgressArtifacts = (
  bookId: string,
  stage: ProgressStage,
  afterId: string | null = null,
) =>
  call<ProgressPage>('listLiteraryProgressArtifacts', {
    target: { kind: 'book', id: bookId },
    stage,
    afterId,
  });
export const getLiteraryProgressArtifact = (bookId: string, stage: ProgressStage, id: string) =>
  call<ProgressDetail>('getLiteraryProgressArtifact', {
    target: { kind: 'book', id: bookId },
    stage,
    id,
  });
export const saveLiteraryProgressNote = (
  input: SaveProgressNote,
  actorId: string,
  noteId: string,
) =>
  withLiteraryRecovery(actorId, input.target.id, 'progress', noteId, input, () =>
    call<ProgressNote>('saveLiteraryProgressNote', input),
  );
