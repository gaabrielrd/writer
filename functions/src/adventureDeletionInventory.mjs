import { workFail, workId } from './workProgressContracts.mjs';

// Version one is independent from restoration layouts and must not shift a live job.
export const ADVENTURE_DELETION_ROOT_COLLECTIONS = Object.freeze([
  'parts',
  'scenes',
  'sceneBlocks',
  'sceneControls',
  'sceneJobs',
  'arcs',
  'timelineEvents',
  'narrativeControls',
  'narrativeLinks',
  'narrativeJobs',
  'sceneLoreLinks',
  'lore',
  'loreBodies',
  'workProgress',
  'workWordSources',
  'workWordGroups',
  'workChecklist',
  'workVersions',
  'workVersionBodies',
]);

const nested = [
  { collection: 'body', parents: ['scenes', 'sceneBlocks'] },
  { collection: 'planning', parents: ['scenes'] },
  { collection: 'references', parents: ['scenes'] },
  { collection: 'milestones', parents: ['arcs'] },
];
export const ADVENTURE_DELETION_LAYOUT = Object.freeze([
  ...nested.map((value) =>
    Object.freeze({ scope: 'nested', ...value, parents: Object.freeze(value.parents) }),
  ),
  ...ADVENTURE_DELETION_ROOT_COLLECTIONS.map((collection) =>
    Object.freeze({ scope: 'root', collection }),
  ),
]);
export const ADVENTURE_DELETION_PAGE_SIZE = 25;
const invalid = () =>
  workFail(
    'failed-precondition',
    'O inventário da aventura está inconsistente.',
    'adventure-deletion-inventory-inconsistent',
  );
export function adventureDeletionRoot(p) {
  workId(p.ownerId);
  return 'adventures/' + workId(p.adventureId);
}
function fields(family) {
  return [
    'ownerId',
    'adventureId',
    ...(family.collection === 'workVersions' ? ['target.kind', 'target.id'] : []),
  ];
}
function belongs(path, root, family) {
  if (typeof path !== 'string' || !path.startsWith(root + '/')) return false;
  const relative = path.slice(root.length + 1).split('/');
  if (family.scope === 'root')
    return relative.length === 2 && relative[0] === family.collection && relative[1].length > 0;
  return (
    relative.length === 4 &&
    family.parents.includes(relative[0]) &&
    relative[1].length > 0 &&
    relative[2] === family.collection &&
    relative[3].length > 0
  );
}
/** Private metadata reader. The caller must first prove the deletion job/reservation. */
export async function readAdventureDeletionInventoryPage(
  tx,
  db,
  p,
  familyIndex,
  limit = ADVENTURE_DELETION_PAGE_SIZE,
) {
  if (
    !Number.isInteger(familyIndex) ||
    familyIndex < 0 ||
    familyIndex >= ADVENTURE_DELETION_LAYOUT.length ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > ADVENTURE_DELETION_PAGE_SIZE
  )
    invalid();
  const family = ADVENTURE_DELETION_LAYOUT[familyIndex],
    root = adventureDeletionRoot(p);
  let query;
  if (family.scope === 'nested') {
    if (typeof db.collectionGroup !== 'function') invalid();
    // Both bounds share the exact adventure path. Every authorized root collection
    // has an ASCII letter as its first character, between these fixed sentinels.
    query = db
      .collectionGroup(family.collection)
      .orderBy('__name__')
      .startAt(db.doc(root + '/!/!'))
      .endBefore(db.doc(root + '/~/~'));
  } else query = db.collection(root + '/' + family.collection).orderBy('__name__');
  const page = await tx.get(query.select(...fields(family)).limit(limit));
  if (!Array.isArray(page?.docs) || page.docs.length > limit) invalid();
  for (const snapshot of page.docs) {
    if (
      !snapshot.exists ||
      !belongs(snapshot.ref?.path, root, family) ||
      snapshot.id !== snapshot.ref.path.split('/').at(-1)
    )
      invalid();
    const value = snapshot.data();
    if (
      !value ||
      (value.ownerId !== undefined && value.ownerId !== p.ownerId) ||
      (value.adventureId !== undefined && value.adventureId !== p.adventureId)
    )
      invalid();
    if (
      family.collection === 'workVersions' &&
      value.target !== undefined &&
      (value.target?.kind !== 'adventure' || value.target?.id !== p.adventureId)
    )
      invalid();
  }
  return {
    familyIndex,
    scope: family.scope,
    collection: family.collection,
    documents: page.docs,
    empty: page.docs.length === 0,
  };
}
export async function assertAdventureDeletionInventoryEmpty(tx, db, p) {
  for (let index = 0; index < ADVENTURE_DELETION_LAYOUT.length; index++)
    if (!(await readAdventureDeletionInventoryPage(tx, db, p, index, 1)).empty) invalid();
}
