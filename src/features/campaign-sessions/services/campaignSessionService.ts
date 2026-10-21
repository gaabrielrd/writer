import {
  campaignSessionStatusLabels,
  type CampaignSession,
  type CampaignSessionEnvelope,
  type CampaignSessionMutation,
  type CampaignSessionSummary,
  type PendingCampaignSession,
} from '../model/campaignSession';
export * from './campaignSessionCallables';
export const canonical = (value: unknown): string => JSON.stringify(value);
export function fail(message = 'A confirmação da sessão não pôde ser validada.'): never {
  throw new Error(message);
}
export function keys(value: unknown, expected: string[]): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).length !== expected.length ||
    expected.some((k) => !Object.hasOwn(value, k))
  )
    fail();
}
export const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
export const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  !!value &&
  !value.includes('/') &&
  new TextEncoder().encode(value).byteLength <= 1500;
const mutationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
const utf8 = (value: string) => new TextDecoder().decode(new TextEncoder().encode(value)) === value;
export function validSessionDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  if (!year || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
export function sessionFieldsError(value: {
  title: string;
  summary: string;
  scheduledDate: string | null;
  status: string;
}): string {
  if (!value.title.trim() || value.title.trim().length > 300 || !utf8(value.title))
    return 'Informe um título válido de até 300 caracteres.';
  if (
    value.summary.length > 150000 ||
    new TextEncoder().encode(value.summary).byteLength > 512 * 1024 ||
    !utf8(value.summary)
  )
    return 'A preparação ultrapassa o limite ou contém caracteres inválidos. O texto foi preservado sem truncamento.';
  if (!validSessionDate(value.scheduledDate)) return 'Informe uma data real válida, sem horário.';
  if (!Object.hasOwn(campaignSessionStatusLabels, value.status)) return 'Escolha um estado válido.';
  return '';
}
export function validateEnvelope(
  value: CampaignSessionEnvelope,
  uid: string,
  campaignId: string,
  token?: string,
  minimum = 0,
): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.campaignId !== campaignId ||
    !/^[a-f0-9]{64}$/.test(value.campaignToken) ||
    (token !== undefined && value.campaignToken !== token) ||
    !integer(value.collectionRevision, minimum)
  )
    fail('A identidade ou a revisão das sessões mudou. Confira a campanha antes de continuar.');
  if (new TextEncoder().encode(canonical(value)).byteLength > 4 * 1024 * 1024)
    fail('A resposta das sessões ultrapassa o limite de leitura.');
}
const summaryFields = [
  'id',
  'schemaVersion',
  'ownerId',
  'campaignId',
  'revision',
  'order',
  'title',
  'scheduledDate',
  'status',
  'createdAt',
  'updatedAt',
];
export function validateSession(
  value: CampaignSessionSummary | CampaignSession,
  uid: string,
  cid: string,
  id?: string,
  full = false,
): void {
  keys(value, full ? [...summaryFields, 'summary'] : summaryFields);
  if (
    !validId(value.id) ||
    (id !== undefined && value.id !== id) ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.campaignId !== cid ||
    !integer(value.revision, 1) ||
    !integer(value.order, 1) ||
    !integer(value.createdAt) ||
    !integer(value.updatedAt, value.createdAt) ||
    typeof value.title !== 'string' ||
    value.title !== value.title.trim() ||
    !validSessionDate(value.scheduledDate) ||
    typeof value.status !== 'string'
  )
    fail();
  const summary = full ? (value as CampaignSession).summary : '';
  if (typeof summary !== 'string' || sessionFieldsError({ ...value, summary })) fail();
}
export function validatePending(value: PendingCampaignSession, uid: string, cid: string): void {
  keys(value, ['schemaVersion', 'ownerId', 'method', 'input']);
  if (value.schemaVersion !== 1 || value.ownerId !== uid || !value.input) fail();
  const input = value.input,
    common = ['campaignId', 'campaignToken', 'sessionId', 'operationId', 'expectedRevision'];
  if (
    input.campaignId !== cid ||
    !validId(cid) ||
    !/^[a-f0-9]{64}$/.test(input.campaignToken) ||
    !mutationId(input.sessionId) ||
    !mutationId(input.operationId) ||
    !integer(input.expectedRevision)
  )
    fail();
  if (value.method === 'saveCampaignSession') {
    keys(input, [...common, 'title', 'summary', 'scheduledDate', 'status']);
    if (
      typeof value.input.title !== 'string' ||
      typeof value.input.summary !== 'string' ||
      sessionFieldsError(value.input) ||
      (input.expectedRevision === 0 &&
        (input.sessionId !== input.operationId || value.input.status !== 'planned'))
    )
      fail();
  } else if (value.method === 'moveCampaignSession') {
    keys(input, [...common, 'expectedCollectionRevision', 'direction']);
    if (
      !integer(input.expectedRevision, 1) ||
      !integer(value.input.expectedCollectionRevision) ||
      !['up', 'down'].includes(value.input.direction)
    )
      fail();
  } else if (value.method === 'deleteCampaignSession') {
    keys(input, common);
    if (!integer(input.expectedRevision, 1)) fail();
  } else fail();
}
export function validateMutation(
  value: CampaignSessionMutation,
  pending: PendingCampaignSession,
  minimum = 0,
): void {
  const input = pending.input;
  validateEnvelope(value, pending.ownerId, input.campaignId, input.campaignToken, minimum);
  keys(value, [
    'schemaVersion',
    'ownerId',
    'campaignId',
    'campaignToken',
    'collectionRevision',
    'receipt',
    'session',
  ]);
  keys(value.receipt, [
    'operationId',
    'action',
    'sessionId',
    'expectedRevision',
    'revision',
    'collectionRevision',
  ]);
  const r = value.receipt,
    action =
      pending.method === 'saveCampaignSession'
        ? 'save'
        : pending.method === 'moveCampaignSession'
          ? 'move'
          : 'delete';
  if (
    r.operationId !== input.operationId ||
    r.action !== action ||
    r.sessionId !== input.sessionId ||
    r.expectedRevision !== input.expectedRevision ||
    !integer(r.revision, 1) ||
    r.revision !== input.expectedRevision + 1 ||
    !integer(r.collectionRevision, 1) ||
    r.collectionRevision > value.collectionRevision ||
    (pending.method === 'moveCampaignSession' &&
      r.collectionRevision !== pending.input.expectedCollectionRevision + 1)
  )
    fail();
  if (value.session !== null) {
    if (action === 'delete') fail();
    validateSession(value.session, pending.ownerId, input.campaignId, input.sessionId, true);
    if (value.session.revision !== r.revision) fail();
    if (
      pending.method === 'saveCampaignSession' &&
      ['title', 'summary', 'scheduledDate', 'status'].some(
        (field) =>
          value.session![field as 'title' | 'summary' | 'scheduledDate' | 'status'] !==
          (field === 'title'
            ? pending.input.title.trim()
            : pending.input[field as 'summary' | 'scheduledDate' | 'status']),
      )
    )
      fail('O texto confirmado não corresponde ao pedido preservado.');
  }
}
export function errorReason(cause: unknown): string {
  if (!cause || typeof cause !== 'object') return '';
  const v = cause as { code?: unknown; details?: { reason?: unknown } };
  return typeof v.details?.reason === 'string'
    ? v.details.reason
    : typeof v.code === 'string'
      ? v.code.replace(/^functions\//, '')
      : '';
}
export const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'Não foi possível consultar as sessões.';
export function isDeletedCampaignError(cause: unknown, campaignId: string): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const value = cause as {
    code?: unknown;
    details?: { reason?: unknown; campaignId?: unknown; deletionId?: unknown };
  };
  return (
    value.code === 'functions/failed-precondition' &&
    ['campaign-deleting', 'campaign-deleted'].includes(String(value.details?.reason)) &&
    value.details?.campaignId === campaignId &&
    mutationId(value.details.deletionId)
  );
}
export const definitive = (cause: unknown): boolean =>
  ['invalid-argument', 'revision-conflict', 'order-boundary'].includes(errorReason(cause));
