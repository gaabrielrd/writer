import {
  validateCampaignLoreDisplayEntity,
  validateCampaignLorePickerItem,
} from '@/features/campaign-lore';
import type {
  PendingSessionReference,
  SessionReferenceEnvelope,
  SessionReferenceOutcome,
  SessionReferencePage,
  SessionReferenceScope,
  SessionReferenceSourceContext,
  SessionLoreReferenceResult,
  ReadSessionLoreReferenceInput,
} from '../model/sessionReference';
export * from './sessionReferenceCallables';
export function canonical(value: unknown): string {
  const sort = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(sort)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, sort(child)]),
          )
        : item;
  return JSON.stringify(sort(value));
}
export function fail(message = 'A resposta dos vínculos não pôde ser confirmada.'): never {
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
export const integer = (value: unknown, min = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
export const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
const workId = (value: unknown) =>
  typeof value === 'string' &&
  !!value &&
  !value.includes('/') &&
  new TextEncoder().encode(value).byteLength <= 1500;
export function source(value: SessionReferenceSourceContext | null) {
  if (value === null) return;
  keys(value, ['baseId', 'projectionToken']);
  if (!hash(value.baseId) || !hash(value.projectionToken)) fail();
}
const scopeFields = ['campaignId', 'campaignToken', 'sessionId', 'expectedSessionRevision'];
const envelopeFields = [
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'sessionId',
  'sessionRevision',
  'referenceCollectionRevision',
];
export function validateEnvelope(
  value: SessionReferenceEnvelope,
  uid: string,
  expected: SessionReferenceScope,
): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.campaignId !== expected.campaignId ||
    value.campaignToken !== expected.campaignToken ||
    value.sessionId !== expected.sessionId ||
    value.sessionRevision !== expected.expectedSessionRevision ||
    !integer(value.referenceCollectionRevision)
  )
    fail('A sessão ou a identidade dos vínculos mudou. Consulte novamente.');
  if (new TextEncoder().encode(canonical(value)).byteLength > 4 * 1024 * 1024)
    fail('A leitura dos vínculos ultrapassa o limite.');
}
export function validatePending(value: PendingSessionReference, uid: string, cid: string): void {
  keys(value, ['schemaVersion', 'ownerId', 'intent', 'action', 'request']);
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    !uid ||
    !['apply', 'cancel'].includes(value.intent)
  )
    fail();
  const r = value.request;
  if (
    !r ||
    r.campaignId !== cid ||
    !workId(cid) ||
    !hash(r.campaignToken) ||
    !id(r.sessionId) ||
    !integer(r.expectedSessionRevision, 1) ||
    !id(r.referenceId) ||
    !id(r.operationId) ||
    !integer(r.expectedReferenceCollectionRevision)
  )
    fail();
  if (value.action === 'add') {
    keys(r, [
      ...scopeFields,
      'referenceId',
      'operationId',
      'expectedReferenceCollectionRevision',
      'sourceContext',
      'target',
    ]);
    source(value.request.sourceContext);
    keys(value.request.target, ['kind', 'sourceKey']);
    if (
      value.request.referenceId !== value.request.operationId ||
      value.request.target.kind !== 'lore' ||
      !hash(value.request.target.sourceKey) ||
      value.request.sourceContext === null
    )
      fail();
  } else if (value.action === 'remove') {
    keys(r, [
      ...scopeFields,
      'referenceId',
      'operationId',
      'expectedReferenceCollectionRevision',
      'expectedRevision',
    ]);
    if (!integer(value.request.expectedRevision, 1)) fail();
  } else fail();
}
export function validateOutcome(
  value: SessionReferenceOutcome,
  expected: PendingSessionReference,
): void {
  const r = expected.request;
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== expected.ownerId ||
    value.campaignId !== r.campaignId ||
    value.campaignToken !== r.campaignToken ||
    value.sessionId !== r.sessionId
  )
    fail();
  const common = ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken', 'sessionId', 'kind'];
  if (value.kind === 'canceled') {
    keys(value, [...common, 'action', 'request']);
    if (value.action !== expected.action || canonical(value.request) !== canonical(r)) fail();
  } else if (value.kind === 'confirmed') {
    keys(value, [...common, 'receipt']);
    const receipt = value.receipt;
    keys(receipt, [
      'operationId',
      'action',
      'referenceId',
      'sessionId',
      'expectedSessionRevision',
      'expectedReferenceCollectionRevision',
      'revision',
      'referenceCollectionRevision',
    ]);
    if (
      receipt.operationId !== r.operationId ||
      receipt.action !== expected.action ||
      receipt.referenceId !== r.referenceId ||
      receipt.sessionId !== r.sessionId ||
      receipt.expectedSessionRevision !== r.expectedSessionRevision ||
      receipt.expectedReferenceCollectionRevision !== r.expectedReferenceCollectionRevision ||
      !integer(receipt.revision, 1) ||
      receipt.revision !==
        (expected.action === 'add' ? 1 : expected.request.expectedRevision + 1) ||
      !integer(receipt.referenceCollectionRevision, 1) ||
      receipt.referenceCollectionRevision !== r.expectedReferenceCollectionRevision + 1
    )
      fail();
  } else fail();
}
export function validatePage(
  value: SessionReferencePage,
  uid: string,
  scope: SessionReferenceScope,
  view: 'references' | 'candidates',
): void {
  validateEnvelope(value, uid, scope);
  keys(value, [...envelopeFields, 'view', 'sourceContext', 'items', 'nextCursor']);
  source(value.sourceContext);
  if (
    value.view !== view ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== 'string' ||
        !value.nextCursor ||
        value.nextCursor.length > 12000))
  )
    fail();
  const seen = new Set<string>();
  if (value.view === 'candidates')
    value.items.forEach((item) => {
      validateCampaignLorePickerItem(item);
      if (seen.has(item.sourceKey)) fail();
      seen.add(item.sourceKey);
    });
  else
    value.items.forEach((item) => {
      keys(item, [
        'id',
        'revision',
        'createdAt',
        'updatedAt',
        'available',
        ...(item.available ? ['target'] : []),
      ]);
      if (
        !id(item.id) ||
        !integer(item.revision, 1) ||
        !integer(item.createdAt) ||
        !integer(item.updatedAt, item.createdAt) ||
        typeof item.available !== 'boolean' ||
        seen.has(item.id)
      )
        fail();
      seen.add(item.id);
      if (item.available) {
        keys(item.target, ['kind', 'sourceKey', 'name', 'category', 'revision', 'mode', 'legacy']);
        if (item.target.kind !== 'lore') fail();
        const { kind: _, ...candidate } = item.target;
        void _;
        validateCampaignLorePickerItem(candidate);
      }
    });
  if (
    value.sourceContext === null &&
    value.items.some((item) => 'sourceKey' in item || item.available)
  )
    fail();
}
export function validateRead(
  value: SessionLoreReferenceResult,
  uid: string,
  input: ReadSessionLoreReferenceInput,
  targetKey: string,
): void {
  validateEnvelope(value, uid, input);
  keys(value, [...envelopeFields, 'referenceId', 'referenceRevision', 'sourceContext', 'material']);
  source(value.sourceContext);
  if (
    value.referenceId !== input.referenceId ||
    value.referenceRevision !== input.expectedRevision ||
    value.referenceCollectionRevision !== input.expectedReferenceCollectionRevision
  )
    fail();
  if (
    value.sourceContext !== null &&
    canonical(value.sourceContext) !== canonical(input.sourceContext)
  )
    fail();
  if (value.material !== null) {
    if (canonical(value.sourceContext) !== canonical(input.sourceContext)) fail();
    const m = value.material;
    keys(m, ['kind', 'sourceKey', 'revision', 'mode', 'legacy', 'entity']);
    if (
      m.kind !== 'lore' ||
      m.sourceKey !== targetKey ||
      !integer(m.revision) ||
      !['base', 'override'].includes(m.mode) ||
      typeof m.legacy !== 'boolean'
    )
      fail();
    validateCampaignLoreDisplayEntity(m.entity, m.sourceKey);
  }
}
export function reason(cause: unknown): string {
  if (!cause || typeof cause !== 'object') return '';
  const v = cause as { code?: unknown; details?: { reason?: unknown } };
  return typeof v.details?.reason === 'string'
    ? v.details.reason
    : typeof v.code === 'string'
      ? v.code.replace(/^functions\//, '')
      : '';
}
export const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Não foi possível consultar os vínculos.';
export function deletedCampaignError(cause: unknown, cid: string) {
  if (!cause || typeof cause !== 'object') return false;
  const v = cause as {
    code?: unknown;
    details?: { reason?: unknown; campaignId?: unknown; deletionId?: unknown };
  };
  return (
    v.code === 'functions/failed-precondition' &&
    ['campaign-deleted', 'campaign-deleting'].includes(String(v.details?.reason)) &&
    v.details?.campaignId === cid &&
    id(v.details.deletionId)
  );
}
