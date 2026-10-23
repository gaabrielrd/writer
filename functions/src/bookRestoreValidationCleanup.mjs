import { digest } from './sceneContracts.mjs';
import { inconsistent, chunkId } from './bookRestoreUploadContracts.mjs';
import { validationContext } from './bookRestoreValidationStore.mjs';
export const VALIDATION_COLLECTIONS = ['validationIndex', 'validationItems', 'validationState'];
export async function prepareBookRestoreValidationCleanup(tx, db, loaded, limit) {
  const phase = loaded.job.cleanupPhase,
    names = {
      'validation-index': 'validationIndex',
      'validation-items': 'validationItems',
      'validation-state': 'validationState',
    },
    name = names[phase];
  if (![3, 4, 5, 6, 7, 8, 9, 10].includes(loaded.job.cleanupVersion) || !name) inconsistent();
  const page = await tx.get(
    db
      .collection(loaded.ref.path + '/' + name)
      .select('schemaVersion', 'ownerId', 'restoreId', 'jobToken', 'key', 'index')
      .orderBy('__name__')
      .limit(name === 'validationState' ? 2 : limit + 1),
  );
  if (name === 'validationState' && page.docs.length > 1) inconsistent();
  const removed = name === 'validationState' ? page.docs : page.docs.slice(0, limit);
  for (const snapshot of removed) {
    const value = snapshot.data();
    validationContext(value, loaded);
    if (name === 'validationIndex') {
      if (!Array.isArray(value.key) || snapshot.id !== digest(value.key)) inconsistent();
    } else if (name === 'validationItems') {
      if (snapshot.id !== chunkId(value.index) || value.index >= loaded.job.validationMeta.items)
        inconsistent();
    } else if (snapshot.id !== 'current') inconsistent();
  }
  const finished = page.docs.length <= limit || name === 'validationState';
  const next = {
    'validation-index': 'validation-items',
    'validation-items': 'validation-state',
    'validation-state': 'proofs',
  };
  return {
    remove: removed.map((v) => v.ref),
    patch: {
      state: 'cancelling',
      cleanupPhase: finished ? next[phase] : phase,
      ...(name === 'validationState' ? { validationStateHash: null } : {}),
    },
  };
}
