import { readWorkMetadata, workFail } from './workProgressContracts.mjs';
import { adventureImageUseKey } from './adventureBlockImages.mjs';
import { adventureDeletionInconsistent as invalid } from './adventureDeletionContracts.mjs';
import { assertAdventureDeletionRestoreClosed } from './adventureDeletionRestore.mjs';
import { assertAdventureDeletionImportCollected } from './adventureDeletionImports.mjs';
import {
  ADVENTURE_DELETION_LAYOUT,
  readAdventureDeletionInventoryPage,
} from './adventureDeletionInventory.mjs';

const PAGE = 25;
const resourceId = (id) =>
  typeof id === 'string' &&
  id.length > 0 &&
  id.isWellFormed() &&
  !id.includes('/') &&
  !['.', '..'].includes(id) &&
  Buffer.byteLength(id) <= 1500;
const nextPhase = (p, phase) => ({
  ...p,
  phase,
  part: 0,
  cursor: null,
  parentId: null,
  childPart: 0,
  childCursor: null,
  certified: [...p.certified, p.phase],
});

/** Source proofs and actual empty queries, never a new publication path. */
export async function assertAdventureDeletionMediaClosed(tx, db, p, now) {
  await assertAdventureDeletionRestoreClosed(tx, db, p, now);
  await assertAdventureDeletionImportCollected(tx, db, p);
  for (const collection of ['adventureRestoreRecoveryKeys', 'adventureImportRecoveryKeys'])
    if (
      (
        await tx.get(
          db
            .collection('users/' + p.ownerId + '/' + collection)
            .where('adventureId', '==', p.adventureId)
            .select()
            .limit(1),
        )
      ).docs.length
    )
      invalid();
  const preparing = await tx.get(
    db
      .collection('users/' + p.ownerId + '/imageLibrary')
      .where('restoreOrigin.target.kind', '==', 'adventure')
      .where('restoreOrigin.target.id', '==', p.adventureId)
      .where('state', '==', 'preparing')
      .select()
      .limit(1),
  );
  if (preparing.docs.length) invalid();
}

export async function readAdventureDeletionImageUses(tx, db, p) {
  if (typeof db.collectionGroup !== 'function') invalid();
  const root = 'users/' + p.ownerId + '/imageLibrary';
  const rows = await tx.get(
    db
      .collectionGroup('uses')
      .where('adventureId', '==', p.adventureId)
      .orderBy('__name__')
      .startAt(db.doc(root + '/!/uses/!'))
      .endBefore(db.doc(root + '/~/uses/~'))
      .select('kind', 'adventureId', 'resource.kind', 'resource.id', 'ownerId')
      .limit(PAGE),
  );
  if (!Array.isArray(rows?.docs) || rows.docs.length > PAGE) invalid();
  const items = [];
  for (const snapshot of rows.docs) {
    if (
      !snapshot.exists ||
      typeof snapshot.ref?.path !== 'string' ||
      !snapshot.ref.path.startsWith(root + '/')
    )
      invalid();
    const parts = snapshot.ref.path.slice(root.length + 1).split('/'),
      v = snapshot.data(),
      resource = v?.resource;
    if (
      parts.length !== 3 ||
      !/^[a-zA-Z0-9-]{16,80}$/.test(parts[0]) ||
      parts[1] !== 'uses' ||
      parts[2] !== snapshot.id ||
      v?.kind !== 'adventure-block' ||
      v.adventureId !== p.adventureId ||
      (v.ownerId !== undefined && v.ownerId !== p.ownerId) ||
      !['scene', 'block'].includes(resource?.kind) ||
      !resourceId(resource?.id) ||
      snapshot.id !== adventureImageUseKey(p.adventureId, resource)
    )
      invalid();
    items.push({ snapshot, imagePath: root + '/' + parts[0], imageId: parts[0] });
  }
  return items;
}

/** Remove typed own uses, grouping counters across this whole bounded page. */
export async function prepareAdventureDeletionImageUses(tx, db, p) {
  const items = await readAdventureDeletionImageUses(tx, db, p);
  if (!items.length) return nextPhase(p, 'children');
  const images = new Map();
  for (const item of items) {
    const entry = images.get(item.imagePath) ?? { id: item.imageId, removed: 0 };
    entry.removed++;
    images.set(item.imagePath, entry);
  }
  for (const [path, entry] of images) {
    const snapshot = await readWorkMetadata(tx, db.doc(path), [
      'id',
      'state',
      'useCount',
      'ownerId',
    ]);
    if (!snapshot.exists) continue; // The typed orphan use can be retired without recreating a library copy.
    const v = snapshot.data();
    if (
      v.id !== entry.id ||
      v.state !== 'active' ||
      (v.ownerId !== undefined && v.ownerId !== p.ownerId) ||
      !Number.isSafeInteger(v.useCount) ||
      v.useCount < entry.removed
    )
      invalid();
    entry.ref = snapshot.ref;
    entry.count = v.useCount - entry.removed;
  }
  for (const item of items) tx.delete(item.snapshot.ref);
  for (const entry of images.values())
    if (entry.ref) tx.update(entry.ref, { useCount: entry.count });
  return { ...p, deletedDocuments: p.deletedDocuments + items.length };
}

export async function advanceAdventureDeletionCleanup(tx, db, p, now) {
  if (p.phase === 'media') {
    await assertAdventureDeletionMediaClosed(tx, db, p, now);
    return nextPhase(p, 'images');
  }
  if (p.phase === 'images') return prepareAdventureDeletionImageUses(tx, db, p);
  if (p.phase === 'children') {
    if (p.part > ADVENTURE_DELETION_LAYOUT.length) invalid();
    if (p.part === ADVENTURE_DELETION_LAYOUT.length) {
      for (let index = 0; index < ADVENTURE_DELETION_LAYOUT.length; index++)
        if (!(await readAdventureDeletionInventoryPage(tx, db, p, index, 1)).empty)
          return { ...p, part: index };
      return nextPhase(p, 'controls');
    }
    const page = await readAdventureDeletionInventoryPage(tx, db, p, p.part);
    for (const snapshot of page.documents) tx.delete(snapshot.ref);
    return {
      ...p,
      part: p.part + Number(page.empty),
      deletedDocuments: p.deletedDocuments + page.documents.length,
    };
  }
  workFail(
    'failed-precondition',
    'Esta etapa da exclusão ainda está em implementação.',
    'adventure-deletion-step-unavailable',
  );
}
