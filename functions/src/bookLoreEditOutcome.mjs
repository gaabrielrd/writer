import { authorize, born, closed, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  editReservationPaths,
  editReservationConflict as conflict,
} from './bookLoreEditReservationContracts.mjs';
import { loadEditReservation } from './bookLoreEditReservationStore.mjs';
import { validateParentAdoption } from './bookLoreEditAdoptionProofs.mjs';
import { editAdoptionView } from './bookLoreEditAdoptionContracts.mjs';

export function setBookLoreEditOutcomeHeaders(method, request) {
  if (method !== 'bookLoreEditOutcome') return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
function request(uid, input) {
  authorize(uid);
  closed(
    input,
    ['writeId', 'bookId', 'loreId', 'sourceToken', 'editId', 'startHash'],
    ['jobToken', 'outcomeToken'],
  );
  const identity = {
    writeId: bookContentId(input.writeId),
    bookId: bookContentId(input.bookId),
    loreId: bookContentId(input.loreId),
    sourceToken: restoreHash(input.sourceToken),
    editId: bookContentId(input.editId),
    startHash: restoreHash(input.startHash),
  };
  const expected =
    'lore-edit-' +
    digest({
      domain: 'writer-book-lore-client-job',
      uid,
      writeId: identity.writeId,
      bookId: identity.bookId,
      loreId: identity.loreId,
      kind: 'lore-edit',
      index: 0,
    });
  if (identity.editId !== expected) conflict();
  for (const key of ['jobToken', 'outcomeToken'])
    if (Object.hasOwn(input, key)) restoreHash(input[key]);
  return {
    identity,
    ...Object.fromEntries(
      ['jobToken', 'outcomeToken']
        .filter((key) => Object.hasOwn(input, key))
        .map((key) => [key, input[key]]),
    ),
  };
}
/** Historical metadata only. Neither absence nor a pending state permits replay. */
export function createBookLoreEditOutcomeService({ db }) {
  return {
    async bookLoreEditOutcome(uid, input) {
      const r = request(uid, input),
        c = editReservationPaths(db, uid, r.identity.editId);
      return db.runTransaction(async (tx) => {
        const l = await loadEditReservation(tx, c, {
          startHash: r.identity.startHash,
          ...(r.jobToken === undefined ? {} : { jobToken: r.jobToken }),
        });
        if (!l) {
          if (r.jobToken !== undefined || r.outcomeToken !== undefined) conflict();
          const orphans = await Promise.all(
            ['operations', 'operationProofs', 'slots'].map((name) =>
              tx.get(
                db
                  .collection(c.path + '/' + name)
                  .limit(1)
                  .select(),
              ),
            ),
          );
          if (orphans.some((page) => page.docs.length)) conflict();
          return null;
        }
        const intent = l.job.context?.intent;
        if (
          l.job.kind !== 'fence' &&
          (l.job.context.sourceMode === 'creation' ||
            intent.creation ||
            intent.bookId !== r.identity.bookId ||
            intent.loreId !== r.identity.loreId ||
            intent.sourceToken !== r.identity.sourceToken)
        )
          conflict();
        const applied = l.job.phase === 'adopted';
        let adoption = null,
          outcomeToken = null;
        if (applied) {
          const original = await validateParentAdoption(tx, l),
            a = l.job.adoption;
          adoption = { ...editAdoptionView(a), privacy: a.privacy };
          outcomeToken = digest({
            domain: 'writer-book-lore-edit-outcome',
            schemaVersion: 1,
            uid,
            identity: r.identity,
            jobToken: l.token,
            receiptBirth: born(original.proof.snapshot),
            receiptHash: digest(original.proof.record),
            eventBirth: born(original.event.event),
            eventHash: digest(original.event.record),
          });
        }
        if (r.outcomeToken !== undefined && r.outcomeToken !== outcomeToken) conflict();
        return {
          schemaVersion: 1,
          ...r.identity,
          jobToken: l.token,
          phase: l.job.phase,
          applied,
          changedFields: intent ? Object.keys(intent.fields) : [],
          relationsChanged: intent ? Object.hasOwn(intent, 'relations') : false,
          adoption,
          outcomeToken,
        };
      });
    },
  };
}
