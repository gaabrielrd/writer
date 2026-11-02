import { DEFAULT_PERSONAS } from '../../src/personaProfile.mjs';
export const personaRestoreUid = 'author',
  personaRestoreBook = 'restore-' + 'b'.repeat(64),
  personaRestoreId = 'persona-restore-001',
  personaRestoreProfile = 'custom-' + 'a'.repeat(64),
  personaRestoreToken = 'c'.repeat(64),
  personaRestoreOrigin = {
    schemaVersion: 1,
    bookId: personaRestoreBook,
    restoreId: personaRestoreId,
    jobToken: personaRestoreToken,
  };
export const personaRestoreValue = () => ({
  ...structuredClone(DEFAULT_PERSONAS[0]),
  id: personaRestoreProfile,
  revision: 7,
  createdAt: 3,
  updatedAt: 5,
  restoreOrigin: { ...personaRestoreOrigin },
});
export const personaRestorePaths = {
  profile: 'users/' + personaRestoreUid + '/aiPersonas/' + personaRestoreProfile,
  batch: 'users/' + personaRestoreUid + '/aiPersonaRestoreBatches/' + personaRestoreBook,
  first: 'users/' + personaRestoreUid + '/bookRestoreOperations/persona-install-0001',
  last: 'users/' + personaRestoreUid + '/bookRestoreOperations/persona-activate-001',
};
export const personaRestoreReceipt = (action, id, state, checkpoint) => ({
  schemaVersion: 1,
  ownerId: personaRestoreUid,
  restoreId: personaRestoreId,
  jobToken: personaRestoreToken,
  fingerprint: 'd'.repeat(64),
  receipt: {
    schemaVersion: 1,
    operationId: id,
    action,
    state,
    expectedCheckpoint: checkpoint - 1,
    checkpoint,
  },
});
export async function preparePersonaRestoreBatch(db) {
  const batch = {
    schemaVersion: 1,
    ownerId: personaRestoreUid,
    ...personaRestoreOrigin,
    state: 'preparing',
    profileCount: 1,
    createdByOperationId: 'persona-install-0001',
    lastOperationId: 'persona-install-0001',
  };
  await db.runTransaction(async (tx) => {
    tx.create(db.doc(personaRestorePaths.batch), batch);
    tx.create(db.doc(personaRestorePaths.profile), personaRestoreValue());
    tx.create(
      db.doc(personaRestorePaths.first),
      personaRestoreReceipt(
        'advanceBookRestorePersonaLibrary',
        'persona-install-0001',
        'content-verified',
        1,
      ),
    );
  });
  return batch;
}
export async function activatePersonaRestoreBatch(db) {
  await db.runTransaction(async (tx) => {
    tx.update(db.doc(personaRestorePaths.batch), {
      state: 'active',
      lastOperationId: 'persona-activate-001',
    });
    tx.create(
      db.doc(personaRestorePaths.last),
      personaRestoreReceipt('activateBookRestore', 'persona-activate-001', 'activated', 2),
    );
  });
}
