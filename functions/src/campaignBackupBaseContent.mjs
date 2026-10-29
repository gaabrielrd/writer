import { validateCapturedFields, validItem } from './campaignBaseRead.mjs';
import { loreRelationOrigin } from './campaignLoreOrigin.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  baseMasked,
  baseInconsistent,
  baseChanged,
  baseHash,
} from './campaignBackupBaseContext.mjs';

export const BASE_CONTENT_FIELDS = Object.freeze([
  'sourceKey',
  'kind',
  'origin',
  'parentKey',
  'archived',
  'orderKey',
  'title',
  'stage',
  'type',
  'audience',
  'role',
  'dateLabel',
  'fields',
  'structured.contentMode',
  'structured.wordCount',
  'structured.mainWordCount',
  'structured.blockWordCount',
  'structured.blockCount',
  'structured.ownArchived',
  'structured.aliases',
  'structured.category',
  'structured.isPublic',
  'structured.relations',
  'image',
]);
const text = (value) => {
  if (typeof value !== 'string' || Buffer.from(value, 'utf8').toString('utf8') !== value)
    baseInconsistent();
  return value;
};
const count = (value) => Number.isSafeInteger(value) && value >= 0;
function fieldDTO(f) {
  return {
    field: f.field,
    sha256: f.sha256,
    bytes: f.bytes,
    chunkCount: f.chunkCount,
    bodySourceKey: f.bodySourceKey,
  };
}
async function fields(c, item, h) {
  let manifests;
  try {
    manifests = validateCapturedFields(item);
  } catch {
    baseInconsistent();
  }
  const result = [];
  for (const f of manifests) {
    if (f.bodySourceKey !== item.sourceKey) {
      if (!(
        item.kind === 'block' &&
        item.role === 'main' &&
        f.field === 'content' &&
        f.bodySourceKey === item.parentKey
      ))
        baseInconsistent();
      const parent = await c.inspect(item.parentKey);
      const p = await baseMasked(c.tx, c.db.doc(c.path + '/items/' + item.parentKey), ['fields']);
      if (digest(p.native) !== digest(parent.native)) baseChanged();
      let sceneFields;
      try {
        sceneFields = validateCapturedFields({ ...parent.value, fields: p.value.fields });
      } catch {
        baseInconsistent();
      }
      const shared = sceneFields.find((x) => x.field === 'content');
      if (!shared || digest(fieldDTO(shared)) !== digest(fieldDTO(f))) baseInconsistent();
    }
    result.push(fieldDTO(f));
  }
  if (
    digest(h.value.origin) !== digest(item.origin) ||
    h.value.kind !== item.kind ||
    h.value.parentKey !== item.parentKey
  )
    baseChanged();
  return result;
}
async function structured(c, item) {
  const stored = item.structured ?? {},
    result = {};
  const allowed =
    {
      part: ['contentMode'],
      scene: ['wordCount', 'mainWordCount', 'blockWordCount', 'blockCount'],
      block: ['wordCount', 'ownArchived'],
      lore: ['aliases', 'category', 'isPublic'],
    }[item.kind] ?? [];
  for (const key of allowed) {
    if (!Object.hasOwn(stored, key)) continue;
    const value = stored[key];
    if (key.endsWith('Count') || ['wordCount', 'mainWordCount', 'blockWordCount'].includes(key)) {
      if (!count(value)) baseInconsistent();
    } else if (['ownArchived', 'isPublic'].includes(key)) {
      if (typeof value !== 'boolean') baseInconsistent();
    } else if (key === 'aliases') {
      if (!Array.isArray(value) || value.length > 20) baseInconsistent();
      for (const alias of value) if (text(alias).length > 200) baseInconsistent();
    } else {
      text(value);
      if (key === 'contentMode' && !['scenes', 'legacy'].includes(value)) baseInconsistent();
    }
    result[key] = value;
  }
  if (item.kind === 'lore') {
    const relations = stored.relations ?? [];
    if (!Array.isArray(relations) || relations.length > 50) baseInconsistent();
    result.relations = [];
    for (const relation of relations) {
      const origin = loreRelationOrigin(relation?.targetEntityId, c.base);
      if (!origin) baseInconsistent();
      const targetKey = digest(origin),
        target = await c.inspect(targetKey, true);
      if (target && target.value.kind !== 'lore') baseInconsistent();
      if (!target || target.availability !== 'available') {
        result.relations.push({ targetKey, available: false });
        continue;
      }
      const entry = { targetKey, available: true, relationType: text(relation.relationType) };
      if (Object.hasOwn(relation, 'description')) entry.description = text(relation.description);
      result.relations.push(entry);
    }
  }
  return result;
}
/** Called only after metadata proof. No live prose is read. */
export async function campaignBackupBaseContent(c, id, expected) {
  const h = await c.inspect(id);
  if (expected !== h.itemToken) baseChanged();
  if (h.availability !== 'available') return { head: h, content: null };
  const read = await baseMasked(c.tx, c.db.doc(c.path + '/items/' + id), BASE_CONTENT_FIELDS);
  if (digest(read.native) !== digest(h.native)) baseChanged();
  const v = read.value;
  try {
    validItem(v, id);
  } catch {
    baseInconsistent();
  }
  const dto = {
    sourceKey: id,
    kind: v.kind,
    origin: v.origin,
    parentKey: v.parentKey,
    archived: v.archived,
    orderKey: text(v.orderKey),
    title: text(v.title),
  };
  const enums = {
    stage: ['planned', 'writing', 'review', 'done'],
    type: ['introduction', 'preparation', 'scene', 'location', 'quest', 'clue', 'ending'],
    audience: ['creator', 'gm', 'players'],
    role: ['main', 'additional'],
  };
  const optional =
    { scene: ['stage'], block: ['type', 'audience', 'role'], event: ['dateLabel'] }[v.kind] ?? [];
  for (const key of optional) {
    if (!Object.hasOwn(v, key)) continue;
    dto[key] = text(v[key]);
    if (enums[key] && !enums[key].includes(v[key])) baseInconsistent();
  }
  if (v.kind === 'block' && v.role !== v.origin.role) baseInconsistent();
  dto.fields = await fields(c, v, h);
  dto.structured = await structured(c, v);
  if (v.image != null) {
    if (!baseHash(v.image.imageKey)) baseInconsistent();
    dto.image = { imageKey: v.image.imageKey };
    for (const key of ['alt', 'caption'])
      if (Object.hasOwn(v.image, key)) dto.image[key] = text(v.image[key]);
  } else dto.image = null;
  return { head: h, content: dto };
}
