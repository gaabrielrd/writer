import { utf8 } from './campaignSessionsContracts.mjs';
import { validSceneRank } from './sceneRanks.mjs';
import { adventureBlockTypes, adventureBlockAudiences } from './adventureBlocksState.mjs';

export const ADVENTURE_RESOURCE_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      'part-control': { path: 'parts', control: true },
      'scene-control': {
        path: 'sceneControls',
        singleton: 'unassigned',
        control: true,
        optional: true,
      },
      scene: { path: 'scenes', owner: true },
      'scene-body': { path: 'body', parent: 'scenes', singleton: 'current', body: true },
      'scene-planning': {
        path: 'planning',
        parent: 'scenes',
        singleton: 'current',
        optional: true,
      },
      'scene-reference': { path: 'references', parent: 'scenes' },
      block: { path: 'sceneBlocks', owner: true, scene: true },
      'block-body': { path: 'body', parent: 'sceneBlocks', singleton: 'current', body: true },
    }).map(([key, value]) => [key, Object.freeze(value)]),
  ),
);
export const ADVENTURE_RESOURCE_KINDS = Object.freeze(Object.keys(ADVENTURE_RESOURCE_DEFINITIONS));
const common = ['title', 'createdAt', 'updatedAt'];
export const ADVENTURE_RESOURCE_FIELDS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      'part-control': ['rankSlot'],
      'scene-control': ['rankSlot'],
      scene: [
        ...common,
        'parentId',
        'formerParentId',
        'stage',
        'archived',
        'rankA',
        'rankB',
        'bodyHash',
        'mainBlockOrder',
        'mainBlockTitle',
        'mainBlockType',
        'mainBlockAudience',
        'mainBlockImage',
        'personaComplement',
      ],
      'scene-body': ['content', 'hash'],
      'block-body': ['content', 'hash'],
      'scene-planning': ['objective', 'conflict', 'pointOfView'],
      'scene-reference': ['kind', 'scopeId', 'entityId'],
      block: [
        ...common,
        'sceneId',
        'narrativeType',
        'audience',
        'order',
        'archived',
        'bodyHash',
        'image',
      ],
    }).map(([key, value]) => [key, Object.freeze(value)]),
  ),
);
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
    (definition.singleton && resourceId !== definition.singleton) ||
    (!present && !definition.optional)
  )
    invalid();
  let data = {};
  if (present) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    value = own(value, ADVENTURE_RESOURCE_FIELDS[kind]);
    for (const key of ['title', 'content', 'objective', 'conflict', 'pointOfView'])
      optional(value, key, utf8);
    for (const key of ['createdAt', 'updatedAt']) optional(value, key, date);
    optional(value, 'archived', (v) => typeof v === 'boolean');
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
    data = own(value, ADVENTURE_RESOURCE_FIELDS[kind]);
    for (const key of ['mainBlockImage', 'image'])
      if (Object.hasOwn(data, key)) data[key] = image(data[key]);
    if (Object.hasOwn(data, 'personaComplement'))
      data.personaComplement = persona(data.personaComplement);
  }
  const json = JSON.stringify({ schemaVersion: 1, kind, parentId, id: resourceId, present, data });
  return { json, bytes: new TextEncoder().encode(json) };
}
