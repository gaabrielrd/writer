import type { StudioBookSummary } from '@/features/books';
import type { AdventureSummary } from '@/features/adventures';
import type { CampaignSummary } from '@/features/campaigns';

export type StudioProjectSummary = StudioBookSummary | AdventureSummary | CampaignSummary;
export type StudioProjectKind = StudioProjectSummary['kind'];
export type StudioStatus = StudioProjectSummary['status'];
export const projectKinds = ['book', 'adventure', 'campaign'] as const;
export const projectLabels = { book: 'Livros', adventure: 'Aventuras', campaign: 'Campanhas' };
export const statusLabels: Record<StudioStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  ready: 'Pronta',
  archived: 'Arquivada',
  planning: 'Em preparação',
  active: 'Em andamento',
  completed: 'Concluída',
};
export const statusesByKind: Record<StudioProjectKind, StudioStatus[]> = {
  book: ['draft', 'published'],
  adventure: ['archived'],
  campaign: ['planning', 'active', 'completed', 'archived'],
};
export function projectPath(project: Pick<StudioProjectSummary, 'id' | 'kind'>): string {
  const prefix =
    project.kind === 'book' ? 'books' : project.kind === 'adventure' ? 'adventures' : 'campaigns';
  return '/' + prefix + '/' + encodeURIComponent(project.id);
}
export function isDefinitiveCreationFailure(cause: unknown): boolean {
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String(cause.code).replace(/^functions\//, '')
      : '';
  return [
    'invalid-argument',
    'permission-denied',
    'unauthenticated',
    'failed-precondition',
    'already-exists',
  ].includes(code);
}
export function projectDateTime(value: number): string | undefined {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 8_640_000_000_000_000
  )
    return undefined;
  return new Date(value).toISOString();
}
export function formatProjectDate(value: number): string {
  if (!projectDateTime(value)) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    value,
  );
}
