import * as api from './campaignBaseCallables';
import { verifyCampaignBaseFields } from './campaignBaseContent';
import {
  capturePhaseLabels,
  type CampaignBaseItem,
  type CampaignBaseWindow,
  type CampaignCaptureProgress,
  type CampaignCaptureActivationResolution,
  type ResolveCampaignCaptureActivationInput,
} from '../model/campaignBase';
export * from './campaignBaseCallables';
export function assertCampaignProjection(token: string, expected?: string): void {
  if (
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(token) ||
    (expected !== undefined && token !== expected)
  )
    throw new Error('A autorização da base mudou. Abra a base novamente para continuar.');
}
export function validateCampaignCapture(
  progress: CampaignCaptureProgress,
  captureId?: string,
): CampaignCaptureProgress {
  if (
    !progress ||
    typeof progress.captureId !== 'string' ||
    !progress.captureId ||
    (captureId && progress.captureId !== captureId) ||
    !['preparing', 'prepared', 'activated', 'aborted', 'deleting', 'deleted'].includes(
      progress.state,
    ) ||
    !Object.hasOwn(capturePhaseLabels, progress.phase) ||
    !Number.isSafeInteger(progress.checkpoint) ||
    progress.checkpoint < 0 ||
    !Number.isSafeInteger(progress.processed) ||
    progress.processed < 0 ||
    typeof progress.sourceAvailable !== 'boolean' ||
    typeof progress.cleanupComplete !== 'boolean' ||
    !progress.reserved ||
    typeof progress.reserved.campaignId !== 'string' ||
    !progress.reserved.campaignId ||
    typeof progress.reserved.baseId !== 'string' ||
    !progress.reserved.baseId ||
    (progress.state === 'activated'
      ? progress.campaignId !== progress.reserved.campaignId
      : progress.campaignId !== null) ||
    (progress.state === 'deleted' && !progress.cleanupComplete) ||
    (!progress.sourceAvailable && (progress.counts !== null || progress.processed !== 0)) ||
    (progress.reason !== null &&
      !['source-changed', 'source-unavailable'].includes(progress.reason)) ||
    !progress.request ||
    typeof progress.request.adventureId !== 'string' ||
    typeof progress.request.title !== 'string' ||
    typeof progress.request.description !== 'string' ||
    (progress.request.universeId !== null && typeof progress.request.universeId !== 'string') ||
    (progress.counts !== null &&
      !['part', 'scene', 'block', 'arc', 'milestone', 'event', 'lore', 'reference', 'image'].every(
        (kind) => {
          const count =
            progress.counts?.[kind as keyof NonNullable<CampaignCaptureProgress['counts']>];
          return Number.isSafeInteger(count) && Number(count) >= 0;
        },
      ))
  )
    throw Object.assign(
      new Error('O progresso da captura não pôde ser confirmado. Repita o mesmo pedido.'),
      { code: 'functions/unavailable' },
    );
  return progress;
}
export function assertCampaignResponseBudget(value: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024)
    throw new Error('A resposta da base ultrapassa o orçamento de leitura.');
}
export function validateCampaignCaptureActivationResolution(
  value: CampaignCaptureActivationResolution,
  ownerId: string,
  request: ResolveCampaignCaptureActivationInput,
): CampaignCaptureActivationResolution {
  assertCampaignResponseBudget(value);
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== ownerId ||
    !['activated', 'aborted'].includes(value.outcome) ||
    !Number.isSafeInteger(value.confirmedCheckpoint) ||
    value.confirmedCheckpoint !== request.expectedCheckpoint + 1 ||
    !value.request ||
    value.request.captureId !== request.captureId ||
    value.request.operationId !== request.operationId ||
    value.request.expectedCheckpoint !== request.expectedCheckpoint ||
    Object.keys(value.request).some(
      (field) => !['captureId', 'operationId', 'expectedCheckpoint'].includes(field),
    ) ||
    Object.keys(value).some(
      (field) =>
        !['schemaVersion', 'ownerId', 'request', 'outcome', 'confirmedCheckpoint'].includes(field),
    )
  )
    throw Object.assign(new Error('O registro histórico não corresponde ao pedido preservado.'), {
      code: 'functions/unavailable',
    });
  return value;
}
export async function readCompleteCampaignBaseItem(
  campaignId: string,
  sourceKey: string,
  projectionToken: string,
  isCurrent: () => boolean,
): Promise<{
  item: CampaignBaseItem;
  fields: Record<string, string>;
  projectionToken: string;
} | null> {
  let first: CampaignBaseWindow | null = null,
    cursor: string | null = null;
  const chunks: CampaignBaseWindow['chunks'] = [],
    seen = new Set<string>();
  do {
    if (!isCurrent()) return null;
    const page = await api.readCampaignBaseItem({ campaignId, sourceKey, cursor, limit: 4 });
    if (!isCurrent()) return null;
    assertCampaignResponseBudget(page);
    assertCampaignProjection(page.projectionToken, projectionToken);
    if (
      !page.item ||
      page.item.sourceKey !== sourceKey ||
      !Array.isArray(page.item.fields) ||
      !Array.isArray(page.chunks) ||
      page.chunks.length > 8 ||
      (first && JSON.stringify(page.item) !== JSON.stringify(first.item))
    )
      throw new Error('A leitura do recurso capturado mudou. Abra a base novamente.');
    first ??= page;
    const expectedChunks = first.item.fields.reduce((total, field) => total + field.chunkCount, 0);
    if (
      !Number.isSafeInteger(expectedChunks) ||
      expectedChunks < 0 ||
      chunks.length + page.chunks.length > expectedChunks
    )
      throw new Error('A leitura contém trechos que não pertencem ao manifesto capturado.');
    chunks.push(...page.chunks);
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (typeof cursor !== 'string' || seen.has(cursor))
        throw new Error('Não foi possível continuar a leitura integral do recurso.');
      seen.add(cursor);
    }
  } while (cursor !== null);
  const fields = await verifyCampaignBaseFields(first.item.fields, chunks, isCurrent);
  if (!isCurrent()) return null;
  return { item: first.item, fields, projectionToken };
}
export function validatedCampaignBaseImage(
  value: { dataUrl: string; projectionToken: string },
  token: string,
): string {
  assertCampaignProjection(value.projectionToken, token);
  if (
    typeof value.dataUrl !== 'string' ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)
  )
    throw new Error('A ilustração capturada não pôde ser confirmada.');
  const encoded = value.dataUrl.slice(value.dataUrl.indexOf(',') + 1),
    bytes = (encoded.length * 3) / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (encoded.length % 4 || bytes > 1.5 * 1024 * 1024)
    throw new Error('A ilustração capturada ultrapassa o orçamento de leitura.');
  return value.dataUrl;
}
const queues = new Map<string, Promise<unknown>>();
export function runCampaignCapture<T>(
  uid: string,
  scope: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([uid, scope]),
    previous = queues.get(key),
    request = (async () => {
      if (previous) await previous.catch(() => undefined);
      return work();
    })();
  queues.set(key, request);
  void request
    .finally(() => {
      if (queues.get(key) === request) queues.delete(key);
    })
    .catch(() => undefined);
  return request;
}
export function definitiveCaptureFailure(cause: unknown): boolean {
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
    'aborted',
    'resource-exhausted',
  ].includes(code);
}
export const captureErrorMessage = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Não foi possível confirmar a captura. Tente novamente com o mesmo pedido.';
