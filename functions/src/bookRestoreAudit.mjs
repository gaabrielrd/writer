import { digest } from './sceneContracts.mjs';
import {
  authorize,
  mutationInput,
  requestHash,
  inconsistent,
  sum,
  bookRestoreArtifactBalance,
  restoreFail as fail,
} from './bookRestoreUploadContracts.mjs';
import { validateBookRestoreAudit } from './bookRestoreAuditContracts.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { readBookRestorePersonaLibraryBatch } from './bookRestorePersonaLibraryBatch.mjs';
import {
  BOOK_RESTORE_AUDIT_LAYOUT,
  auditAnchor,
  verifyAuditAnchor,
  advanceBookRestorePhysicalAudit,
} from './bookRestoreAuditInventory.mjs';
const action = 'advanceBookRestoreAudit';
function context(loaded) {
  return digest({
    schemaVersion: 1,
    domain: 'book-restore-final-audit',
    ownerId: loaded.job.ownerId,
    restoreId: loaded.job.restoreId,
    jobToken: loaded.view.jobToken,
    bookId: loaded.job.bookId,
    validationCheckpoint: loaded.job.validationCheckpoint,
    artifactCount: loaded.job.preparation.artifactCount,
    retiredArtifacts: loaded.job.preparation.retiredArtifacts ?? 0,
    layout: BOOK_RESTORE_AUDIT_LAYOUT,
  });
}
async function controls(tx, db, loaded) {
  const p = loaded.job.preparation;
  await readBookRestorePersonaLibraryBatch(tx, db, loaded, 'preparing');
  const control = await readBookRestoreArtifact(tx, db, loaded, 'work-control', 'current'),
    index = await readBookRestoreArtifact(tx, db, loaded, 'entity-index-control', 'entity-scenes');
  if (
    control.value.countReady !== false ||
    control.value.wordCount !== p.wordCount ||
    index.value.complete !== true
  )
    inconsistent();
}
export function createBookRestoreAuditService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  return {
    async advanceBookRestoreAudit(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          old = await tx.get(opRef(uid, request.operationId));
        if (old.exists)
          return confirmed(loaded, readOp(old, uid, request.restoreId, fingerprint, loaded));
        if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
        if (loaded.job.checkpoint !== request.expectedCheckpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        const current = loaded.job.preparation;
        if (
          loaded.job.cleanupVersion !== 14 ||
          !(
            (current?.schemaVersion === 12 && current.phase === 'resources-finalize') ||
            (current?.schemaVersion === 13 && current.phase === 'resources-audit')
          ) ||
          !current.sourceIndexes.complete ||
          current.counts.step !== 'done' ||
          current.coverStorage.state !== 'prepared' ||
          current.personaLibrary.revoked ||
          (loaded.job.payloadInventoryVersion === 1 && current.loreStaging?.step !== 'done')
        )
          fail('failed-precondition', 'audit-phase-conflict');
        await controls(tx, db, loaded);
        const preparation = structuredClone(current),
          expected = context(loaded);
        if (preparation.schemaVersion === 12) {
          preparation.schemaVersion = 13;
          preparation.phase = 'resources-audit';
          preparation.audit = {
            schemaVersion: 1,
            contextToken: expected,
            phase: 'journals',
            family: 0,
            parent: null,
            parentAfter: null,
            after: null,
            checkedArtifacts: 0,
            checkedPhysical: 0,
            anchor: null,
            sealOperationId: null,
          };
        }
        const p = validateBookRestoreAudit(preparation.audit);
        if (p.contextToken !== expected || p.family > BOOK_RESTORE_AUDIT_LAYOUT.length)
          inconsistent();
        await verifyAuditAnchor(tx, db, loaded, p.anchor);
        if (p.phase === 'journals') {
          let query = db
            .collection(loaded.ref.path + '/materializationArtifacts')
            .orderBy('__name__')
            .select('kind', 'id')
            .limit(8);
          if (p.after !== null) query = query.startAfter(p.after);
          const page = await tx.get(query);
          for (const snapshot of page.docs) {
            const v = snapshot.data();
            if (snapshot.id !== digest([v.kind, v.id])) inconsistent();
            const artifact = await readBookRestoreArtifact(tx, db, loaded, v.kind, v.id, {
              metadataOnly: true,
            });
            p.checkedArtifacts = sum(p.checkedArtifacts, 1);
            if (p.checkedArtifacts > bookRestoreArtifactBalance(preparation)) inconsistent();
            p.after = snapshot.id;
            p.anchor = auditAnchor(artifact, v.kind, v.id);
          }
          if (!page.docs.length) {
            if (p.checkedArtifacts !== bookRestoreArtifactBalance(preparation)) inconsistent();
            p.phase = 'physical';
            p.after = null;
          }
        } else if (p.phase === 'physical') {
          await advanceBookRestorePhysicalAudit(tx, db, loaded, p);
          if (p.family === BOOK_RESTORE_AUDIT_LAYOUT.length) {
            if (p.checkedPhysical !== p.checkedArtifacts) inconsistent();
            p.phase = 'done';
            p.sealOperationId = request.operationId;
            preparation.phase = 'activation-ready';
          }
        } else inconsistent();
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
