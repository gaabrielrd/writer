import {
  baseKinds,
  baseItemAvailable,
  BASE_PAGE_BYTES,
  BASE_IMAGE_BYTES,
  limit,
  decodeBaseCursor,
  encodeBaseCursor,
  id,
} from './campaignBaseContracts.mjs';
import {
  summary,
  validItem,
  projectedStructured,
  projectedReference,
  loadContent,
  readBaseImageAccess,
  checkCapturedImageStorage,
} from './campaignBaseRead.mjs';
import { deriveAdventurePreviewImage } from './adventurePreview.mjs';
import { PREVIEW_IMAGE_BYTES } from './adventurePreviewContracts.mjs';
import {
  request,
  hashId,
  digest,
  fail,
  inconsistent,
  sourceKey,
  ownedComparison,
  comparisonPath,
  readComparisonContext,
  meteredTransaction,
  readWorkMetadata,
} from './campaignComparisonContracts.mjs';

const itemFields = [
  'sourceKey',
  'kind',
  'parentKey',
  'title',
  'archived',
  'orderKey',
  'origin',
  'stage',
  'type',
  'audience',
  'role',
  'dateLabel',
  'fields',
  'structured',
  'image.imageKey',
  'image.alt',
  'image.caption',
];
const dependencyFields = ['sourceKey', 'kind', 'origin'];
const budget = (value) => {
  if (Buffer.byteLength(JSON.stringify(value)) > BASE_PAGE_BYTES)
    fail('failed-precondition', 'Resposta acima do orçamento.');
  return value;
};
const scopeFor = (uid, c, data) => ({ uid, ...c.envelope, ...data });
async function orderContext(tx, db, context, item) {
  if (item.kind === 'lore') return null;
  const keys = [];
  for (const direction of ['desc', 'asc']) {
    const query = db
      .collection(context.path + '/items')
      .where('kind', '==', item.kind)
      .where('parentKey', '==', item.parentKey)
      .where('archived', '==', item.archived)
      .orderBy('orderKey', direction)
      .orderBy('__name__', direction)
      .startAfter(item.orderKey, item.sourceKey)
      .limit(1)
      .select('sourceKey');
    const doc = (await tx.get(query)).docs[0];
    keys.push(doc ? hashId(doc.id) : null);
  }
  return { previousKey: keys[0], nextKey: keys[1] };
}
async function itemProjection(tx, db, context, item, key) {
  validItem(item, key);
  if (!(await baseItemAvailable(tx, db, context, item))) return { unavailable: true };
  const structured = await projectedStructured(tx, db, context, item);
  const order = await orderContext(tx, db, context, item);
  const s = { ...summary(item), orderContext: order };
  delete s.orderKey;
  if (item.kind === 'lore') s.category = structured.category;
  if (!Array.isArray(item.fields) || item.fields.length > 16) inconsistent();
  const fields = item.fields
    .map((field) => {
      hashId(field.sha256);
      if (typeof field.field !== 'string' || !Number.isSafeInteger(field.bytes) || field.bytes < 0)
        inconsistent();
      return { field: field.field, sha256: field.sha256, bytes: field.bytes };
    })
    .sort((a, b) => a.field.localeCompare(b.field));
  let author = {};
  if (item.kind === 'part') author = { contentMode: structured.contentMode ?? null };
  if (item.kind === 'block') author = { ownArchived: structured.ownArchived ?? false };
  if (item.kind === 'lore')
    author = {
      aliases: structured.aliases ?? [],
      category: structured.category,
      isPublic: structured.isPublic ?? false,
      relations: structured.relations.map((relation) => ({
        targetKey: relation.targetKey,
        relationType: relation.relationType,
        description: relation.description,
      })),
    };
  const image =
    item.image && Object.keys(item.image).length
      ? { imageKey: hashId(item.image.imageKey), alt: item.image.alt, caption: item.image.caption }
      : null;
  if (image && (typeof image.alt !== 'string' || typeof image.caption !== 'string')) inconsistent();
  return { summary: s, semantic: { ...s, fields, author, image } };
}
async function project(tx, db, context, group, key, stored) {
  if (!stored) return null;
  if (group === 'items') return itemProjection(tx, db, context, stored, key);
  if (group === 'references') {
    if (!['scene', 'narrative'].includes(stored.kind) || typeof stored.sourceKey !== 'string')
      inconsistent();
    const source = (
      await readWorkMetadata(
        tx,
        db.doc(context.path + '/items/' + hashId(stored.sourceKey)),
        dependencyFields,
      )
    ).data();
    if (!source || !(await baseItemAvailable(tx, db, context, source)))
      return { unavailable: true };
    const s = await projectedReference(tx, db, context, stored, key);
    return { summary: s, semantic: s };
  }
  if (group === 'images') {
    try {
      const access = await readBaseImageAccess(tx, db, context, key);
      return {
        summary: { imageKey: key, preview: 'unchecked' },
        semantic: {
          imageKey: key,
          path: access.image.path,
          generation: access.image.generation,
          size: access.image.size,
        },
      };
    } catch (error) {
      if (error.code === 'not-found') return { unavailable: true };
      throw error;
    }
  }
  inconsistent();
}
const metadata = async (tx, db, context, group, key) => {
  const collection = { items: 'items', references: 'links', images: 'images' }[group];
  return (
    await readWorkMetadata(
      tx,
      db.doc(context.path + '/' + collection + '/' + key),
      group === 'items'
        ? itemFields
        : group === 'references'
          ? ['kind', 'sourceKey', 'reference']
          : ['imageKey', 'imageId', 'state', 'path', 'generation', 'size', 'useKey'],
    )
  ).data();
};
function frozenSource(context) {
  const value = context.base.snapshot;
  if (
    !value ||
    ['title', 'synopsis', 'language'].some(
      (k) => typeof value[k] !== 'string' || Buffer.from(value[k]).toString('utf8') !== value[k],
    ) ||
    value.synopsis.length > 4000
  )
    inconsistent();
  return { title: value.title, synopsis: value.synopsis, language: value.language };
}
export function createCampaignComparisonReadService({
  db,
  assets,
  deriveImage = deriveAdventurePreviewImage,
}) {
  async function context(tx, uid, key) {
    const p = ownedComparison((await tx.get(db.doc(comparisonPath(uid, key)))).data(), uid, key);
    return readComparisonContext(tx, db, uid, p);
  }
  async function imageObservation(uid, data) {
    return db.runTransaction(async (tx) => {
      const c = await context(tx, uid, data.comparisonId);
      const access = await readBaseImageAccess(tx, db, c[data.side], data.imageKey);
      return {
        envelope: c.envelope,
        ...access,
        identity: digest({ envelope: c.envelope, image: access.image }),
      };
    });
  }
  return {
    async listCampaignComparisonChanges(uid, data) {
      request(uid, data, ['comparisonId', 'group', 'kind', 'change', 'cursor', 'limit']);
      id(data.comparisonId);
      if (
        !['source', 'items', 'references', 'images'].includes(data.group) ||
        (data.kind !== undefined && (data.group !== 'items' || !baseKinds.includes(data.kind))) ||
        (data.change !== undefined &&
          !['added', 'changed', 'removed', 'unchanged'].includes(data.change))
      )
        fail('invalid-argument', 'Filtro inválido.');
      const count = limit(data.limit);
      return db.runTransaction(async (original) => {
        const meter = meteredTransaction(original),
          tx = meter.tx,
          c = await context(tx, uid, data.comparisonId);
        const scope = scopeFor(uid, c, {
          group: data.group,
          kind: data.kind ?? null,
          change: data.change ?? null,
        });
        const cursor = decodeBaseCursor(data.cursor, scope);
        if (cursor) hashId(cursor.key);
        let keys,
          more = false;
        if (data.group === 'source') keys = cursor ? [] : [sourceKey(c.p.adventureId)];
        else {
          const pages = [];
          for (const side of ['current', 'candidate']) {
            let query = db.collection(
              c[side].path +
                '/' +
                { items: 'items', references: 'links', images: 'images' }[data.group],
            );
            if (data.kind) query = query.where('kind', '==', data.kind);
            query = query
              .orderBy('__name__')
              .limit(count + 1)
              .select('kind');
            if (cursor) query = query.startAfter(cursor.key);
            pages.push((await tx.get(query)).docs.map((doc) => doc.id));
          }
          keys = [...new Set(pages.flat())].sort();
          more = keys.length > count || pages.some((page) => page.length > count);
          keys = keys.slice(0, count);
        }
        const items = [];
        let last = null;
        for (const key of keys) {
          // The bound includes up to100 projected lore targets (two sides), gates,
          // overlays and neighbors; reserve before loading any next pair.
          const lore = data.group === 'items';
          if (!meter.canReserve(lore ? 3 * 1024 * 1024 : 128 * 1024, lore ? 384 : 32)) {
            if (!last)
              fail('failed-precondition', 'Não foi possível reservar um par da comparação.');
            more = true;
            break;
          }
          let a, b;
          if (data.group === 'source') {
            const current = frozenSource(c.current),
              candidate = frozenSource(c.candidate);
            a = { summary: current, semantic: current };
            b = { summary: candidate, semantic: candidate };
          } else {
            const av = await metadata(tx, db, c.current, data.group, key);
            const bv = await metadata(tx, db, c.candidate, data.group, key);
            a = await project(tx, db, c.current, data.group, key, av);
            b = await project(tx, db, c.candidate, data.group, key, bv);
          }
          if (!a?.unavailable && !b?.unavailable && (a || b)) {
            const change = !a
              ? 'added'
              : !b
                ? 'removed'
                : digest(a.semantic) === digest(b.semantic)
                  ? 'unchanged'
                  : 'changed';
            const row = {
              key,
              group: data.group,
              change,
              currentSummary: a?.summary ?? null,
              candidateSummary: b?.summary ?? null,
            };
            if (data.group === 'items') {
              row.orderContextChanged = Boolean(
                a && b && digest(a.summary.orderContext) !== digest(b.summary.orderContext),
              );
              if ((a ? a.summary : b.summary).kind === 'lore') {
                const overlay = (
                  await readWorkMetadata(
                    tx,
                    db.doc(`campaigns/${c.p.campaignId}/loreVariants/${key}`),
                    [
                      'schemaVersion',
                      'ownerId',
                      'campaignId',
                      'campaignToken',
                      'baseId',
                      'sourceKey',
                      'mode',
                      'revision',
                    ],
                  )
                ).data();
                if (
                  overlay &&
                  (overlay.schemaVersion !== 1 ||
                    overlay.ownerId !== uid ||
                    overlay.campaignId !== c.p.campaignId ||
                    overlay.campaignToken !== c.p.campaignToken ||
                    overlay.baseId !== c.p.currentBaseId ||
                    overlay.sourceKey !== key ||
                    !['base', 'override', 'removed'].includes(overlay.mode) ||
                    !Number.isSafeInteger(overlay.revision) ||
                    overlay.revision < 1)
                )
                  inconsistent();
                row.local = overlay ? { mode: overlay.mode, revision: overlay.revision } : null;
                row.requiresReview = Boolean(
                  change !== 'unchanged' && overlay && overlay.mode !== 'base',
                );
              }
            }
            if (data.change === undefined || data.change === change) {
              if (
                Buffer.byteLength(
                  JSON.stringify({
                    ...c.envelope,
                    items: [...items, row],
                    nextCursor: 'x'.repeat(12000),
                  }),
                ) > BASE_PAGE_BYTES
              ) {
                if (!last) fail('failed-precondition', 'O par ultrapassa o orçamento da resposta.');
                more = true;
                break;
              }
              items.push(row);
            }
          }
          last = key;
        }
        return budget({
          ...c.envelope,
          items,
          nextCursor: more && last ? encodeBaseCursor({ version: 1, scope, key: last }) : null,
        });
      });
    },
    async readCampaignComparisonItem(uid, data) {
      request(uid, data, ['comparisonId', 'sourceKey', 'side', 'cursor', 'limit']);
      id(data.comparisonId);
      const key = hashId(data.sourceKey),
        count = data.limit ?? 4;
      if (
        !['current', 'candidate'].includes(data.side) ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 8
      )
        fail('invalid-argument', 'Leitura inválida.');
      return db.runTransaction(async (tx) => {
        const c = await context(tx, uid, data.comparisonId),
          side = c[data.side];
        const stored = (await tx.get(db.doc(side.path + '/items/' + key))).data();
        if (!stored) {
          decodeBaseCursor(
            data.cursor,
            scopeFor(uid, c, { side: data.side, key, projection: null }),
            ['index'],
          );
          return { ...c.envelope, side: data.side, key, item: null, chunks: [], nextCursor: null };
        }
        if (!(await baseItemAvailable(tx, db, side, stored)))
          fail('not-found', 'Item indisponível.');
        validItem(stored, key);
        const structured = await projectedStructured(tx, db, side, stored);
        const scope = scopeFor(uid, c, { side: data.side, key, projection: digest(structured) });
        const cursor = decodeBaseCursor(data.cursor, scope, ['index']);
        const content = await loadContent(tx, db, side, stored),
          offset = cursor?.index ?? 0;
        if (offset > content.chunks.length) fail('invalid-argument', 'Página inválida.');
        const item = {
          ...summary(stored),
          fields: content.fields,
          structured,
          image: stored.image
            ? {
                imageKey: hashId(stored.image.imageKey),
                alt: stored.image.alt,
                caption: stored.image.caption,
              }
            : null,
        };
        return budget({
          ...c.envelope,
          side: data.side,
          key,
          item,
          chunks: content.chunks.slice(offset, offset + count),
          nextCursor:
            offset + count < content.chunks.length
              ? encodeBaseCursor({ version: 1, scope, index: offset + count })
              : null,
        });
      });
    },
    async readCampaignComparisonImage(uid, data) {
      request(uid, data, ['comparisonId', 'imageKey', 'side']);
      id(data.comparisonId);
      hashId(data.imageKey);
      if (!['current', 'candidate'].includes(data.side)) fail('invalid-argument', 'Lado inválido.');
      const before = await imageObservation(uid, data),
        metadata = await checkCapturedImageStorage(assets, before.image);
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
      const reauthorize = async () => {
        const current = await imageObservation(uid, data);
        if (current.identity !== before.identity)
          fail('failed-precondition', 'A comparação mudou.', 'cursor-invalidated');
        const after = await checkCapturedImageStorage(assets, before.image);
        if (after.size !== metadata.size) inconsistent();
      };
      await reauthorize();
      const derived = await deriveImage(bytes);
      if (!Buffer.isBuffer(derived) || derived.length > PREVIEW_IMAGE_BYTES) inconsistent();
      await reauthorize();
      return budget({
        ...before.envelope,
        side: data.side,
        key: data.imageKey,
        dataUrl: 'data:image/webp;base64,' + derived.toString('base64'),
      });
    },
  };
}
