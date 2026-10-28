import { readWorkMetadata } from './workProgressContracts.mjs';
import { assertAdventureNotDeleted } from './adventureDeletionGuard.mjs';
import {
  ADVENTURE_RESTORE_ACTIONS,
  ADVENTURE_RESTORE_CHUNK_BYTES,
  closed,
  invalid,
  inconsistent,
  authorize,
  restoreId,
  restoreHash,
  integer,
  sum,
  digest,
  born,
  updated,
  bornEqual,
  immutable,
  compareStamp,
  nativeToken,
  pendingRoot,
  parseJob,
  progress,
  requestHash,
  restoreDate,
  restoreFail,
} from './adventureRestoreContracts.mjs';
import {
  ADVENTURE_RESTORE_CLEANUP,
  ADVENTURE_VALIDATION_COLLECTIONS,
  adventureValidationView,
  validAdventureValidationView,
} from './adventureRestoreValidationMeta.mjs';
import {
  adventureStagingView,
  validAdventureStagingView,
  ADVENTURE_STAGING_COLLECTIONS,
} from './adventureRestoreStagingMeta.mjs';
import { ADVENTURE_RESTORE_ROOT_COLLECTIONS } from './adventureRestoreRootCollections.mjs';
export { ADVENTURE_RESTORE_ROOT_COLLECTIONS };
const RECEIPT_FIELDS = [
  'schemaVersion',
  'operationId',
  'action',
  'expectedCheckpoint',
  'checkpoint',
  'state',
  'sequence',
  'uploadedChunks',
  'uploadedBytes',
  'checkedChunks',
  'checkedBytes',
  'cleanedChunks',
  'cleanedProofs',
  'cleanedStates',
  'cleanupPhase',
  'integrityFailure',
];
const COUNTERS = [
  'uploadedChunks',
  'uploadedBytes',
  'checkedChunks',
  'checkedBytes',
  'cleanedChunks',
  'cleanedProofs',
  'cleanedStates',
];
export function createAdventureRestoreStore({ db, now = Date.now }) {
  const refs = {
    job: (uid, id) => db.doc('users/' + uid + '/adventureRestores/' + id),
    op: (uid, id) => db.doc('users/' + uid + '/adventureRestoreOperations/' + id),
    fence: (uid, id) => db.doc('users/' + uid + '/adventureRestoreStartFences/' + id),
    reservation: (id) => db.doc('adventureRestoreReservations/' + id),
    root: (id) => db.doc('adventures/' + id),
  };
  const rootMeta = (tx, id) =>
    readWorkMetadata(tx, refs.root(id), [
      'schemaVersion',
      'kind',
      'restoreOwnerId',
      'restoreId',
      'startFingerprint',
      'ownerId',
    ]);
  function operation(snapshot, loaded, fingerprint) {
    const op = snapshot.data();
    closed(
      op,
      ['schemaVersion', 'ownerId', 'restoreId', 'fingerprint', 'jobHash', 'receipt', 'effects'],
      ['jobToken'],
    );
    if (op.schemaVersion !== 1 || op.ownerId !== loaded.uid || op.restoreId !== loaded.id)
      inconsistent();
    restoreHash(op.fingerprint);
    restoreHash(op.jobHash);
    if (fingerprint !== undefined && op.fingerprint !== fingerprint) invalid('operation-mismatch');
    immutable(snapshot);
    const r = closed(op.receipt, RECEIPT_FIELDS, ['validation', 'staging', 'activation']);
    if (
      Object.hasOwn(r, 'activation')
        ? r.action !== 'activateAdventureRestore' ||
          r.state !== 'activated' ||
          !loaded.job.activation ||
          digest(r.activation) !== digest(loaded.job.activation) ||
          r.checkpoint !== loaded.job.checkpoint
        : r.action === 'activateAdventureRestore'
    )
      inconsistent();
    if (Object.hasOwn(r, 'staging')) {
      if (
        !loaded.job.staging ||
        !validAdventureStagingView(r.staging) ||
        ![
          'advanceAdventureRestoreStructure',
          'advanceAdventureRestoreResources',
          'advanceAdventureRestoreProfiles',
          'advanceAdventureRestoreHistory',
          'finalizeAdventureRestoreDraft',
          'advanceAdventureRestoreUniverse',
          'advanceAdventureRestorePersonaLibrary',
          'advanceAdventureRestoreImages',
          'advanceAdventureRestoreImageStorage',
          'advanceAdventureRestoreCounts',
          'advanceAdventureRestoreAudit',
          'advanceAdventureRestoreImageLibrary',
          'activateAdventureRestore',
          'retireAdventureRestoreActivation',
          'cancelAdventureRestore',
          'advanceAdventureRestoreCleanup',
        ].includes(r.action) ||
        [
          'itemIndex',
          'artifactCount',
          'cleanedArtifacts',
          'parts',
          'scenes',
          'blocks',
          'resourceIndex',
          'resourcesProcessed',
          'checklistTotal',
          'checklistCompleted',
          'loreHeads',
          'loreBodies',
          'personaAdventureBindings',
          'personaSceneBindings',
          'personaProfiles',
          'personaLibraryInstalled',
          'historyVersions',
          'historyBytes',
          'historyBodies',
          'historySourceRecords',
          'drafts',
          'draftBytes',
          'draftBodies',
          'textFrames',
          'historyUnits',
          'imageBindings',
          'imageAssets',
          'imageBytes',
          'imageFrames',
          'imageUnits',
          'storageBindings',
          'storageIntents',
          'storagePrepared',
          'storageFenced',
          'countBlocks',
          'countScenes',
          'countLinks',
          'countWordCount',
          'auditJournals',
          'auditPhysical',
          'auditMedia',
          'libraryImages',
          'libraryUses',
        ].some(
          (k) =>
            // Library installation invalidates the first audit and starts a final round.
            // Its sealed checkpoint remains an immutable historical receipt boundary.
            !(
              k.startsWith('audit') &&
              r.checkpoint <= (loaded.job.staging.librarySourceAudit?.checkpoint ?? -1)
            ) && r.staging[k] > loaded.job.staging[k],
        )
      )
        inconsistent();
    } else if (
      [
        'advanceAdventureRestoreStructure',
        'advanceAdventureRestoreResources',
        'advanceAdventureRestoreProfiles',
        'advanceAdventureRestoreHistory',
        'finalizeAdventureRestoreDraft',
        'advanceAdventureRestoreUniverse',
        'advanceAdventureRestorePersonaLibrary',
        'advanceAdventureRestoreImages',
        'advanceAdventureRestoreImageStorage',
        'advanceAdventureRestoreCounts',
        'advanceAdventureRestoreAudit',
        'advanceAdventureRestoreImageLibrary',
        'activateAdventureRestore',
        'retireAdventureRestoreActivation',
      ].includes(r.action)
    )
      inconsistent();
    if (Object.hasOwn(r, 'validation')) {
      if (
        !loaded.job.validation ||
        !validAdventureValidationView(r.validation) ||
        ![
          'advanceAdventureRestoreValidation',
          'advanceAdventureRestoreStructure',
          'advanceAdventureRestoreResources',
          'advanceAdventureRestoreProfiles',
          'advanceAdventureRestoreHistory',
          'finalizeAdventureRestoreDraft',
          'advanceAdventureRestoreUniverse',
          'advanceAdventureRestorePersonaLibrary',
          'advanceAdventureRestoreImages',
          'advanceAdventureRestoreImageStorage',
          'advanceAdventureRestoreCounts',
          'advanceAdventureRestoreAudit',
          'advanceAdventureRestoreImageLibrary',
          'activateAdventureRestore',
          'retireAdventureRestoreActivation',
          'cancelAdventureRestore',
          'advanceAdventureRestoreCleanup',
        ].includes(r.action) ||
        ['frames', 'items', 'recheckedChunks'].some(
          (k) => r.validation[k] > loaded.job.validation[k],
        )
      )
        inconsistent();
    } else if (r.action === 'advanceAdventureRestoreValidation') inconsistent();
    if (
      r.schemaVersion !== 1 ||
      r.operationId !== snapshot.id ||
      !Object.hasOwn(ADVENTURE_RESTORE_ACTIONS, r.action) ||
      !ADVENTURE_RESTORE_ACTIONS[r.action].includes(r.state) ||
      !Number.isSafeInteger(r.checkpoint) ||
      r.checkpoint < 0 ||
      r.checkpoint > loaded.job.checkpoint
    )
      inconsistent();
    for (const key of COUNTERS)
      if (!Number.isSafeInteger(r[key]) || r[key] < 0 || r[key] > loaded.job[key]) inconsistent();
    if (
      r.uploadedBytes !==
        Math.min(loaded.job.source.byteLength, r.uploadedChunks * ADVENTURE_RESTORE_CHUNK_BYTES) ||
      r.checkedBytes !==
        Math.min(loaded.job.source.byteLength, r.checkedChunks * ADVENTURE_RESTORE_CHUNK_BYTES) ||
      r.checkedChunks > r.uploadedChunks ||
      r.cleanedChunks > r.uploadedChunks ||
      r.cleanedProofs > r.checkedChunks ||
      ![...ADVENTURE_RESTORE_CLEANUP, 'done'].includes(r.cleanupPhase) ||
      (r.integrityFailure !== null &&
        !['file-hash-mismatch', 'upload-chain-mismatch'].includes(r.integrityFailure))
    )
      inconsistent();
    if (
      !Array.isArray(op.effects) ||
      op.effects.length > (r.action === 'advanceAdventureRestoreValidation' ? 97 : 18)
    )
      inconsistent();
    const keys = new Set();
    for (const effect of op.effects) {
      closed(effect, ['collection', 'id', 'hash']);
      if (
        ![
          'chunks',
          'integrityProofs',
          'integrityStates',
          'root',
          ...ADVENTURE_VALIDATION_COLLECTIONS,
          ...ADVENTURE_STAGING_COLLECTIONS,
          'staged-target',
          'persona-library-batch',
          'recovery-key',
        ].includes(effect.collection) ||
        typeof effect.id !== 'string' ||
        !/^[A-Za-z0-9-]{1,80}$/.test(effect.id)
      )
        inconsistent();
      if (
        effect.collection === 'recovery-key' &&
        (r.action !== 'startAdventureRestore' || effect.id !== loaded.id)
      )
        inconsistent();
      restoreHash(effect.hash);
      const key = effect.collection + '/' + effect.id;
      if (keys.has(key)) inconsistent();
      keys.add(key);
    }
    if (r.action === 'startAdventureRestore') {
      if (
        r.checkpoint !== 0 ||
        r.expectedCheckpoint !== null ||
        r.sequence !== null ||
        Object.hasOwn(op, 'jobToken') ||
        !bornEqual(snapshot, loaded.snapshot)
      )
        inconsistent();
    } else {
      integer(r.expectedCheckpoint);
      if (
        r.checkpoint !== sum(r.expectedCheckpoint, 1) ||
        op.jobToken !== loaded.view.jobToken ||
        compareStamp(born(snapshot), born(loaded.snapshot)) < 0 ||
        compareStamp(born(snapshot), updated(loaded.snapshot)) > 0
      )
        inconsistent();
      if (r.action === 'appendAdventureRestoreChunk') {
        integer(r.sequence);
        if (r.uploadedChunks !== r.sequence + 1 || r.sequence >= loaded.job.uploadedChunks)
          inconsistent();
      } else if (r.sequence !== null) inconsistent();
    }
    if (r.checkpoint === loaded.job.checkpoint) {
      if (
        snapshot.id !== loaded.job.lastOperationId ||
        op.fingerprint !== loaded.job.lastRequestHash ||
        op.jobHash !== digest(loaded.job) ||
        digest(born(snapshot)) !== digest(updated(loaded.snapshot)) ||
        r.state !== loaded.job.state ||
        digest(r.staging ?? null) !==
          digest(loaded.job.staging ? adventureStagingView(loaded.job.staging) : null) ||
        digest(r.validation ?? null) !==
          digest(loaded.job.validation ? adventureValidationView(loaded.job.validation) : null) ||
        COUNTERS.some((k) => r[k] !== loaded.job[k]) ||
        r.cleanupPhase !== loaded.job.cleanupPhase ||
        r.integrityFailure !== loaded.job.integrityFailure
      )
        inconsistent();
    }
    return structuredClone(r);
  }
  async function load(tx, uid, id, token, supplied) {
    authorize(uid);
    restoreId(id);
    const ref = refs.job(uid, id),
      snapshot = supplied ?? (await tx.get(ref));
    if (!snapshot.exists || snapshot.id !== id || snapshot.data()?.ownerId !== uid)
      restoreFail('not-found', 'restore-unavailable');
    let job;
    try {
      job = parseJob(snapshot.data(), uid, id);
    } catch (error) {
      if (error?.code === 'invalid-argument') inconsistent();
      throw error;
    }
    if (!['activated', 'cancelled'].includes(job.state))
      await assertAdventureNotDeleted(tx, db, uid, job.adventureId);
    const view = progress(uid, id, snapshot, job);
    if (token !== undefined && token !== view.jobToken)
      restoreFail('failed-precondition', 'identity-conflict');
    const loaded = { uid, id, ref, snapshot, job, view };
    const [reserved, start, meta] = await Promise.all([
      tx.get(refs.reservation(job.adventureId)),
      tx.get(refs.op(uid, id)),
      job.state === 'activated' ? Promise.resolve(null) : rootMeta(tx, job.adventureId),
    ]);
    const r = reserved.data();
    closed(r, ['schemaVersion', 'ownerId', 'restoreId', 'adventureId', 'startFingerprint', 'kind']);
    if (
      r.schemaVersion !== 1 ||
      r.ownerId !== uid ||
      r.restoreId !== id ||
      r.adventureId !== job.adventureId ||
      r.startFingerprint !== job.startFingerprint ||
      r.kind !== 'job' ||
      !bornEqual(reserved, snapshot)
    )
      inconsistent();
    immutable(reserved);
    if (
      job.state !== 'activated' &&
      (!meta.exists ||
        !bornEqual(meta, snapshot) ||
        Object.hasOwn(meta.data(), 'ownerId') ||
        digest(meta.data()) !==
          digest(pendingRoot(uid, id, job.startFingerprint, job.state === 'cancelled')))
    )
      inconsistent();
    if (
      !start.exists ||
      operation(start, loaded, job.startFingerprint).action !== 'startAdventureRestore'
    )
      inconsistent();
    const latest =
      job.lastOperationId === id ? start : await tx.get(refs.op(uid, job.lastOperationId));
    if (!latest.exists) inconsistent();
    if (operation(latest, loaded, job.lastRequestHash).checkpoint !== job.checkpoint)
      inconsistent();
    if (job.state === 'cancelled') {
      if (
        digest(updated(meta)) !== digest(born(latest)) ||
        !latest
          .data()
          .effects.some(
            (e) =>
              e.collection === 'root' && e.id === job.adventureId && e.hash === digest(meta.data()),
          )
      )
        inconsistent();
    } else if (job.state !== 'activated') immutable(meta);
    if (job.state !== 'activated') {
      const full = await tx.get(refs.root(job.adventureId));
      if (nativeToken(full) !== nativeToken(meta) || digest(full.data()) !== digest(meta.data()))
        inconsistent();
    }
    return loaded;
  }
  async function emptyRoot(tx, id) {
    for (const name of ADVENTURE_RESTORE_ROOT_COLLECTIONS) {
      const found = await tx.get(
        db
          .collection('adventures/' + id + '/' + name)
          .select('schemaVersion')
          .limit(1),
      );
      if (found.docs.length) inconsistent();
    }
  }
  function mutationFingerprint(action, request, fingerprintAction = action) {
    if (
      fingerprintAction !== action &&
      !(
        action === 'retireAdventureRestoreActivation' &&
        fingerprintAction === 'activateAdventureRestore'
      )
    )
      inconsistent();
    return requestHash(fingerprintAction, request);
  }
  function next(loaded, request, action, patch = {}, fingerprintAction = action) {
    if (request.expectedCheckpoint !== loaded.job.checkpoint)
      restoreFail('failed-precondition', 'checkpoint-conflict');
    return parseJob(
      {
        ...loaded.job,
        ...patch,
        checkpoint: sum(loaded.job.checkpoint, 1),
        updatedAt: restoreDate(now, loaded.job.updatedAt),
        lastOperationId: request.operationId,
        lastRequestHash: mutationFingerprint(action, request, fingerprintAction),
      },
      loaded.uid,
      loaded.id,
    );
  }
  function receipt(action, request, record, sequence = null) {
    return {
      schemaVersion: 1,
      operationId: request.operationId,
      action,
      expectedCheckpoint: action === 'startAdventureRestore' ? null : request.expectedCheckpoint,
      checkpoint: record.checkpoint,
      state: record.state,
      sequence,
      ...Object.fromEntries(COUNTERS.map((k) => [k, record[k]])),
      cleanupPhase: record.cleanupPhase,
      integrityFailure: record.integrityFailure,
      ...(record.validation ? { validation: adventureValidationView(record.validation) } : {}),
      ...(record.staging ? { staging: adventureStagingView(record.staging) } : {}),
      ...(record.activation ? { activation: structuredClone(record.activation) } : {}),
    };
  }
  function writeOperation(
    tx,
    uid,
    id,
    action,
    request,
    record,
    token,
    effects = [],
    sequence = null,
    fingerprintAction = action,
  ) {
    const r = receipt(action, request, record, sequence);
    tx.create(refs.op(uid, request.operationId), {
      schemaVersion: 1,
      ownerId: uid,
      restoreId: id,
      fingerprint: mutationFingerprint(action, request, fingerprintAction),
      jobHash: digest(record),
      receipt: r,
      effects: structuredClone(effects),
      ...(token === undefined ? {} : { jobToken: token }),
    });
    return r;
  }
  function confirm(loaded, r, record = loaded.job) {
    return {
      schemaVersion: 1,
      kind: 'confirmed',
      receipt: structuredClone(r),
      progress: progress(loaded.uid, loaded.id, loaded.snapshot, record),
    };
  }
  function commit(
    tx,
    loaded,
    request,
    action,
    record,
    effects = [],
    sequence = null,
    fingerprintAction = action,
  ) {
    tx.update(loaded.ref, record);
    return confirm(
      loaded,
      writeOperation(
        tx,
        loaded.uid,
        loaded.id,
        action,
        request,
        record,
        loaded.view.jobToken,
        effects,
        sequence,
        fingerprintAction,
      ),
      record,
    );
  }
  const effect = (collection, id, value) => ({ collection, id, hash: digest(value) });
  async function artifact(tx, loaded, collection, snapshot) {
    if (!snapshot.exists) inconsistent();
    immutable(snapshot);
    const value = snapshot.data();
    if (
      !value ||
      value.schemaVersion !== 1 ||
      value.ownerId !== loaded.uid ||
      value.restoreId !== loaded.id ||
      value.jobToken !== loaded.view.jobToken
    )
      inconsistent();
    restoreId(value.createdByOperationId);
    const op = await tx.get(refs.op(loaded.uid, value.createdByOperationId));
    if (!op.exists || !bornEqual(op, snapshot)) inconsistent();
    const r = operation(op, loaded);
    if (
      (collection === 'chunks'
        ? r.action !== 'appendAdventureRestoreChunk'
        : ['validationIndex', 'validationItems'].includes(collection)
          ? r.action !== 'advanceAdventureRestoreValidation'
          : r.action !== 'advanceAdventureRestoreIntegrity') ||
      !op
        .data()
        .effects.some(
          (e) => e.collection === collection && e.id === snapshot.id && e.hash === digest(value),
        )
    )
      inconsistent();
    return value;
  }
  return {
    db,
    now,
    refs,
    rootMeta,
    load,
    operation,
    emptyRoot,
    next,
    writeOperation,
    confirm,
    commit,
    effect,
    artifact,
  };
}
