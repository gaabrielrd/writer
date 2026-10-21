import { loreRelationOrigin, loreReferenceOrigin } from './campaignLoreOrigin.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  closed,
  fail,
  id,
  digest,
  limit,
  baseKinds,
  baseSummary,
  publicField,
  baseBodyKey,
  baseSourceKey,
  baseImageKey,
  baseImageUseKey,
  BASE_PAGE_BYTES,
  BASE_IMAGE_BYTES,
  CAPTURE_WRITE_BYTES,
  readCampaignBase,
  baseItemAvailable,
  decodeBaseCursor,
  encodeBaseCursor,
} from './campaignBaseContracts.mjs';
import { CHUNK_BYTES } from './workHistoryContracts.mjs';
import { deriveAdventurePreviewImage } from './adventurePreview.mjs';
import { PREVIEW_IMAGE_BYTES } from './adventurePreviewContracts.mjs';

const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    fail('invalid-argument', 'Identificador da base inválido.');
  return value;
};
const inconsistent = () => fail('failed-precondition', 'O conteúdo capturado está inconsistente.');
function budget(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > BASE_PAGE_BYTES)
    fail('failed-precondition', 'O recurso ultrapassa o orçamento da leitura.');
  return value;
}
function request(uid, data, keys) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
  closed(data, ['campaignId', ...keys]);
  return id(data.campaignId);
}
export function summary(item) {
  const value = baseSummary(item),
    allowed =
      {
        scene: ['stage'],
        block: ['type', 'audience', 'role'],
        event: ['dateLabel'],
      }[item.kind] ?? [];
  for (const key of ['stage', 'type', 'audience', 'role', 'dateLabel'])
    if (!allowed.includes(key)) delete value[key];
  return value;
}
export function validItem(item, key) {
  if (
    !item ||
    item.sourceKey !== key ||
    !baseKinds.includes(item.kind) ||
    typeof item.title !== 'string' ||
    typeof item.archived !== 'boolean' ||
    typeof item.orderKey !== 'string' ||
    !(
      item.parentKey === null ||
      (typeof item.parentKey === 'string' && /^[a-f0-9]{64}$/.test(item.parentKey))
    )
  )
    inconsistent();
  return item;
}
const textFields = {
  part: ['legacyContent'],
  scene: ['content', 'objective', 'conflict', 'pointOfView'],
  block: ['content'],
  arc: ['initialState', 'objective', 'plannedOutcome'],
  milestone: ['notes'],
  event: ['description'],
  lore: ['summary', 'details', 'appearance', 'personality', 'history', 'notes'],
};
export async function projectedStructured(tx, db, context, item) {
  const stored = item.structured ?? {},
    result = {};
  const fields =
    {
      part: ['contentMode'],
      scene: ['wordCount', 'mainWordCount', 'blockWordCount', 'blockCount'],
      block: ['wordCount', 'ownArchived'],
      lore: ['aliases', 'category', 'isPublic'],
    }[item.kind] ?? [];
  for (const field of fields) {
    const value = stored[field];
    if (value === undefined) continue;
    if (
      ['wordCount', 'mainWordCount', 'blockWordCount', 'blockCount'].includes(field) &&
      (!Number.isSafeInteger(value) || value < 0)
    )
      inconsistent();
    if (['ownArchived', 'isPublic'].includes(field) && typeof value !== 'boolean') inconsistent();
    if (['category', 'contentMode'].includes(field) && typeof value !== 'string') inconsistent();
    if (
      field === 'aliases' &&
      (!Array.isArray(value) ||
        value.length > 20 ||
        value.some((alias) => typeof alias !== 'string' || alias.length > 200))
    )
      inconsistent();
    result[field] = value;
  }
  if (item.kind === 'lore') {
    result.relations = [];
    if (!Array.isArray(stored.relations ?? []) || (stored.relations?.length ?? 0) > 50)
      inconsistent();
    for (const relation of stored.relations ?? []) {
      const origin = loreRelationOrigin(relation?.targetEntityId, context.base);
      if (!origin) continue;
      const key = baseSourceKey(origin);
      const target = (
        await readWorkMetadata(tx, db.doc(context.path + '/items/' + key), [
          'sourceKey',
          'kind',
          'title',
          'origin',
          'originAdventureToken',
        ])
      ).data();
      if (
        !target ||
        target.kind !== 'lore' ||
        target.sourceKey !== key ||
        !(await baseItemAvailable(tx, db, context, target))
      )
        continue;
      if (
        typeof relation.relationType !== 'string' ||
        (relation.description !== undefined && typeof relation.description !== 'string')
      )
        inconsistent();
      result.relations.push({
        targetKey: key,
        title: target.title,
        relationType: relation.relationType,
        description: relation.description ?? '',
      });
    }
  }
  return result;
}
export function validateCapturedFields(item) {
  if (!Array.isArray(item.fields) || item.fields.length > 16) inconsistent();
  if (!textFields[item.kind]) inconsistent();
  const seen = new Set();
  let bytes = 0;
  for (const field of item.fields) {
    if (
      !field ||
      !textFields[item.kind].includes(field.field) ||
      seen.has(field.field) ||
      !/^[a-f0-9]{64}$/.test(field.sha256) ||
      !Number.isSafeInteger(field.bytes) ||
      field.bytes < 0 ||
      !Number.isSafeInteger(field.chunkCount) ||
      field.chunkCount < 1 ||
      field.chunkCount > Math.max(1, Math.ceil(field.bytes / (CHUNK_BYTES - 3))) ||
      typeof field.bodySourceKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(field.bodySourceKey)
    )
      inconsistent();
    bytes += field.bytes;
    if (bytes > CAPTURE_WRITE_BYTES) inconsistent();
    seen.add(field.field);
  }
  return item.fields;
}
export async function loadContent(tx, db, context, item) {
  const descriptors = validateCapturedFields(item),
    chunks = [],
    fields = [];
  for (const field of descriptors) {
    const content = [];
    for (let index = 0; index < field.chunkCount; index++) {
      const chunk = (
        await tx.get(
          db.doc(context.path + '/bodies/' + baseBodyKey(field.bodySourceKey, field.field, index)),
        )
      ).data();
      if (
        !chunk ||
        chunk.sourceKey !== field.bodySourceKey ||
        chunk.field !== field.field ||
        chunk.index !== index ||
        typeof chunk.content !== 'string' ||
        Buffer.byteLength(chunk.content) > CHUNK_BYTES ||
        Buffer.from(chunk.content).toString('utf8') !== chunk.content
      )
        inconsistent();
      content.push(chunk.content);
      chunks.push({ field: field.field, index, content: chunk.content });
    }
    const text = content.join('');
    if (Buffer.byteLength(text) !== field.bytes || digest(text) !== field.sha256) inconsistent();
    fields.push(publicField(field));
  }
  return { fields, chunks };
}

export function createCampaignBaseReadService({
  db,
  assets,
  deriveImage = deriveAdventurePreviewImage,
}) {
  async function imageAccess(uid, campaignId, imageKey) {
    return db.runTransaction(async (tx) => {
      const context = await readCampaignBase(tx, db, uid, campaignId);
      return readBaseImageAccess(tx, db, context, imageKey);
    });
  }
  async function checkStorage(image) {
    return checkCapturedImageStorage(assets, image);
  }
  return {
    async getCampaignBase(uid, data) {
      const campaignId = request(uid, data, []);
      return db.runTransaction(async (tx) => {
        const context = await readCampaignBase(tx, db, uid, campaignId);
        const snapshot = context.base.snapshot;
        if (
          !snapshot ||
          !Number.isFinite(context.base.capturedAt) ||
          context.base.capturedAt < 0 ||
          ['title', 'synopsis', 'language'].some((field) => typeof snapshot[field] !== 'string')
        )
          inconsistent();
        return budget({
          baseId: context.base.id,
          capturedAt: context.base.capturedAt,
          source: {
            adventureId: context.base.adventureId,
            title: snapshot.title,
            synopsis: snapshot.synopsis,
            language: snapshot.language,
          },
          projectionToken: context.projectionToken,
        });
      });
    },
    async listCampaignBaseReferences(uid, data) {
      const campaignId = request(uid, data, ['sourceKey', 'cursor', 'limit']);
      const sourceKey = hash(data.sourceKey),
        count = limit(data.limit);
      return db.runTransaction(async (tx) => {
        const context = await readCampaignBase(tx, db, uid, campaignId);
        const source = (await tx.get(db.doc(context.path + '/items/' + sourceKey))).data();
        if (!source || !(await baseItemAvailable(tx, db, context, source)))
          fail('not-found', 'Item indisponível.');
        const scope = {
          uid,
          campaignId,
          baseId: context.base.id,
          sourceKey,
          token: context.projectionToken,
        };
        const cursor = decodeBaseCursor(data.cursor, scope);
        if (cursor) hash(cursor.key);
        let query = db
          .collection(context.path + '/links')
          .where('sourceKey', '==', sourceKey)
          .orderBy('__name__')
          .limit(count + 1)
          .select('kind', 'sourceKey', 'reference');
        if (cursor) query = query.startAfter(cursor.key);
        const docs = (await tx.get(query)).docs,
          items = [];
        for (const doc of docs.slice(0, count)) {
          const link = doc.data();
          if (!['scene', 'narrative'].includes(link.kind) || link.sourceKey !== sourceKey)
            inconsistent();
          items.push(await projectedReference(tx, db, context, link, doc.id));
        }
        return budget({
          items,
          nextCursor:
            docs.length > count
              ? encodeBaseCursor({ version: 1, scope, key: docs[count - 1].id })
              : null,
          projectionToken: context.projectionToken,
        });
      });
    },
    async listCampaignBaseItems(uid, data) {
      const campaignId = request(uid, data, ['kind', 'parentKey', 'archive', 'cursor', 'limit']);
      if (!baseKinds.includes(data.kind)) fail('invalid-argument', 'Tipo inválido.');
      const archive = data.archive ?? 'active',
        count = limit(data.limit);
      if (!['active', 'archived', 'all'].includes(archive))
        fail('invalid-argument', 'Arquivo inválido.');
      const hasParent = Object.hasOwn(data, 'parentKey');
      if (hasParent && data.parentKey !== null) hash(data.parentKey);
      return db.runTransaction(async (tx) => {
        const context = await readCampaignBase(tx, db, uid, campaignId);
        const scope = {
          uid,
          campaignId,
          baseId: context.base.id,
          kind: data.kind,
          parent: hasParent ? data.parentKey : '*',
          archive,
          token: context.projectionToken,
        };
        const cursor = decodeBaseCursor(data.cursor, scope, ['key']);
        let after = null;
        if (cursor) {
          hash(cursor.key);
          after = (await tx.get(db.doc(context.path + '/items/' + cursor.key))).data();
          if (
            !after ||
            after.sourceKey !== cursor.key ||
            after.kind !== data.kind ||
            typeof after.orderKey !== 'string' ||
            (hasParent && after.parentKey !== data.parentKey) ||
            (archive !== 'all' && after.archived !== (archive === 'archived'))
          )
            fail('invalid-argument', 'Página inválida.');
        }
        let query = db.collection(context.path + '/items').where('kind', '==', data.kind);
        if (hasParent) query = query.where('parentKey', '==', data.parentKey);
        if (archive !== 'all') query = query.where('archived', '==', archive === 'archived');
        query = query
          .orderBy('orderKey')
          .orderBy('__name__')
          .limit(count + 1)
          .select(
            'sourceKey',
            'kind',
            'parentKey',
            'title',
            'archived',
            'orderKey',
            'origin',
            'originAdventureToken',
            'stage',
            'type',
            'audience',
            'role',
            'dateLabel',
          );
        if (cursor) query = query.startAfter(after.orderKey, cursor.key);
        const docs = (await tx.get(query)).docs,
          items = [];
        let last = null,
          more = docs.length > count;
        for (const doc of docs.slice(0, count)) {
          const item = validItem(doc.data(), doc.id);
          if (await baseItemAvailable(tx, db, context, item)) {
            const candidate = summary(item);
            const response = {
              items: [...items, candidate],
              nextCursor: 'x'.repeat(12000),
              projectionToken: context.projectionToken,
            };
            if (Buffer.byteLength(JSON.stringify(response)) > BASE_PAGE_BYTES) {
              if (!last) fail('failed-precondition', 'O item ultrapassa o orçamento da leitura.');
              more = true;
              break;
            }
            items.push(candidate);
          }
          last = item;
        }
        return budget({
          items,
          nextCursor:
            more && last
              ? encodeBaseCursor({
                  version: 1,
                  scope,
                  key: last.sourceKey,
                })
              : null,
          projectionToken: context.projectionToken,
        });
      });
    },
    async readCampaignBaseItem(uid, data) {
      const campaignId = request(uid, data, ['sourceKey', 'cursor', 'limit']),
        key = hash(data.sourceKey);
      const count = data.limit ?? 4;
      if (!Number.isInteger(count) || count < 1 || count > 8)
        fail('invalid-argument', 'Página inválida.');
      return db.runTransaction(async (tx) => {
        const context = await readCampaignBase(tx, db, uid, campaignId);
        const stored = (await tx.get(db.doc(context.path + '/items/' + key))).data();
        if (!stored || !(await baseItemAvailable(tx, db, context, stored)))
          fail('not-found', 'Item indisponível.');
        validItem(stored, key);
        const structured = await projectedStructured(tx, db, context, stored);
        const projectionToken = context.projectionToken;
        const scope = {
          uid,
          campaignId,
          baseId: context.base.id,
          key,
          token: projectionToken,
          projection: digest(structured),
        };
        const cursor = decodeBaseCursor(data.cursor, scope, ['index']);
        const offset = cursor?.index ?? 0;
        if (!Number.isSafeInteger(offset) || offset < 0)
          fail('invalid-argument', 'Página inválida.');
        const content = await loadContent(tx, db, context, stored);
        if (offset > content.chunks.length) fail('invalid-argument', 'Página inválida.');
        const chunks = content.chunks.slice(offset, offset + count);
        const item = {
          ...summary(stored),
          fields: content.fields,
          structured,
          image: stored.image
            ? {
                imageKey: hash(stored.image.imageKey),
                alt: stored.image.alt,
                caption: stored.image.caption,
              }
            : null,
        };
        return budget({
          item,
          chunks,
          nextCursor:
            offset + count < content.chunks.length
              ? encodeBaseCursor({ version: 1, scope, index: offset + count })
              : null,
          projectionToken,
        });
      });
    },
    async readCampaignBaseImage(uid, data) {
      const campaignId = request(uid, data, ['imageKey']),
        imageKey = hash(data.imageKey);
      const before = await imageAccess(uid, campaignId, imageKey);
      const metadata = await checkStorage(before.image);
      let bytes;
      try {
        bytes = await assets.readGeneration(before.image.path, before.image.generation);
      } catch {
        fail('not-found', 'Ilustração indisponível.');
      }
      if (
        !Buffer.isBuffer(bytes) ||
        bytes.length !== metadata.size ||
        bytes.length > BASE_IMAGE_BYTES
      )
        inconsistent();
      const assertCurrent = async () => {
        const current = await imageAccess(uid, campaignId, imageKey);
        if (current.identity !== before.identity)
          fail(
            'failed-precondition',
            'A projeção mudou. Abra a base novamente.',
            'cursor-invalidated',
          );
        const after = await checkStorage(before.image);
        if (after.size !== metadata.size) inconsistent();
      };
      await assertCurrent();
      const derived = await deriveImage(bytes);
      if (!Buffer.isBuffer(derived) || derived.length > PREVIEW_IMAGE_BYTES) inconsistent();
      await assertCurrent();
      return budget({
        dataUrl: 'data:image/webp;base64,' + derived.toString('base64'),
        projectionToken: before.projectionToken,
      });
    },
  };
}

export async function projectedReference(tx, db, context, link, key) {
  const reference = link.reference;
  let origin = null;
  const lore =
    link.kind === 'scene' ? reference : reference?.kind === 'lore' ? reference.reference : null;
  if (lore) origin = loreReferenceOrigin(lore, context.base);
  else if (link.kind === 'narrative' && reference?.kind === 'scene')
    origin = {
      adventureId: context.base.adventureId,
      kind: 'scene',
      id: reference.sceneId,
    };
  else if (link.kind === 'narrative' && reference?.kind === 'event')
    origin = {
      adventureId: context.base.adventureId,
      kind: 'event',
      id: reference.eventId,
    };
  let targetKey = null;
  if (origin && typeof origin.id === 'string') {
    const key = baseSourceKey(origin);
    const target = (
      await readWorkMetadata(tx, db.doc(context.path + '/items/' + key), [
        'sourceKey',
        'kind',
        'origin',
        'originAdventureToken',
      ])
    ).data();
    if (target && target.sourceKey === key && (await baseItemAvailable(tx, db, context, target)))
      targetKey = key;
  }
  return {
    key,
    kind: link.kind,
    sourceKey: link.sourceKey,
    targetKey,
    available: targetKey !== null,
  };
}

export async function readBaseImageAccess(tx, db, context, imageKey) {
  const image = (
    await readWorkMetadata(tx, db.doc(context.path + '/images/' + imageKey), [
      'imageKey',
      'imageId',
      'state',
      'path',
      'generation',
      'size',
      'useKey',
    ])
  ).data();
  if (
    !image ||
    image.imageKey !== imageKey ||
    image.state !== 'ready' ||
    baseImageKey(image.imageId) !== imageKey ||
    image.useKey !== baseImageUseKey(context.base.id, image.imageId)
  )
    fail('not-found', 'Ilustração indisponível.');
  const ref = 'users/' + context.uid + '/imageLibrary/' + id(image.imageId);
  const library = (await readWorkMetadata(tx, db.doc(ref), ['state', 'path', 'useCount'])).data();
  const use = (
    await readWorkMetadata(tx, db.doc(ref + '/uses/' + image.useKey), [
      'kind',
      'campaignId',
      'baseId',
    ])
  ).data();
  if (
    !library ||
    library.state !== 'active' ||
    library.path !== image.path ||
    !Number.isSafeInteger(library.useCount) ||
    library.useCount < 1 ||
    !use ||
    use.kind !== 'campaign-base' ||
    use.campaignId !== context.campaignId ||
    use.baseId !== context.base.id ||
    typeof image.generation !== 'string' ||
    !/^[0-9]+$/.test(image.generation)
  )
    fail('not-found', 'Ilustração indisponível.');
  return {
    image,
    projectionToken: context.projectionToken,
    identity: digest({ image, token: context.projectionToken }),
  };
}

export async function checkCapturedImageStorage(assets, image) {
  let metadata;
  try {
    metadata = await assets.metadata(image.path);
  } catch {
    fail('not-found', 'Ilustração indisponível.');
  }
  if (!metadata || metadata.generation !== image.generation)
    fail('failed-precondition', 'A identidade da ilustração mudou.');
  if (!Number.isSafeInteger(metadata.size) || metadata.size < 1 || metadata.size > BASE_IMAGE_BYTES)
    fail('failed-precondition', 'A ilustração ultrapassa o orçamento da leitura.');
  return metadata;
}
