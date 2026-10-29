import { validItem, validateCapturedFields } from './campaignBaseValidation.mjs';
import { categories, entityInput } from './campaignLoreContracts.mjs';
import { campaignManifestId } from './portableCampaignManifest.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
export const campaignDerivedBad = () =>
  workFail(
    'failed-precondition',
    'A estrutura derivada do arquivo está inconsistente.',
    'campaign-backup-derived-invalid',
  );
const bad = campaignDerivedBad,
  hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const closed = (v, required, optional = []) => {
  if (
    !object(v) ||
    required.some((k) => !Object.hasOwn(v, k)) ||
    Object.keys(v).some((k) => !required.includes(k) && !optional.includes(k))
  )
    bad();
};
const text = (v) => {
  if (typeof v !== 'string' || Buffer.from(v).toString('utf8') !== v) bad();
  return v;
};
const id = (v) => {
  try {
    return campaignManifestId(v);
  } catch {
    bad();
  }
};
const hashed = (v) => {
  if (!hash(v)) bad();
  return v;
};
const bool = (v) => {
  if (typeof v !== 'boolean') bad();
};
const count = (v) => {
  if (!Number.isSafeInteger(v) || v < 0) bad();
};
function target(v) {
  closed(v, ['kind', 'sourceKey', 'available']);
  if (!['scene', 'event', 'lore'].includes(v.kind)) bad();
  hashed(v.sourceKey);
  bool(v.available);
  return v;
}
function relation(v, variant = false, sourceKey) {
  closed(v, ['targetKey', 'available'], v?.available ? ['relationType', 'description'] : []);
  hashed(v.targetKey);
  bool(v.available);
  if (variant && v.targetKey === sourceKey) bad();
  if (v.available) {
    text(v.relationType);
    if (Object.hasOwn(v, 'description')) text(v.description);
  }
  return { targetKey: v.targetKey, available: v.available };
}
function snapshot(v) {
  closed(v, ['adventureId', 'universeId', 'capturedAt', 'title', 'synopsis', 'language']);
  id(v.adventureId);
  if (v.universeId !== null) id(v.universeId);
  if (!Number.isFinite(v.capturedAt) || v.capturedAt < 0 || v.capturedAt > 8640000000000000) bad();
  for (const k of ['title', 'synopsis', 'language']) text(v[k]);
  return { adventureId: v.adventureId, universeId: v.universeId, capturedAt: v.capturedAt };
}
function item(v, key) {
  const optional =
    { scene: ['stage'], block: ['type', 'audience', 'role'], event: ['dateLabel'] }[v?.kind] ?? [];
  closed(
    v,
    [
      'sourceKey',
      'kind',
      'origin',
      'parentKey',
      'archived',
      'orderKey',
      'title',
      'fields',
      'structured',
      'image',
    ],
    optional,
  );
  try {
    validItem(v, key);
    validateCapturedFields(v);
  } catch {
    bad();
  }
  for (const k of ['title', 'orderKey']) text(v[k]);
  if (v.sourceKey !== digest(v.origin)) bad();
  const o = v.origin;
  if (v.kind === 'lore') {
    if (o?.kind === 'lore') {
      closed(o, ['kind', 'scopeId', 'id']);
      id(o.scopeId);
    } else if (o?.kind === 'adventure-lore') {
      closed(o, ['kind', 'adventureId', 'id']);
      id(o.adventureId);
    } else bad();
  } else {
    const extra = v.kind === 'block' ? ['role'] : v.kind === 'milestone' ? ['arcId'] : [];
    closed(o, ['adventureId', 'kind', 'id', ...extra]);
    id(o.adventureId);
    if (o.kind !== v.kind) bad();
    if (v.kind === 'milestone') id(o.arcId);
    if (v.kind === 'block' && (!['main', 'additional'].includes(o.role) || v.role !== o.role))
      bad();
  }
  id(o.id);
  const enums = {
    stage: ['planned', 'writing', 'review', 'done'],
    type: ['introduction', 'preparation', 'scene', 'location', 'quest', 'clue', 'ending'],
    audience: ['creator', 'gm', 'players'],
    role: ['main', 'additional'],
  };
  for (const k of optional)
    if (Object.hasOwn(v, k)) {
      text(v[k]);
      if (enums[k] && !enums[k].includes(v[k])) bad();
    }
  for (const f of v.fields) closed(f, ['field', 'sha256', 'bytes', 'chunkCount', 'bodySourceKey']);
  const allowed =
    {
      part: ['contentMode'],
      scene: ['wordCount', 'mainWordCount', 'blockWordCount', 'blockCount'],
      block: ['wordCount', 'ownArchived'],
      lore: ['aliases', 'category', 'isPublic', 'relations'],
    }[v.kind] ?? [];
  closed(v.structured, [], allowed);
  for (const [k, value] of Object.entries(v.structured)) {
    if (k.endsWith('Count')) count(value);
    else if (['ownArchived', 'isPublic'].includes(k)) bool(value);
    else if (k === 'contentMode') {
      if (!['scenes', 'legacy'].includes(value)) bad();
    } else if (k === 'aliases') {
      if (!Array.isArray(value) || value.length > 20) bad();
      for (const alias of value) if (text(alias).length > 200) bad();
    } else if (k === 'category') {
      if (!categories.includes(value)) bad();
    } else {
      if (!Array.isArray(value) || value.length > 50) bad();
      for (const r of value) relation(r);
    }
  }
  let image = null;
  if (v.image !== null) {
    closed(v.image, ['imageKey'], ['alt', 'caption']);
    image = hashed(v.image.imageKey);
    for (const k of ['alt', 'caption']) if (Object.hasOwn(v.image, k)) text(v.image[k]);
  }
  return {
    sourceKey: key,
    kind: v.kind,
    origin: o,
    parentKey: v.parentKey,
    fields: v.fields,
    ...(v.role ? { role: v.role } : {}),
    image,
    relations: (v.structured.relations ?? []).map((r) => relation(r)),
  };
}
function variant(v, key) {
  closed(
    v,
    ['sourceKey', 'anchorKey', 'mode', 'name', 'category'],
    ['previousMode', 'participation', 'retainedLegacy', 'entity'],
  );
  if (v.sourceKey !== key) bad();
  hashed(v.anchorKey);
  text(v.name);
  if (!categories.includes(v.category) || !['base', 'override', 'removed'].includes(v.mode)) bad();
  if (Object.hasOwn(v, 'previousMode') && !['base', 'override'].includes(v.previousMode)) bad();
  if (
    Object.hasOwn(v, 'participation') &&
    !['candidate', 'legacy', 'inactive'].includes(v.participation)
  )
    bad();
  if (Object.hasOwn(v, 'retainedLegacy')) bool(v.retainedLegacy);
  const mode = v.mode === 'removed' ? v.previousMode : v.mode,
    relations = [];
  if (mode === 'override') {
    const e = v.entity;
    closed(e, [
      'name',
      'aliases',
      'category',
      'summary',
      'details',
      'structuredDetails',
      'relations',
    ]);
    if (!Array.isArray(e.relations) || e.relations.length > 50) bad();
    const input = {
      ...e,
      relations: e.relations
        .filter((r) => r.available)
        .map((r) => {
          relation(r, true, key);
          closed(r, ['targetKey', 'available', 'relationType', 'description']);
          return {
            targetKey: r.targetKey,
            relationType: r.relationType,
            description: r.description,
          };
        }),
    };
    let normalized;
    try {
      normalized = entityInput(input, key);
    } catch {
      bad();
    }
    if (
      JSON.stringify(normalized) !== JSON.stringify(input) ||
      e.name !== v.name ||
      e.category !== v.category
    )
      bad();
    for (const r of e.relations) relations.push(relation(r, true, key));
  } else if (mode !== 'base' || Object.hasOwn(v, 'entity')) bad();
  return {
    sourceKey: key,
    anchorKey: v.anchorKey,
    mode: v.mode,
    previousMode: v.previousMode ?? null,
    participation: v.participation ?? null,
    relations,
  };
}
/** Closed portable DTOs, compact metadata only; this does not authorize any declared origin. */
export function parseCampaignDerivedUnit(unit, bytes) {
  if (
    unit.outcome !== 'available' ||
    ['base:field', 'anchor:field', 'image'].includes(unit.section)
  )
    return null;
  if (!(bytes instanceof Uint8Array) || bytes.length > 4 * 1024 * 1024) bad();
  const raw = Buffer.from(bytes).toString('utf8');
  if (!Buffer.from(raw).equals(Buffer.from(bytes))) bad();
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    bad();
  }
  if (JSON.stringify(v) !== raw) bad();
  switch (unit.section) {
    case 'base':
      return snapshot(v);
    case 'base:item':
      return item(v, unit.id);
    case 'base:bodies':
      closed(v, ['sourceKey', 'field', 'index']);
      hashed(v.sourceKey);
      text(v.field);
      count(v.index);
      return v;
    case 'base:links':
      closed(v, ['id', 'kind', 'sourceKey', 'target']);
      if (v.id !== unit.id || !['scene', 'narrative'].includes(v.kind)) bad();
      hashed(v.sourceKey);
      target(v.target);
      return v;
    case 'base:loreReferences':
      closed(v, ['id', 'targetKey', 'available']);
      if (v.id !== unit.id) bad();
      hashed(v.targetKey);
      bool(v.available);
      return v;
    case 'variant':
      return variant(v, unit.id);
    case 'anchor':
      closed(v, ['anchorKey', 'source', 'item']);
      if (v.anchorKey !== unit.id) bad();
      return {
        anchorKey: v.anchorKey,
        source: snapshot(v.source),
        item: item(v.item, v.item?.sourceKey),
      };
    default:
      bad();
  }
}
