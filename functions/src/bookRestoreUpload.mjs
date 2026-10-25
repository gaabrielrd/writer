import { createBookRestoreStructureService } from './bookRestoreStructure.mjs';
import { createBookRestoreLoreService } from './bookRestoreLore.mjs';
import { createBookRestorePreparedLoreService } from './bookRestorePreparedLore.mjs';
import { createBookRestoreResourcesService } from './bookRestoreResources.mjs';
import { createBookRestoreCountsService } from './bookRestoreCounts.mjs';
import { createBookRestorePersonasService } from './bookRestorePersonas.mjs';
import { createBookRestoreUniverseService } from './bookRestoreUniverse.mjs';
import { createBookRestoreHistoryService } from './bookRestoreHistory.mjs';
import { createBookRestoreDraftService } from './bookRestoreDraft.mjs';
import { createBookRestoreDraftFinalizeService } from './bookRestoreDraftFinalize.mjs';
import { createBookRestoreCoverService } from './bookRestoreCover.mjs';
import { createBookRestorePersonaLibraryService } from './bookRestorePersonaLibrary.mjs';
import { createBookRestoreSourceIndexesService } from './bookRestoreSourceIndexes.mjs';
import { createBookRestoreAuditService } from './bookRestoreAudit.mjs';
import { createBookRestoreActivationReviewService } from './bookRestoreActivationReview.mjs';
import { createBookRestoreCoverMaterializationService } from './bookRestoreCoverMaterialization.mjs';
import { digest } from './sceneContracts.mjs';
import {
  prepareBookRestoreArtifactsCleanup,
  prepareBookRestoreBodyArtifactsCleanup,
  prepareBookRestoreResourceChildrenCleanup,
} from './bookRestoreArtifacts.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import { createBookRestoreValidationService } from './bookRestoreValidation.mjs';
import { prepareBookRestoreValidationCleanup } from './bookRestoreValidationCleanup.mjs';
import {
  createBookRestoreIntegrityService,
  prepareBookRestoreIntegrityCleanup,
} from './bookRestoreIntegrity.mjs';
import { createVerifiedBookRestoreSource } from './bookRestoreIntegrityRead.mjs';
import { randomBytes } from 'node:crypto';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { createBookRestoreRecoveryHandler } from './bookRestoreRecovery.mjs';
import {
  restoreFail as fail,
  inconsistent,
  invalid,
  closed,
  restoreId,
  restoreHash,
  integer,
  sum,
  date,
  authorize,
  startInput,
  mutationInput,
  chunkInput,
  sha256,
  requestHash,
  targetId,
  chunkId,
  bornEqual,
  progress,
  integrityProgress,
  validationProgress,
  preparationProgress,
  restoreValidationMeta,
  BOOK_RESTORE_SEED,
  BOOK_RESTORE_CHUNK_BYTES,
  chunkChain,
  BOOK_RESTORE_METHODS,
} from './bookRestoreUploadContracts.mjs';
export { createBookRestoreRecoveryHandler };
export function setBookRestoreHeaders(method, request) {
  if (BOOK_RESTORE_METHODS.includes(method))
    request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
}
const actions = {
  startBookRestore: ['uploading'],
  appendBookRestoreChunk: ['uploading', 'uploaded'],
  cancelBookRestore: ['cancelling'],
  advanceBookRestoreCleanup: ['cancelling', 'cancelled'],
  advanceBookRestoreIntegrity: ['checking', 'bytes-verified', 'rejected'],
  advanceBookRestoreValidation: ['validating', 'content-verified', 'content-rejected'],
  advanceBookRestoreStructure: ['content-verified'],
  advanceBookRestoreLore: ['content-verified'],
  advanceBookRestoreResources: ['content-verified'],
  advanceBookRestoreCounts: ['content-verified'],
  advanceBookRestorePersonas: ['content-verified'],
  advanceBookRestoreUniverse: ['content-verified'],
  advanceBookRestoreHistory: ['content-verified'],
  advanceBookRestoreDraft: ['content-verified'],
  finalizeBookRestoreDraft: ['content-verified'],
  advanceBookRestoreCover: ['content-verified'],
  reserveBookRestoreCover: ['content-verified'],
  materializeBookRestoreCover: ['content-verified'],
  advanceBookRestorePersonaLibrary: ['content-verified'],
  advanceBookRestoreSourceIndexes: ['content-verified'],
  advanceBookRestoreAudit: ['content-verified'],
};
export function createBookRestoreUploadService({
  db,
  restoreAssets,
  now = Date.now,
  indexedLoreBodies = false,
}) {
  // Coordinated D3 rollout: existing streamed jobs always resume; enable new ones after reconciliation.
  if (typeof indexedLoreBodies !== 'boolean') inconsistent();
  const jobRef = (uid, id) => db.doc('users/' + uid + '/bookRestores/' + id);
  const opRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreOperations/' + id);
  const fenceRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreStartFences/' + id);
  const keyRef = (uid, id) => db.doc('users/' + uid + '/bookRestoreRecoveryKeys/' + id);
  const resRef = (id) => db.doc('bookRestoreReservations/' + id);
  const markerRef = (id) => db.doc('deletedBooks/' + id);
  const rootRef = (id) => db.doc('books/' + id);
  const chunkRef = (uid, id, index) => db.doc(jobRef(uid, id).path + '/chunks/' + chunkId(index));
  const terminal = (uid, id, bookId) => ({
    schemaVersion: 1,
    kind: 'cancelled',
    ownerId: uid,
    restoreId: id,
    bookId,
  });
  function marker(uid, id, bookId, fingerprint, kind, timestamp) {
    return {
      schemaVersion: 1,
      kind: 'book-restore-reservation',
      ownerId: uid,
      restoreId: id,
      bookId,
      startFingerprint: fingerprint,
      reservationKind: kind,
      reservedAt: timestamp,
    };
  }
  function binding(uid, id, bookId, fingerprint, kind, reserved, marked, birth) {
    const r = reserved.data(),
      m = marked.data();
    if (
      !r ||
      r.schemaVersion !== 1 ||
      r.ownerId !== uid ||
      r.restoreId !== id ||
      r.bookId !== bookId ||
      r.startFingerprint !== fingerprint ||
      r.kind !== kind ||
      !m ||
      m.schemaVersion !== 1 ||
      m.kind !== 'book-restore-reservation' ||
      m.ownerId !== uid ||
      m.restoreId !== id ||
      m.bookId !== bookId ||
      m.startFingerprint !== fingerprint ||
      m.reservationKind !== kind ||
      !bornEqual(reserved, birth) ||
      !bornEqual(marked, birth)
    )
      inconsistent();
  }
  function checkFence(snapshot, uid, id, bookId, fingerprint) {
    const value = snapshot.data();
    if (value?.fingerprint !== fingerprint) invalid('operation-mismatch');
    if (
      value.schemaVersion !== 1 ||
      value.ownerId !== uid ||
      value.restoreId !== id ||
      value.bookId !== bookId
    )
      inconsistent();
  }
  async function load(tx, uid, id, token, supplied) {
    authorize(uid);
    const snapshot = supplied ?? (await tx.get(jobRef(uid, id)));
    if (!snapshot.exists || snapshot.id !== id) fail('not-found', 'restore-unavailable');
    const view = progress(uid, id, snapshot),
      job = snapshot.data();
    if (token !== undefined && token !== view.jobToken)
      fail('failed-precondition', 'identity-conflict');
    const [reserved, marked, root] = await Promise.all([
      tx.get(resRef(job.bookId)),
      tx.get(markerRef(job.bookId)),
      readWorkMetadata(tx, rootRef(job.bookId), []),
    ]);
    binding(uid, id, job.bookId, job.startFingerprint, 'job', reserved, marked, snapshot);
    if (root.exists) fail('failed-precondition', 'target-present');
    return { ref: jobRef(uid, id), snapshot, job, view };
  }
  function receipt(action, request, job, sequence = null) {
    return {
      schemaVersion: 1,
      operationId: request.operationId,
      action,
      expectedCheckpoint: action === 'startBookRestore' ? null : request.expectedCheckpoint,
      checkpoint: job.checkpoint,
      state: job.state,
      sequence,
      uploadedChunks: job.uploadedChunks,
      uploadedBytes: job.uploadedBytes,
      cleanedChunks: job.cleanedChunks,
      ...(job.cleanupVersion >= 2 ? { integrity: integrityProgress(job) } : {}),
      ...(job.cleanupVersion >= 3 ? { validation: job.validationMeta } : {}),
      ...(job.cleanupVersion >= 4 ? { preparation: job.preparation } : {}),
    };
  }
  function writeOp(tx, uid, id, action, request, job, token, sequence = null) {
    const value = receipt(action, request, job, sequence);
    tx.create(opRef(uid, request.operationId), {
      schemaVersion: 1,
      ownerId: uid,
      restoreId: id,
      fingerprint: requestHash(action, request),
      ...(token === undefined ? {} : { jobToken: token }),
      receipt: value,
    });
    return value;
  }
  function readOp(snapshot, uid, id, fingerprint, loaded) {
    const op = snapshot.data();
    if (!op) return null;
    if (
      op.schemaVersion !== 1 ||
      op.ownerId !== uid ||
      op.restoreId !== id ||
      op.fingerprint !== fingerprint
    )
      invalid('operation-mismatch');
    const r = op.receipt;
    closed(
      r,
      [
        'schemaVersion',
        'operationId',
        'action',
        'expectedCheckpoint',
        'checkpoint',
        'state',
        'sequence',
        'uploadedChunks',
        'uploadedBytes',
        'cleanedChunks',
      ],
      ['integrity', 'validation', 'preparation'],
    );
    if (
      r.schemaVersion !== 1 ||
      r.operationId !== snapshot.id ||
      !Object.hasOwn(actions, r.action) ||
      !actions[r.action].includes(r.state)
    )
      inconsistent();
    ['checkpoint', 'uploadedChunks', 'uploadedBytes', 'cleanedChunks'].forEach((k) =>
      integer(r[k]),
    );
    if (
      r.checkpoint > loaded.job.checkpoint ||
      r.uploadedChunks > loaded.job.uploadedChunks ||
      r.uploadedBytes > loaded.job.uploadedBytes ||
      r.cleanedChunks > loaded.job.cleanedChunks
    )
      inconsistent();
    if (r.integrity !== undefined) {
      closed(r.integrity, ['checkedChunks', 'checkedBytes', 'failure', 'cleanupPhase']);
      integer(r.integrity.checkedChunks);
      integer(r.integrity.checkedBytes);
      if (
        r.integrity.checkedChunks > loaded.view.integrity.checkedChunks ||
        r.integrity.checkedBytes > loaded.view.integrity.checkedBytes ||
        ![null, 'file-hash-mismatch', 'upload-chain-mismatch'].includes(r.integrity.failure) ||
        ![
          'chunks',
          'proofs',
          'state',
          'done',
          'validation-index',
          'validation-items',
          'validation-state',
          'artifacts',
          'body-artifacts',
          'resource-children',
        ].includes(r.integrity.cleanupPhase)
      )
        inconsistent();
    } else if (r.action === 'advanceBookRestoreIntegrity') inconsistent();
    if (r.validation !== undefined) {
      restoreValidationMeta(r.validation, loaded.job.validationVersion);
      if (
        !loaded.job.validationMeta ||
        ['frames', 'items', 'checkedChunks'].some(
          (k) => r.validation[k] > loaded.job.validationMeta[k],
        )
      )
        inconsistent();
    } else if (r.action === 'advanceBookRestoreValidation') inconsistent();
    if (r.preparation !== undefined) {
      preparationProgress(r.preparation);
      if (
        !loaded.job.preparation ||
        [
          'itemIndex',
          'artifactCount',
          'cleanedArtifacts',
          'retiredArtifacts',
          'actCount',
          'chapterCount',
          'wordCount',
          'loreCount',
          'loreRelationCount',
          'loreItemIndex',
        ].some((k) => (r.preparation[k] ?? 0) > (loaded.job.preparation[k] ?? 0))
      )
        inconsistent();
      if (
        r.preparation.resourceCounts &&
        Object.keys(r.preparation.resourceCounts).some(
          (kind) =>
            r.preparation.resourceCounts[kind] >
            (loaded.job.preparation.resourceCounts?.[kind] ?? 0),
        )
      )
        inconsistent();
      if (
        r.preparation.counts &&
        ['itemIndex', 'sceneCount', 'linkCount'].some(
          (key) => r.preparation.counts[key] > (loaded.job.preparation.counts?.[key] ?? 0),
        )
      )
        inconsistent();
      if (Object.hasOwn(r.preparation, 'lorePayload') && loaded.job.payloadInventoryVersion !== 1)
        inconsistent();
      const oldLorePage = r.preparation.counts?.lorePayloadOffset,
        currentLorePage = loaded.job.preparation.counts?.lorePayloadOffset;
      if (
        oldLorePage &&
        r.preparation.counts.itemIndex === loaded.job.preparation.counts?.itemIndex &&
        (!currentLorePage ||
          oldLorePage.entityId !== currentLorePage.entityId ||
          oldLorePage.offset > currentLorePage.offset)
      )
        inconsistent();
      if (
        r.preparation.personas &&
        (r.preparation.personas.profileCount >
          (loaded.job.preparation.personas?.profileCount ?? 0) ||
          Object.keys(r.preparation.personas.bindings).some(
            (scope) =>
              r.preparation.personas.bindings[scope] >
              (loaded.job.preparation.personas?.bindings[scope] ?? 0),
          ))
      )
        inconsistent();
      if (
        r.preparation.personas &&
        Object.hasOwn(r.preparation.personas, 'draftProfileId') &&
        r.preparation.personas.draftProfileId !== loaded.job.preparation.personas?.draftProfileId
      )
        inconsistent();
      if (
        r.preparation.draft &&
        (!loaded.job.preparation.draft ||
          r.preparation.draft.startIndex !== loaded.job.preparation.draft.startIndex ||
          ['parts', 'bytes', 'bodyCount'].some(
            (k) => r.preparation.draft[k] > loaded.job.preparation.draft[k],
          ) ||
          (r.preparation.draft.match !== null &&
            r.preparation.draft.match !== loaded.job.preparation.draft.match))
      )
        inconsistent();
      if (
        r.preparation.draft?.finalized &&
        (!loaded.job.preparation.draft?.finalized ||
          digest(r.preparation.draft.finalized) !== digest(loaded.job.preparation.draft.finalized))
      )
        inconsistent();
      if (
        r.preparation.cover &&
        (!loaded.job.preparation.cover ||
          r.preparation.cover.startIndex !== loaded.job.preparation.cover.startIndex ||
          r.preparation.cover.kind !== loaded.job.preparation.cover.kind ||
          r.preparation.cover.imageId !== loaded.job.preparation.cover.imageId ||
          ['parts', 'bytes'].some((k) => r.preparation.cover[k] > loaded.job.preparation.cover[k]))
      )
        inconsistent();
      if (
        r.preparation.personaLibrary &&
        (!loaded.job.preparation.personaLibrary ||
          r.preparation.personaLibrary.installed >
            loaded.job.preparation.personaLibrary.installed ||
          (r.preparation.personaLibrary.installed ===
            loaded.job.preparation.personaLibrary.installed &&
            r.preparation.personaLibrary.after !== loaded.job.preparation.personaLibrary.after) ||
          (r.preparation.personaLibrary.revoked && !loaded.job.preparation.personaLibrary.revoked))
      )
        inconsistent();
      if (r.preparation.audit) {
        const prior = r.preparation.audit,
          current = loaded.job.preparation.audit;
        if (
          !current ||
          prior.contextToken !== current.contextToken ||
          prior.checkedArtifacts > current.checkedArtifacts ||
          prior.checkedPhysical > current.checkedPhysical ||
          prior.family > current.family ||
          ['journals', 'physical', 'done'].indexOf(prior.phase) >
            ['journals', 'physical', 'done'].indexOf(current.phase) ||
          (prior.sealOperationId !== null && prior.sealOperationId !== current.sealOperationId)
        )
          inconsistent();
      }
      if (r.preparation.sourceIndexes) {
        const p = r.preparation.sourceIndexes,
          current = loaded.job.preparation.sourceIndexes;
        if (
          !current ||
          p.scanned > current.scanned ||
          p.backfilled > current.backfilled ||
          (p.scanned === current.scanned && p.after !== current.after) ||
          (p.complete && !current.complete)
        )
          inconsistent();
      }
      if (
        r.preparation.coverStorage &&
        (!loaded.job.preparation.coverStorage ||
          (r.preparation.coverStorage.state === 'prepared' &&
            digest(r.preparation.coverStorage.proof) !==
              digest(loaded.job.preparation.coverStorage.proof)) ||
          (r.preparation.coverStorage.fence !== null &&
            digest(r.preparation.coverStorage.fence) !==
              digest(loaded.job.preparation.coverStorage.fence)))
      )
        inconsistent();
      if (
        r.preparation.history &&
        (!loaded.job.preparation.history ||
          ['versions', 'byteLength', 'sourceChunks', 'bodyCount'].some(
            (k) => r.preparation.history[k] > loaded.job.preparation.history[k],
          ) ||
          r.preparation.history.startIndex !== loaded.job.preparation.history.startIndex ||
          (r.preparation.itemIndex === loaded.job.preparation.itemIndex &&
            r.preparation.history.pending &&
            (!loaded.job.preparation.history.pending ||
              r.preparation.history.pending.part > loaded.job.preparation.history.pending.part)))
      )
        inconsistent();
      if (
        r.preparation.universe &&
        (!loaded.job.preparation.universe ||
          r.preparation.universe.itemIndex !== loaded.job.preparation.universe.itemIndex ||
          digest(r.preparation.universe.origin) !== digest(loaded.job.preparation.universe.origin))
      )
        inconsistent();
    } else if (
      [
        'advanceBookRestoreStructure',
        'advanceBookRestoreLore',
        'advanceBookRestoreResources',
        'advanceBookRestoreCounts',
        'advanceBookRestorePersonas',
        'advanceBookRestoreUniverse',
        'advanceBookRestoreHistory',
        'advanceBookRestoreDraft',
        'finalizeBookRestoreDraft',
        'advanceBookRestoreCover',
        'reserveBookRestoreCover',
        'materializeBookRestoreCover',
        'advanceBookRestorePersonaLibrary',
        'advanceBookRestoreSourceIndexes',
        'advanceBookRestoreAudit',
      ].includes(r.action)
    )
      inconsistent();
    if (r.action === 'startBookRestore') {
      if (
        r.expectedCheckpoint !== null ||
        r.checkpoint !== 0 ||
        r.sequence !== null ||
        op.jobToken !== undefined ||
        !bornEqual(snapshot, loaded.snapshot)
      )
        inconsistent();
    } else {
      integer(r.expectedCheckpoint);
      if (r.checkpoint !== sum(r.expectedCheckpoint, 1) || op.jobToken !== loaded.view.jobToken)
        inconsistent();
      if (r.action === 'appendBookRestoreChunk') {
        integer(r.sequence);
        if (r.sequence >= loaded.job.uploadedChunks) inconsistent();
      } else if (r.sequence !== null) inconsistent();
    }
    return { ...r };
  }
  const confirmed = (loaded, r) => ({
    schemaVersion: 1,
    kind: 'confirmed',
    receipt: r,
    progress: loaded.view,
  });
  function next(job, request, patch = {}) {
    if (request.expectedCheckpoint !== job.checkpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    return {
      ...job,
      ...patch,
      checkpoint: sum(job.checkpoint, 1),
      updatedAt: date(now, job.updatedAt),
    };
  }
  function keyContext(value, loaded) {
    if (
      !value ||
      value.schemaVersion !== 1 ||
      value.ownerId !== loaded.job.ownerId ||
      value.restoreId !== loaded.job.restoreId ||
      value.jobToken !== loaded.view.jobToken ||
      value.reviewHash !== loaded.job.reviewHash ||
      value.keyId !== loaded.job.keyId
    )
      inconsistent();
  }
  function secret(value, loaded) {
    keyContext(value, loaded);
    if (typeof value.keyBase64 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value.keyBase64))
      inconsistent();
    const bytes = Buffer.from(value.keyBase64, 'base64');
    if (
      bytes.length !== 32 ||
      bytes.toString('base64') !== value.keyBase64 ||
      sha256(bytes) !== loaded.job.keyFingerprint
    )
      inconsistent();
    return value.keyBase64;
  }
  async function start(uid, input) {
    authorize(uid);
    const request = startInput(input),
      id = request.operationId,
      fingerprint = requestHash('startBookRestore', request),
      bookId = targetId(uid, id, fingerprint),
      keyId = randomBytes(32).toString('hex');
    const prior = await db.runTransaction(async (tx) => {
      const [job, op, fence, reserved, marked, root] = await Promise.all([
        tx.get(jobRef(uid, id)),
        tx.get(opRef(uid, id)),
        tx.get(fenceRef(uid, id)),
        tx.get(resRef(bookId)),
        tx.get(markerRef(bookId)),
        readWorkMetadata(tx, rootRef(bookId), []),
      ]);
      if (fence.exists) {
        if (job.exists || op.exists) inconsistent();
        checkFence(fence, uid, id, bookId, fingerprint);
        binding(uid, id, bookId, fingerprint, 'fence', reserved, marked, fence);
        return terminal(uid, id, bookId);
      }
      if (job.exists || op.exists) {
        if (!job.exists || !op.exists) inconsistent();
        const loaded = await load(tx, uid, id);
        const r = readOp(op, uid, id, fingerprint, loaded);
        if (r?.action !== 'startBookRestore') inconsistent();
        return confirmed(loaded, r);
      }
      if (reserved.exists || marked.exists || root.exists) inconsistent();
      const timestamp = date(now),
        record = {
          schemaVersion: 1,
          cleanupVersion: 1,
          ownerId: uid,
          restoreId: id,
          bookId,
          startFingerprint: fingerprint,
          source: request.source,
          reviewHash: request.reviewHash,
          keyId,
          keyEverCreated: false,
          keyFingerprint: null,
          recoveryReady: false,
          state: 'uploading',
          checkpoint: 0,
          uploadedChunks: 0,
          uploadedBytes: 0,
          uploadedChainHash: BOOK_RESTORE_SEED,
          cleanedChunks: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      tx.create(jobRef(uid, id), record);
      tx.create(resRef(bookId), {
        schemaVersion: 1,
        ownerId: uid,
        restoreId: id,
        bookId,
        startFingerprint: fingerprint,
        kind: 'job',
      });
      tx.create(markerRef(bookId), marker(uid, id, bookId, fingerprint, 'job', timestamp));
      writeOp(tx, uid, id, 'startBookRestore', request, record);
      return null;
    });
    if (prior) return prior;
    return db.runTransaction(async (tx) => {
      const loaded = await load(tx, uid, id),
        op = await tx.get(opRef(uid, id));
      const r = readOp(op, uid, id, fingerprint, loaded);
      if (!r) inconsistent();
      return confirmed(loaded, r);
    });
  }
  async function resolveStart(uid, input) {
    authorize(uid);
    closed(input, ['operationId', 'requestHash', 'intent']);
    const id = restoreId(input.operationId),
      fingerprint = restoreHash(input.requestHash),
      bookId = targetId(uid, id, fingerprint);
    if (input.intent !== 'cancel') invalid();
    return db.runTransaction(async (tx) => {
      const [job, op, fence, reserved, marked, root] = await Promise.all([
        tx.get(jobRef(uid, id)),
        tx.get(opRef(uid, id)),
        tx.get(fenceRef(uid, id)),
        tx.get(resRef(bookId)),
        tx.get(markerRef(bookId)),
        readWorkMetadata(tx, rootRef(bookId), []),
      ]);
      if (job.exists || op.exists) {
        if (!job.exists || !op.exists || fence.exists) inconsistent();
        const loaded = await load(tx, uid, id),
          r = readOp(op, uid, id, fingerprint, loaded);
        if (r?.action !== 'startBookRestore') inconsistent();
        return confirmed(loaded, r);
      }
      if (fence.exists) {
        checkFence(fence, uid, id, bookId, fingerprint);
        binding(uid, id, bookId, fingerprint, 'fence', reserved, marked, fence);
        return terminal(uid, id, bookId);
      }
      if (reserved.exists || marked.exists || root.exists) inconsistent();
      const timestamp = date(now);
      tx.create(fenceRef(uid, id), {
        schemaVersion: 1,
        ownerId: uid,
        restoreId: id,
        bookId,
        fingerprint,
      });
      tx.create(resRef(bookId), {
        schemaVersion: 1,
        ownerId: uid,
        restoreId: id,
        bookId,
        startFingerprint: fingerprint,
        kind: 'fence',
      });
      tx.create(markerRef(bookId), marker(uid, id, bookId, fingerprint, 'fence', timestamp));
      return terminal(uid, id, bookId);
    });
  }
  async function get(uid, input) {
    authorize(uid);
    closed(input, ['restoreId'], ['jobToken']);
    const id = restoreId(input.restoreId),
      token = input.jobToken === undefined ? undefined : restoreHash(input.jobToken);
    return db.runTransaction(async (tx) => (await load(tx, uid, id, token)).view);
  }
  async function append(uid, input) {
    authorize(uid);
    const request = chunkInput(input),
      id = request.restoreId,
      fingerprint = requestHash('appendBookRestoreChunk', request);
    return db.runTransaction(async (tx) => {
      const loaded = await load(tx, uid, id, request.jobToken),
        op = await tx.get(opRef(uid, request.operationId));
      if (op.exists) return confirmed(loaded, readOp(op, uid, id, fingerprint, loaded));
      const job = loaded.job;
      if (job.state !== 'uploading') fail('failed-precondition', 'state-conflict');
      if (!job.recoveryReady || !job.keyEverCreated)
        fail('failed-precondition', 'recovery-not-ready');
      if (request.expectedCheckpoint !== job.checkpoint)
        fail('failed-precondition', 'checkpoint-conflict');
      const remaining = job.source.byteLength - job.uploadedBytes;
      if (
        request.index !== job.uploadedChunks ||
        request.bytes.length !== Math.min(BOOK_RESTORE_CHUNK_BYTES, remaining)
      )
        invalid('invalid-chunk-position');
      const [existing, key] = await Promise.all([
        tx.get(chunkRef(uid, id, request.index)),
        tx.get(keyRef(uid, id)),
      ]);
      if (existing.exists) inconsistent();
      secret(key.data(), loaded);
      const uploadedBytes = sum(job.uploadedBytes, request.bytes.length),
        record = next(job, request, {
          uploadedBytes,
          uploadedChunks: sum(job.uploadedChunks, 1),
          state: uploadedBytes === job.source.byteLength ? 'uploaded' : 'uploading',
          uploadedChainHash: chunkChain(
            job.uploadedChainHash,
            request.index,
            request.chunkHash,
            request.bytes.length,
          ),
        });
      tx.create(chunkRef(uid, id, request.index), {
        schemaVersion: 1,
        ownerId: uid,
        restoreId: id,
        jobToken: loaded.view.jobToken,
        index: request.index,
        byteLength: request.bytes.length,
        chunkHash: request.chunkHash,
        chunkBase64: request.bytes.toString('base64'),
      });
      tx.update(loaded.ref, record);
      const r = writeOp(
        tx,
        uid,
        id,
        'appendBookRestoreChunk',
        request,
        record,
        loaded.view.jobToken,
        request.index,
      );
      return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, r);
    });
  }
  const pickProgress = (job) => ({
    state: job.state,
    checkpoint: job.checkpoint,
    uploadedChunks: job.uploadedChunks,
    uploadedBytes: job.uploadedBytes,
    cleanedChunks: job.cleanedChunks,
    integrity: integrityProgress(job),
    validation: validationProgress(job),
    ...(job.cleanupVersion >= 4 ? { preparation: preparationProgress(job.preparation) } : {}),
    recoveryReady: job.recoveryReady,
    updatedAt: job.updatedAt,
  });
  async function resolveOperation(uid, input) {
    authorize(uid);
    closed(input, ['restoreId', 'jobToken', 'operationId', 'requestHash']);
    const id = restoreId(input.restoreId),
      token = restoreHash(input.jobToken),
      opId = restoreId(input.operationId),
      fingerprint = restoreHash(input.requestHash);
    return db.runTransaction(async (tx) => {
      const loaded = await load(tx, uid, id, token),
        op = await tx.get(opRef(uid, opId));
      return op.exists
        ? confirmed(loaded, readOp(op, uid, id, fingerprint, loaded))
        : { schemaVersion: 1, kind: 'unknown', progress: loaded.view };
    });
  }
  async function cancel(uid, input) {
    authorize(uid);
    const request = mutationInput(input),
      id = request.restoreId,
      fingerprint = requestHash('cancelBookRestore', request);
    return db.runTransaction(async (tx) => {
      const loaded = await load(tx, uid, id, request.jobToken),
        op = await tx.get(opRef(uid, request.operationId));
      if (op.exists) return confirmed(loaded, readOp(op, uid, id, fingerprint, loaded));
      if (
        ![
          'uploading',
          'uploaded',
          'checking',
          'bytes-verified',
          'rejected',
          'validating',
          'content-verified',
          'content-rejected',
        ].includes(loaded.job.state)
      )
        fail('failed-precondition', 'state-conflict');
      const key = await tx.get(keyRef(uid, id));
      if (key.exists) keyContext(key.data(), loaded);
      const record = next(loaded.job, request, {
        state: 'cancelling',
        recoveryReady: false,
        ...(loaded.job.cleanupVersion >= 4
          ? {
              cleanupPhase:
                loaded.job.cleanupVersion >= 14
                  ? 'persona-library'
                  : loaded.job.cleanupVersion >= 13
                    ? 'cover-storage'
                    : loaded.job.cleanupVersion >= 7
                      ? 'resource-children'
                      : loaded.job.cleanupVersion >= 5
                        ? 'body-artifacts'
                        : 'artifacts',
            }
          : {}),
      });
      tx.delete(keyRef(uid, id));
      tx.update(loaded.ref, record);
      const r = writeOp(tx, uid, id, 'cancelBookRestore', request, record, loaded.view.jobToken);
      return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, r);
    });
  }
  async function cleanup(uid, input) {
    authorize(uid);
    const request = { ...mutationInput(input, ['limit']), limit: integer(input.limit, 1) },
      id = request.restoreId;
    if (request.limit > 50) invalid();
    const fingerprint = requestHash('advanceBookRestoreCleanup', request);
    const result = await db.runTransaction(async (tx) => {
      const loaded = await load(tx, uid, id, request.jobToken),
        op = await tx.get(opRef(uid, request.operationId));
      if (op.exists) return confirmed(loaded, readOp(op, uid, id, fingerprint, loaded));
      if (loaded.job.state !== 'cancelling') fail('failed-precondition', 'state-conflict');
      if (request.expectedCheckpoint !== loaded.job.checkpoint)
        fail('failed-precondition', 'checkpoint-conflict');
      if (loaded.job.cleanupPhase === 'persona-library') return { personaLibraryCleanup: true };
      if (loaded.job.cleanupPhase === 'cover-storage') return { coverStorageCleanup: true };
      if (loaded.job.cleanupVersion >= 2 && loaded.job.cleanupPhase !== 'chunks') {
        const prepared =
          loaded.job.cleanupPhase === 'resource-children'
            ? await prepareBookRestoreResourceChildrenCleanup(tx, db, loaded, request.limit)
            : loaded.job.cleanupPhase === 'body-artifacts'
              ? await prepareBookRestoreBodyArtifactsCleanup(tx, db, loaded, request.limit)
              : loaded.job.cleanupPhase === 'artifacts'
                ? await prepareBookRestoreArtifactsCleanup(tx, db, loaded, request.limit)
                : loaded.job.cleanupPhase.startsWith('validation-')
                  ? await prepareBookRestoreValidationCleanup(tx, db, loaded, request.limit)
                  : await prepareBookRestoreIntegrityCleanup(tx, db, loaded, request.limit);
        const record = next(loaded.job, request, prepared.patch);
        for (const ref of prepared.remove) tx.delete(ref);
        tx.update(loaded.ref, record);
        const r = writeOp(
          tx,
          uid,
          id,
          'advanceBookRestoreCleanup',
          request,
          record,
          loaded.view.jobToken,
        );
        return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, r);
      }
      const [page, key] = await Promise.all([
        tx.get(
          db
            .collection(loaded.ref.path + '/chunks')
            .select(
              'schemaVersion',
              'ownerId',
              'restoreId',
              'jobToken',
              'index',
              'byteLength',
              'chunkHash',
            )
            .orderBy('__name__')
            .limit(request.limit + 1),
        ),
        tx.get(keyRef(uid, id)),
      ]);
      if (key.exists) inconsistent();
      const removed = page.docs.slice(0, request.limit);
      for (const snapshot of removed) {
        const value = snapshot.data();
        if (
          !value ||
          value.schemaVersion !== 1 ||
          value.ownerId !== uid ||
          value.restoreId !== id ||
          value.jobToken !== loaded.view.jobToken ||
          snapshot.id !== chunkId(value.index) ||
          value.index >= loaded.job.uploadedChunks
        )
          inconsistent();
        integer(value.byteLength, 1);
        restoreHash(value.chunkHash);
      }
      const record = next(loaded.job, request, {
        cleanedChunks: sum(loaded.job.cleanedChunks, removed.length),
        state:
          page.docs.length <= request.limit && loaded.job.cleanupVersion === 1
            ? 'cancelled'
            : 'cancelling',
        ...(loaded.job.cleanupVersion >= 2
          ? {
              cleanupPhase:
                page.docs.length <= request.limit
                  ? loaded.job.cleanupVersion >= 3
                    ? 'validation-index'
                    : 'proofs'
                  : 'chunks',
            }
          : {}),
      });
      if (record.cleanedChunks > record.uploadedChunks) inconsistent();
      for (const snapshot of removed) tx.delete(snapshot.ref);
      tx.update(loaded.ref, record);
      const r = writeOp(
        tx,
        uid,
        id,
        'advanceBookRestoreCleanup',
        request,
        record,
        loaded.view.jobToken,
      );
      return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, r);
    });
    return result.personaLibraryCleanup
      ? cleanupPersonaLibrary(uid, input)
      : result.coverStorageCleanup
        ? cleanupCoverStorage(uid, input)
        : result;
  }
  async function recovery(uid, input) {
    authorize(uid);
    closed(input, ['restoreId', 'jobToken', 'reviewHash'], ['expectedKeyId']);
    const id = restoreId(input.restoreId),
      token = restoreHash(input.jobToken),
      reviewHash = restoreHash(input.reviewHash),
      expected = input.expectedKeyId === undefined ? undefined : restoreHash(input.expectedKeyId);
    const proposed = randomBytes(32);
    return db.runTransaction(async (tx) => {
      const loaded = await load(tx, uid, id, token),
        job = loaded.job;
      if (
        ![
          'uploading',
          'uploaded',
          'checking',
          'bytes-verified',
          'rejected',
          'validating',
          'content-verified',
          'content-rejected',
        ].includes(job.state)
      )
        fail('failed-precondition', 'state-conflict');
      if (job.reviewHash !== reviewHash) fail('failed-precondition', 'review-mismatch');
      if (expected !== undefined && job.keyId !== expected)
        fail('failed-precondition', 'key-mismatch');
      const snapshot = await tx.get(keyRef(uid, id));
      let keyBase64;
      if (job.keyEverCreated) {
        if (!job.recoveryReady) inconsistent();
        keyBase64 = secret(snapshot.data(), loaded);
      } else {
        if (snapshot.exists || job.recoveryReady) inconsistent();
        keyBase64 = proposed.toString('base64');
        const keyFingerprint = sha256(proposed);
        tx.create(keyRef(uid, id), {
          schemaVersion: 1,
          ownerId: uid,
          restoreId: id,
          jobToken: token,
          reviewHash,
          keyId: job.keyId,
          keyBase64,
        });
        tx.update(loaded.ref, {
          keyEverCreated: true,
          recoveryReady: true,
          keyFingerprint,
          updatedAt: date(now, job.updatedAt),
        });
      }
      return {
        schemaVersion: 1,
        ownerId: uid,
        restoreId: id,
        bookId: job.bookId,
        jobToken: token,
        reviewHash,
        keyId: job.keyId,
        algorithm: 'AES-GCM',
        keyBase64,
      };
    });
  }
  async function list(uid, input) {
    authorize(uid);
    closed(input, [], ['limit', 'cursor']);
    const limit = input.limit === undefined ? 25 : integer(input.limit, 1);
    if (limit > 50) invalid();
    let cursor = null;
    if (input.cursor !== undefined && input.cursor !== null) {
      if (
        typeof input.cursor !== 'string' ||
        input.cursor.length > 4096 ||
        !/^[A-Za-z0-9_-]+$/.test(input.cursor)
      )
        invalid('invalid-cursor');
      try {
        cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
      } catch {
        invalid('invalid-cursor');
      }
      closed(cursor, ['version', 'ownerId', 'createdAt', 'id']);
      if (cursor.version !== 1 || cursor.ownerId !== uid) invalid('invalid-cursor');
      restoreId(cursor.id);
      integer(cursor.createdAt);
    }
    return db.runTransaction(async (tx) => {
      let query = db
        .collection('users/' + uid + '/bookRestores')
        .orderBy('createdAt', 'desc')
        .orderBy('__name__', 'desc')
        .limit(limit + 1);
      if (cursor) query = query.startAfter(cursor.createdAt, cursor.id);
      const page = await tx.get(query),
        items = [];
      for (const snapshot of page.docs.slice(0, limit))
        items.push((await load(tx, uid, snapshot.id, undefined, snapshot)).view);
      const last = items.at(-1);
      return {
        schemaVersion: 1,
        items,
        nextCursor:
          page.docs.length > limit
            ? Buffer.from(
                JSON.stringify({
                  version: 1,
                  ownerId: uid,
                  createdAt: last.createdAt,
                  id: last.restoreId,
                }),
              ).toString('base64url')
            : null,
      };
    });
  }
  const integrity = createBookRestoreIntegrityService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const validation = createBookRestoreValidationService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const structure = createBookRestoreStructureService({
    db,
    now,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const lore = createBookRestoreLoreService({
    db,
    indexedLoreBodies,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const resources = createBookRestoreResourcesService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const counts = createBookRestoreCountsService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const personas = createBookRestorePersonasService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const universe = createBookRestoreUniverseService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const history = createBookRestoreHistoryService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const draft = createBookRestoreDraftService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const draftFinalize = createBookRestoreDraftFinalizeService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const cover = createBookRestoreCoverService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const { cleanupCoverStorage, ...coverMaterialization } =
    createBookRestoreCoverMaterializationService({
      db,
      assets: restoreAssets,
      load,
      readOp,
      writeOp,
      confirmed,
      next,
      pickProgress,
    });
  const { cleanupPersonaLibrary, ...personaLibrary } = createBookRestorePersonaLibraryService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  const sourceIndexes = createBookRestoreSourceIndexesService({
    db,
    load,
    readOp,
    writeOp,
    confirmed,
    next,
    pickProgress,
  });
  return {
    ...createBookRestorePreparedLoreService({ db, load }),
    ...createBookRestoreActivationReviewService({ db, load, readOp, assets: restoreAssets }),
    ...sourceIndexes,
    ...createBookRestoreAuditService({ db, load, readOp, writeOp, confirmed, next, pickProgress }),
    ...personaLibrary,
    ...coverMaterialization,
    ...cover,
    ...draftFinalize,
    ...draft,
    ...history,
    ...universe,
    ...personas,
    ...counts,
    ...resources,
    ...lore,
    ...structure,
    ...validation,
    ...integrity,
    async openVerifiedBookRestoreContent(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      return createVerifiedBookRestoreContent({
        db,
        uid,
        id: restoreId(input.restoreId),
        token: restoreHash(input.jobToken),
        load,
      });
    },
    async openVerifiedBookRestoreSource(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      return createVerifiedBookRestoreSource({
        db,
        uid,
        id: restoreId(input.restoreId),
        token: restoreHash(input.jobToken),
        load,
      });
    },
    startBookRestore: start,
    resolveBookRestoreStart: resolveStart,
    getBookRestore: get,
    listBookRestores: list,
    appendBookRestoreChunk: append,
    resolveBookRestoreOperation: resolveOperation,
    cancelBookRestore: cancel,
    advanceBookRestoreCleanup: cleanup,
    getBookRestoreRecoveryKey: recovery,
  };
}
