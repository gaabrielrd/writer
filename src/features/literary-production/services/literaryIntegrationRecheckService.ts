import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { withLiteraryRecovery } from './literaryRecoveryStorage';
export interface IntegrationRecheck {
  operationId: string;
  jobId: string | null;
  state: 'scanning' | 'done' | 'changed' | 'canceled';
  phase: string;
  selectedChapters: number;
  verifiedUnits: number;
  verifiedAnalyses: number;
  architectureCompared?: number;
  impact: {
    kind: string;
    message: string;
    chapterId?: string;
    requestId?: string;
    resource?: { kind: string; id: string };
  } | null;
  createdAt: number;
  completedAt: number | null;
}
export interface StartIntegrationRecheck {
  target: { kind: 'book'; id: string };
  operationId: string;
  jobId: string;
  expectedSourceToken: string;
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method, {
      timeout: 120000,
    })(input)
  ).data;
}
export const startLiteraryIntegrationRecheck = (input: StartIntegrationRecheck, actorId: string) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'integrationRecheck',
    input.operationId,
    { ...input, expectedRevision: 0 },
    () => call<IntegrationRecheck>('startLiteraryIntegrationRecheck', input),
  );
export const getLiteraryIntegrationRecheck = (bookId: string, operationId: string) =>
  call<IntegrationRecheck | { operationId: string; state: 'unconfirmed' }>(
    'getLiteraryIntegrationRecheck',
    { target: { kind: 'book', id: bookId }, operationId },
  );
export const advanceLiteraryIntegrationRecheck = (bookId: string, operationId: string) =>
  call<IntegrationRecheck>('advanceLiteraryIntegrationRecheck', {
    target: { kind: 'book', id: bookId },
    operationId,
  });
export const cancelLiteraryIntegrationRecheck = (bookId: string, operationId: string) =>
  call<IntegrationRecheck>('cancelLiteraryIntegrationRecheck', {
    target: { kind: 'book', id: bookId },
    operationId,
  });
export const cancelPendingLiteraryIntegrationRecheck = (
  input: StartIntegrationRecheck,
  actorId: string,
) =>
  withLiteraryRecovery(
    actorId,
    input.target.id,
    'integrationRecheck',
    input.operationId,
    { ...input, expectedRevision: 0 },
    () => cancelLiteraryIntegrationRecheck(input.target.id, input.operationId),
  );
