import type {
  PreparationIdentity,
  PreparationItemSummary,
  PreparationItemPage,
  PreparationItemResult,
  ListPreparationItemsInput,
  GetPreparationItemInput,
  PreparationLinkPage,
  PreparationSessionScope,
  PreparationRequest,
  PendingCampaignPreparation,
  PreparationOutcome,
  SavePreparationItemInput,
} from '../model/campaignPreparation';
import {
  clueStatusLabels,
  questStatusLabels,
  isPreparationPending,
} from '../model/campaignPreparation';
export * from './campaignPreparationCallables';
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, next: unknown) =>
    next && typeof next === 'object' && !Array.isArray(next)
      ? Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)))
      : next,
  );
}
export function fail(message = 'A resposta da preparação não pôde ser validada.'): never {
  throw new Error(message);
}
export function keys(value: unknown, expected: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== expected.length ||
    expected.some((k) => !Object.hasOwn(value, k))
  )
    fail();
}
export const integer = (n: unknown, min = 0): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= min;
export const validId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v !== '.' &&
  v !== '..' &&
  !!v &&
  !v.includes('/') &&
  new TextEncoder().encode(v).byteLength <= 1500;
const operationId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(v);
const token = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const utf8 = (v: string) => new TextDecoder().decode(new TextEncoder().encode(v)) === v;
const title = (v: unknown): v is string =>
  typeof v === 'string' && v === v.trim() && !!v && v.length <= 300 && utf8(v);
const date = (v: unknown) => integer(v) && v <= 8640000000000000;
const identityKeys = ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken'];
const summaryKeys = [
  'id',
  'kind',
  'revision',
  'order',
  'title',
  'status',
  'createdAt',
  'updatedAt',
];
export function validateIdentity(
  value: PreparationIdentity,
  uid: string,
  cid: string,
  expectedToken?: string,
) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.campaignId !== cid ||
    !token(value.campaignToken) ||
    (expectedToken !== undefined && value.campaignToken !== expectedToken) ||
    new TextEncoder().encode(canonical(value)).byteLength > 4 * 1024 * 1024
  )
    fail('A identidade da preparação mudou. Consulte a campanha antes de continuar.');
}
export function fieldsError(value: {
  kind: string;
  title: string;
  status: string;
  body: unknown;
}): string {
  if (!title(value.title.trim())) return 'Informe um título válido de até 300 caracteres.';
  const fields =
    value.kind === 'clue'
      ? ['text', 'condition', 'recipient']
      : value.kind === 'quest'
        ? ['description', 'consequences']
        : null;
  if (!fields) return 'Escolha um tipo válido.';
  if (!Object.hasOwn(value.kind === 'clue' ? clueStatusLabels : questStatusLabels, value.status))
    return 'Escolha um estado válido.';
  try {
    keys(value.body, fields);
  } catch {
    return 'Os campos do item não correspondem ao tipo.';
  }
  let size = 0;
  for (const field of fields) {
    const v = value.body[field];
    if (typeof v !== 'string' || v.length > 150000 || !utf8(v))
      return 'Um campo ultrapassa o limite ou contém caracteres inválidos. O texto foi preservado.';
    size += new TextEncoder().encode(v).byteLength;
  }
  return size > 512 * 1024 ? 'O texto ultrapassa 512 KiB. Nenhum conteúdo foi truncado.' : '';
}
export function validateSummary(v: PreparationItemSummary, full = false): void {
  keys(v, full ? [...summaryKeys, 'body'] : summaryKeys);
  if (
    !validId(v.id) ||
    !integer(v.revision, 1) ||
    !integer(v.order, 1) ||
    !title(v.title) ||
    !date(v.createdAt) ||
    !date(v.updatedAt) ||
    v.updatedAt < v.createdAt ||
    !['clue', 'quest'].includes(v.kind) ||
    !Object.hasOwn(v.kind === 'clue' ? clueStatusLabels : questStatusLabels, v.status)
  )
    fail();
  if (full && fieldsError({ ...v, body: v.body })) fail();
}
function cursor(v: unknown) {
  if (v !== null && (typeof v !== 'string' || !v || v.length > 16384)) fail();
}
function ordered(items: { id: string; order: number }[]) {
  const ids = new Set<string>();
  let prior = 0;
  for (const item of items) {
    if (ids.has(item.id) || item.order <= prior)
      fail('A ordem da preparação não pôde ser confirmada.');
    ids.add(item.id);
    prior = item.order;
  }
}
export function validateItemPage(
  v: PreparationItemPage,
  uid: string,
  input: ListPreparationItemsInput,
  minimum = 0,
): void {
  keys(v, [...identityKeys, 'itemCollectionRevision', 'items', 'nextCursor']);
  validateIdentity(v, uid, input.campaignId, input.campaignToken);
  if (
    !integer(v.itemCollectionRevision, minimum) ||
    !Array.isArray(v.items) ||
    v.items.length > (input.limit ?? 25)
  )
    fail();
  for (const item of v.items) {
    validateSummary(item);
    if (item.kind !== input.kind || (input.view === 'pending' && !isPreparationPending(item)))
      fail();
  }
  ordered(v.items);
  cursor(v.nextCursor);
}
export function validateItemResult(
  v: PreparationItemResult,
  uid: string,
  input: GetPreparationItemInput,
  minimum = 0,
): void {
  keys(v, [...identityKeys, 'itemCollectionRevision', 'item']);
  validateIdentity(v, uid, input.campaignId, input.campaignToken);
  if (!integer(v.itemCollectionRevision, minimum)) fail();
  validateSummary(v.item, true);
  if (v.item.id !== input.itemId || v.item.revision !== input.expectedRevision)
    fail('O item mudou. Seu rascunho foi preservado.');
}
export function validateLinkPage(
  v: PreparationLinkPage,
  uid: string,
  input: PreparationSessionScope,
  minimumItems = 0,
  minimumLinks = 0,
): void {
  keys(v, [
    ...identityKeys,
    'sessionId',
    'sessionRevision',
    'itemCollectionRevision',
    'linkCollectionRevision',
    'items',
    'nextCursor',
  ]);
  validateIdentity(v, uid, input.campaignId, input.campaignToken);
  if (
    v.sessionId !== input.sessionId ||
    v.sessionRevision !== input.expectedSessionRevision ||
    !integer(v.itemCollectionRevision, minimumItems) ||
    !integer(v.linkCollectionRevision, minimumLinks) ||
    !Array.isArray(v.items) ||
    v.items.length > 50
  )
    fail();
  for (const item of v.items) {
    keys(
      item,
      item.available
        ? ['id', 'revision', 'order', 'createdAt', 'updatedAt', 'available', 'target']
        : ['id', 'revision', 'order', 'createdAt', 'updatedAt', 'available'],
    );
    if (
      typeof item.available !== 'boolean' ||
      !validId(item.id) ||
      !integer(item.revision, 1) ||
      !integer(item.order, 1) ||
      !date(item.createdAt) ||
      !date(item.updatedAt) ||
      item.updatedAt < item.createdAt
    )
      fail();
    if (item.available) validateSummary(item.target);
  }
  ordered(v.items);
  cursor(v.nextCursor);
}
const commonItem = [
  'campaignId',
  'campaignToken',
  'operationId',
  'itemId',
  'expectedRevision',
  'expectedItemCollectionRevision',
];
const commonLink = [
  'campaignId',
  'campaignToken',
  'sessionId',
  'expectedSessionRevision',
  'operationId',
  'linkId',
  'expectedRevision',
  'expectedLinkCollectionRevision',
];
export function validateRequest(value: PreparationRequest, cid: string): void {
  const r = value.request;
  if (
    !r ||
    r.campaignId !== cid ||
    !validId(cid) ||
    !token(r.campaignToken) ||
    !operationId(r.operationId) ||
    !integer(r.expectedRevision)
  )
    fail();
  if (
    value.action === 'save-item' ||
    value.action === 'delete-item' ||
    value.action === 'move-item'
  ) {
    keys(
      r,
      value.action === 'save-item'
        ? [...commonItem, 'kind', 'title', 'status', 'body']
        : value.action === 'move-item'
          ? [...commonItem, 'direction']
          : commonItem,
    );
    if (!validId(r.itemId) || !integer(r.expectedItemCollectionRevision)) fail();
    if (value.action === 'save-item') {
      const s = value.request;
      if (
        fieldsError(s) ||
        s.title !== s.title.trim() ||
        (s.expectedRevision === 0 &&
          (s.itemId !== s.operationId ||
            s.status !== (s.kind === 'clue' ? 'pending' : 'available')))
      )
        fail();
    } else if (!integer(r.expectedRevision, 1)) fail();
    if (value.action === 'move-item' && !['up', 'down'].includes(value.request.direction)) fail();
  } else if (
    value.action === 'add-link' ||
    value.action === 'remove-link' ||
    value.action === 'move-link'
  ) {
    keys(
      r,
      value.action === 'add-link'
        ? [...commonLink, 'itemId', 'expectedItemRevision']
        : value.action === 'move-link'
          ? [...commonLink, 'direction']
          : commonLink,
    );
    if (
      !validId(r.linkId) ||
      !validId(r.sessionId) ||
      !integer(r.expectedSessionRevision, 1) ||
      !integer(r.expectedLinkCollectionRevision)
    )
      fail();
    if (value.action === 'add-link') {
      if (
        r.expectedRevision !== 0 ||
        r.linkId !== r.operationId ||
        !validId(value.request.itemId) ||
        !integer(value.request.expectedItemRevision, 1)
      )
        fail();
    } else if (!integer(r.expectedRevision, 1)) fail();
    if (value.action === 'move-link' && !['up', 'down'].includes(value.request.direction)) fail();
  } else fail();
}
export function validatePending(v: PendingCampaignPreparation, uid: string, cid: string): void {
  keys(v, ['schemaVersion', 'ownerId', 'intent', 'action', 'request']);
  if (v.schemaVersion !== 1 || v.ownerId !== uid || !['apply', 'cancel'].includes(v.intent)) fail();
  validateRequest(v, cid);
}
export function validateOutcome(v: PreparationOutcome, p: PendingCampaignPreparation): void {
  keys(
    v,
    v.kind === 'confirmed'
      ? [...identityKeys, 'kind', 'receipt']
      : [...identityKeys, 'kind', 'action', 'operationId'],
  );
  validateIdentity(v, p.ownerId, p.request.campaignId, p.request.campaignToken);
  if (v.kind === 'canceled') {
    if (v.action !== p.action || v.operationId !== p.request.operationId) fail();
    return;
  }
  if (v.kind !== 'confirmed') fail();
  const r = v.receipt,
    request = p.request;
  if (p.action === 'save-item' || p.action === 'delete-item' || p.action === 'move-item') {
    const request = p.request;
    keys(r, [
      'operationId',
      'action',
      'itemId',
      'expectedRevision',
      'revision',
      'itemCollectionRevision',
    ]);
    if (
      !('itemId' in r) ||
      r.itemId !== request.itemId ||
      r.itemCollectionRevision !== request.expectedItemCollectionRevision + 1
    )
      fail();
  } else {
    const request = p.request;
    keys(r, [
      'operationId',
      'action',
      'linkId',
      'sessionId',
      'expectedSessionRevision',
      'expectedRevision',
      'revision',
      'linkCollectionRevision',
    ]);
    if (
      !('linkId' in r) ||
      r.linkId !== request.linkId ||
      r.sessionId !== request.sessionId ||
      r.expectedSessionRevision !== request.expectedSessionRevision ||
      r.linkCollectionRevision !== request.expectedLinkCollectionRevision + 1
    )
      fail();
  }
  if (
    r.operationId !== request.operationId ||
    r.action !== p.action ||
    r.expectedRevision !== request.expectedRevision ||
    r.revision !== request.expectedRevision + 1
  )
    fail();
}
export function deletedCampaignError(cause: unknown, cid: string): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const v = cause as {
    code?: unknown;
    details?: { reason?: unknown; campaignId?: unknown; deletionId?: unknown };
  };
  return (
    v.code === 'functions/failed-precondition' &&
    ['campaign-deleting', 'campaign-deleted'].includes(String(v.details?.reason)) &&
    v.details?.campaignId === cid &&
    operationId(v.details?.deletionId)
  );
}
export const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Não foi possível confirmar a preparação. O pedido foi preservado.';
export const newOperationId = () => crypto.randomUUID();
export const normalizedSave = (v: SavePreparationItemInput): SavePreparationItemInput => ({
  ...v,
  title: v.title.trim(),
});
