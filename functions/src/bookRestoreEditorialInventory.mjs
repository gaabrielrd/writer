import { BOOK_EDITORIAL_HISTORY_COLLECTIONS } from './bookEditorialStorage.mjs';
import { inconsistent } from './bookRestoreUploadContracts.mjs';

export const BOOK_RESTORE_EDITORIAL_VERSION = 15;
export const BOOK_RESTORE_EDITORIAL_COLLECTIONS = Object.freeze({
  'editorial-record': BOOK_EDITORIAL_HISTORY_COLLECTIONS.records,
  'editorial-body': BOOK_EDITORIAL_HISTORY_COLLECTIONS.bodies,
  'editorial-part': BOOK_EDITORIAL_HISTORY_COLLECTIONS.parts,
  'editorial-contract': 'literaryProduction',
  'editorial-contract-version': 'literaryContractVersions',
  'editorial-plan': 'literaryPlans',
  'editorial-plan-version': 'literaryPlanVersions',
  'editorial-review': BOOK_EDITORIAL_HISTORY_COLLECTIONS.reviews,
});
export const BOOK_RESTORE_EDITORIAL_KINDS = Object.freeze([
  ...Object.keys(BOOK_RESTORE_EDITORIAL_COLLECTIONS),
  'editorial-control',
]);
/** Native addresses only; no paths or callbacks from archive data. */
export function bookRestoreEditorialAddress(loaded, kind, id, version = loaded.job.cleanupVersion) {
  if (!BOOK_RESTORE_EDITORIAL_KINDS.includes(kind)) return null;
  if (!Number.isSafeInteger(version) || version !== BOOK_RESTORE_EDITORIAL_VERSION) inconsistent();
  if (kind === 'editorial-control') {
    if (id !== 'current') inconsistent();
    return loaded.ref.path + '/preparedEditorial/current';
  }
  if (kind === 'editorial-contract') {
    if (id !== 'current') inconsistent();
  } else if (kind === 'editorial-contract-version') {
    if (id !== '1') inconsistent();
  } else if (['editorial-plan', 'editorial-review'].includes(kind)) {
    if (
      !(kind === 'editorial-review' && id === 'contract') &&
      (typeof id !== 'string' || !/^restore-[a-f0-9]{64}$/.test(id))
    )
      inconsistent();
  } else if (kind === 'editorial-part') {
    const match = typeof id === 'string' && /^([a-f0-9]{64}):([0-9]{15})$/.exec(id);
    if (!match || Number(match[2]) >= 128) inconsistent();
  } else if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) inconsistent();
  return 'books/' + loaded.job.bookId + '/' + BOOK_RESTORE_EDITORIAL_COLLECTIONS[kind] + '/' + id;
}
async function emptyCollection(tx, db, path) {
  const page = await tx.get(db.collection(path).select().limit(1));
  if (page.docs.length) inconsistent();
}
/** Certify absence before upgrading the inventory, and again before finishing cancellation. */
export async function assertBookRestoreEditorialNamespacesEmpty(tx, db, loaded) {
  for (const name of Object.values(BOOK_RESTORE_EDITORIAL_COLLECTIONS))
    await emptyCollection(tx, db, 'books/' + loaded.job.bookId + '/' + name);
  await emptyCollection(tx, db, loaded.ref.path + '/preparedEditorial');
  await assertBookEditorialReviewNamespacesEmpty(tx, db, loaded);
  const journals = await tx.get(
    db
      .collection(loaded.ref.path + '/materializationArtifacts')
      .where('kind', 'in', BOOK_RESTORE_EDITORIAL_KINDS)
      .select('kind')
      .limit(1),
  );
  if (journals.docs.length) inconsistent();
}
export async function assertBookRestoreEditorialPartsEmpty(tx, db, loaded) {
  await emptyCollection(
    tx,
    db,
    'books/' + loaded.job.bookId + '/' + BOOK_EDITORIAL_HISTORY_COLLECTIONS.parts,
  );
}

export async function assertBookRestoreEditorialHeadNamespacesEmpty(tx, db, loaded) {
  for (const kind of [
    'editorial-contract',
    'editorial-contract-version',
    'editorial-plan',
    'editorial-plan-version',
    'editorial-review',
  ])
    await emptyCollection(
      tx,
      db,
      'books/' + loaded.job.bookId + '/' + BOOK_RESTORE_EDITORIAL_COLLECTIONS[kind],
    );
}


/** Active-book review resources must never be inherited by a rootless restore. */
export async function assertBookEditorialReviewNamespacesEmpty(tx, db, loaded) {
  for (const name of [BOOK_EDITORIAL_HISTORY_COLLECTIONS.resolutions, BOOK_EDITORIAL_HISTORY_COLLECTIONS.operations, BOOK_EDITORIAL_HISTORY_COLLECTIONS.withdrawals])
    await emptyCollection(tx, db, 'books/' + loaded.job.bookId + '/' + name);
}
