import { born, bornEqual } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  creationConflict as conflict,
  creationIntent,
  creationPaths,
  creationRequest,
  creationView,
  creationCleanupRequest,
} from './bookLoreCreationContracts.mjs';
import {
  loadCreationReservation,
  creationBook,
  assertCreationEmpty,
  creationSlots,
  createCreationContext,
  writeCreationCancellation,
} from './bookLoreCreationStore.mjs';
import { assertDeletionOpening, deletionScopeCheck } from './bookLoreDeletionStore.mjs';
import {
  requestCreationCancellation,
  advanceCreationCleanupInTransaction,
} from './bookLoreCreationCleanup.mjs';
export const creationBookQuery = (db, uid, bookId) =>
  db.collection('users/' + uid + '/bookLoreCreations').where('intent.bookId', '==', bookId);
export function createBookLoreCreationReservationService({ db }) {
  const get = (uid, input) => {
    const r = creationRequest(uid, input),
      c = creationPaths(db, uid, r);
    return db.runTransaction(async (tx) => {
      const l = await loadCreationReservation(tx, c, r);
      return l ? creationView(l) : null;
    });
  };
  return {
    getBookLoreCreationReservation: get,
    async advanceBookLoreCreationCleanup(uid, input) {
      const r = creationCleanupRequest(uid, input),
        c = creationPaths(db, uid, r);
      return db.runTransaction(async (tx) => {
        const l = await loadCreationReservation(tx, c, r);
        if (!l) conflict();
        return advanceCreationCleanupInTransaction(tx, l, r);
      });
    },
    async startBookLoreCreationReservation(uid, input) {
      const intent = creationIntent(uid, input),
        c = creationPaths(db, uid, intent);
      const result = await db.runTransaction(async (tx) => {
        const l = await loadCreationReservation(tx, c);
        if (l) return creationView(l);
        const root = await creationBook(tx, c),
          slots = await creationSlots(tx, c);
        if (Object.values(slots).some((s) => s.exists)) conflict();
        await assertCreationEmpty(tx, c);
        createCreationContext(tx, c, born(root));
        if (root.data().hasLoreResources !== true) tx.update(root.ref, { hasLoreResources: true });
        return null;
      });
      return result ?? get(uid, intent);
    },
    async cancelBookLoreCreationReservation(uid, input) {
      const r = creationRequest(uid, input, true),
        intent = creationIntent(uid, { bookId: r.bookId, creationId: r.creationId }),
        c = creationPaths(db, uid, intent);
      const result = await db.runTransaction(async (tx) => {
        const l = await loadCreationReservation(tx, c, r);
        if (l) return requestCreationCancellation(tx, l, r);
        if (r.jobToken !== undefined) conflict();
        const slots = await creationSlots(tx, c);
        if (
          slots.reservation.exists ||
          slots.cancel.exists ||
          slots.proof.exists ||
          slots.adoption.exists ||
          slots.adoptionProof.exists
        )
          conflict();
        const context = createCreationContext(tx, c);
        writeCreationCancellation(tx, c, context, null, r);
        return null;
      });
      return result ?? get(uid, intent);
    },
  };
}
export async function advanceBookLoreCreationCleanup(tx, l, next) {
  assertDeletionOpening(tx, l);
  let query = creationBookQuery(l.c.db, l.c.uid, l.c.bookId).orderBy('__name__').limit(1);
  if (next.cursor) query = query.startAfter(next.cursor);
  const s = (await tx.get(query)).docs[0];
  if (!s) {
    next.phase = 'heads';
    next.cursor = null;
    return;
  }
  deletionScopeCheck(l, s);
  const intent = s.data().intent,
    c = creationPaths(l.c.db, l.c.uid, intent),
    job = await loadCreationReservation(tx, c);
  if (
    !job ||
    intent.bookId !== l.c.bookId ||
    (job.context.kind === 'reservation' &&
      !bornEqual(l.root, { createTime: job.context.bookBirth }))
  )
    conflict();
  if (job.cancellation || job.adoption) {
    next.cursor = s.id;
    return;
  }
  const r = {
    ...intent,
    jobToken: job.token,
    operationId: digest([
      'book-lore-creation-book-cancel',
      l.token,
      s.id,
      job.cancelRequest?.state.revision ?? null,
    ]),
  };
  const result = job.cancelRequest
    ? await advanceCreationCleanupInTransaction(tx, job, {
        ...r,
        expectedRevision: job.cancelRequest.state.revision,
      })
    : { progress: await requestCreationCancellation(tx, job, r) };
  if (result.progress.phase === 'cancelled') next.cursor = s.id;
  next.coordinatedUnits++;
}
