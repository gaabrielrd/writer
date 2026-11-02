export type WorkTarget = { kind: 'book' | 'adventure' | 'campaign'; id: string };
export type ManuscriptTarget = { kind: 'book' | 'adventure'; id: string };
export type PreparationTarget = { kind: 'adventure' | 'campaign'; id: string };
export type EditorialState = 'draft' | 'review' | 'ready';
export type WorkResource =
  { kind: 'project' } | { kind: 'chapter'; id: string } | { kind: 'scene'; id: string };
export interface WorkProgress {
  target: WorkTarget;
  ownerId: string;
  title: string;
  revision: number;
  activityRevision: number;
  archived: boolean;
  editorialState: EditorialState | null;
  wordGoal: number | null;
  manuscript: {
    ready: boolean;
    wordCount: number | null;
    operationId?: string;
    processed?: number;
  } | null;
  checklist: { total: number; completed: number } | null;
}
export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export type ChecklistFilter = 'all' | 'pending' | 'completed';
export interface ChecklistPage {
  items: ChecklistItem[];
  nextCursor: string | null;
  checklistRevision: number;
  total: number;
  completed: number;
}
export interface ChecklistMutation {
  item: ChecklistItem;
  checklistRevision: number;
  total: number;
  completed: number;
}
export interface ChecklistDeletion {
  checklistRevision: number;
  total: number;
  completed: number;
}
export interface ResumeSummary {
  target: WorkTarget;
  title: string;
  resource: WorkResource;
  accessedAt: number;
}
export interface ResumePage {
  items: ResumeSummary[];
  nextCursor: string | null;
  activityRevision: number;
}
export interface ResolvedResume {
  target: WorkTarget;
  title: string;
  resource: WorkResource;
  fallback: boolean;
}
export interface WorkPreferences {
  revision: number;
  timeZone: string | null;
}
export interface UpdateWorkProgressInput {
  target: ManuscriptTarget;
  operationId: string;
  expectedRevision: number;
  patch: { editorialState?: EditorialState; wordGoal?: number | null };
}
export interface WorkProgressMutation {
  revision: number;
  editorialState: EditorialState;
  wordGoal: number | null;
}
export interface PrepareWorkWordCountInput {
  target: ManuscriptTarget;
  operationId: string;
  limit?: number;
}
export interface WorkWordPreparation {
  complete: boolean;
  processed: number;
  wordCount: number | null;
}
export interface WorkChecklistListInput {
  target: PreparationTarget;
  filter?: ChecklistFilter;
  cursor?: string | null;
  limit?: number;
}
export interface CreateWorkChecklistInput {
  target: PreparationTarget;
  operationId: string;
  title: string;
}
export interface UpdateWorkChecklistInput {
  target: PreparationTarget;
  id: string;
  operationId: string;
  expectedRevision: number;
  patch: { title?: string; completed?: boolean };
}
export interface DeleteWorkChecklistInput {
  target: PreparationTarget;
  id: string;
  operationId: string;
  expectedRevision: number;
}
export interface SaveWorkPreferencesInput {
  operationId: string;
  expectedRevision: number;
  timeZone: string;
}
export interface RecordWorkActivityInput {
  target: WorkTarget;
  resource: WorkResource;
  operationId: string;
  expectedActivityRevision: number;
}
export interface WorkActivityResult {
  activityRevision: number;
  accessedAt: number;
}
export interface WorkResumeListInput {
  kind?: WorkTarget['kind'];
  cursor?: string | null;
  limit?: number;
}
export const editorialStateLabels: Record<EditorialState, string> = {
  draft: 'Rascunho',
  review: 'Em revisão',
  ready: 'Pronto',
};
export function workProjectPath(target: WorkTarget): string {
  const prefix =
    target.kind === 'book' ? 'books' : target.kind === 'adventure' ? 'adventures' : 'campaigns';
  return '/' + prefix + '/' + encodeURIComponent(target.id);
}
export function workResumePath(target: WorkTarget, resource: WorkResource): string {
  const base = workProjectPath(target);
  if (resource.kind === 'chapter' && target.kind === 'book')
    return base + '/editor/' + encodeURIComponent(resource.id);
  if (resource.kind === 'scene' && target.kind !== 'campaign')
    return base + '/scenes/' + encodeURIComponent(resource.id);
  return base;
}
export function workErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code).replace(/^functions\//, '')
    : '';
}
export function workErrorReason(error: unknown): string {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('details' in error) ||
    typeof error.details !== 'object' ||
    error.details === null ||
    !('reason' in error.details)
  )
    return '';
  return String(error.details.reason);
}
export function isWorkConflict(error: unknown): boolean {
  return (
    workErrorCode(error) === 'failed-precondition' &&
    ['revision-conflict', 'cursor-invalidated'].includes(workErrorReason(error))
  );
}
export function isWorkFailureDefinitive(error: unknown): boolean {
  return [
    'invalid-argument',
    'unauthenticated',
    'permission-denied',
    'not-found',
    'failed-precondition',
    'already-exists',
  ].includes(workErrorCode(error));
}
export function workErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível confirmar a operação. Tente novamente.';
}
export function parseWordGoal(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value.trim()))
    throw new Error('Informe um número inteiro positivo de palavras.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('Informe um número inteiro positivo de palavras.');
  return number;
}
