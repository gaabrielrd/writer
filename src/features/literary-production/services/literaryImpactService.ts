import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import type {
  ImpactIntent,
  ImpactScope,
  ImpactFrame,
  ImpactStart,
  ImpactAdvance,
  ImpactResolve,
  ImpactCancel,
  ImpactCancellation,
  ImpactOperationCanceled,
  ImpactResolution,
  ImpactOperation,
  ImpactMethod,
  ImpactPage,
  ImpactPageKind,
} from '../model/impact';
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method, {
      timeout: 120000,
    })(input)
  ).data;
}
const target = (id: string) => ({ kind: 'book' as const, id });
export const getLiteraryImpactScope = (bookId: string, intent: ImpactIntent) =>
  call<ImpactScope>('getLiteraryImpactScope', { target: target(bookId), ...intent });
export const startLiteraryImpact = (input: ImpactStart) =>
  call<ImpactFrame>('startLiteraryImpact', input);
export const getLiteraryImpact = (bookId: string, jobId: string, expectedOriginToken?: string) =>
  call<ImpactFrame>('getLiteraryImpact', {
    target: target(bookId),
    jobId,
    ...(expectedOriginToken ? { expectedOriginToken } : {}),
  });
export const listLiteraryImpacts = (bookId: string, afterId: string | null = null) =>
  call<{ items: ImpactFrame[]; nextAfterId: string | null }>('listLiteraryImpacts', {
    target: target(bookId),
    afterId,
    limit: 25,
  });
export const advanceLiteraryImpact = (input: ImpactAdvance) =>
  call<ImpactFrame | ImpactOperationCanceled>('advanceLiteraryImpact', input);
export const resolveLiteraryImpact = (input: ImpactResolve) =>
  call<ImpactResolution | ImpactOperationCanceled>('resolveLiteraryImpact', input);
export const cancelLiteraryImpact = (input: ImpactCancel) =>
  call<ImpactCancellation>('cancelLiteraryImpact', input);
export const getLiteraryImpactOperation = (
  bookId: string,
  jobId: string,
  operationId: string,
  requestHash: string,
  expectedBookToken: string,
) =>
  call<ImpactOperation>('getLiteraryImpactOperation', {
    target: target(bookId),
    jobId,
    operationId,
    requestHash,
    expectedBookToken,
  });
export const cancelLiteraryImpactOperation = (
  bookId: string,
  jobId: string,
  operationId: string,
  method: ImpactMethod,
  requestHash: string,
  expectedOriginToken: string,
) =>
  call<ImpactOperation>('cancelLiteraryImpactOperation', {
    target: target(bookId),
    jobId,
    operationId,
    method,
    requestHash,
    expectedOriginToken,
  });
export const readLiteraryImpactPage = <K extends ImpactPageKind>(
  bookId: string,
  jobId: string,
  expectedOriginToken: string,
  kind: K,
  afterId: string | null = null,
) =>
  call<ImpactPage<K>>('readLiteraryImpactPage', {
    target: target(bookId),
    jobId,
    expectedOriginToken,
    kind,
    afterId,
    limit: 25,
  });
/** Correlation only. The server separately authenticates the source and compares the full request. */
export async function impactRequestHash(input: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const value = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
