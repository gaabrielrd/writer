import { ADVENTURE_RESTORE_ROOT_COLLECTIONS } from './adventureRestoreRootCollections.mjs';
export const ADVENTURE_AUDIT_LAYOUT = Object.freeze([
  ...ADVENTURE_RESTORE_ROOT_COLLECTIONS.map((collection) => ({
    scope: 'adventure',
    collection,
  })),
  ...[
    ['scenes', 'body'],
    ['scenes', 'planning'],
    ['scenes', 'references'],
    ['sceneBlocks', 'body'],
    ['arcs', 'milestones'],
  ].map(([parentCollection, collection]) => ({ scope: 'adventure', parentCollection, collection })),
  { scope: 'job', collection: 'preparedRoot' },
  { scope: 'persona', collection: 'aiPersonas' },
]);
