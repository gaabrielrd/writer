import { encodeBookBackupJSON, serializeBookBackupStructure } from './bookBackupStructure.mjs';
export const BOOK_RESOURCE_KINDS = Object.freeze([
  'lore',
  'scene-control',
  'scene-source',
  'scene',
  'scene-body',
  'scene-planning',
  'scene-reference',
  'narrative-control',
  'arc',
  'milestone',
  'event',
  'narrative-link',
]);
export const BOOK_RESOURCE_CHILDREN = Object.freeze({
  scene: Object.freeze(['scene-body', 'scene-planning', 'scene-reference']),
  arc: Object.freeze(['milestone']),
});
export const BOOK_RESOURCE_SINGLETONS = Object.freeze({
  'scene-control': 'unassigned',
  'scene-body': 'current',
  'scene-planning': 'current',
});
export const BOOK_RESOURCE_ROOTS = Object.freeze([
  'lore',
  'scene-control',
  'scene-source',
  'scene',
  'narrative-control',
  'arc',
  'event',
  'narrative-link',
]);
const own = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
const common = ['schemaVersion', 'revision', 'title', 'rankA', 'rankB', 'createdAt', 'updatedAt'];
function lore(value) {
  return own(value, ['kind', 'scopeId', 'entityId']);
}
function source(value) {
  return own(value, ['kind', 'id', ...(value.kind === 'milestone' ? ['arcId'] : [])]);
}
function reference(value) {
  return value.kind === 'lore'
    ? { kind: 'lore', reference: lore(value.reference) }
    : own(value, ['kind', value.kind === 'scene' ? 'sceneId' : 'eventId']);
}
/** Closed source projection, independent of authorization and the complete portable-book schema. */
export function projectBookBackupResource(kind, value) {
  let data;
  if (kind === 'lore')
    data = {
      ...own(value, [
        'name',
        'aliases',
        'category',
        'summary',
        'details',
        'isPublic',
        'createdAt',
        'updatedAt',
      ]),
      ...(Object.hasOwn(value, 'structuredDetails')
        ? {
            structuredDetails: own(value.structuredDetails, [
              'appearance',
              'personality',
              'history',
              'notes',
            ]),
          }
        : {}),
      ...(Object.hasOwn(value, 'relations')
        ? {
            relations: value.relations.map((relation) =>
              own(relation, ['targetEntityId', 'relationType', 'description']),
            ),
          }
        : {}),
    };
  else if (kind === 'scene')
    data = own(value, [
      ...common,
      'parentId',
      'formerParentId',
      'stage',
      'archived',
      'bodyHash',
      'bodyBytes',
    ]);
  else if (kind === 'scene-body') data = own(value, ['content', 'hash']);
  else if (kind === 'scene-planning') data = own(value, ['objective', 'conflict', 'pointOfView']);
  else if (kind === 'scene-reference') data = lore(value);
  else if (kind === 'scene-control') data = own(value, ['rankSlot']);
  else if (kind === 'scene-source')
    data = {
      ...own(value, ['hash', 'createdAt']),
      original: JSON.parse(serializeBookBackupStructure('chapter', value.original).json),
    };
  else if (kind === 'narrative-control')
    data = { ...own(value, ['rankSlot']), resource: source(value.resource) };
  else if (kind === 'narrative-link')
    data = { source: source(value.source), reference: reference(value.reference) };
  else if (kind === 'arc')
    data = own(value, [...common, 'initialState', 'objective', 'plannedOutcome']);
  else if (kind === 'milestone') data = own(value, [...common, 'arcId', 'notes']);
  else if (kind === 'event') data = own(value, [...common, 'description', 'dateLabel']);
  else throw new TypeError('Recurso de livro inválido.');
  return data;
}
export function serializeBookBackupResource(kind, parentId, id, value) {
  return encodeBookBackupJSON({
    schemaVersion: 1,
    kind,
    parentId,
    id,
    data: projectBookBackupResource(kind, value),
  });
}
