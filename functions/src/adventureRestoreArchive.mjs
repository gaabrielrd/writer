import {
  authorize,
  restoreFail,
  sum,
  restoreDate,
  inconsistent,
} from './adventureRestoreContracts.mjs';
import { createAdventureRestoreMediaStore } from './adventureRestoreMediaStore.mjs';
import {
  archiveRequest,
  initialArchive,
  validateArchive,
  archiveView,
} from './adventureRestoreArchiveContracts.mjs';
import { createAdventureRestoreArchiveStore } from './adventureRestoreArchiveStore.mjs';
import { prepareAdventureRestoreArchiveUnit } from './adventureRestoreArchiveUnits.mjs';
import { readAdventureRestoreKey } from './adventureRestoreRecoveryKey.mjs';
export function createAdventureRestoreArchiveService(store) {
  const mediaStore = createAdventureRestoreMediaStore(store),
    archiveStore = createAdventureRestoreArchiveStore(store);
  async function state(tx, uid, request) {
    if (typeof tx.getAll !== 'function') inconsistent();
    const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
    if (loaded.job.state !== 'activated')
      restoreFail('failed-precondition', 'archive-phase-conflict');
    const media = await mediaStore.load(tx, loaded),
      control = await archiveStore.load(tx, loaded, media);
    return { loaded, media, control };
  }
  return {
    async getAdventureRestoreArchiveCleanup(uid, input) {
      authorize(uid);
      const request = archiveRequest(input);
      return store.db.runTransaction(async (tx) => {
        const s = await state(tx, uid, request);
        return { schemaVersion: 1, progress: archiveView(s.control.value, s.media.value.complete) };
      });
    },
    async advanceAdventureRestoreArchiveCleanup(uid, input) {
      authorize(uid);
      const request = archiveRequest(input, true);
      return store.db.runTransaction(async (tx) => {
        const { loaded, media, control } = await state(tx, uid, request);
        return (
          await prepareAdventureRestoreArchiveCleanup(store, tx, loaded, media, control, request)
        ).answer;
      });
    },
  };
}

// Compose one original archive checkpoint with a caller's own transaction.
export async function prepareAdventureRestoreArchiveCleanup(
  store,
  tx,
  loaded,
  media,
  control,
  request,
) {
  const archiveStore = createAdventureRestoreArchiveStore(store);
  if (!media.value.complete) restoreFail('failed-precondition', 'archive-media-not-complete');
  const replay = await archiveStore.replay(tx, loaded, media, control, request);
  if (replay) return { answer: replay, removedDocuments: 0 };
  if (control.value?.phase === 'done')
    return {
      answer: {
        schemaVersion: 1,
        kind: 'already-complete',
        receipt: null,
        progress: archiveView(control.value, true),
      },
      removedDocuments: 0,
    };
  const p = control.value ? structuredClone(control.value) : initialArchive(loaded, media);
  if (p.checkpoint !== request.expectedCheckpoint)
    restoreFail('failed-precondition', 'archive-checkpoint-conflict');
  const key = !control.value ? await readAdventureRestoreKey(store, tx, loaded, true) : null;
  const remove = await prepareAdventureRestoreArchiveUnit(store, tx, loaded, p);
  p.checkpoint = sum(p.checkpoint, 1);
  p.firstOperationId ??= request.operationId;
  p.lastOperationId = request.operationId;
  p.updatedAt = restoreDate(store.now, p.updatedAt);
  if (p.phase === 'done') p.completedAt = p.updatedAt;
  validateArchive(p, loaded, media);
  if (key) tx.delete(key.ref);
  for (const ref of remove) tx.delete(ref);
  return {
    answer: archiveStore.commit(tx, loaded, control, request, p),
    removedDocuments: remove.length + Number(Boolean(key)),
  };
}
