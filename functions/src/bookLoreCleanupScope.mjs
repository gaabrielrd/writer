import { isDeletionOpening, deletionConflict } from './bookLoreDeletionStore.mjs';
import { isRemovalOpening } from './bookLoreRemovalStore.mjs';
/** Only native openings registered by their controllers; DTOs and other transactions cannot authorize cleanup. */
export function assertLoreCleanupOpening(tx, l) {
  if (!isDeletionOpening(tx, l) && !isRemovalOpening(tx, l)) deletionConflict();
}
export function loreCleanupQuery(l, name) {
  let q = l.c.db.collection('books/' + l.c.bookId + '/' + name);
  if (l.c.loreId)
    q =
      name === 'bookResourceBodies'
        ? q.where('resource.kind', '==', 'lore').where('resource.id', '==', l.c.loreId)
        : q.where('loreId', '==', l.c.loreId);
  return q;
}
