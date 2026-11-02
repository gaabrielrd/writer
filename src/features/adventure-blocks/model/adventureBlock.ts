import type { SetAdventureBlockImageInput } from './adventurePreview';
export type AdventureBlockResource = { kind: 'scene' | 'block'; id: string };
export type AdventureBlockAudience = 'creator' | 'gm' | 'players';
export const blockAudienceLabels: Record<AdventureBlockAudience, string> = {
  creator: 'Privado do criador',
  gm: 'Mestre',
  players: 'Jogadores',
};
export const narrativeTypes = [
  'introduction',
  'preparation',
  'scene',
  'location',
  'quest',
  'clue',
  'ending',
] as const;
export type AdventureNarrativeType = (typeof narrativeTypes)[number];
export const narrativeTypeLabels: Record<AdventureNarrativeType, string> = {
  introduction: 'Introdução',
  preparation: 'Preparação',
  scene: 'Cena',
  location: 'Local',
  quest: 'Missão',
  clue: 'Pista',
  ending: 'Encerramento',
};
export interface AdventureBlockSummary {
  resource: AdventureBlockResource;
  sceneId: string;
  revision: number;
  title: string;
  narrativeType: AdventureNarrativeType;
  audience: AdventureBlockAudience;
  archived: boolean;
  order: number;
  wordCount: number;
  bodyHash: string;
  bodyBytes: number;
  createdAt: number;
  updatedAt: number;
}
export interface AdventureBlockTotals {
  sceneRevision: number;
  sceneWordCount: number;
  structureRevision: number;
  mainBodyHash: string;
}
export interface AdventureBlockDocument extends AdventureBlockSummary, AdventureBlockTotals {
  content: string;
  sceneTitle: string;
  adventureTitle: string;
  universeId: string | null;
  sceneArchived: boolean;
}
export interface AdventureBlockPage extends AdventureBlockTotals {
  items: AdventureBlockSummary[];
  nextCursor: string | null;
}
export interface AdventureBlockMutation extends AdventureBlockTotals {
  block: AdventureBlockSummary;
}
export type AdventureBlockPatch = Partial<
  Pick<AdventureBlockDocument, 'title' | 'narrativeType' | 'audience' | 'content'>
>;
export interface CreateAdventureBlockInput {
  adventureId: string;
  sceneId: string;
  operationId: string;
  title: string;
  narrativeType?: AdventureNarrativeType;
  audience?: AdventureBlockAudience;
  content?: string;
}
export interface UpdateAdventureBlockInput {
  adventureId: string;
  resource: AdventureBlockResource;
  operationId: string;
  expectedRevision: number;
  patch: AdventureBlockPatch;
}
export interface DuplicateAdventureBlockInput {
  adventureId: string;
  resource: AdventureBlockResource;
  operationId: string;
  expectedRevision: number;
}
export interface MoveAdventureBlockInput extends DuplicateAdventureBlockInput {
  expectedStructureRevision: number;
  direction: 'up' | 'down';
}
export interface ArchiveAdventureBlockInput {
  adventureId: string;
  blockId: string;
  operationId: string;
  expectedRevision: number;
  archived: boolean;
}
export interface DeleteAdventureBlockInput {
  adventureId: string;
  blockId: string;
  operationId: string;
  expectedRevision: number;
}
export interface VerifyAdventureBlockCountInput {
  adventureId: string;
  sceneId: string;
  operationId: string;
  expectedSceneRevision: number;
  limit?: number;
}
export interface AdventureBlockJob extends AdventureBlockTotals {
  complete: boolean;
  processed: number;
}
export interface AdventureBlockCountStatus {
  sceneRevision: number;
  mainBodyHash: string;
  structureRevision: number;
  sceneWordCount: number | null;
  needsVerification: boolean;
  repairable: boolean;
}
export type AdventureBlockVerificationProgress =
  | (Omit<AdventureBlockJob, 'complete' | 'sceneWordCount'> & {
      complete: false;
      sceneWordCount: null;
    })
  | (AdventureBlockJob & { complete: true });
export type PendingAdventureBlockOperation =
  | { method: 'setAdventureBlockImage'; input: SetAdventureBlockImageInput }
  | { method: 'createAdventureBlock'; input: CreateAdventureBlockInput }
  | { method: 'updateAdventureBlock'; input: UpdateAdventureBlockInput }
  | { method: 'duplicateAdventureBlock'; input: DuplicateAdventureBlockInput }
  | { method: 'moveAdventureBlock'; input: MoveAdventureBlockInput }
  | { method: 'archiveAdventureBlock'; input: ArchiveAdventureBlockInput }
  | { method: 'deleteAdventureBlock'; input: DeleteAdventureBlockInput }
  | { method: 'verifyAdventureBlockCount'; input: VerifyAdventureBlockCountInput };
export const sameBlockResource = (a: AdventureBlockResource, b: AdventureBlockResource) =>
  a.kind === b.kind && a.id === b.id;
export const adventureBlockPath = (
  adventureId: string,
  sceneId: string,
  resource: AdventureBlockResource,
) =>
  `/adventures/${encodeURIComponent(adventureId)}/scenes/${encodeURIComponent(sceneId)}` +
  (resource.kind === 'block' ? `/blocks/${encodeURIComponent(resource.id)}` : '');
export const blockErrorMessage = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Não foi possível confirmar a operação. Tente novamente.';
export function isBlockFailureDefinitive(cause: unknown): boolean {
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String(cause.code).replace(/^functions\//, '')
      : '';
  return [
    'invalid-argument',
    'permission-denied',
    'unauthenticated',
    'not-found',
    'failed-precondition',
    'already-exists',
    'resource-exhausted',
    'aborted',
  ].includes(code);
}
export function blockAudience(value: unknown): AdventureBlockAudience {
  return value === 'gm' || value === 'players' ? value : 'creator';
}
export async function blockContentHash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
