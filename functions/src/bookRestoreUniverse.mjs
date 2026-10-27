import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { inspectPortableRestoreUniverse } from './portableUniverseRestore.mjs';
import { validateBookBackupUniverseOrigin } from './bookBackupUniverse.mjs';
import { validateBookRestoreUniverseSelection } from './bookRestoreUniverseContracts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { prepareUniverseProjectLink } from './universes.mjs';

export async function inspectBookRestoreUniverse(tx, db, uid, input) {
  authorize(uid);
  let origin;
  try {
    origin = validateBookBackupUniverseOrigin(input);
  } catch {
    inconsistent();
  }
  try {
    return await inspectPortableRestoreUniverse(tx, db, uid, origin);
  } catch (error) {
    if (error instanceof TypeError) inconsistent();
    throw error;
  }
}

/** Internal activation plan. Caller must commit the returned effects with the authorized new root. */
export async function prepareBookRestoreUniverseLink(tx, db, loaded, item, now = Date.now) {
  if (
    loaded?.job?.state !== 'content-verified' ||
    loaded.job.preparation?.schemaVersion < 6 ||
    loaded.ref?.path !== 'users/' + loaded.job.ownerId + '/bookRestores/' + loaded.job.restoreId ||
    typeof item?.verify !== 'function' ||
    item.record?.kind !== 'book-universe' ||
    item.record.id !== loaded.job.bookId
  )
    inconsistent();
  let selection;
  try {
    selection = validateBookRestoreUniverseSelection(loaded.job.preparation.universe);
  } catch {
    inconsistent();
  }
  const current = await tx.get(loaded.ref);
  if (
    !current.exists ||
    digest(current.data()) !== digest(loaded.job) ||
    nativeRestoreToken(current) !== nativeRestoreToken(loaded.snapshot) ||
    digest(item.value.origin) !== digest(selection.origin)
  )
    inconsistent();
  await item.verify(tx);
  const inspected = await inspectBookRestoreUniverse(tx, db, loaded.job.ownerId, item.value.origin);
  const plan =
    inspected.universeId === null
      ? { commit() {} }
      : await prepareUniverseProjectLink(
          tx,
          db,
          loaded.job.ownerId,
          { kind: 'book', id: loaded.job.bookId },
          null,
          inspected.universeId,
          now,
          { strict: true },
        );
  return { ...inspected, commit: plan.commit };
}

const action = 'advanceBookRestoreUniverse';
export function createBookRestoreUniverseService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  function available(loaded, request) {
    if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    if (loaded.job.preparation?.phase !== 'universe')
      fail('failed-precondition', 'universe-phase-conflict');
  }
  return {
    async advanceBookRestoreUniverse(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      async function resolved(tx, loaded) {
        const op = await tx.get(opRef(uid, request.operationId));
        return op.exists
          ? confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded))
          : null;
      }
      const initial = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return { result };
        available(loaded, request);
        return { loaded };
      });
      if (initial.result) return initial.result;
      let item;
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        item = await reader.readMappedItem(initial.loaded.job.preparation.itemIndex);
      } catch (error) {
        const result = await db.runTransaction(async (tx) =>
          resolved(tx, await load(tx, uid, request.restoreId, request.jobToken)),
        );
        if (result) return result;
        throw error;
      }
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          result = await resolved(tx, loaded);
        if (result) return result;
        available(loaded, request);
        await item.verify(tx);
        if (item.record.kind !== 'book-universe' || item.record.id !== loaded.job.bookId)
          inconsistent();
        const inspected = await inspectBookRestoreUniverse(tx, db, uid, item.value.origin),
          preparation = structuredClone(loaded.job.preparation);
        preparation.schemaVersion = 6;
        preparation.universe = validateBookRestoreUniverseSelection({
          schemaVersion: 1,
          itemIndex: preparation.itemIndex,
          origin: inspected.origin,
          observed: inspected.observed,
        });
        preparation.itemIndex = sum(preparation.itemIndex, 1);
        preparation.phase = 'history';
        const record = next(loaded.job, request, { preparation });
        tx.update(loaded.ref, record);
        const receipt = writeOp(
          tx,
          uid,
          request.restoreId,
          action,
          request,
          record,
          loaded.view.jobToken,
        );
        return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, receipt);
      });
    },
  };
}
