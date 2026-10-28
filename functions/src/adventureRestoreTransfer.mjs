import { createAdventureRestoreStore } from './adventureRestoreStore.mjs';
import { createAdventureRestoreIntegrityService } from './adventureRestoreIntegrity.mjs';
import { restoreContext } from './adventureRestoreChunks.mjs';
import {
  ADVENTURE_RESTORE_CHUNK_BYTES,
  ADVENTURE_RESTORE_SEED,
  authorize,
  closed,
  restoreId,
  restoreHash,
  integer,
  sum,
  digest,
  invalid,
  inconsistent,
  restoreFail,
  restoreDate,
  startInput,
  mutationInput,
  chunkInput,
  requestHash,
  targetId,
  pendingRoot,
  bornEqual,
  immutable,
  nativeToken,
  chunkId,
  chunkChain,
} from './adventureRestoreContracts.mjs';
import { ADVENTURE_RESTORE_CLEANUP as names } from './adventureRestoreValidationMeta.mjs';
import { readAdventureValidationState } from './adventureRestoreValidationState.mjs';
import { createAdventureRestoreValidationService } from './adventureRestoreValidation.mjs';
import { ADVENTURE_STAGE_ARTIFACT_FIELDS } from './adventureRestoreArtifacts.mjs';
import { createAdventureRestorePersonaLibraryService } from './adventureRestorePersonaLibrary.mjs';
import {
  prepareAdventurePersonaLibraryRevocation,
  assertAdventurePersonaLibraryClean,
} from './adventureRestorePersonaLibraryBatch.mjs';
import { createAdventureRestoreUniverseService } from './adventureRestoreUniverse.mjs';
import { createAdventureRestoreDraftFinalizeService } from './adventureRestoreDraftFinalize.mjs';
import { createAdventureRestoreHistoryService } from './adventureRestoreHistory.mjs';
import { createAdventureRestoreProfilesService } from './adventureRestoreProfiles.mjs';
import { createAdventureRestoreResourcesService } from './adventureRestoreResources.mjs';
import { createAdventureRestoreStructureService } from './adventureRestoreStructure.mjs';
import {
  prepareAdventureStagingCleanup,
  checkAdventureStageSourceIndex,
} from './adventureRestoreStagingCleanup.mjs';
const terminal = (id, adventureId) => ({
  schemaVersion: 1,
  kind: 'cancelled',
  restoreId: id,
  adventureId,
});
/** Internal only: no callable or UI is exposed before persistent validation/recovery/activation is complete. */
export function createAdventureRestoreTransferService({ db, now = Date.now }) {
  const store = createAdventureRestoreStore({ db, now }),
    { refs } = store;
  const reservation = (uid, id, adventureId, fingerprint, kind) => ({
    schemaVersion: 1,
    ownerId: uid,
    restoreId: id,
    adventureId,
    startFingerprint: fingerprint,
    kind,
  });
  async function fence(tx, uid, id, adventureId, fingerprint, f, r, root) {
    const value = f.data();
    closed(value, [
      'schemaVersion',
      'ownerId',
      'restoreId',
      'adventureId',
      'startFingerprint',
      'kind',
      'createdAt',
    ]);
    if (value.startFingerprint !== fingerprint) invalid('operation-mismatch');
    integer(value.createdAt);
    if (
      value.kind !== 'cancel-start' ||
      value.schemaVersion !== 1 ||
      value.ownerId !== uid ||
      value.restoreId !== id ||
      value.adventureId !== adventureId ||
      digest(r.data()) !== digest(reservation(uid, id, adventureId, fingerprint, 'fence')) ||
      !root.exists ||
      digest(root.data()) !== digest(pendingRoot(uid, id, fingerprint, true)) ||
      !bornEqual(f, r) ||
      !bornEqual(f, root)
    )
      inconsistent();
    immutable(f);
    immutable(r);
    immutable(root);
    const full = await tx.get(refs.root(adventureId));
    if (nativeToken(full) !== nativeToken(root) || digest(full.data()) !== digest(root.data()))
      inconsistent();
    return terminal(id, adventureId);
  }
  async function start(uid, input) {
    authorize(uid);
    const request = startInput(input),
      id = request.operationId,
      fingerprint = requestHash('startAdventureRestore', request),
      adventureId = targetId(uid, id, fingerprint);
    const prior = await db.runTransaction(async (tx) => {
      const [job, op, f, r, root] = await Promise.all([
        tx.get(refs.job(uid, id)),
        tx.get(refs.op(uid, id)),
        tx.get(refs.fence(uid, id)),
        tx.get(refs.reservation(adventureId)),
        store.rootMeta(tx, adventureId),
      ]);
      if (f.exists) {
        if (job.exists || op.exists) inconsistent();
        return fence(tx, uid, id, adventureId, fingerprint, f, r, root);
      }
      if (job.exists || op.exists) {
        if (!job.exists || !op.exists) inconsistent();
        const loaded = await store.load(tx, uid, id, undefined, job),
          receipt = store.operation(op, loaded, fingerprint);
        if (receipt.action !== 'startAdventureRestore') inconsistent();
        return store.confirm(loaded, receipt);
      }
      if (r.exists || root.exists) inconsistent();
      await store.emptyRoot(tx, adventureId);
      const timestamp = restoreDate(now),
        record = {
          schemaVersion: 1,
          ownerId: uid,
          restoreId: id,
          adventureId,
          startFingerprint: fingerprint,
          source: request.source,
          reviewHash: request.reviewHash,
          state: 'uploading',
          checkpoint: 0,
          uploadedChunks: 0,
          uploadedBytes: 0,
          uploadedChainHash: ADVENTURE_RESTORE_SEED,
          checkedChunks: 0,
          checkedBytes: 0,
          checkedChainHash: ADVENTURE_RESTORE_SEED,
          integrityDigest: null,
          integrityFailure: null,
          integrityStateId: null,
          integrityStateHash: null,
          writtenStates: 0,
          cleanupPhase: 'chunks',
          cleanupCursor: null,
          cleanedChunks: 0,
          cleanedProofs: 0,
          cleanedStates: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastOperationId: id,
          lastRequestHash: fingerprint,
        };
      tx.create(refs.job(uid, id), record);
      tx.create(
        refs.reservation(adventureId),
        reservation(uid, id, adventureId, fingerprint, 'job'),
      );
      tx.create(refs.root(adventureId), pendingRoot(uid, id, fingerprint));
      store.writeOperation(tx, uid, id, 'startAdventureRestore', request, record);
      return null;
    });
    if (prior) return prior;
    return db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, uid, id),
        op = await tx.get(refs.op(uid, id));
      return store.confirm(loaded, store.operation(op, loaded, fingerprint));
    });
  }
  async function resolveStart(uid, input) {
    authorize(uid);
    closed(input, ['operationId', 'requestHash', 'intent']);
    const id = restoreId(input.operationId),
      fingerprint = restoreHash(input.requestHash);
    if (input.intent !== 'cancel') invalid();
    const adventureId = targetId(uid, id, fingerprint);
    return db.runTransaction(async (tx) => {
      const [job, op, f, r, root] = await Promise.all([
        tx.get(refs.job(uid, id)),
        tx.get(refs.op(uid, id)),
        tx.get(refs.fence(uid, id)),
        tx.get(refs.reservation(adventureId)),
        store.rootMeta(tx, adventureId),
      ]);
      if (job.exists || op.exists) {
        if (!job.exists || !op.exists || f.exists) inconsistent();
        const loaded = await store.load(tx, uid, id, undefined, job),
          receipt = store.operation(op, loaded, fingerprint);
        if (receipt.action !== 'startAdventureRestore') inconsistent();
        return store.confirm(loaded, receipt);
      }
      if (f.exists) return fence(tx, uid, id, adventureId, fingerprint, f, r, root);
      if (r.exists || root.exists) inconsistent();
      await store.emptyRoot(tx, adventureId);
      tx.create(refs.fence(uid, id), {
        ...reservation(uid, id, adventureId, fingerprint, 'cancel-start'),
        createdAt: restoreDate(now),
      });
      tx.create(
        refs.reservation(adventureId),
        reservation(uid, id, adventureId, fingerprint, 'fence'),
      );
      tx.create(refs.root(adventureId), pendingRoot(uid, id, fingerprint, true));
      return terminal(id, adventureId);
    });
  }
  async function get(uid, input) {
    authorize(uid);
    closed(input, ['restoreId'], ['jobToken']);
    const id = restoreId(input.restoreId),
      token = input.jobToken === undefined ? undefined : restoreHash(input.jobToken);
    return db.runTransaction(async (tx) => (await store.load(tx, uid, id, token)).view);
  }
  async function list(uid, input = {}) {
    authorize(uid);
    closed(input, [], ['limit', 'cursor']);
    const limit = integer(input.limit ?? 25, 1);
    if (limit > 50) invalid();
    let after = null;
    if (input.cursor !== undefined && input.cursor !== null) {
      const encoded = input.cursor;
      if (typeof encoded !== 'string' || encoded.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(encoded))
        invalid('invalid-page');
      try {
        after = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      } catch {
        invalid('invalid-page');
      }
      closed(after, ['schemaVersion', 'kind', 'uid', 'createdAt', 'id']);
      if (
        Buffer.from(JSON.stringify(after)).toString('base64url') !== encoded ||
        after.schemaVersion !== 1 ||
        after.kind !== 'adventure-restore-list' ||
        after.uid !== uid
      )
        invalid('invalid-page');
      integer(after.createdAt);
      restoreId(after.id);
    }
    return db.runTransaction(async (tx) => {
      let q = db
        .collection('users/' + uid + '/adventureRestores')
        .orderBy('createdAt', 'desc')
        .orderBy('__name__', 'desc')
        .limit(limit);
      if (after) q = q.startAfter(after.createdAt, after.id);
      const page = await tx.get(q),
        items = [];
      for (const snap of page.docs)
        items.push((await store.load(tx, uid, snap.id, undefined, snap)).view);
      const last = items.at(-1),
        cursor =
          items.length === limit
            ? Buffer.from(
                JSON.stringify({
                  schemaVersion: 1,
                  kind: 'adventure-restore-list',
                  uid,
                  createdAt: last.createdAt,
                  id: last.restoreId,
                }),
              ).toString('base64url')
            : null;
      return { schemaVersion: 1, items, nextCursor: cursor };
    });
  }
  async function append(uid, input) {
    authorize(uid);
    const request = chunkInput(input),
      action = 'appendAdventureRestoreChunk',
      fingerprint = requestHash(action, request);
    return db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
        op = await tx.get(refs.op(uid, request.operationId)),
        job = loaded.job;
      if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
      if (job.state !== 'uploading') restoreFail('failed-precondition', 'state-conflict');
      if (request.expectedCheckpoint !== job.checkpoint)
        restoreFail('failed-precondition', 'checkpoint-conflict');
      const expected = Math.min(
        ADVENTURE_RESTORE_CHUNK_BYTES,
        job.source.byteLength - job.uploadedBytes,
      );
      if (request.index !== job.uploadedChunks || request.bytes.length !== expected)
        invalid('chunk-position');
      const ref = db.doc(loaded.ref.path + '/chunks/' + chunkId(request.index));
      if ((await tx.get(ref)).exists) inconsistent();
      const value = {
        ...restoreContext(loaded, request.operationId),
        index: request.index,
        byteLength: request.bytes.length,
        chunkHash: request.chunkHash,
        chunkBase64: request.bytes.toString('base64'),
        previousChainHash: job.uploadedChainHash,
        chainHash: chunkChain(
          job.uploadedChainHash,
          request.index,
          request.chunkHash,
          request.bytes.length,
        ),
      };
      const record = store.next(loaded, request, action, {
        uploadedChunks: sum(job.uploadedChunks, 1),
        uploadedBytes: sum(job.uploadedBytes, request.bytes.length),
        uploadedChainHash: value.chainHash,
        state:
          job.uploadedBytes + request.bytes.length === job.source.byteLength
            ? 'uploaded'
            : 'uploading',
      });
      tx.create(ref, value);
      return store.commit(
        tx,
        loaded,
        request,
        action,
        record,
        [store.effect('chunks', chunkId(request.index), value)],
        request.index,
      );
    });
  }
  async function resolveOperation(uid, input) {
    authorize(uid);
    closed(input, ['restoreId', 'jobToken', 'operationId', 'requestHash']);
    const id = restoreId(input.restoreId),
      token = restoreHash(input.jobToken),
      operationId = restoreId(input.operationId),
      fingerprint = restoreHash(input.requestHash);
    return db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, uid, id, token),
        op = await tx.get(refs.op(uid, operationId));
      return op.exists
        ? store.confirm(loaded, store.operation(op, loaded, fingerprint))
        : { schemaVersion: 1, kind: 'unresolved', progress: loaded.view };
    });
  }
  async function cancel(uid, input) {
    authorize(uid);
    const request = mutationInput(input),
      action = 'cancelAdventureRestore',
      fingerprint = requestHash(action, request);
    return db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
        op = await tx.get(refs.op(uid, request.operationId));
      if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
      if (loaded.job.state === 'cancelled') restoreFail('failed-precondition', 'state-conflict');
      const record = store.next(loaded, request, action, {
        state: 'cancelling',
        integrityStateId: null,
        integrityStateHash: null,
      });
      return store.commit(tx, loaded, request, action, record);
    });
  }
  async function cleanup(uid, input) {
    authorize(uid);
    const request = { ...mutationInput(input, ['limit']), limit: integer(input.limit, 1) },
      action = 'advanceAdventureRestoreCleanup',
      fingerprint = requestHash(action, request);
    if (request.limit > 50) invalid();
    return db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
        op = await tx.get(refs.op(uid, request.operationId)),
        job = loaded.job;
      if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
      if (job.state !== 'cancelling' || request.expectedCheckpoint !== job.checkpoint)
        restoreFail('failed-precondition', 'state-conflict');
      const revocation = await prepareAdventurePersonaLibraryRevocation(store, tx, loaded, request);
      if (revocation) {
        const record = store.next(loaded, request, action, { staging: revocation.staging });
        revocation.commit();
        return store.commit(tx, loaded, request, action, record, revocation.effects);
      }
      const name = job.cleanupPhase,
        offset = names.indexOf(name);
      if (offset < 0) inconsistent();
      let q = db
        .collection(loaded.ref.path + '/' + name)
        .orderBy('__name__')
        .limit(request.limit);
      if (name === 'stagingArtifacts') q = q.select(...ADVENTURE_STAGE_ARTIFACT_FIELDS);
      if (name === 'preparedRoot') q = q.select('schemaVersion');
      if (job.cleanupCursor) q = q.startAfter(job.cleanupCursor);
      const fetched = await tx.get(q),
        // Finish descendant journals in their own commit before checking parents.
        page =
          name === 'stagingArtifacts' && fetched.docs[0]?.id.startsWith('0-')
            ? { docs: fetched.docs.filter((snapshot) => snapshot.id.startsWith('0-')) }
            : fetched,
        counter = {
          chunks: 'cleanedChunks',
          integrityProofs: 'cleanedProofs',
          integrityStates: 'cleanedStates',
          validationIndex: 'cleanedIndex',
          validationItems: 'cleanedItems',
          validationState: 'cleanedState',
        }[name];
      const stagingCleanup = ['stagingArtifacts', 'preparedRoot'].includes(name)
        ? await prepareAdventureStagingCleanup(store, tx, loaded, name, page)
        : null;
      const isValidation = name.startsWith('validation');
      if (isValidation && page.docs.length && !job.validation) inconsistent();
      for (const snap of stagingCleanup ? [] : page.docs) {
        if (name === 'validationState') {
          if (snap.id !== 'current') inconsistent();
          const state = await readAdventureValidationState(store, tx, loaded);
          if (nativeToken(state.snapshot) !== nativeToken(snap)) inconsistent();
        } else {
          await store.artifact(tx, loaded, name, snap);
          if (name === 'validationIndex')
            await checkAdventureStageSourceIndex(store, tx, loaded, snap);
        }
      }
      const cleaned = stagingCleanup
        ? stagingCleanup.cleaned
        : isValidation
          ? (job.validation?.[counter] ?? 0)
          : job[counter];
      let patch = {
          cleanupCursor: page.docs.at(-1)?.id ?? job.cleanupCursor,
          ...(stagingCleanup
            ? stagingCleanup.patch
            : isValidation
              ? job.validation
                ? {
                    validation: {
                      ...job.validation,
                      [counter]: sum(cleaned, page.docs.length),
                      ...(name === 'validationState' && page.docs.length ? { snapshot: null } : {}),
                    },
                  }
                : {}
              : { [counter]: sum(cleaned, page.docs.length) }),
        },
        root = null;
      if (!page.docs.length) {
        if (
          (
            await tx.get(
              db
                .collection(loaded.ref.path + '/' + name)
                .select('schemaVersion')
                .limit(1),
            )
          ).docs.length
        )
          inconsistent();
        const expected = stagingCleanup
          ? stagingCleanup.expected
          : {
              chunks: job.uploadedChunks,
              integrityProofs: job.checkedChunks,
              integrityStates: job.writtenStates,
              validationIndex: job.validation?.indexEntries ?? 0,
              validationItems: job.validation?.items ?? 0,
              validationState: Number(job.validation?.stateCreated ?? false),
            }[name];
        if (cleaned !== expected) inconsistent();
        patch = { ...patch, cleanupCursor: null, cleanupPhase: names[offset + 1] ?? 'done' };
        if (patch.cleanupPhase === 'done') {
          for (const collection of names)
            if (
              (
                await tx.get(
                  db
                    .collection(loaded.ref.path + '/' + collection)
                    .select('schemaVersion')
                    .limit(1),
                )
              ).docs.length
            )
              inconsistent();
          await store.emptyRoot(tx, job.adventureId);
          await assertAdventurePersonaLibraryClean(store, tx, loaded);
          root = pendingRoot(uid, loaded.id, job.startFingerprint, true);
          patch.state = 'cancelled';
        }
      }
      const record = store.next(loaded, request, action, patch),
        effects = root ? [store.effect('root', job.adventureId, root)] : [];
      if (stagingCleanup) stagingCleanup.commit();
      else page.docs.forEach((snap) => tx.delete(snap.ref));
      if (root) tx.set(refs.root(job.adventureId), root);
      return store.commit(tx, loaded, request, action, record, effects);
    });
  }
  return {
    startAdventureRestore: start,
    resolveAdventureRestoreStart: resolveStart,
    getAdventureRestore: get,
    listAdventureRestores: list,
    appendAdventureRestoreChunk: append,
    resolveAdventureRestoreOperation: resolveOperation,
    cancelAdventureRestore: cancel,
    advanceAdventureRestoreCleanup: cleanup,
    ...createAdventureRestoreIntegrityService(store),
    ...createAdventureRestoreValidationService(store),
    ...createAdventureRestoreStructureService(store),
    ...createAdventureRestoreResourcesService(store),
    ...createAdventureRestoreProfilesService(store),
    ...createAdventureRestoreHistoryService(store),
    ...createAdventureRestoreDraftFinalizeService(store),
    ...createAdventureRestoreUniverseService(store),
    ...createAdventureRestorePersonaLibraryService(store),
  };
}
