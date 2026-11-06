import {
  inconsistent,
  integer,
  sum,
  bookRestoreArtifactBalance,
} from './bookRestoreUploadContracts.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import {
  BOOK_RESTORE_EDITORIAL_VERSION,
  BOOK_RESTORE_EDITORIAL_KINDS,
  assertBookRestoreEditorialPartsEmpty,
  assertBookRestoreEditorialNamespacesEmpty,
} from './bookRestoreEditorialInventory.mjs';

/** All reads precede the caller's deletes, cursor update and immutable receipt. */
export async function prepareBookRestoreEditorialCleanup(tx, db, loaded, limit) {
  if (
    loaded.job.cleanupVersion !== BOOK_RESTORE_EDITORIAL_VERSION ||
    loaded.job.state !== 'cancelling' ||
    loaded.job.cleanupPhase !== 'editorial'
  )
    inconsistent();
  integer(limit, 1);
  if (limit > 50) inconsistent();
  const journal = db.collection(loaded.ref.path + '/materializationArtifacts');
  async function page(selectedKinds) {
    return tx.get(
      journal
        .where('kind', 'in', selectedKinds)
        .orderBy('__name__')
        .limit(limit + 1),
    );
  }
  let found = await page(['editorial-part']);
  let selected = found.docs.slice(0, limit);
  if (!selected.length) {
    // Never remove a header while a foreign/unregistered part still exists.
    await assertBookRestoreEditorialPartsEmpty(tx, db, loaded);
    found = await page(BOOK_RESTORE_EDITORIAL_KINDS.filter((kind) => kind !== 'editorial-part'));
    selected = found.docs.slice(0, limit);
  }
  const remove = [];
  for (const snapshot of selected) {
    const value = snapshot.data();
    if (!BOOK_RESTORE_EDITORIAL_KINDS.includes(value?.kind)) inconsistent();
    const target = await readBookRestoreArtifact(tx, db, loaded, value.kind, value.id, {
      metadataOnly: true,
    });
    if (target.journal.ref.path !== snapshot.ref.path) inconsistent();
    remove.push(target.ref, snapshot.ref);
  }
  const preparation = structuredClone(loaded.job.preparation);
  preparation.cleanedArtifacts = sum(preparation.cleanedArtifacts, selected.length);
  bookRestoreArtifactBalance(preparation);
  if (!selected.length) await assertBookRestoreEditorialNamespacesEmpty(tx, db, loaded);
  return {
    remove,
    patch: {
      preparation,
      state: 'cancelling',
      cleanupPhase: selected.length ? 'editorial' : 'resource-children',
    },
  };
}
