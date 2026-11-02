import * as api from './adventureLoreCallables';
import type {
  AdventureLoreAction,
  AdventureLoreDetail,
  AdventureLoreEntityInput,
  AdventureLoreGet,
  AdventureLoreGetInput,
  AdventureLoreIdentity,
  AdventureLoreList,
  AdventureLoreListInput,
  AdventureLoreOutcome,
  AdventureLorePending,
  AdventureLoreSave,
  AdventureLoreSummary,
  AdventureLoreWrite,
} from '../model/adventureLore';
export * from './adventureLoreCallables';
export const loreMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Não foi possível consultar o lore. Tente novamente.';
export function invalidLore(message = 'O contexto de lore não pôde ser confirmado.'): never {
  throw new Error(message);
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
const text = (v: unknown, max: number, required = false, trim = false): string => {
  if (typeof v !== 'string' || v.length > max || decoder.decode(encoder.encode(v)) !== v)
    return invalidLore('Texto de lore inválido.');
  const result = trim ? v.trim() : v;
  if (required && !result) return invalidLore('Preencha nome e resumo.');
  return result;
};
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return invalidLore();
  return v as Record<string, unknown>;
};
const exact = (v: unknown, keys: string[]) => {
  const r = object(v);
  if (Object.keys(r).length !== keys.length || !keys.every((k) => Object.hasOwn(r, k)))
    invalidLore();
  return r;
};
const int = (v: unknown, min = 0) => Number.isSafeInteger(v) && Number(v) >= min;
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(v);
const token = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const categories = ['character', 'location', 'concept', 'other'];
const structuredKeys = ['appearance', 'personality', 'history', 'notes'];
const summaryKeys = [
  'id',
  'reference',
  'entityToken',
  'name',
  'aliases',
  'category',
  'summary',
  'isPublic',
  'createdAt',
  'updatedAt',
];
const identityKeys = ['schemaVersion', 'ownerId', 'adventureId', 'adventureToken'];
export function normalizeAdventureLoreEntity(value: unknown): AdventureLoreEntityInput {
  const v = exact(value, [
    'name',
    'aliases',
    'category',
    'summary',
    'details',
    'structuredDetails',
    'relations',
    'isPublic',
  ]);
  if (
    v.isPublic !== false ||
    !categories.includes(String(v.category)) ||
    !Array.isArray(v.aliases) ||
    v.aliases.length > 20 ||
    !Array.isArray(v.relations) ||
    v.relations.length > 50
  )
    invalidLore('Ficha de lore inválida.');
  const details = exact(v.structuredDetails, structuredKeys);
  const result: AdventureLoreEntityInput = {
    name: text(v.name, 200, true, true),
    aliases: (v.aliases as unknown[]).map((a) => text(a, 200, true, true)),
    category: v.category as AdventureLoreEntityInput['category'],
    summary: text(v.summary, 140, true, true),
    details: text(v.details, 150000),
    structuredDetails: {
      appearance: text(details.appearance, 150000),
      personality: text(details.personality, 150000),
      history: text(details.history, 150000),
      notes: text(details.notes, 150000),
    },
    relations: (v.relations as unknown[]).map((value) => {
      const r = exact(value, ['targetEntityId', 'relationType', 'description']);
      relationReference(r.targetEntityId);
      return {
        targetEntityId: String(r.targetEntityId),
        relationType: text(r.relationType, 200, true, true),
        description: text(r.description, 4000),
      };
    }),
    isPublic: false,
  };
  if (encoder.encode(JSON.stringify(result)).length > 900000)
    invalidLore('A ficha ultrapassa o limite de 900.000 bytes.');
  return result;
}
export function relationReference(value: unknown) {
  if (typeof value !== 'string') return invalidLore();
  const [kind, scopeId, entityId, ...rest] = value.split(':');
  if (
    rest.length ||
    !kind ||
    !['adventure', 'universe'].includes(kind) ||
    !scopeId ||
    !entityId ||
    [scopeId, entityId].some(
      (v) => v.includes('/') || ['.', '..'].includes(v) || encoder.encode(v).length > 1500,
    ) ||
    (kind === 'adventure' && (!id(scopeId) || !id(entityId)))
  )
    return invalidLore();
  return { kind: kind as 'adventure' | 'universe', scopeId, entityId };
}
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sorted(v)]),
    );
  return value;
}
export async function adventureLoreRequestHash(
  action: AdventureLoreAction,
  request: AdventureLoreSave | AdventureLoreWrite,
): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(JSON.stringify(sorted({ action, request }))),
  );
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export async function prepareAdventureLoreOperation(
  action: AdventureLoreAction,
  input: AdventureLoreSave | AdventureLoreWrite,
): Promise<AdventureLorePending> {
  const allowed = [
    'adventureId',
    'adventureToken',
    'entityId',
    'operationId',
    'expectedRevision',
    'expectedCollectionRevision',
    ...(action === 'save' ? ['entity'] : []),
  ];
  exact(input, allowed);
  if (
    !id(input.adventureId) ||
    !token(input.adventureToken) ||
    !id(input.entityId) ||
    !id(input.operationId) ||
    !int(input.expectedRevision) ||
    !int(input.expectedCollectionRevision) ||
    (action === 'delete' && !input.expectedRevision) ||
    (action === 'save' && !input.expectedRevision && input.entityId !== input.operationId)
  )
    invalidLore();
  const request = structuredClone(input);
  if (action === 'save')
    (request as AdventureLoreSave).entity = normalizeAdventureLoreEntity(
      (input as AdventureLoreSave).entity,
    );
  if (encoder.encode(JSON.stringify(request)).length > 900000)
    invalidLore('O pedido ultrapassa o limite de 900.000 bytes.');
  return { action, request, requestHash: await adventureLoreRequestHash(action, request) };
}
export function validateAdventureLoreIdentity(
  value: AdventureLoreIdentity,
  uid: string,
  adventureId: string,
  expectedToken?: string,
) {
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.adventureId !== adventureId ||
    !token(value.adventureToken) ||
    (expectedToken !== undefined && value.adventureToken !== expectedToken)
  )
    invalidLore();
}
function summary(
  value: AdventureLoreSummary,
  adventureId: string,
  full = false,
): AdventureLoreSummary {
  const r = object(value.reference);
  exact(r, ['kind', 'scopeId', 'entityId']);
  if (typeof r.kind !== 'string' || typeof r.scopeId !== 'string' || typeof r.entityId !== 'string')
    invalidLore();
  const reference = relationReference(r.kind + ':' + r.scopeId + ':' + r.entityId);
  const local = reference.kind === 'adventure';
  if (local && reference.scopeId !== adventureId) invalidLore();
  const keys = [
    ...summaryKeys,
    ...(local
      ? ['revision', 'relationCount']
      : Object.hasOwn(value, 'relationCount')
        ? ['relationCount']
        : []),
    ...(full ? ['details', 'structuredDetails', 'relations'] : []),
  ];
  exact(value, keys);
  if (
    value.id !== reference.kind + ':' + reference.scopeId + ':' + reference.entityId ||
    !token(value.entityToken) ||
    !categories.includes(value.category) ||
    typeof value.isPublic !== 'boolean' ||
    (local && value.isPublic !== false) ||
    !int(value.createdAt) ||
    !int(value.updatedAt) ||
    value.updatedAt < value.createdAt ||
    value.updatedAt > 8640000000000000 ||
    (local && !int(value.revision, 1)) ||
    (value.relationCount !== undefined && (!int(value.relationCount) || value.relationCount > 50))
  )
    invalidLore();
  text(value.name, 200, true);
  text(value.summary, 140, true);
  if (!Array.isArray(value.aliases) || value.aliases.length > 20) invalidLore();
  value.aliases.forEach((a) => text(a, 200, true));
  return {
    ...value,
    ...(local ? { adventureId: reference.scopeId } : { universeId: reference.scopeId }),
  };
}
export function validateAdventureLoreList(
  value: AdventureLoreList,
  uid: string,
  input: AdventureLoreListInput,
): AdventureLoreList {
  exact(value, [
    ...identityKeys,
    'scope',
    'collectionRevision',
    'contextToken',
    'items',
    'nextCursor',
  ]);
  validateAdventureLoreIdentity(value, uid, input.adventureId, input.adventureToken);
  if (
    value.scope !== input.scope ||
    !int(value.collectionRevision) ||
    !token(value.contextToken) ||
    !Array.isArray(value.items) ||
    value.items.length > (input.limit ?? 25) ||
    (value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !value.nextCursor))
  )
    invalidLore();
  const ids = new Set<string>();
  const items = value.items.map((v) => {
    if (
      v.reference.kind !== input.scope ||
      ids.has(v.id) ||
      (input.category && v.category !== input.category)
    )
      invalidLore();
    ids.add(v.id);
    return summary(v, input.adventureId);
  });
  if (encoder.encode(JSON.stringify(value)).length > 4 * 1024 * 1024) invalidLore();
  return { ...value, items };
}
export function validateAdventureLoreGet(
  value: AdventureLoreGet,
  uid: string,
  input: AdventureLoreGetInput,
): AdventureLoreGet {
  exact(value, [...identityKeys, 'collectionRevision', 'contextToken', 'item']);
  validateAdventureLoreIdentity(value, uid, input.adventureId, input.adventureToken);
  if (
    !int(value.collectionRevision) ||
    value.contextToken !== input.expectedContextToken ||
    value.item.reference.kind !== input.reference.kind ||
    value.item.reference.scopeId !== input.reference.scopeId ||
    value.item.reference.entityId !== input.reference.entityId ||
    value.item.entityToken !== input.expectedEntityToken
  )
    invalidLore();
  const item = summary(value.item, input.adventureId, true) as AdventureLoreDetail;
  text(item.details, 150000);
  const details = exact(item.structuredDetails, structuredKeys);
  structuredKeys.forEach((k) => text(details[k], 150000));
  if (
    !Array.isArray(item.relations) ||
    item.relations.length > 50 ||
    (item.relationCount !== undefined && item.relationCount !== item.relations.length)
  )
    invalidLore();
  item.relations.forEach((r) => {
    exact(r, ['targetEntityId', 'relationType', 'description', 'available']);
    text(r.targetEntityId, 4 * 1024 * 1024);
    if (r.available === true) relationReference(r.targetEntityId);
    text(r.relationType, 200, true);
    text(r.description, 4000);
    if (typeof r.available !== 'boolean') invalidLore();
  });
  if (encoder.encode(JSON.stringify(value)).length > 4 * 1024 * 1024) invalidLore();
  return { ...value, item };
}
export function validateAdventureLoreOutcome(
  value: AdventureLoreOutcome,
  uid: string,
  pending: AdventureLorePending,
) {
  const r = pending.request;
  exact(value, [
    ...identityKeys,
    ...(value.kind === 'confirmed' ? ['kind', 'receipt'] : ['kind', 'action', 'operationId']),
  ]);
  validateAdventureLoreIdentity(value, uid, r.adventureId, r.adventureToken);
  if (value.kind === 'confirmed') {
    const receipt = exact(value.receipt, [
      'operationId',
      'action',
      'entityId',
      'expectedRevision',
      'revision',
      'collectionRevision',
    ]);
    if (
      receipt.operationId !== r.operationId ||
      receipt.action !== pending.action ||
      receipt.entityId !== r.entityId ||
      receipt.expectedRevision !== r.expectedRevision ||
      receipt.revision !== r.expectedRevision + 1 ||
      receipt.collectionRevision !== r.expectedCollectionRevision + 1
    )
      invalidLore();
  } else if (
    value.kind !== 'canceled' ||
    value.action !== pending.action ||
    value.operationId !== r.operationId
  )
    invalidLore();
  return value;
}
export function sendAdventureLoreOperation(p: AdventureLorePending) {
  return p.action === 'save'
    ? api.saveAdventureLore(p.request as AdventureLoreSave)
    : api.deleteAdventureLore(p.request);
}
export function cancelAdventureLoreOperation(p: AdventureLorePending) {
  const { entity: _entity, ...header } = p.request as AdventureLoreSave;
  void _entity;
  return api.resolveAdventureLoreOperation({
    ...header,
    action: p.action,
    requestHash: p.requestHash,
    intent: 'cancel',
  });
}
