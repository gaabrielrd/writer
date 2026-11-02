import type {
  AdventureDeletionSource as Source,
  AdventureDeletionIdentity as Identity,
  AdventureDeletionFloor as Floor,
  AdventureDeletionProgress as Progress,
  AdventureDeletionControl as Control,
  AdventureDeletionPending as Pending,
  AdventureDeletionLookup as Lookup,
  AdventureDeletionPage as Page,
  AdventureDeletionMutation as Mutation,
  AdventureDeletionCanceled as Canceled,
} from './adventureDeletion';

export const phaseLabels = {
  quiescence: 'Encerrando preparações',
  media: 'Conferindo mídia',
  images: 'Desvinculando imagens',
  children: 'Removendo conteúdo',
  controls: 'Retirando conteúdo derivado do chat',
  activity: 'Atualizando retomada',
  verify: 'Conferindo exclusão',
  complete: 'Concluída',
};
export function fail(message = 'A resposta da exclusão não pôde ser confirmada.'): never {
  throw new Error(message);
}
export const canonical = (v: unknown): string =>
  JSON.stringify(v, (_key, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
export function budget(v: unknown): void {
  const text = JSON.stringify(v);
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 1024 * 1024) fail();
}
export function closed(
  v: unknown,
  expected: readonly string[],
): asserts v is Record<string, unknown> {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).length !== expected.length ||
    expected.some((k) => !Object.hasOwn(v, k))
  )
    fail();
}
const wellFormed = (v: string) =>
  Array.from(v).every(
    (c) => c.length === 2 || c.charCodeAt(0) < 0xd800 || c.charCodeAt(0) > 0xdfff,
  );
export const nativeId = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  wellFormed(v) &&
  !v.includes('/') &&
  !['.', '..'].includes(v) &&
  new TextEncoder().encode(v).byteLength <= 1500;
export const operationId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(v);
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const date = (v: unknown): v is number => integer(v) && v <= 8640000000000000;
const title = (v: unknown) =>
  typeof v === 'string' && !!v.trim() && wellFormed(v) && v.length <= 300;
const identityKeys = [
  'schemaVersion',
  'ownerId',
  'adventureId',
  'adventureToken',
  'deletionId',
  'deletionToken',
] as const;
const floorKeys = [
  'checkpoint',
  'deletedDocuments',
  'createdAt',
  'updatedAt',
  'complete',
  'phase',
] as const;
export function assertScope(uid: string, adventureId: string): void {
  if (!nativeId(uid) || !nativeId(adventureId)) fail('A conta ou a aventura está indisponível.');
}
export function identityOf(p: Progress): Identity {
  return {
    schemaVersion: 1,
    ownerId: p.ownerId,
    adventureId: p.adventureId,
    adventureToken: p.adventureToken,
    deletionId: p.deletionId,
    deletionToken: p.deletionToken,
  };
}
export function floorOf(p: Progress): Floor {
  return {
    checkpoint: p.checkpoint,
    deletedDocuments: p.deletedDocuments,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    complete: p.complete,
    phase: p.phase,
  };
}
export function readIdentity(
  value: unknown,
  uid: string,
  expected: Partial<Identity> = {},
): Identity {
  closed(value, identityKeys);
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    !nativeId(value.ownerId) ||
    !nativeId(value.adventureId) ||
    !operationId(value.deletionId) ||
    !hash(value.adventureToken) ||
    !hash(value.deletionToken) ||
    Object.entries(expected).some(([k, v]) => value[k] !== v)
  )
    fail();
  return structuredClone(value) as unknown as Identity;
}
export function readFloor(value: unknown): Floor {
  closed(value, floorKeys);
  if (
    !integer(value.checkpoint) ||
    !integer(value.deletedDocuments) ||
    !date(value.createdAt) ||
    !date(value.updatedAt) ||
    value.updatedAt < value.createdAt ||
    typeof value.complete !== 'boolean' ||
    typeof value.phase !== 'string' ||
    !Object.hasOwn(phaseLabels, value.phase) ||
    value.complete !== (value.phase === 'complete') ||
    (value.checkpoint === 0 &&
      (value.phase !== 'quiescence' ||
        value.deletedDocuments !== 0 ||
        value.updatedAt !== value.createdAt))
  )
    fail();
  return structuredClone(value) as unknown as Floor;
}
export function checkFloor(next: Floor, previous: Floor): void {
  if (
    next.checkpoint < previous.checkpoint ||
    next.deletedDocuments < previous.deletedDocuments ||
    next.createdAt !== previous.createdAt ||
    next.updatedAt < previous.updatedAt ||
    (previous.complete && canonical(next) !== canonical(previous)) ||
    (next.checkpoint === previous.checkpoint && canonical(next) !== canonical(previous))
  )
    fail('O progresso recebido retrocedeu. O pedido foi preservado.');
}
export function readSource(value: unknown, uid: string, adventureId: string): Source | null {
  assertScope(uid, adventureId);
  budget(value);
  if (value === null) return null;
  closed(value, [
    'schemaVersion',
    'ownerId',
    'adventureId',
    'adventureToken',
    'sourceToken',
    'revision',
    'title',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.adventureId !== adventureId ||
    !hash(value.adventureToken) ||
    !hash(value.sourceToken) ||
    !integer(value.revision) ||
    value.revision < 1 ||
    !title(value.title)
  )
    fail();
  return structuredClone(value) as unknown as Source;
}
export function readProgress(
  value: unknown,
  uid: string,
  expected: Partial<Identity> = {},
  floor?: Floor,
): Progress {
  budget(value);
  closed(value, [...identityKeys, ...floorKeys, 'title', 'state', 'revoked']);
  readIdentity(Object.fromEntries(identityKeys.map((k) => [k, value[k]])), uid, expected);
  const next = readFloor(Object.fromEntries(floorKeys.map((k) => [k, value[k]])));
  if (
    !title(value.title) ||
    !['deleting', 'deleted'].includes(value.state as string) ||
    (value.state === 'deleted') !== next.complete ||
    value.revoked !== true
  )
    fail();
  if (floor) checkFloor(next, floor);
  return structuredClone(value) as unknown as Progress;
}
export function adventureOf(v: Control): string {
  return v.kind === 'start' ? v.input.adventureId : v.identity.adventureId;
}
export function readControl(raw: unknown, uid: string, adventureId: string): Control {
  assertScope(uid, adventureId);
  budget(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    fail('O controle local inválido foi preservado.');
  const value = raw as Record<string, unknown>;
  if (!Object.hasOwn(value, 'kind')) fail('O controle local inválido foi preservado.');
  if (value.kind === 'start') {
    closed(value, ['schemaVersion', 'ownerId', 'kind', 'phase', 'input']);
    closed(value.input, [
      'adventureId',
      'adventureToken',
      'sourceToken',
      'expectedRevision',
      'operationId',
    ]);
    const i = value.input;
    if (
      i.adventureId !== adventureId ||
      !hash(i.adventureToken) ||
      !hash(i.sourceToken) ||
      !integer(i.expectedRevision) ||
      i.expectedRevision < 1 ||
      !operationId(i.operationId) ||
      !['request', 'cancel-start'].includes(value.phase as string)
    )
      fail();
  } else {
    closed(
      value,
      value.kind === 'step'
        ? ['schemaVersion', 'ownerId', 'kind', 'identity', 'floor', 'input']
        : ['schemaVersion', 'ownerId', 'kind', 'identity', 'floor'],
    );
    if (!['step', 'known'].includes(value.kind as string)) fail();
    const identity = readIdentity(value.identity, uid, { adventureId }),
      floor = readFloor(value.floor);
    if (value.kind === 'step') {
      closed(value.input, ['deletionId', 'deletionToken', 'expectedCheckpoint', 'operationId']);
      const i = value.input;
      if (
        i.deletionId !== identity.deletionId ||
        i.deletionToken !== identity.deletionToken ||
        i.expectedCheckpoint !== floor.checkpoint ||
        !operationId(i.operationId) ||
        floor.complete ||
        !Number.isSafeInteger(floor.checkpoint + 1)
      )
        fail();
    }
  }
  const v = value as unknown as Control;
  if (v.schemaVersion !== 1 || v.ownerId !== uid) fail();
  return structuredClone(v);
}
export function readLookup(
  value: unknown,
  uid: string,
  adventureId: string,
  expected: Partial<Identity> = {},
  floor?: Floor,
): Lookup {
  assertScope(uid, adventureId);
  budget(value);
  closed(value, ['schemaVersion', 'ownerId', 'lookup', 'deletion']);
  closed(value.lookup, ['adventureId']);
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.lookup.adventureId !== adventureId
  )
    fail();
  if (value.deletion !== null)
    readProgress(value.deletion, uid, { ...expected, adventureId }, floor);
  return structuredClone(value) as unknown as Lookup;
}
export function readMutation(value: unknown, pending: Pending): Mutation {
  budget(value);
  closed(value, ['receipt', 'progress']);
  const op = readControl(pending, pending.ownerId, adventureOf(pending));
  if (op.kind === 'known') fail();
  closed(value.receipt, ['operationId', 'action', 'expectedCheckpoint', 'confirmedCheckpoint']);
  const r = value.receipt,
    previous = op.kind === 'step' ? op.input.expectedCheckpoint : null,
    expected =
      op.kind === 'start'
        ? {
            adventureId: op.input.adventureId,
            adventureToken: op.input.adventureToken,
            deletionId: op.input.operationId,
          }
        : op.identity;
  if (
    r.operationId !== op.input.operationId ||
    r.action !== (op.kind === 'start' ? 'start' : 'advance') ||
    r.expectedCheckpoint !== previous ||
    !integer(r.confirmedCheckpoint) ||
    r.confirmedCheckpoint !== (previous === null ? 0 : previous + 1)
  )
    fail('O recibo não confirma o pedido preservado.');
  const p = readProgress(
    value.progress,
    op.ownerId,
    expected,
    op.kind === 'step' ? op.floor : undefined,
  );
  if (p.checkpoint < r.confirmedCheckpoint) fail();
  return structuredClone(value) as unknown as Mutation;
}
export function readCanceled(value: unknown, pending: Pending): Canceled {
  budget(value);
  closed(value, ['schemaVersion', 'ownerId', 'kind', 'request']);
  if (
    pending.kind !== 'start' ||
    value.schemaVersion !== 1 ||
    value.ownerId !== pending.ownerId ||
    value.kind !== 'canceled' ||
    canonical(value.request) !== canonical(pending.input)
  )
    fail();
  return structuredClone(value) as unknown as Canceled;
}
export function readPage(value: unknown, uid: string, limit = 25, seen = new Set<string>()): Page {
  budget(value);
  closed(value, ['schemaVersion', 'ownerId', 'items', 'nextCursor']);
  if (
    !nativeId(uid) ||
    !integer(limit) ||
    limit < 1 ||
    limit > 50 ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    !Array.isArray(value.items) ||
    value.items.length > limit
  )
    fail();
  const ids = new Set<string>(),
    projects = new Set<string>();
  for (const item of value.items) {
    const p = readProgress(item, uid);
    if (ids.has(p.deletionId) || projects.has(p.adventureId)) fail();
    ids.add(p.deletionId);
    projects.add(p.adventureId);
  }
  const cursor = value.nextCursor;
  if (
    cursor !== null &&
    (typeof cursor !== 'string' ||
      !/^[A-Za-z0-9_-]{1,4096}$/.test(cursor) ||
      seen.has(cursor) ||
      value.items.length === 0)
  )
    fail('A paginação mudou. Consulte a lista novamente.');
  return structuredClone(value) as unknown as Page;
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
