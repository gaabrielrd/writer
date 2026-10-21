export type VersionTarget = { kind: 'book' | 'adventure'; id: string };
export type VersionResource = { kind: 'chapter' | 'scene' | 'block'; id: string };
export interface VersionSource {
  target: VersionTarget;
  resource: VersionResource;
  title: string;
  content: string;
  sourceToken: string;
  contentHash: string;
  revision: number | null;
  /** Confirmed scene total when an adventure contains independently edited blocks. */
  sceneWordCount?: number;
}
export interface VersionSummary {
  id: string;
  target: VersionTarget;
  resource: VersionResource;
  createdAt: number;
  reason: 'manual' | 'before-restore';
  label: string | null;
  wordCount: number;
  byteLength: number;
  contentHash: string;
  chunkCount: number;
}
export interface VersionPage {
  items: VersionSummary[];
  nextCursor: string | null;
}
export interface VersionBodyPage {
  version: VersionSummary;
  chunks: { index: number; content: string }[];
  nextCursor: string | null;
}
export interface CompleteWorkVersion {
  version: VersionSummary;
  content: string;
}
export interface WorkHistoryBackupSource {
  schemaVersion: 1;
  historyRevision: number;
  sourceToken: string;
}
export interface WorkHistoryBackup {
  schemaVersion: 1;
  versions: CompleteWorkVersion[];
}
export interface CreateWorkVersionInput {
  target: VersionTarget;
  resource: VersionResource;
  operationId: string;
  expectedSourceToken: string;
  label?: string;
}
export interface RestoreWorkVersionInput {
  target: VersionTarget;
  resource: VersionResource;
  versionId: string;
  operationId: string;
  expectedSourceToken: string;
}
export interface DeleteWorkVersionInput {
  target: VersionTarget;
  versionId: string;
  operationId: string;
}
export interface RestoreWorkVersionResult {
  source: VersionSource;
  previousVersion: VersionSummary;
}
/** The host reserves its editor before awaiting and rejects dirty/unconfirmed state. */
export interface VersionEditorAdapter {
  resource: VersionResource;
  blockedReason?: string;
  destinationAudience?: string;
  getConfirmedContent: () => string | null;
  runExclusive: <T>(work: () => Promise<T>, options?: { recovery: boolean }) => Promise<T>;
  acceptRestored: (source: VersionSource) => void | Promise<void>;
}
export type PendingWorkHistoryOperation =
  | { kind: 'create'; input: CreateWorkVersionInput }
  | { kind: 'restore'; input: RestoreWorkVersionInput }
  | { kind: 'delete'; resource: VersionResource; input: DeleteWorkVersionInput };

export const sameVersionTarget = (a: VersionTarget, b: VersionTarget) =>
  a.kind === b.kind && a.id === b.id;
export const sameVersionResource = (a: VersionResource, b: VersionResource) =>
  a.kind === b.kind && a.id === b.id;
export const workHistoryMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Não foi possível acessar o histórico. Tente novamente.';
export function isUncertainHistoryFailure(cause: unknown): boolean {
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? String(cause.code).replace(/^functions\//, '')
      : '';
  return ![
    'invalid-argument',
    'permission-denied',
    'unauthenticated',
    'failed-precondition',
    'already-exists',
    'not-found',
    'aborted',
    'out-of-range',
    'resource-exhausted',
  ].includes(code);
}
export async function workHistoryHash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}
