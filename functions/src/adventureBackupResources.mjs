import { utf8 } from './campaignSessionsContracts.mjs';
import { validSceneRank } from './sceneRanks.mjs';
import { sequenceKey } from './narrativeContracts.mjs';
import { adventureBlockTypes, adventureBlockAudiences } from './adventureBlocksState.mjs';

import {
  ADVENTURE_RESOURCE_DEFINITIONS,
  ADVENTURE_RESOURCE_KINDS,
  ADVENTURE_RESOURCE_FIELDS,
} from './adventureBackupResourceDefinitions.mjs';
export {
  ADVENTURE_RESOURCE_DEFINITIONS,
  ADVENTURE_RESOURCE_KINDS,
  ADVENTURE_RESOURCE_FIELDS,
} from './adventureBackupResourceDefinitions.mjs';
export function adventureResourceSingleton(kind, parentId) {
  const definition = ADVENTURE_RESOURCE_DEFINITIONS[kind];
  return definition.sequence
    ? sequenceKey({
        kind: definition.sequence,
        ...(definition.sequence === 'milestone' ? { arcId: parentId } : {}),
      })
    : definition.singleton;
}
const own = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
function invalid() {
  throw new TypeError('Recurso não representável no backup da aventura.');
}
const id = (value) =>
  utf8(value) &&
  value.length > 0 &&
  Buffer.byteLength(value) <= 1500 &&
  !value.includes('/') &&
  !['.', '..'].includes(value);
const date = (value) => Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function optional(value, key, valid) {
  if (Object.hasOwn(value, key) && !valid(value[key])) invalid();
}
function image(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !id(value.imageId)) invalid();
  for (const key of ['alt', 'caption']) optional(value, key, utf8);
  return own(value, ['imageId', 'alt', 'caption']);
}
function persona(value) {
  if (value === null) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !id(value.personaId) ||
    !Array.isArray(value.overrides)
  )
    invalid();
  return {
    personaId: value.personaId,
    overrides: value.overrides.map((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !utf8(entry.traitId) ||
        !Number.isFinite(entry.value)
      )
        invalid();
      return own(entry, ['traitId', 'value']);
    }),
  };
}
function narrativeSource(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !['arc', 'event', 'milestone'].includes(value.kind) ||
    !id(value.id) ||
    (value.kind === 'milestone' && !id(value.arcId))
  )
    invalid();
  return own(value, ['kind', 'id', ...(value.kind === 'milestone' ? ['arcId'] : [])]);
}
function narrativeReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (value.kind === 'scene' && id(value.sceneId)) return own(value, ['kind', 'sceneId']);
  if (value.kind === 'event' && id(value.eventId)) return own(value, ['kind', 'eventId']);
  const ref = value.reference;
  if (
    value.kind === 'lore' &&
    ref &&
    ['book', 'adventure', 'universe'].includes(ref.kind) &&
    id(ref.scopeId) &&
    id(ref.entityId)
  )
    return { kind: 'lore', reference: own(ref, ['kind', 'scopeId', 'entityId']) };
  invalid();
}
export function serializeAdventureBackupResource(
  kind,
  parentId,
  resourceId,
  value,
  present = true,
) {
  if (
    !ADVENTURE_RESOURCE_KINDS.includes(kind) ||
    !id(resourceId) ||
    typeof present !== 'boolean' ||
    (parentId !== null && !id(parentId))
  )
    invalid();
  const definition = ADVENTURE_RESOURCE_DEFINITIONS[kind];
  if (
    (definition.parent && parentId === null) ||
    (!definition.parent && parentId !== null) ||
    (definition.singleton && resourceId !== adventureResourceSingleton(kind, parentId)) ||
    (!present && !definition.optional)
  )
    invalid();
  let data = {};
  if (present) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    value = own(value, ADVENTURE_RESOURCE_FIELDS[kind]);
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
      optional(value, key, utf8);
    for (const key of ['createdAt', 'updatedAt']) optional(value, key, date);
    optional(value, 'archived', (v) => typeof v === 'boolean');
    optional(value, 'completed', (v) => typeof v === 'boolean');
    optional(value, 'editorialState', (v) => ['draft', 'review', 'ready'].includes(v));
    optional(value, 'wordGoal', (v) => v === null || (Number.isSafeInteger(v) && v > 0));
    if (kind === 'checklist' && (!utf8(value.title) || typeof value.completed !== 'boolean'))
      invalid();
    for (const key of ['rankA', 'rankB']) optional(value, key, validSceneRank);
    optional(value, 'rankSlot', (v) => v === null || ['A', 'B'].includes(v));
    optional(value, 'bodyHash', hash);
    for (const key of ['parentId', 'formerParentId'])
      optional(value, key, (v) => v === null || id(v));
    optional(value, 'stage', (v) => ['planned', 'writing', 'review', 'done'].includes(v));
    optional(value, 'order', Number.isFinite);
    optional(value, 'mainBlockOrder', (v) => v === null || (Number.isSafeInteger(v) && v >= 0));
    optional(value, 'mainBlockTitle', (v) => v === null || utf8(v));
    optional(value, 'mainBlockType', (v) => v === null || adventureBlockTypes.includes(v));
    optional(value, 'mainBlockAudience', (v) => v === null || adventureBlockAudiences.includes(v));
    if (definition.body && (!utf8(value.content) || !hash(value.hash))) invalid();
    if (
      kind === 'scene-reference' &&
      (!['book', 'adventure', 'universe'].includes(value.kind) ||
        !id(value.scopeId) ||
        !id(value.entityId))
    )
      invalid();
    if (
      kind === 'block' &&
      (!id(value.sceneId) ||
        !adventureBlockTypes.includes(value.narrativeType) ||
        !adventureBlockAudiences.includes(value.audience))
    )
      invalid();
    if (
      definition.nativeKind &&
      (value.kind !== definition.nativeKind || (kind === 'milestone' && value.arcId !== parentId))
    )
      invalid();
    data = own(value, ADVENTURE_RESOURCE_FIELDS[kind]);
    if (definition.narrativeSource) {
      data.source = narrativeSource(value.source);
      data.reference = narrativeReference(value.reference);
    }
    for (const key of ['mainBlockImage', 'image'])
      if (Object.hasOwn(data, key)) data[key] = image(data[key]);
    if (Object.hasOwn(data, 'personaComplement'))
      data.personaComplement = persona(data.personaComplement);
  }
  const json = JSON.stringify({ schemaVersion: 1, kind, parentId, id: resourceId, present, data });
  return { json, bytes: new TextEncoder().encode(json) };
}
