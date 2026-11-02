import type {
  DeletionSource,
  DeletionIdentity,
  DeletionProgress,
  DeletionPending,
  DeletionMutation,
  DeletionStartCanceled,
  DeletionLookup,
  DeletionLookupInput,
  DeletionControl,
} from '../model/campaignDeletion';
export * from './campaignDeletionCallables';
export const canonical = (v: unknown): string =>
  JSON.stringify(v, (_key, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
export function fail(message = 'A resposta da exclusão não pôde ser confirmada.'): never {
  throw new Error(message);
}
export function keys(v: unknown, expected: string[]): void {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).length !== expected.length ||
    expected.some((k) => !Object.hasOwn(v, k))
  )
    fail();
}
const id = (v: unknown) =>
  typeof v === 'string' && v.length > 0 && v.length <= 300 && !v.includes('/');
const hex = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const identityKeys = ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken', 'deletionId'];
export function identityOf(p: DeletionProgress): DeletionIdentity {
  return {
    schemaVersion: 1,
    ownerId: p.ownerId,
    campaignId: p.campaignId,
    campaignToken: p.campaignToken,
    deletionId: p.deletionId,
  };
}
export function validateIdentity(
  v: DeletionIdentity,
  uid: string,
  expected: Partial<DeletionIdentity> = {},
): void {
  keys(v, identityKeys);
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== uid ||
    ![v.ownerId, v.campaignId, v.deletionId].every(id) ||
    !hex(v.campaignToken) ||
    Object.entries(expected).some(([k, x]) => v[k as keyof DeletionIdentity] !== x)
  )
    fail();
}
export function validateSource(v: DeletionSource | null, uid: string, campaignId: string): void {
  if (v === null) return;
  keys(v, ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken', 'revision', 'title']);
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== uid ||
    v.campaignId !== campaignId ||
    !hex(v.campaignToken) ||
    !integer(v.revision) ||
    v.revision < 1 ||
    typeof v.title !== 'string' ||
    v.title.length > 300
  )
    fail();
}
export const phaseLabels = {
  recovery: 'Recuperações preservadas',
  controls: 'Preparações e candidatas',
  bases: 'Bases capturadas',
  'lore-generations': 'Versões do lore da mesa',
  'campaign-children': 'Notas e preparação',
  activity: 'Retomada',
  finalizing: 'Conferência final',
  complete: 'Concluída',
};
export function validateProgress(
  v: DeletionProgress,
  uid: string,
  expected: Partial<DeletionIdentity> = {},
  floor = 0,
): void {
  keys(v, [
    ...identityKeys,
    'state',
    'phase',
    'checkpoint',
    'complete',
    'revoked',
    'createdAt',
    'updatedAt',
  ]);
  validateIdentity(identityOf(v), uid, expected);
  if (
    !integer(v.checkpoint) ||
    v.checkpoint < floor ||
    v.revoked !== true ||
    !Object.hasOwn(phaseLabels, v.phase) ||
    !['deleting', 'deleted'].includes(v.state) ||
    v.complete !== (v.state === 'deleted' && v.phase === 'complete') ||
    (v.state === 'deleted') !== (v.phase === 'complete') ||
    !integer(v.createdAt) ||
    !integer(v.updatedAt) ||
    v.updatedAt < v.createdAt ||
    v.updatedAt > 8640000000000000
  )
    fail();
}
export function validateLookup(v: DeletionLookup, uid: string, input: DeletionLookupInput): void {
  keys(v, ['schemaVersion', 'ownerId', 'lookup', 'deletion']);
  if (v.schemaVersion !== 1 || v.ownerId !== uid || canonical(v.lookup) !== canonical(input))
    fail();
  if (v.deletion !== null)
    validateProgress(
      v.deletion,
      uid,
      'campaignId' in input ? { campaignId: input.campaignId } : {},
    );
}
export function validateStartInput(v: DeletionPending & { kind: 'start' }): void {
  keys(v.input, ['campaignId', 'campaignToken', 'expectedRevision', 'operationId']);
  if (
    !id(v.input.campaignId) ||
    !id(v.input.operationId) ||
    !hex(v.input.campaignToken) ||
    !integer(v.input.expectedRevision) ||
    v.input.expectedRevision < 1 ||
    !['request', 'cancel-start'].includes(v.phase)
  )
    fail();
}
export const campaignOf = (op: DeletionControl) =>
  op.kind === 'start' ? op.input.campaignId : op.identity.campaignId;
export function validateControl(v: DeletionControl, uid: string, campaignId: string): void {
  if (!v || v.schemaVersion !== 1 || v.ownerId !== uid || campaignOf(v) !== campaignId)
    fail('O controle local foi preservado porque não pôde ser validado.');
  if (v.kind === 'start') {
    keys(v, ['schemaVersion', 'ownerId', 'kind', 'phase', 'input']);
    validateStartInput(v);
  } else if (v.kind === 'step') {
    keys(v, ['schemaVersion', 'ownerId', 'kind', 'identity', 'input']);
    validateIdentity(v.identity, uid, { campaignId });
    keys(v.input, ['deletionId', 'operationId', 'expectedCheckpoint']);
    if (
      v.input.deletionId !== v.identity.deletionId ||
      !id(v.input.operationId) ||
      !integer(v.input.expectedCheckpoint)
    )
      fail();
  } else if (v.kind === 'known') {
    keys(v, ['schemaVersion', 'ownerId', 'kind', 'identity', 'checkpoint']);
    validateIdentity(v.identity, uid, { campaignId });
    if (!integer(v.checkpoint)) fail();
  } else fail();
}
export function validateMutation(v: DeletionMutation, op: DeletionPending, floor = 0): void {
  keys(v, ['receipt', 'progress']);
  keys(v.receipt, ['operationId', 'action', 'expectedCheckpoint', 'confirmedCheckpoint']);
  const r = v.receipt,
    n = op.kind === 'step' ? op.input.expectedCheckpoint : null,
    expected =
      op.kind === 'start'
        ? {
            campaignId: op.input.campaignId,
            campaignToken: op.input.campaignToken,
            deletionId: op.input.operationId,
          }
        : op.identity;
  if (
    r.operationId !== op.input.operationId ||
    r.action !== (op.kind === 'start' ? 'start' : 'advance') ||
    r.expectedCheckpoint !== n ||
    r.confirmedCheckpoint !== (n === null ? 0 : n + 1) ||
    !integer(r.confirmedCheckpoint)
  )
    fail('O recibo não confirma o pedido preservado.');
  validateProgress(v.progress, op.ownerId, expected, Math.max(floor, r.confirmedCheckpoint));
}
export function validateCanceled(v: DeletionStartCanceled, op: DeletionPending): void {
  keys(v, ['kind', 'schemaVersion', 'ownerId', 'request']);
  if (
    op.kind !== 'start' ||
    v.kind !== 'canceled' ||
    v.schemaVersion !== 1 ||
    v.ownerId !== op.ownerId ||
    canonical(v.request) !== canonical(op.input)
  )
    fail();
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
export function message(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'Não foi possível confirmar a exclusão. Preserve o pedido e tente novamente.';
}
export function validateCursor(v: unknown, seen?: Set<string>): asserts v is string | null {
  if (v !== null && (typeof v !== 'string' || !v || v.length > 12000 || seen?.has(v)))
    fail('A paginação mudou. Consulte a lista novamente.');
}
export function budget(v: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(v)).byteLength > 4 * 1024 * 1024) fail();
}
