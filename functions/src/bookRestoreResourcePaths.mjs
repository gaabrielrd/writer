import { inconsistent } from './bookRestoreUploadContracts.mjs';
export const BOOK_RESTORE_RESOURCE_FLAT = Object.freeze({
  'scene-control': 'sceneControls',
  'scene-source': 'sceneSources',
  scene: 'scenes',
  'scene-lore-link': 'sceneLoreLinks',
  'narrative-control': 'narrativeControls',
  arc: 'arcs',
  event: 'timelineEvents',
  'narrative-link': 'narrativeLinks',
});
export const BOOK_RESTORE_RESOURCE_CHILDREN = Object.freeze({
  'scene-body': { parent: 'scenes', collection: 'body', singleton: true },
  'scene-planning': { parent: 'scenes', collection: 'planning', singleton: true },
  'scene-reference': { parent: 'scenes', collection: 'references', hash: true },
  milestone: { parent: 'arcs', collection: 'milestones' },
});
export const BOOK_RESTORE_RESOURCE_TYPES = Object.freeze([
  ...Object.keys(BOOK_RESTORE_RESOURCE_FLAT),
  ...Object.keys(BOOK_RESTORE_RESOURCE_CHILDREN),
]);
const mapped = (id) => typeof id === 'string' && /^restore-[a-f0-9]{64}$/.test(id);
const hashed = (id) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
/** Returns only a fixed native suffix. No user-supplied path is accepted. */
export function bookRestoreResourcePath(kind, id) {
  if (Object.hasOwn(BOOK_RESTORE_RESOURCE_FLAT, kind)) {
    const valid =
      kind === 'scene-control'
        ? id === 'unassigned'
        : ['scene-lore-link', 'narrative-control', 'narrative-link'].includes(kind)
          ? hashed(id)
          : mapped(id);
    if (!valid) inconsistent();
    return BOOK_RESTORE_RESOURCE_FLAT[kind] + '/' + id;
  }
  if (!Object.hasOwn(BOOK_RESTORE_RESOURCE_CHILDREN, kind)) return null;
  const child = BOOK_RESTORE_RESOURCE_CHILDREN[kind],
    parts = typeof id === 'string' ? id.split(':') : [];
  if (
    parts.length !== 2 ||
    !mapped(parts[0]) ||
    !(child.singleton ? parts[1] === 'current' : child.hash ? hashed(parts[1]) : mapped(parts[1]))
  )
    inconsistent();
  return child.parent + '/' + parts[0] + '/' + child.collection + '/' + parts[1];
}
export const bookRestoreParentCollections = (kind) =>
  kind === 'scene' ? ['body', 'planning', 'references'] : kind === 'arc' ? ['milestones'] : [];
