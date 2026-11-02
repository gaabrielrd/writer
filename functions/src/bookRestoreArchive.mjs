import { date, sum, inconsistent, restoreFail as fail } from './bookRestoreUploadContracts.mjs';
import { readBookRestoreMediaOutcome } from './bookRestoreMediaOutcome.mjs';
import {
  bookRestoreArchiveRequest,
  bookRestoreArchiveFingerprint,
  bookRestoreArchiveContext,
  BOOK_RESTORE_ARCHIVE_COUNTERS,
  validateBookRestoreArchiveProgress,
} from './bookRestoreArchiveContracts.mjs';
import {
  bookRestoreArchiveOpRef,
  readBookRestoreArchiveOp,
  readBookRestoreArchiveControl,
  assertBookRestoreArchiveHistory,
  bookRestoreArchiveView,
} from './bookRestoreArchiveStore.mjs';
import { prepareBookRestoreArchiveUnit } from './bookRestoreArchiveUnits.mjs';
export function createBookRestoreArchiveService({ db, load, readOp, now }) {
  async function state(tx, uid, request) {
    const loaded = await load(tx, uid, request.restoreId, request.jobToken);
    if (loaded.job.state !== 'activated') fail('failed-precondition', 'archive-phase-conflict');
    const media = await readBookRestoreMediaOutcome(tx, db, loaded),
      control = await readBookRestoreArchiveControl(tx, db, loaded, media);
    return { loaded, media, control };
  }
  return {
    async getBookRestoreArchiveCleanup(uid, input) {
      const request = bookRestoreArchiveRequest(uid, input);
      return db.runTransaction(async (tx) => {
        const s = await state(tx, uid, request);
        return { schemaVersion: 1, progress: bookRestoreArchiveView(s.control, s.media) };
      });
    },
    async advanceBookRestoreArchiveCleanup(uid, input) {
      const request = bookRestoreArchiveRequest(uid, input, true);
      return db.runTransaction(async (tx) => {
        const s = await state(tx, uid, request),
          op = await tx.get(bookRestoreArchiveOpRef(db, uid, request.operationId));
        if (op.exists) {
          if (!s.media || !s.control.value) inconsistent();
          const receipt = readBookRestoreArchiveOp(op, s.loaded, s.media, request);
          assertBookRestoreArchiveHistory(receipt.progress, s.control.value);
          return {
            schemaVersion: 1,
            kind: 'confirmed',
            receipt: structuredClone(receipt.progress),
            progress: bookRestoreArchiveView(s.control, s.media),
          };
        }
        if (!s.media) fail('failed-precondition', 'archive-media-not-complete');
        if (s.control.value?.phase === 'done')
          return {
            schemaVersion: 1,
            kind: 'already-complete',
            receipt: null,
            progress: bookRestoreArchiveView(s.control, s.media),
          };
        const old = s.control.value;
        if (request.expectedRevision !== (old?.revision ?? 0))
          fail('failed-precondition', 'archive-revision-conflict');
        const progress = old
            ? structuredClone(old)
            : {
                ...bookRestoreArchiveContext(s.loaded, s.media),
                revision: 0,
                phase: 'artifacts',
                after: null,
                removed: Object.fromEntries(BOOK_RESTORE_ARCHIVE_COUNTERS.map((k) => [k, 0])),
                scannedOperations: 0,
                validationOperationId: null,
                firstOperationId: request.operationId,
                lastOperationId: request.operationId,
                completedAt: null,
              },
          remove = await prepareBookRestoreArchiveUnit(tx, db, s.loaded, progress, readOp);
        progress.revision = sum(progress.revision, 1);
        progress.lastOperationId = request.operationId;
        if (progress.phase === 'done') progress.completedAt = date(now, s.media.value.completedAt);
        validateBookRestoreArchiveProgress(progress, s.loaded, s.media);
        const seen = new Set();
        for (const ref of remove) {
          if (!ref.path.startsWith(s.loaded.ref.path + '/') || seen.has(ref.path)) inconsistent();
          seen.add(ref.path);
        }
        for (const ref of remove) tx.delete(ref);
        if (old) tx.update(s.control.ref, progress);
        else tx.create(s.control.ref, progress);
        tx.create(bookRestoreArchiveOpRef(db, uid, request.operationId), {
          schemaVersion: 1,
          ownerId: uid,
          restoreId: request.restoreId,
          jobToken: request.jobToken,
          operationId: request.operationId,
          action: 'advanceBookRestoreArchiveCleanup',
          requestHash: bookRestoreArchiveFingerprint(uid, request),
          progress,
        });
        return {
          schemaVersion: 1,
          kind: 'confirmed',
          receipt: structuredClone(progress),
          progress: structuredClone(progress),
        };
      });
    },
  };
}
