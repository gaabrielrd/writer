import { DEFAULT_PERSONAS } from '../../src/personaProfile.mjs';
// Synthetic native batch harness. The production installer/activation are separate increments.
export const adventurePersonaUid = 'author',
  adventurePersonaProjectId = 'restore-a-' + 'b'.repeat(64),
  adventurePersonaId = 'custom-' + 'e'.repeat(64),
  adventurePersonaOrigin = {
    schemaVersion: 2,
    target: { kind: 'adventure', id: adventurePersonaProjectId },
    restoreId: 'adventure-persona-restore-001',
    jobToken: 'c'.repeat(64),
  },
  adventurePersonaPaths = {
    batch: 'users/author/aiPersonaRestoreBatches/' + adventurePersonaProjectId,
    profile: 'users/author/aiPersonas/' + adventurePersonaId,
    first: 'users/author/adventureRestoreOperations/adventure-persona-install-001',
    last: 'users/author/adventureRestoreOperations/adventure-persona-activate-001',
    cancel: 'users/author/adventureRestoreOperations/adventure-persona-cleanup-001',
  };
export const adventurePersonaValue = () => ({
  ...structuredClone(DEFAULT_PERSONAS[0]),
  id: adventurePersonaId,
  revision: 7,
  createdAt: 3,
  updatedAt: 5,
  restoreOrigin: structuredClone(adventurePersonaOrigin),
});
const receipt = (action, id, state, checkpoint) => ({
  schemaVersion: 1,
  ownerId: adventurePersonaUid,
  restoreId: adventurePersonaOrigin.restoreId,
  jobToken: adventurePersonaOrigin.jobToken,
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
export async function prepareAdventurePersonaBatch(db) {
  await db.runTransaction(async (tx) => {
    tx.create(db.doc(adventurePersonaPaths.profile), adventurePersonaValue());
    tx.create(db.doc(adventurePersonaPaths.batch), {
      ...structuredClone(adventurePersonaOrigin),
      ownerId: adventurePersonaUid,
      state: 'preparing',
      profileCount: 1,
      createdByOperationId: 'adventure-persona-install-001',
      lastOperationId: 'adventure-persona-install-001',
    });
    tx.create(
      db.doc(adventurePersonaPaths.first),
      receipt(
        'advanceAdventureRestorePersonaLibrary',
        'adventure-persona-install-001',
        'content-verified',
        1,
      ),
    );
  });
}
export async function activateAdventurePersonaBatch(db) {
  await db.runTransaction(async (tx) => {
    tx.update(db.doc(adventurePersonaPaths.batch), {
      state: 'active',
      lastOperationId: 'adventure-persona-activate-001',
    });
    tx.create(
      db.doc(adventurePersonaPaths.last),
      receipt('activateAdventureRestore', 'adventure-persona-activate-001', 'activated', 2),
    );
  });
}
export async function cancelAdventurePersonaBatch(db) {
  await db.runTransaction(async (tx) => {
    tx.update(db.doc(adventurePersonaPaths.batch), {
      state: 'cancelled',
      lastOperationId: 'adventure-persona-cleanup-001',
    });
    tx.create(
      db.doc(adventurePersonaPaths.cancel),
      receipt('advanceAdventureRestoreCleanup', 'adventure-persona-cleanup-001', 'cancelling', 3),
    );
  });
}
