import { digest } from './sceneContracts.mjs';
import { date, inconsistent } from './bookRestoreUploadContracts.mjs';
import {
  bookRestoreMediaRequest,
  bookRestoreMediaFingerprint,
  assertBookRestoreMediaPhase,
  validateBookRestoreAcceptedMedia,
  validateBookRestoreMediaOutcome,
} from './bookRestoreMediaContracts.mjs';
import {
  readBookRestoreMediaOutcome,
  validateBookRestoreMediaOp,
  bookRestoreMediaOpRef,
  bookRestoreMediaView,
  bookRestoreMediaReceipt,
} from './bookRestoreMediaOutcome.mjs';
import { prepareBookRestorePendingMedia } from './bookRestoreMediaPending.mjs';
export function createBookRestoreMediaService({ db, assets, load, now }) {
  async function state(tx, uid, request, checkOp = false) {
    const loaded = await load(tx, uid, request.restoreId, request.jobToken);
    assertBookRestoreMediaPhase(loaded);
    const op = checkOp ? await tx.get(bookRestoreMediaOpRef(db, uid, request.operationId)) : null;
    if (op?.exists) validateBookRestoreMediaOp(op, loaded, request);
    const outcome = await readBookRestoreMediaOutcome(tx, db, loaded);
    if (op?.exists && (!outcome || outcome.value.operationId !== request.operationId))
      inconsistent();
    return { loaded, outcome, op };
  }
  async function confirmed(tx, s, kind = 'confirmed') {
    return {
      schemaVersion: 1,
      kind,
      receipt: bookRestoreMediaReceipt(s.outcome),
      media: await bookRestoreMediaView(tx, db, s.loaded, s.outcome),
    };
  }
  return {
    async getBookRestoreMediaState(uid, input) {
      const request = bookRestoreMediaRequest(uid, input);
      return db.runTransaction(async (tx) => {
        const s = await state(tx, uid, request);
        return {
          schemaVersion: 1,
          media: await bookRestoreMediaView(tx, db, s.loaded, s.outcome),
          receipt: s.outcome ? bookRestoreMediaReceipt(s.outcome) : null,
        };
      });
    },
    async finalizeBookRestoreMedia(uid, input) {
      const request = bookRestoreMediaRequest(uid, input, true);
      const initial = await db.runTransaction(async (tx) => {
        const s = await state(tx, uid, request, true);
        if (s.outcome)
          return { answer: await confirmed(tx, s, s.op.exists ? 'confirmed' : 'already-complete') };
        return { pending: await prepareBookRestorePendingMedia(tx, db, s.loaded) };
      });
      if (initial.answer) return initial.answer;
      let accepted = null;
      try {
        if (initial.pending && !initial.pending.unavailable) {
          if (typeof assets?.accept !== 'function') inconsistent();
          accepted = validateBookRestoreAcceptedMedia(
            await assets.accept(initial.pending.context, initial.pending.sourceProof),
            initial.pending,
          );
        }
        return await db.runTransaction(async (tx) => {
          const s = await state(tx, uid, request, true);
          if (s.outcome) return confirmed(tx, s, s.op.exists ? 'confirmed' : 'already-complete');
          const pending = await prepareBookRestorePendingMedia(tx, db, s.loaded);
          if ((pending?.token ?? null) !== (initial.pending?.token ?? null)) inconsistent();
          if (pending && !pending.unavailable) validateBookRestoreAcceptedMedia(accepted, pending);
          const completedAt = date(
              now,
              Math.max(
                s.loaded.job.activation.activatedAt,
                pending?.attach ? (pending.root.data().updatedAt ?? 0) : 0,
              ),
            ),
            j = s.loaded.job,
            value = validateBookRestoreMediaOutcome(
              {
                schemaVersion: 1,
                ownerId: uid,
                restoreId: j.restoreId,
                jobToken: s.loaded.view.jobToken,
                bookId: j.bookId,
                activationOperationId: j.activation.operationId,
                operationId: request.operationId,
                state: pending ? (pending.unavailable ? 'unavailable' : 'ready') : 'none',
                imageId: pending?.cover.imageId ?? null,
                sourceProof: pending?.sourceProof ?? null,
                storageProof: accepted?.proof ?? null,
                urlHash: accepted ? digest(accepted.url) : null,
                rootUpdated: pending?.attach ?? false,
                completedAt,
              },
              s.loaded,
            ),
            outcomeRef = db.doc(s.loaded.ref.path + '/activationMedia/current');
          if (pending && !pending.unavailable) {
            tx.update(pending.imageRef, {
              state: 'active',
              url: accepted.url,
              restoreStorage: {
                ...pending.image.data().restoreStorage,
                publishedProof: accepted.proof,
              },
            });
            if (pending.attach)
              tx.update(pending.rootRef, { coverUrl: accepted.url, updatedAt: completedAt });
          }
          tx.create(outcomeRef, value);
          tx.create(bookRestoreMediaOpRef(db, uid, request.operationId), {
            schemaVersion: 1,
            ownerId: uid,
            restoreId: j.restoreId,
            jobToken: s.loaded.view.jobToken,
            operationId: request.operationId,
            action: 'finalizeBookRestoreMedia',
            requestHash: bookRestoreMediaFingerprint(uid, request),
            outcomeHash: digest(value),
          });
          return {
            schemaVersion: 1,
            kind: 'confirmed',
            receipt: bookRestoreMediaReceipt({ value }),
            media: {
              state: value.state,
              imageId: value.imageId,
              imageAvailable: Boolean(pending && !pending.unavailable),
              imageState: pending ? (pending.unavailable ? 'unavailable' : 'available') : 'none',
              completedAt,
            },
          };
        });
      } catch (error) {
        const answer = await db.runTransaction(async (tx) => {
          const s = await state(tx, uid, request, true);
          return s.outcome
            ? confirmed(tx, s, s.op.exists ? 'confirmed' : 'already-complete')
            : null;
        });
        if (answer) return answer;
        throw error;
      }
    },
  };
}
