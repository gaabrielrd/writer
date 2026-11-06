import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  bornEqual,
  restoreHash,
  restoreId,
  closed,
  sum,
  bookRestoreArtifactBalance,
} from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import { readBookRestoreArtifact, prepareBookRestoreArtifacts } from './bookRestoreArtifacts.mjs';
import { readBookRestorePersonaLibraryBatch } from './bookRestorePersonaLibraryBatch.mjs';
import {
  readBookRestoreEditorialControl,
  assertEditorialSameCommit,
} from './bookRestoreEditorialRead.mjs';
import { validateEditorialMaterialization } from './bookRestoreEditorialBodyContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import {
  BOOK_RESTORE_EDITORIAL_AUDIT_LAYOUT as layout,
  auditAnchor,
  verifyAuditAnchor,
  advanceBookRestorePhysicalAudit,
} from './bookRestoreAuditInventory.mjs';
const action = 'advanceBookRestoreEditorialAudit';
/** Base receipt stays exact; later editorial artifacts never inflate its certified total. */
export async function verifyBookRestoreEditorialBaseAudit(
  tx,
  db,
  loaded,
  readOp,
  baseArtifacts,
  controlSnapshot = null,
) {
  const p = loaded.job.preparation;
  if (p?.schemaVersion !== 13 || p.phase !== 'activation-ready' || p.audit?.phase !== 'done')
    inconsistent();
  const ref = db.doc(
    'users/' + loaded.job.ownerId + '/bookRestoreOperations/' + p.audit.sealOperationId,
  );
  const seal = await tx.get(ref);
  if (!seal.exists || !bornEqual(seal, { createTime: seal.updateTime })) inconsistent();
  const receipt = readOp(
    seal,
    loaded.job.ownerId,
    loaded.job.restoreId,
    restoreHash(seal.data().fingerprint),
    loaded,
  );
  const expected = structuredClone(p);
  expected.artifactCount = baseArtifacts;
  delete expected.editorialAddedArtifacts;
  if (
    receipt.action !== 'advanceBookRestoreAudit' ||
    receipt.state !== 'content-verified' ||
    digest(receipt.preparation) !== digest(expected)
  )
    inconsistent();
  if (controlSnapshot === null) assertEditorialSameCommit(seal, loaded.snapshot);
  else {
    const a = seal.createTime,
      b = controlSnapshot.createTime;
    if (
      !controlSnapshot.exists ||
      !a ||
      !b ||
      !(a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds < b.nanoseconds))
    )
      inconsistent();
  }
  return seal;
}
function context(loaded, control, baseSeal) {
  return digest({
    schemaVersion: 1,
    domain: 'writer-book-editorial-final-census-v1',
    ownerId: loaded.job.ownerId,
    restoreId: loaded.job.restoreId,
    jobToken: loaded.view.jobToken,
    bookId: loaded.job.bookId,
    validationCheckpoint: loaded.job.validationCheckpoint,
    sourceSha256: control.value.sourceSha256,
    originalProofRoot: control.value.proofRoot,
    headProofRoot: control.value.heads.proofRoot,
    added: loaded.job.preparation.editorialAddedArtifacts,
    artifactCount: loaded.job.preparation.artifactCount,
    retiredArtifacts: loaded.job.preparation.retiredArtifacts ?? 0,
    baseSeal: nativeRestoreToken(baseSeal),
    layout,
  });
}
function available(loaded, request = null) {
  const j = loaded.job,
    p = j.preparation;
  if (
    j.state !== 'content-verified' ||
    j.cleanupVersion !== 15 ||
    j.source.format !== 'writer-book-archive' ||
    j.source.version !== 2 ||
    p?.schemaVersion !== 13 ||
    p.phase !== 'activation-ready' ||
    p.audit?.phase !== 'done' ||
    p.cleanedArtifacts !== 0 ||
    p.personaLibrary.revoked ||
    p.coverStorage.state !== 'prepared' ||
    p.coverStorage.fence !== null
  )
    fail('failed-precondition', 'editorial-audit-not-ready');
  if (request && j.checkpoint !== request.expectedCheckpoint)
    fail('failed-precondition', 'checkpoint-conflict');
}
async function inputs(tx, db, loaded, readOp) {
  const current = await readBookRestoreEditorialControl(tx, db, loaded);
  if (current.value.phase !== 'materialized' || current.value.heads?.phase !== 'prepared')
    fail('failed-precondition', 'editorial-heads-required');
  const baseSeal = await verifyBookRestoreEditorialBaseAudit(
    tx,
    db,
    loaded,
    readOp,
    current.value.baseArtifacts,
    current.snapshot,
  );
  await readBookRestorePersonaLibraryBatch(tx, db, loaded, 'preparing');
  const control = await readBookRestoreArtifact(tx, db, loaded, 'work-control', 'current'),
    index = await readBookRestoreArtifact(tx, db, loaded, 'entity-index-control', 'entity-scenes');
  if (
    control.value.countReady !== false ||
    control.value.wordCount !== loaded.job.preparation.wordCount ||
    index.value.complete !== true
  )
    inconsistent();
  return { current, expected: context(loaded, current, baseSeal) };
}
/** Internal certificate, consumable only in the current native transaction. Not an activation grant. */
export async function verifyBookRestoreEditorialAudit(tx, db, loaded, readOp) {
  available(loaded);
  const { current, expected } = await inputs(tx, db, loaded, readOp),
    census = current.value.census;
  if (
    !census ||
    census.phase !== 'done' ||
    census.contextToken !== expected ||
    census.family !== layout.length ||
    census.checkedArtifacts !== bookRestoreArtifactBalance(loaded.job.preparation) ||
    census.checkedPhysical !== census.checkedArtifacts
  )
    inconsistent();
  await verifyAuditAnchor(tx, db, loaded, census.anchor);
  const seal = await tx.get(
    db.doc('users/' + loaded.job.ownerId + '/bookRestoreOperations/' + census.sealOperationId),
  );
  if (!seal.exists || !bornEqual(seal, { createTime: seal.updateTime })) inconsistent();
  const receipt = readOp(
    seal,
    loaded.job.ownerId,
    loaded.job.restoreId,
    restoreHash(seal.data().fingerprint),
    loaded,
  );
  if (
    ![action, 'retireBookRestoreActivation'].includes(receipt.action) ||
    receipt.checkpoint !== loaded.job.checkpoint ||
    receipt.state !== 'content-verified' ||
    digest(receipt.preparation) !== digest(loaded.job.preparation) ||
    current.journal.data().lastOperationId !== census.sealOperationId
  )
    inconsistent();
  assertEditorialSameCommit(seal, loaded.snapshot);
  assertEditorialSameCommit(current.snapshot, seal);
  return { control: current, seal, contextToken: expected };
}
export function createBookRestoreEditorialAuditService({
  db,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  return {
    async openVerifiedBookRestoreEditorialAudit(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const id = restoreId(input.restoreId),
        token = restoreHash(input.jobToken);
      async function inspect(tx) {
        const loaded = await load(tx, uid, id, token);
        const proof = await verifyBookRestoreEditorialAudit(tx, db, loaded, readOp);
        return {
          bookId: loaded.job.bookId,
          contextToken: proof.contextToken,
          jobToken: nativeRestoreToken(loaded.snapshot),
          controlToken: nativeRestoreToken(proof.control.snapshot),
          sealToken: nativeRestoreToken(proof.seal),
          checkedArtifacts: proof.control.value.census.checkedArtifacts,
          checkedPhysical: proof.control.value.census.checkedPhysical,
        };
      }
      const original = await db.runTransaction(inspect);
      return Object.freeze({
        schemaVersion: 1,
        bookId: original.bookId,
        checkedArtifacts: original.checkedArtifacts,
        checkedPhysical: original.checkedPhysical,
        async verify(tx) {
          if (digest(await inspect(tx)) !== digest(original)) inconsistent();
        },
      });
    },
    async advanceBookRestoreEditorialAudit(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken);
        const old = await tx.get(
          db.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId),
        );
        if (old.exists)
          return confirmed(loaded, readOp(old, uid, request.restoreId, fingerprint, loaded));
        available(loaded, request);
        const { current, expected } = await inputs(tx, db, loaded, readOp);
        const state = structuredClone(current.value);
        state.census ??= {
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
        const p = state.census;
        if (p.contextToken !== expected || p.family > layout.length) inconsistent();
        if (p.phase === 'done') fail('failed-precondition', 'editorial-audit-complete');
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
            const value = snapshot.data();
            if (snapshot.id !== digest([value.kind, value.id])) inconsistent();
            const artifact = await readBookRestoreArtifact(tx, db, loaded, value.kind, value.id, {
              metadataOnly: true,
            });
            p.checkedArtifacts = sum(p.checkedArtifacts, 1);
            if (p.checkedArtifacts > bookRestoreArtifactBalance(loaded.job.preparation))
              inconsistent();
            p.after = snapshot.id;
            // This control is rewritten together with the job on every census unit.
            // Its current receipt is verified by inputs; it must not become a frozen anchor.
            if (value.kind !== 'editorial-control')
              p.anchor = auditAnchor(artifact, value.kind, value.id);
          }
          if (!page.docs.length) {
            if (p.checkedArtifacts !== bookRestoreArtifactBalance(loaded.job.preparation))
              inconsistent();
            p.phase = 'physical';
            p.after = null;
          }
        } else if (p.phase === 'physical') {
          await advanceBookRestorePhysicalAudit(tx, db, loaded, p, layout);
          if (p.family === layout.length) {
            if (p.checkedPhysical !== p.checkedArtifacts) inconsistent();
            p.phase = 'done';
            p.sealOperationId = request.operationId;
          }
        } else inconsistent();
        validateEditorialMaterialization(state);
        const artifacts = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          [{ kind: 'editorial-control', id: 'current', replace: true, value: state }],
          15,
        );
        if (artifacts.created !== 0) inconsistent();
        const record = next(loaded.job, request);
        artifacts.commit();
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
