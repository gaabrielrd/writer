export { adventureIdentityToken } from './campaignLoreOrigin.mjs';
import { validateId } from './generation.mjs';
import {
  workClosed as closed,
  workFail as fail,
  workId,
  workRevision,
  digest,
  workLimit as limit,
  workConflict as conflict,
} from './workProgressContracts.mjs';
import { utf8, safe, token } from './campaignSessionsContracts.mjs';
export { closed, fail, workId, workRevision, digest, limit, conflict, utf8, safe, token };
export const categories = ['character', 'location', 'concept', 'other'];
export const structuredKeys = ['appearance', 'personality', 'history', 'notes'];
export const entityKeys = [
  'name',
  'aliases',
  'category',
  'summary',
  'details',
  'structuredDetails',
  'relations',
  'isPublic',
];
export const metadataFields = [
  'schemaVersion',
  'ownerId',
  'adventureId',
  'adventureToken',
  'entityId',
  'revision',
  'name',
  'aliases',
  'category',
  'summary',
  'relationCount',
  'createdAt',
  'updatedAt',
  'isPublic',
  'deleted',
];
export const bodyFields = [
  'schemaVersion',
  'ownerId',
  'adventureId',
  'adventureToken',
  'entityId',
  'revision',
  'details',
  'structuredDetails',
  'relations',
];
export const globalMetadataFields = [
  'name',
  'aliases',
  'category',
  'summary',
  'isPublic',
  'createdAt',
  'updatedAt',
  'deleting',
  'deleted',
];
export const inconsistent = () =>
  fail('failed-precondition', 'O lore da aventura está inconsistente.', 'lore-inconsistent');
export const changed = () =>
  fail(
    'failed-precondition',
    'O contexto de lore mudou. Atualize a consulta.',
    'cursor-invalidated',
  );
export const exact = (v, keys) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
export const identity = (c) => ({
  schemaVersion: 1,
  ownerId: c.uid,
  adventureId: c.adventureId,
  adventureToken: c.adventureToken,
});
export const operationPath = (uid, id) => `users/${uid}/adventureLoreOperations/${id}`;
export const fencePath = (uid, id) => `users/${uid}/adventureLoreFences/${id}`;
function text(value, max, required = false, trim = false) {
  if (!utf8(value) || value.length > max) fail('invalid-argument', 'Texto de lore inválido.');
  const result = trim ? value.trim() : value;
  if (required && !result) fail('invalid-argument', 'Preencha nome e resumo.');
  return result;
}
export function normalizeAdventureLoreEntity(entity) {
  if (
    !exact(entity, entityKeys) ||
    entity.isPublic !== false ||
    !categories.includes(entity.category) ||
    !Array.isArray(entity.aliases) ||
    entity.aliases.length > 20 ||
    !exact(entity.structuredDetails, structuredKeys) ||
    !Array.isArray(entity.relations) ||
    entity.relations.length > 50
  )
    fail('invalid-argument', 'Ficha de lore inválida.');
  const value = {
    name: text(entity.name, 200, true, true),
    aliases: entity.aliases.map((v) => text(v, 200, true, true)),
    category: entity.category,
    summary: text(entity.summary, 140, true, true),
    details: text(entity.details, 150000),
    structuredDetails: Object.fromEntries(
      structuredKeys.map((k) => [k, text(entity.structuredDetails[k], 150000)]),
    ),
    relations: entity.relations.map((r) => {
      if (!exact(r, ['targetEntityId', 'relationType', 'description']))
        fail('invalid-argument', 'Relação inválida.');
      relationReference(r.targetEntityId);
      return {
        targetEntityId: r.targetEntityId,
        relationType: text(r.relationType, 200, true, true),
        description: text(r.description, 4000),
      };
    }),
    isPublic: false,
  };
  if (Buffer.byteLength(JSON.stringify(value)) > 900000)
    fail('invalid-argument', 'A ficha ultrapassa o limite de 900.000 bytes.');
  return value;
}
export function relationReference(value) {
  if (typeof value !== 'string') fail('invalid-argument', 'Destino da relação inválido.');
  const parts = value.split(':');
  if (parts.length !== 3 || !['adventure', 'universe'].includes(parts[0]))
    fail('invalid-argument', 'Destino da relação inválido.');
  const reference = { kind: parts[0], scopeId: workId(parts[1]), entityId: workId(parts[2]) };
  if (reference.kind === 'adventure') {
    validateId(reference.scopeId);
    validateId(reference.entityId);
  }
  return reference;
}
export function referenceInput(value) {
  if (
    !exact(value, ['kind', 'scopeId', 'entityId']) ||
    !['adventure', 'universe'].includes(value.kind)
  )
    fail('invalid-argument', 'Referência inválida.');
  workId(value.scopeId);
  workId(value.entityId);
  if (value.kind === 'adventure') {
    validateId(value.scopeId);
    validateId(value.entityId);
  }
  return { kind: value.kind, scopeId: value.scopeId, entityId: value.entityId };
}
export const canonicalId = (r) => r.kind + ':' + r.scopeId + ':' + r.entityId;
export function scopeInput(uid, data, keys, optionalToken = false) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
  workId(uid);
  closed(data, ['adventureId', 'adventureToken', ...keys]);
  validateId(data.adventureId);
  if (!optionalToken || data.adventureToken !== undefined) token(data.adventureToken);
}
export function mutationInput(uid, data, action) {
  if (!['save', 'delete'].includes(action)) fail('invalid-argument', 'Ação inválida.');
  const keys = [
    'entityId',
    'operationId',
    'expectedRevision',
    'expectedCollectionRevision',
    ...(action === 'save' ? ['entity'] : []),
  ];
  scopeInput(uid, data, keys);
  validateId(data.entityId);
  validateId(data.operationId);
  workRevision(data.expectedRevision);
  workRevision(data.expectedCollectionRevision);
  if (action === 'delete' && !data.expectedRevision) fail('invalid-argument', 'Revisão inválida.');
  if (action === 'save' && !data.expectedRevision && data.entityId !== data.operationId)
    fail('invalid-argument', 'A identidade da criação deve ser a operação.');
  const result = {
    adventureId: data.adventureId,
    adventureToken: data.adventureToken,
    entityId: data.entityId,
    operationId: data.operationId,
    expectedRevision: data.expectedRevision,
    expectedCollectionRevision: data.expectedCollectionRevision,
  };
  if (action === 'save') result.entity = normalizeAdventureLoreEntity(data.entity);
  if (Buffer.byteLength(JSON.stringify(result)) > 900000)
    fail('invalid-argument', 'O pedido ultrapassa o limite de 900.000 bytes.');
  return result;
}
// sceneContracts.digest hashes UTF-8 JSON with recursively sorted object keys; arrays retain order.
export const adventureLoreRequestHash = (action, request) => digest({ action, request });
export function resolverInput(uid, data) {
  scopeInput(uid, data, [
    'entityId',
    'operationId',
    'action',
    'expectedRevision',
    'expectedCollectionRevision',
    'requestHash',
    'intent',
  ]);
  validateId(data.entityId);
  validateId(data.operationId);
  workRevision(data.expectedRevision);
  workRevision(data.expectedCollectionRevision);
  token(data.requestHash);
  if (
    !['save', 'delete'].includes(data.action) ||
    data.intent !== 'cancel' ||
    (data.action === 'delete' && !data.expectedRevision) ||
    (data.action === 'save' && !data.expectedRevision && data.entityId !== data.operationId)
  )
    fail('invalid-argument', 'Resolução inválida.');
  return {
    adventureId: data.adventureId,
    adventureToken: data.adventureToken,
    entityId: data.entityId,
    operationId: data.operationId,
    expectedRevision: data.expectedRevision,
    expectedCollectionRevision: data.expectedCollectionRevision,
  };
}
export function ownRecord(v, c) {
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.ownerId !== c.uid ||
    v.adventureId !== c.adventureId ||
    v.adventureToken !== c.adventureToken
  )
    inconsistent();
}
export function storedMetadata(v, c, entityId) {
  if (!v) return null;
  ownRecord(v, c);
  const keys = v.deleted
    ? [
        'schemaVersion',
        'ownerId',
        'adventureId',
        'adventureToken',
        'entityId',
        'revision',
        'createdAt',
        'updatedAt',
        'deleted',
      ]
    : metadataFields;
  if (
    !exact(v, keys) ||
    v.entityId !== entityId ||
    !safe(v.revision, 1) ||
    v.revision > c.collectionRevision ||
    typeof v.deleted !== 'boolean' ||
    ![v.createdAt, v.updatedAt].every((n) => safe(n) && n <= 8640000000000000) ||
    v.updatedAt < v.createdAt
  )
    inconsistent();
  if (
    !v.deleted &&
    (!utf8(v.name) ||
      !v.name.trim() ||
      v.name !== v.name.trim() ||
      v.name.length > 200 ||
      !utf8(v.summary) ||
      !v.summary.trim() ||
      v.summary !== v.summary.trim() ||
      v.summary.length > 140 ||
      !categories.includes(v.category) ||
      !Array.isArray(v.aliases) ||
      v.aliases.length > 20 ||
      v.aliases.some((a) => !utf8(a) || !a.trim() || a !== a.trim() || a.length > 200) ||
      !safe(v.relationCount) ||
      v.relationCount > 50 ||
      v.isPublic !== false)
  )
    inconsistent();
  return v;
}
export function storedBody(v, c, item) {
  ownRecord(v, c);
  if (
    !exact(v, bodyFields) ||
    v.entityId !== item.entityId ||
    v.revision !== item.revision ||
    v.relations?.length !== item.relationCount
  )
    inconsistent();
  let entity;
  try {
    entity = normalizeAdventureLoreEntity({
      name: item.name,
      aliases: item.aliases,
      category: item.category,
      summary: item.summary,
      details: v.details,
      structuredDetails: v.structuredDetails,
      relations: v.relations,
      isPublic: false,
    });
  } catch {
    inconsistent();
  }
  if (digest(entity.relations) !== digest(v.relations)) inconsistent();
  return {
    details: entity.details,
    structuredDetails: entity.structuredDetails,
    relations: entity.relations,
  };
}
export function prior(value, c, request, action, requestHash, hasReceipt) {
  if (!value) return null;
  ownRecord(value, c);
  const descriptor = {
    action,
    operationId: request.operationId,
    entityId: request.entityId,
    expectedRevision: request.expectedRevision,
    expectedCollectionRevision: request.expectedCollectionRevision,
  };
  if (
    !exact(value, [
      ...Object.keys(identity(c)),
      ...Object.keys(descriptor),
      'requestHash',
      ...(hasReceipt ? ['receipt'] : []),
    ]) ||
    Object.entries(descriptor).some(([k, v]) => value[k] !== v) ||
    !/^[a-f0-9]{64}$/.test(value.requestHash)
  )
    inconsistent();
  if (value.requestHash !== requestHash)
    fail('invalid-argument', 'Operação utilizada com outro pedido.');
  if (hasReceipt) {
    const r = value.receipt;
    if (
      !exact(r, [
        'operationId',
        'action',
        'entityId',
        'expectedRevision',
        'revision',
        'collectionRevision',
      ]) ||
      r.operationId !== request.operationId ||
      r.action !== action ||
      r.entityId !== request.entityId ||
      r.expectedRevision !== request.expectedRevision ||
      !safe(r.revision, 1) ||
      r.revision !== request.expectedRevision + 1 ||
      !safe(r.collectionRevision, 1) ||
      r.collectionRevision !== request.expectedCollectionRevision + 1
    )
      inconsistent();
  }
  return value;
}
export const confirmed = (c, v) => ({ ...identity(c), kind: 'confirmed', receipt: v.receipt });
export const canceled = (c, r, action) => ({
  ...identity(c),
  kind: 'canceled',
  action,
  operationId: r.operationId,
});
export function bounded(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > 4 * 1024 * 1024)
    fail('failed-precondition', 'O recurso ultrapassa o orçamento da leitura.');
  return value;
}
