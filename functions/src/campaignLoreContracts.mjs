import { assertLoreItemOrigin, loreRelationOrigin } from './campaignLoreOrigin.mjs';
import { validateId } from './generation.mjs';
import {
  workClosed as closed,
  workFail as fail,
  workRevision,
  workId,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import {
  readCampaignBase,
  baseItemAvailable,
  baseBodyKey,
  baseSourceKey,
  BASE_PAGE_BYTES,
  CAPTURE_WRITE_BYTES,
} from './campaignBaseContracts.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import { CHUNK_BYTES, splitHistoryContent } from './workHistoryContracts.mjs';
import { readCampaignAuthorization } from './campaignAuthorization.mjs';
import {
  loreStorageContext,
  readLoreGuard,
  anchorContext,
  normalizedBodyBinding,
  bindingPath,
  validateBodyStorage,
} from './campaignLoreStorage.mjs';

export { closed, fail, digest, CHUNK_BYTES };
export const LORE_BYTES = 900000;
export const categories = ['character', 'location', 'concept', 'other'];
export const textNames = ['appearance', 'personality', 'history', 'notes'];
export const headerFields = [
  'campaignId',
  'campaignToken',
  'baseId',
  'sourceKey',
  'operationId',
  'expectedRevision',
];
export const actions = ['save', 'remove', 'restore', 'discard'];
export const changed = (reason) =>
  fail(
    'failed-precondition',
    'A identidade ou a projeção da campanha mudou. Reabra sem reaplicar o pedido.',
    reason,
  );
export const inconsistent = () =>
  fail('failed-precondition', 'O lore da campanha está inconsistente.');
export function hashId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail('invalid-argument', 'Identificador do lore inválido.');
  return value;
}
export function utf8(value) {
  return typeof value === 'string' && Buffer.from(value).toString('utf8') === value;
}
export function entityInput(value, sourceKey) {
  closed(value, [
    'name',
    'aliases',
    'category',
    'summary',
    'details',
    'structuredDetails',
    'relations',
  ]);
  const text = (value, size, required = false, trim = false) => {
    if (!utf8(value) || value.length > size || (required && !value.trim()))
      fail('invalid-argument', 'Campo da ficha inválido.');
    return trim ? value.trim() : value;
  };
  if (
    !categories.includes(value.category) ||
    !Array.isArray(value.aliases) ||
    value.aliases.length > 20 ||
    !Array.isArray(value.relations) ||
    value.relations.length > 50
  )
    fail('invalid-argument', 'Ficha inválida.');
  closed(value.structuredDetails, textNames);
  const result = {
    name: text(value.name, 200, true, true),
    aliases: value.aliases.map((alias) => text(alias, 200, true, true)),
    category: value.category,
    summary: text(value.summary, 140, true, true),
    details: text(value.details, 150000),
    structuredDetails: Object.fromEntries(
      textNames.map((key) => [key, text(value.structuredDetails[key], 150000)]),
    ),
    relations: value.relations.map((relation) => {
      closed(relation, ['targetKey', 'relationType', 'description']);
      const targetKey = hashId(relation.targetKey);
      if (targetKey === sourceKey)
        fail('invalid-argument', 'Uma ficha não pode se relacionar consigo mesma.');
      return {
        targetKey,
        relationType: text(relation.relationType, 200, true, true),
        description: text(relation.description, 4000),
      };
    }),
  };
  if (Buffer.byteLength(JSON.stringify(result)) > LORE_BYTES)
    fail('invalid-argument', 'A ficha ultrapassa 900.000 bytes. Reduza o texto sem truncá-lo.');
  return result;
}
export function relatedKeys(value, sourceKey) {
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    value.some((key, index) => hashId(key) === sourceKey || (index > 0 && value[index - 1] >= key))
  )
    fail('invalid-argument', 'Alvos da recuperação inválidos.');
  return [...value];
}
export function operationDescriptor(uid, data, action) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
  if (!actions.includes(action)) fail('invalid-argument', 'Ação inválida.');
  const descriptor = {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: workId(data.campaignId),
    campaignToken: hashId(data.campaignToken),
    baseId: hashId(data.baseId),
    sourceKey: hashId(data.sourceKey),
    operationId: validateId(data.operationId),
    expectedRevision: workRevision(data.expectedRevision),
    action,
  };
  if (action === 'save')
    descriptor.relatedSourceKeys = relatedKeys(data.relatedSourceKeys, descriptor.sourceKey);
  return descriptor;
}
export const operationRef = (db, uid, operationId) =>
  db.doc(`users/${uid}/campaignVariantOperations/${operationId}`);
export function verifyOperation(value, descriptor) {
  if (!value) return null;
  if (value.descriptorHash !== digest(descriptor))
    fail('invalid-argument', 'Operação utilizada com outro escopo ou payload.');
  for (const [key, expected] of Object.entries(descriptor))
    if (digest(value[key] ?? null) !== digest(expected)) inconsistent();
  if (!['prepared', 'committed', 'canceled'].includes(value.state)) inconsistent();
  return value;
}
export const operationMetadata = (descriptor, state = 'prepared') => ({
  ...descriptor,
  descriptorHash: digest(descriptor),
  state,
});
export const recoveryIdentity = (descriptor) => ({ ...descriptor });
export function budget(value, maximum = BASE_PAGE_BYTES) {
  if (Buffer.byteLength(JSON.stringify(value)) > maximum)
    fail(
      'failed-precondition',
      'A ficha ultrapassa o orçamento da operação. Nenhum texto foi truncado.',
    );
  return value;
}
export async function loreContext(tx, db, uid, data, optionalToken = false, options = {}) {
  const context = await readCampaignBase(tx, db, uid, workId(data.campaignId), options);
  if (!context) return null;
  const campaignToken = campaignIdentityToken(uid, context.campaignId, context.campaignSnapshot);
  if (hashId(data.baseId) !== context.base.id) changed('base-changed');
  if (
    (!optionalToken || data.campaignToken !== undefined) &&
    hashId(data.campaignToken) !== campaignToken
  )
    changed('campaign-changed');
  const storage = await loreStorageContext(tx, db, { ...context, campaignToken });
  const lorePath = storage.lorePath,
    controlRef = db.doc(`campaigns/${context.campaignId}/loreVariantState/current`),
    control = (await tx.get(controlRef)).data();
  let collectionRevision = 0;
  if (control) {
    if (
      control.ownerId !== uid ||
      control.campaignId !== context.campaignId ||
      control.campaignToken !== campaignToken
    )
      changed('campaign-changed');
    if (control.baseId !== context.base.id) changed('base-changed');
    if (
      control.schemaVersion !== 1 ||
      !Number.isSafeInteger(control.revision) ||
      control.revision < 0
    )
      inconsistent();
    collectionRevision = control.revision;
  } else if (
    (
      await tx.get(
        db
          .collection(lorePath + '/loreVariants')
          .orderBy('__name__')
          .limit(1)
          .select(),
      )
    ).docs.length
  )
    inconsistent();
  const authorization = await readCampaignAuthorization(tx, db, uid);
  const result = {
    ...context,
    ...storage,
    campaignToken,
    lorePath,
    controlRef,
    controlRecord: control ?? null,
    collectionRevision,
    authorization,
  };
  return { ...result, guard: await readLoreGuard(tx, db, result) };
}
export const loreEnvelope = (context) => ({
  schemaVersion: 1,
  ownerId: context.uid,
  campaignId: context.campaignId,
  campaignToken: context.campaignToken,
  baseId: context.base.id,
  collectionRevision: context.collectionRevision,
  projectionToken: digest({
    base: context.projectionToken,
    campaignToken: context.campaignToken,
    collectionRevision: context.collectionRevision,
    generationId: context.generationId ?? null,
    authorization: context.authorization?.record
      ? { token: context.authorization.record.token, epoch: context.authorization.epoch }
      : null,
  }),
});
export function overlayRecord(value, context, key) {
  if (!value) return null;
  if (
    value.ownerId !== context.uid ||
    value.campaignId !== context.campaignId ||
    value.campaignToken !== context.campaignToken
  )
    changed('campaign-changed');
  if (value.baseId !== context.base.id) changed('base-changed');
  if (
    value.schemaVersion !== 1 ||
    value.sourceKey !== key ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !['base', 'override', 'removed'].includes(value.mode) ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < value.createdAt ||
    !utf8(value.name) ||
    !categories.includes(value.category)
  )
    inconsistent();
  const bodyMode = value.mode === 'removed' ? value.previousMode : value.mode;
  if (!['base', 'override'].includes(bodyMode)) inconsistent();
  if (bodyMode === 'override') {
    const manifest = value.manifest;
    if (
      !manifest ||
      !Number.isSafeInteger(manifest.bodyRevision) ||
      manifest.bodyRevision < 1 ||
      manifest.bodyRevision > value.revision ||
      !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes < 1 ||
      manifest.bytes > LORE_BYTES ||
      !Number.isSafeInteger(manifest.chunkCount) ||
      manifest.chunkCount < 1 ||
      manifest.chunkCount > Math.ceil(manifest.bytes / (CHUNK_BYTES - 3)) ||
      typeof manifest.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256)
    )
      inconsistent();
    normalizedBodyBinding(context, value);
  } else if (value.manifest != null || value.bodyBinding != null) inconsistent();
  if (
    value.participation !== undefined &&
    !['candidate', 'legacy', 'inactive'].includes(value.participation)
  )
    inconsistent();
  return value;
}
export async function loreRecord(tx, db, context, key, supplied) {
  const overlay = overlayRecord(
    (await tx.get(db.doc(context.lorePath + '/loreVariants/' + key))).data(),
    context,
    key,
  );
  if (overlay?.participation === 'inactive' && !context.includeInactive) return null;
  let source = context;
  const itemFields = [
    'sourceKey',
    'kind',
    'origin',
    'originAdventureToken',
    'title',
    'structured.category',
  ];
  let item =
    supplied ??
    (await readWorkMetadata(tx, db.doc(context.path + '/items/' + key), itemFields)).data();
  if (
    !item &&
    (overlay?.participation === 'legacy' || (context.includeInactive && overlay?.anchor))
  ) {
    if (overlay.anchor?.sourceKey !== key) inconsistent();
    source = await anchorContext(tx, db, context, overlay.anchor);
    item = (await readWorkMetadata(tx, db.doc(source.path + '/items/' + key), itemFields)).data();
  }
  if (!item) return null;
  if (item.kind !== 'lore' || item.sourceKey !== key) inconsistent();
  assertLoreItemOrigin(item, source.base);
  if (!(await baseItemAvailable(tx, db, source, item))) return null;
  if (!utf8(item.title) || !categories.includes(item.structured?.category)) inconsistent();
  return {
    item,
    overlay,
    anchorContext: source,
    legacy: overlay?.participation === 'legacy',
    sourceKey: key,
    revision: overlay?.revision ?? 0,
    mode: overlay?.mode ?? 'base',
    name: overlay?.name ?? item.title,
    category: overlay?.category ?? item.structured.category,
  };
}
export async function requireTargets(tx, db, context, keys) {
  for (const key of keys) {
    const target = await loreRecord(tx, db, context, key);
    if (!target || target.mode === 'removed') fail('not-found', 'Ficha relacionada indisponível.');
  }
}
export const variantChunkId = (context, key, bodyRevision, index) =>
  digest({
    campaignToken: context.campaignToken,
    baseId: context.base.id,
    sourceKey: key,
    bodyRevision,
    index,
  });
export function bodyRefs(db, context, record) {
  const manifest = record?.manifest;
  const binding = normalizedBodyBinding(context, record);
  return manifest
    ? Array.from({ length: manifest.chunkCount }, (_, index) =>
        db.doc(
          bindingPath(context, binding) +
            '/loreVariantBodies/' +
            variantChunkId(
              { ...context, base: { ...context.base, id: binding.baseId } },
              record.sourceKey,
              manifest.bodyRevision,
              index,
            ),
        ),
      )
    : [];
}
export function bodyPlan(context, key, revision, entity) {
  const content = JSON.stringify(entity),
    chunks = splitHistoryContent(content);
  return {
    bodyBinding: {
      schemaVersion: 1,
      layout: context.generationId ? 'generation' : 'legacy',
      generationId: context.generationId ?? null,
      baseId: context.base.id,
      sourceKey: key,
      bodyRevision: revision,
    },
    manifest: {
      bodyRevision: revision,
      bytes: Buffer.byteLength(content),
      chunkCount: chunks.length,
      sha256: digest(content),
    },
    chunks: chunks.map((content, index) => ({
      sourceKey: key,
      baseId: context.base.id,
      campaignToken: context.campaignToken,
      revision,
      index,
      content,
    })),
  };
}
export async function readVariantEntity(tx, db, context, record) {
  const binding = normalizedBodyBinding(context, record);
  await validateBodyStorage(tx, db, context, binding);
  const refs = bodyRefs(db, context, record),
    texts = [];
  for (let index = 0; index < refs.length; index++) {
    const value = (await tx.get(refs[index])).data();
    if (
      !value ||
      value.sourceKey !== record.sourceKey ||
      value.baseId !== binding.baseId ||
      value.campaignToken !== context.campaignToken ||
      value.revision !== record.manifest.bodyRevision ||
      value.index !== index ||
      !utf8(value.content) ||
      Buffer.byteLength(value.content) > CHUNK_BYTES
    )
      inconsistent();
    texts.push(value.content);
  }
  const content = texts.join('');
  if (
    Buffer.byteLength(content) !== record.manifest.bytes ||
    digest(content) !== record.manifest.sha256
  )
    inconsistent();
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    inconsistent();
  }
  const entity = entityInput(parsed, record.sourceKey);
  if (JSON.stringify(entity) !== content) inconsistent();
  if (entity.name !== record.name || entity.category !== record.category) inconsistent();
  return entity;
}
export async function readBaseEntity(tx, db, context, item) {
  const expectedKey = item.sourceKey;
  item = (
    await readWorkMetadata(tx, db.doc(context.path + '/items/' + item.sourceKey), [
      'sourceKey',
      'kind',
      'origin',
      'originAdventureToken',
      'title',
      'fields',
      'structured',
    ])
  ).data();
  if (!item || item.sourceKey !== expectedKey) inconsistent();
  assertLoreItemOrigin(item, context.base);
  if (!(await baseItemAvailable(tx, db, context, item))) fail('not-found', 'Ficha indisponível.');
  if (!Array.isArray(item.fields) || item.fields.length > 6) inconsistent();
  const texts = {},
    allowed = ['summary', 'details', ...textNames];
  let bytes = 0;
  for (const field of item.fields) {
    if (
      !allowed.includes(field.field) ||
      Object.hasOwn(texts, field.field) ||
      !/^[a-f0-9]{64}$/.test(field.sha256) ||
      !Number.isSafeInteger(field.bytes) ||
      field.bytes < 0 ||
      !Number.isSafeInteger(field.chunkCount) ||
      field.chunkCount < 1 ||
      field.chunkCount > Math.max(1, Math.ceil(field.bytes / (CHUNK_BYTES - 3))) ||
      field.bodySourceKey !== item.sourceKey
    )
      inconsistent();
    bytes += field.bytes;
    if (bytes > CAPTURE_WRITE_BYTES) inconsistent();
    const parts = [];
    for (let index = 0; index < field.chunkCount; index++) {
      const chunk = (
        await tx.get(
          db.doc(context.path + '/bodies/' + baseBodyKey(item.sourceKey, field.field, index)),
        )
      ).data();
      if (
        !chunk ||
        chunk.sourceKey !== item.sourceKey ||
        chunk.field !== field.field ||
        chunk.index !== index ||
        !utf8(chunk.content) ||
        Buffer.byteLength(chunk.content) > CHUNK_BYTES
      )
        inconsistent();
      parts.push(chunk.content);
    }
    const content = parts.join('');
    if (Buffer.byteLength(content) !== field.bytes || digest(content) !== field.sha256)
      inconsistent();
    texts[field.field] = content;
  }
  if (!Object.hasOwn(texts, 'summary') || !Object.hasOwn(texts, 'details')) inconsistent();
  const stored = item.structured;
  if (
    !Array.isArray(stored.aliases) ||
    stored.aliases.length > 20 ||
    stored.aliases.some((value) => !utf8(value) || value.length > 200) ||
    !Array.isArray(stored.relations) ||
    stored.relations.length > 50
  )
    inconsistent();
  const relations = [];
  for (const relation of stored.relations) {
    const origin = loreRelationOrigin(relation.targetEntityId, context.base);
    if (!origin) continue;
    if (!utf8(relation.relationType) || !utf8(relation.description ?? '')) inconsistent();
    relations.push({
      targetKey: baseSourceKey(origin),
      relationType: relation.relationType,
      description: relation.description ?? '',
    });
  }
  return {
    name: item.title,
    aliases: stored.aliases,
    category: stored.category,
    summary: texts.summary ?? '',
    details: texts.details ?? '',
    structuredDetails: Object.fromEntries(textNames.map((key) => [key, texts[key] ?? ''])),
    relations,
  };
}
export async function projectEntity(tx, db, context, entity) {
  const relations = [];
  for (const relation of entity.relations) {
    const target = await loreRecord(tx, db, context, relation.targetKey);
    if (target && target.mode !== 'removed')
      relations.push({ ...relation, targetName: target.name });
  }
  return { ...entity, relations };
}
export async function loreState(tx, db, context, record, suppliedEntity) {
  let entity = null,
    entityHash = null;
  if (record.mode !== 'removed') {
    const source =
      suppliedEntity ??
      (record.mode === 'override'
        ? await readVariantEntity(tx, db, context, record.overlay)
        : await readBaseEntity(tx, db, record.anchorContext ?? context, record.item));
    entityHash = digest(JSON.stringify(source));
    entity = await projectEntity(tx, db, context, source);
  }
  return {
    sourceKey: record.sourceKey,
    revision: record.revision,
    mode: record.mode,
    legacy: record.legacy ?? false,
    createdAt: record.overlay?.createdAt ?? null,
    updatedAt: record.overlay?.updatedAt ?? null,
    entityHash,
    entity,
  };
}
export const confirmationHash = (record) => digest(record);
