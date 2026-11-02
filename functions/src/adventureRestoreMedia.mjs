import { restoreFail, inconsistent, restoreDate, sum } from './adventureRestoreContracts.mjs';
import {
  mediaRequest,
  assertMediaPhase,
  mediaView,
  validateMediaControl,
} from './adventureRestoreMediaContracts.mjs';
import { prepareAdventureRestoreMedia } from './adventureRestoreMediaRead.mjs';
import { createAdventureRestoreMediaStore } from './adventureRestoreMediaStore.mjs';
import { validateBookRestoreAcceptedMedia } from './bookRestoreMediaContracts.mjs';
import { bookRestoreStorageProof } from './bookRestoreCoverStorageContracts.mjs';
export function createAdventureRestoreMediaService(store, assets) {
  const mediaStore = createAdventureRestoreMediaStore(store);
  async function state(tx, uid, request) {
    const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
    assertMediaPhase(loaded);
    return { loaded, current: await mediaStore.load(tx, loaded) };
  }
  function checkpoint(current, request) {
    if (current.value.checkpoint !== request.expectedCheckpoint)
      restoreFail('failed-precondition', 'media-checkpoint-conflict');
  }
  return {
    async getAdventureRestoreMediaState(uid, input) {
      const request = mediaRequest(uid, input);
      return store.db.runTransaction(async (tx) => {
        const { current } = await state(tx, uid, request);
        return { schemaVersion: 1, media: mediaView(current.value) };
      });
    },
    async advanceAdventureRestoreMedia(uid, input) {
      const request = mediaRequest(uid, input, true);
      const initial = await store.db.runTransaction(async (tx) => {
        const { loaded, current } = await state(tx, uid, request),
          replay = await mediaStore.replay(tx, loaded, current, request);
        if (replay) return { answer: replay };
        checkpoint(current, request);
        if (current.value.complete)
          return {
            answer: {
              schemaVersion: 1,
              kind: 'already-complete',
              receipt: null,
              media: mediaView(current.value),
            },
          };
        return { pending: await prepareAdventureRestoreMedia(store, tx, loaded, current.value) };
      });
      if (initial.answer) return initial.answer;
      let accepted = null,
        proof = null;
      try {
        const pending = initial.pending;
        if (pending) {
          if (pending.unavailable) {
            if (typeof assets?.retire !== 'function') inconsistent();
            proof = bookRestoreStorageProof(
              await assets.retire(pending.context, pending.sourceProof),
            );
            if (proof.generation === pending.sourceProof.generation) inconsistent();
          } else {
            if (typeof assets?.accept !== 'function') inconsistent();
            accepted = validateBookRestoreAcceptedMedia(
              await assets.accept(pending.context, pending.sourceProof),
              pending,
            );
            proof = accepted.proof;
          }
        }
        return await store.db.runTransaction(async (tx) => {
          const { loaded, current } = await state(tx, uid, request),
            replay = await mediaStore.replay(tx, loaded, current, request);
          if (replay) return replay;
          checkpoint(current, request);
          const nextPending = await prepareAdventureRestoreMedia(store, tx, loaded, current.value);
          if ((nextPending?.token ?? null) !== (pending?.token ?? null))
            restoreFail('failed-precondition', 'media-context-changed');
          if (nextPending && !nextPending.unavailable)
            validateBookRestoreAcceptedMedia(accepted, nextPending);
          const next = validateMediaControl(
            {
              ...current.value,
              checkpoint: sum(current.value.checkpoint, 1),
              processed: sum(current.value.processed, Number(Boolean(nextPending))),
              ready: sum(
                current.value.ready,
                Number(Boolean(nextPending && !nextPending.unavailable)),
              ),
              unavailable: sum(
                current.value.unavailable,
                Number(Boolean(nextPending?.unavailable)),
              ),
              cursor: nextPending?.after ?? current.value.cursor,
              complete: nextPending === null,
              firstOperationId: current.value.firstOperationId ?? request.operationId,
              lastOperationId: request.operationId,
              updatedAt: restoreDate(store.now, current.value.updatedAt),
            },
            loaded,
          );
          return mediaStore.commit(
            tx,
            loaded,
            current,
            request,
            next,
            nextPending,
            proof,
            accepted,
          );
        });
      } catch (error) {
        let replay;
        try {
          replay = await store.db.runTransaction(async (tx) => {
            const { loaded, current } = await state(tx, uid, request);
            return mediaStore.replay(tx, loaded, current, request);
          });
        } catch {
          /* Preserve the original I/O or commit failure. */
        }
        if (replay) return replay;
        throw error;
      }
    },
  };
}
