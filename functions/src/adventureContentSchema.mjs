import {
  contentInvalid as bad,
  contentClosed as closed,
  contentObject as object,
  contentText as text,
  contentDate as date,
  contentId as id,
  contentHash as hash,
  contentCount as count,
} from './adventureContentPrimitives.mjs';
import {
  ADVENTURE_RESOURCE_DEFINITIONS as definitions,
  ADVENTURE_RESOURCE_FIELDS as fields,
} from './adventureBackupResourceDefinitions.mjs';
import { projectPortablePersonaProfile } from './portablePersonaProfile.mjs';
import { validateComplement } from './personaProfile.mjs';
const rootFields = [
  'title',
  'synopsis',
  'language',
  'status',
  'editorialState',
  'personaId',
  'universeId',
  'createdAt',
  'updatedAt',
  'origin',
];
const partFields = ['title', 'order', 'contentMode', 'content', 'createdAt', 'updatedAt'];
const blockTypes = ['introduction', 'preparation', 'scene', 'location', 'quest', 'clue', 'ending'];
const audiences = ['creator', 'gm', 'players'];
const rank = (value) =>
  typeof value === 'string' && /^[0-9A-Za-z]{1,128}$/.test(value) && !value.endsWith('0');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const optional = (value, key, valid) => {
  if (Object.hasOwn(value, key) && !valid(value[key])) bad();
};
export function validateAdventureStructure(value, kind) {
  if (
    !closed(value, ['schemaVersion', 'kind', 'data']) ||
    value.schemaVersion !== 1 ||
    value.kind !== kind ||
    !['adventure', 'part'].includes(kind) ||
    !closed(value.data, [], kind === 'adventure' ? rootFields : partFields)
  )
    bad();
  const data = value.data;
  for (const key of ['title', 'synopsis', 'language', 'content']) optional(data, key, text);
  for (const key of ['createdAt', 'updatedAt']) optional(data, key, date);
  if (kind === 'adventure') {
    if (!text(data.title) || !['draft', 'ready', 'archived'].includes(data.status)) bad();
    optional(data, 'editorialState', (v) => ['draft', 'review', 'ready'].includes(v));
    for (const key of ['personaId', 'universeId']) optional(data, key, (v) => v === null || id(v));
    if (Object.hasOwn(data, 'origin')) {
      const o = data.origin;
      if (closed(o, ['kind']) && o.kind === 'authored') return data;
      if (
        !closed(o, ['kind', 'sourceMediaType', 'sourceHash', 'reviewHash']) ||
        o.kind !== 'imported' ||
        !text(o.sourceMediaType) ||
        ![o.sourceHash, o.reviewHash].every(
          (v) => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v),
        )
      )
        bad();
    }
  } else {
    optional(data, 'order', finite);
    optional(data, 'contentMode', (v) => ['scenes', 'legacy'].includes(v));
  }
  return data;
}
export function validateAdventureImageReference(value) {
  if (value === null) return null;
  if (
    !closed(value, ['imageId', 'alt', 'caption']) ||
    !id(value.imageId) ||
    !text(value.alt, 1000) ||
    !text(value.caption, 4000)
  )
    bad();
  return value;
}
export function validateAdventureComplement(value) {
  if (value === null) return null;
  if (
    !closed(value, ['personaId', 'overrides']) ||
    !Array.isArray(value.overrides) ||
    !value.overrides.every((v) => closed(v, ['traitId', 'value']))
  )
    bad();
  try {
    validateComplement(value);
  } catch {
    bad();
  }
  return value;
}
export function validateAdventureLoreReference(value) {
  if (
    !closed(value, ['kind', 'scopeId', 'entityId']) ||
    !['book', 'adventure', 'universe'].includes(value.kind) ||
    !id(value.scopeId) ||
    !id(value.entityId)
  )
    bad();
  return value;
}
export function validateAdventureNarrativeSource(value) {
  if (
    !value ||
    !closed(value, ['kind', 'id', ...(value.kind === 'milestone' ? ['arcId'] : [])]) ||
    !['arc', 'event', 'milestone'].includes(value.kind) ||
    !id(value.id) ||
    (value.kind === 'milestone' && !id(value.arcId))
  )
    bad();
  return value;
}
function narrativeReference(value) {
  if (closed(value, ['kind', 'sceneId']) && value.kind === 'scene' && id(value.sceneId)) return;
  if (closed(value, ['kind', 'eventId']) && value.kind === 'event' && id(value.eventId)) return;
  if (closed(value, ['kind', 'reference']) && value.kind === 'lore') {
    validateAdventureLoreReference(value.reference);
    return;
  }
  bad();
}
export function validateAdventureResource(value) {
  if (
    !closed(value, ['schemaVersion', 'kind', 'parentId', 'id', 'present', 'data']) ||
    value.schemaVersion !== 1 ||
    typeof value.kind !== 'string' ||
    !Object.hasOwn(definitions, value.kind) ||
    !id(value.id) ||
    typeof value.present !== 'boolean' ||
    !object(value.data)
  )
    bad();
  const def = definitions[value.kind],
    data = value.data;
  if (
    (def.parent ? !id(value.parentId) : value.parentId !== null) ||
    (!value.present && !def.optional) ||
    !closed(data, [], value.present ? fields[value.kind] : [])
  )
    bad();
  if (!value.present) return value;
  for (const key of [
    'title',
    'content',
    'objective',
    'conflict',
    'pointOfView',
    'initialState',
    'plannedOutcome',
    'description',
    'dateLabel',
    'notes',
  ])
    optional(data, key, text);
  for (const key of ['createdAt', 'updatedAt']) optional(data, key, date);
  for (const key of ['archived', 'completed']) optional(data, key, (v) => typeof v === 'boolean');
  optional(data, 'editorialState', (v) => ['draft', 'review', 'ready'].includes(v));
  optional(data, 'wordGoal', (v) => v === null || (count(v) && v > 0));
  for (const key of ['rankA', 'rankB']) optional(data, key, rank);
  optional(data, 'rankSlot', (v) => v === null || ['A', 'B'].includes(v));
  optional(data, 'bodyHash', hash);
  for (const key of ['parentId', 'formerParentId']) optional(data, key, (v) => v === null || id(v));
  optional(data, 'stage', (v) => ['planned', 'writing', 'review', 'done'].includes(v));
  optional(data, 'order', finite);
  optional(data, 'mainBlockOrder', (v) => v === null || count(v));
  optional(data, 'mainBlockTitle', (v) => v === null || text(v));
  optional(data, 'mainBlockType', (v) => v === null || blockTypes.includes(v));
  optional(data, 'mainBlockAudience', (v) => v === null || audiences.includes(v));
  for (const key of ['mainBlockImage', 'image'])
    if (Object.hasOwn(data, key)) validateAdventureImageReference(data[key]);
  if (Object.hasOwn(data, 'personaComplement')) validateAdventureComplement(data.personaComplement);
  if (value.kind === 'checklist' && (!text(data.title) || typeof data.completed !== 'boolean'))
    bad();
  if (def.body && (!text(data.content) || !hash(data.hash))) bad();
  if (value.kind === 'scene-reference') validateAdventureLoreReference(data);
  if (
    value.kind === 'block' &&
    (!id(data.sceneId) ||
      !blockTypes.includes(data.narrativeType) ||
      !audiences.includes(data.audience))
  )
    bad();
  if (
    def.nativeKind &&
    (data.kind !== def.nativeKind || (value.kind === 'milestone' && data.arcId !== value.parentId))
  )
    bad();
  if (def.narrativeSource) {
    validateAdventureNarrativeSource(data.source);
    narrativeReference(data.reference);
  }
  return value;
}
export function validateAdventurePersona(value) {
  if (
    !closed(value, ['schemaVersion', 'kind', 'scope', 'bindingId', 'personaId', 'profile']) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'persona' ||
    !['adventure', 'scene'].includes(value.scope) ||
    !id(value.bindingId)
  )
    bad();
  if (value.personaId === null) {
    if (value.profile !== null) bad();
    return value;
  }
  const p = value.profile;
  if (
    !id(value.personaId) ||
    !closed(p, [
      'id',
      'schemaVersion',
      'name',
      'description',
      'instructions',
      'revision',
      'archived',
      'createdAt',
      'updatedAt',
      'traits',
    ]) ||
    p.id !== value.personaId ||
    !Array.isArray(p.traits) ||
    !p.traits.every((t) => closed(t, ['id', 'name', 'description', 'low', 'high', 'value']))
  )
    bad();
  try {
    projectPortablePersonaProfile(p);
  } catch {
    bad();
  }
  return value;
}
export function validateAdventureLore(value, kind) {
  if (
    !closed(value, ['schemaVersion', 'kind', 'id', 'data']) ||
    value.schemaVersion !== 1 ||
    value.kind !== kind ||
    !id(value.id)
  )
    bad();
  const d = value.data;
  if (kind === 'lore') {
    if (!object(d) || typeof d.deleted !== 'boolean') bad();
    if (d.deleted) {
      if (!closed(d, ['deleted', 'createdAt', 'updatedAt'])) bad();
    } else {
      if (
        !closed(d, [
          'name',
          'aliases',
          'category',
          'summary',
          'isPublic',
          'deleted',
          'createdAt',
          'updatedAt',
        ]) ||
        !text(d.name, 200) ||
        !d.name.trim() ||
        d.name.trim() !== d.name ||
        !text(d.summary, 140) ||
        !d.summary.trim() ||
        d.summary.trim() !== d.summary ||
        !['character', 'location', 'concept', 'other'].includes(d.category) ||
        d.isPublic !== false ||
        !Array.isArray(d.aliases) ||
        d.aliases.length > 20 ||
        !d.aliases.every((a) => text(a, 200) && a.trim() && a.trim() === a)
      )
        bad();
    }
    if (
      !count(d.createdAt) ||
      !count(d.updatedAt) ||
      !date(d.createdAt) ||
      !date(d.updatedAt) ||
      d.updatedAt < d.createdAt
    )
      bad();
  } else if (kind === 'lore-body') {
    const structured = ['appearance', 'personality', 'history', 'notes'];
    if (
      !closed(d, ['details', 'structuredDetails', 'relations']) ||
      !text(d.details, 150000) ||
      !closed(d.structuredDetails, structured) ||
      !structured.every((k) => text(d.structuredDetails[k], 150000)) ||
      !Array.isArray(d.relations) ||
      d.relations.length > 50
    )
      bad();
    for (const r of d.relations) {
      if (
        !closed(r, ['targetEntityId', 'relationType', 'description']) ||
        !text(r.targetEntityId) ||
        !text(r.relationType, 200) ||
        !r.relationType.trim() ||
        r.relationType.trim() !== r.relationType ||
        !text(r.description, 4000)
      )
        bad();
      const parts = r.targetEntityId.split(':');
      if (
        parts.length !== 3 ||
        !['adventure', 'universe'].includes(parts[0]) ||
        !id(parts[1]) ||
        !id(parts[2])
      )
        bad();
    }
  } else bad();
  return d;
}

export function validateAdventureVersion(value) {
  if (
    !closed(value, ['schemaVersion', 'kind', 'parentId', 'id', 'data']) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'version' ||
    value.parentId !== null ||
    !id(value.id)
  )
    bad();
  const d = value.data;
  if (
    !closed(
      d,
      ['resource', 'createdAt', 'reason', 'wordCount', 'byteLength', 'contentHash', 'chunkCount'],
      ['label'],
    ) ||
    !closed(d.resource, ['kind', 'id']) ||
    !['scene', 'block'].includes(d.resource.kind) ||
    !id(d.resource.id) ||
    !date(d.createdAt) ||
    !['manual', 'before-restore'].includes(d.reason) ||
    !count(d.wordCount) ||
    !count(d.byteLength) ||
    !hash(d.contentHash) ||
    !count(d.chunkCount) ||
    d.chunkCount < Math.max(1, Math.ceil(d.byteLength / 65536)) ||
    d.chunkCount > Math.max(1, Math.ceil(d.byteLength / 65533)) ||
    (Object.hasOwn(d, 'label') && d.label !== null && !text(d.label))
  )
    bad();
  return d;
}
export function validateAdventureVersionBody(value) {
  if (
    !closed(value, [
      'schemaVersion',
      'versionId',
      'layout',
      'headerHash',
      'byteLength',
      'contentHash',
      'chunkCount',
    ]) ||
    value.schemaVersion !== 1 ||
    !id(value.versionId) ||
    value.layout !== 'fixed64k' ||
    !hash(value.headerHash) ||
    !count(value.byteLength) ||
    !hash(value.contentHash) ||
    value.chunkCount !== Math.max(1, Math.ceil(value.byteLength / 65536)) ||
    value.chunkCount > 0xffffffff
  )
    bad();
  return value;
}
export function validateAdventureDraft(value) {
  if (
    !closed(value, [
      'schemaVersion',
      'resource',
      'baseRevision',
      'savedAt',
      'layout',
      'byteLength',
      'chunkCount',
      'contentHash',
      'current',
    ]) ||
    value.schemaVersion !== 1 ||
    !closed(value.resource, ['kind', 'id']) ||
    !['scene', 'block'].includes(value.resource.kind) ||
    !id(value.resource.id) ||
    !count(value.baseRevision) ||
    value.baseRevision < 1 ||
    !date(value.savedAt) ||
    value.layout !== 'utf8-parts' ||
    !count(value.byteLength) ||
    !count(value.chunkCount) ||
    !hash(value.contentHash) ||
    value.chunkCount < Math.max(1, Math.ceil(value.byteLength / 65536)) ||
    value.chunkCount > Math.max(1, Math.ceil(value.byteLength / 65533)) ||
    !closed(value.current, ['headHash', 'bodyHash']) ||
    !hash(value.current.headHash) ||
    !hash(value.current.bodyHash)
  )
    bad();
  return value;
}
export function validateAdventureImageBinding(value) {
  if (
    !closed(value, ['schemaVersion', 'resource', 'image']) ||
    value.schemaVersion !== 1 ||
    !closed(value.resource, ['kind', 'id']) ||
    !['scene', 'block'].includes(value.resource.kind) ||
    !id(value.resource.id)
  )
    bad();
  const image = value.image;
  if (
    image !== null &&
    (!closed(image, ['assetId', 'imageId', 'alt', 'caption']) ||
      !hash(image.assetId) ||
      !id(image.imageId) ||
      !text(image.alt, 1000) ||
      !text(image.caption, 4000))
  )
    bad();
  return value;
}
export function validateAdventureImageAsset(value) {
  if (
    !closed(
      value,
      [
        'schemaVersion',
        'assetId',
        'imageId',
        'contentType',
        'byteLength',
        'chunkCount',
        'contentHash',
      ],
      ['name', 'createdAt', 'updatedAt'],
    ) ||
    value.schemaVersion !== 1 ||
    !hash(value.assetId) ||
    !id(value.imageId) ||
    value.contentType !== 'image/png' ||
    !count(value.byteLength) ||
    value.byteLength < 8 ||
    value.byteLength > 16 * 1024 * 1024 ||
    value.chunkCount !== Math.ceil(value.byteLength / 65536) ||
    !hash(value.contentHash)
  )
    bad();
  optional(value, 'name', (v) => text(v, 300));
  for (const key of ['createdAt', 'updatedAt']) optional(value, key, count);
  return value;
}
