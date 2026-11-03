import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  digest,
  sum,
  nativeToken,
} from './adventureRestoreContracts.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
import { prepareAdventureStageArtifacts } from './adventureRestoreArtifacts.mjs';
import { readAdventureRestorePersonaBatch } from './adventureRestorePersonaLibraryBatch.mjs';
import { bookRestoreStorageProof } from './bookRestoreCoverStorageContracts.mjs';
import { imageStoragePhase } from './adventureRestoreImageStorageMeta.mjs';
import {
  imageStorageAddress,
  observeImageArtifact,
  checkedStorageIntent,
  adventureImageStorageContext,
  readImageStorageSource,
  observeImageStorageSource,
  readPreparedImageBuffer,
} from './adventureRestoreImageStorageRead.mjs';
export function createAdventureRestoreImageStorageService(store, assets) {
  const action = 'advanceAdventureRestoreImageStorage';
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      !['image-bytes-ready', 'image-storage'].includes(loaded.job.staging?.phase) ||
      loaded.job.staging.personaLibraryRevoked ||
      loaded.job.checkpoint !== request.expectedCheckpoint
    )
      restoreFail('failed-precondition', 'state-conflict');
  }
  const intent = (tx, loaded, id) =>
    observeImageArtifact(store, tx, loaded, imageStorageAddress(id));
  async function resolved(tx, loaded, request, method = action) {
    const op = await tx.get(store.refs.op(loaded.uid, request.operationId));
    return op.exists
      ? store.confirm(loaded, store.operation(op, loaded, requestHash(method, request)))
      : null;
  }
  async function verifySource(tx, loaded, source, native, frames = []) {
    for (const proof of source.proofs) await proof.verify(tx);
    for (const observation of native) await observation.verify(tx, loaded);
    for (const verify of frames) await verify(tx, loaded);
  }
  async function replayAfterFailure(uid, request, error, method = action) {
    let replay = null;
    try {
      replay = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
        return resolved(tx, loaded, request, method);
      });
    } catch {
      /* Preserve the original failure. */
    }
    if (replay) return replay;
    throw error;
  }
  async function advance(uid, input) {
    authorize(uid);
    const request = Object.freeze(mutationInput(input));
    const initial = await store.db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
        replay = await resolved(tx, loaded, request);
      if (replay) return { replay };
      available(loaded, request);
      await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing');
      const pending = loaded.job.staging.storagePending
        ? await intent(tx, loaded, loaded.job.staging.storageAssetId)
        : null;
      if (pending) {
        const v = checkedStorageIntent(loaded, pending, loaded.job.staging.storageAssetId);
        if (v.state !== 'reserved' || v.sourceIndex + 1 !== loaded.job.staging.storageIndex)
          inconsistent();
      }
      return { loaded, pending };
    });
    if (initial.replay) return initial.replay;
    const first = initial.loaded.job.staging.phase === 'image-bytes-ready',
      preparedStaging = first
        ? {
            ...initial.loaded.job.staging,
            phase: 'image-storage',
            storageIndex: initial.loaded.job.staging.itemIndex,
            storageBindings: 0,
            storageIntents: 0,
            storagePrepared: 0,
            storageFenced: 0,
            storagePending: false,
            storageAssetId: null,
            storageFenceAfter: null,
          }
        : structuredClone(initial.loaded.job.staging);
    let source,
      native,
      frames = [],
      storage = null;
    try {
      const reader = await createVerifiedAdventureRestoreContent({
          db: store.db,
          uid,
          restoreId: request.restoreId,
          jobToken: request.jobToken,
        }),
        mapper = createAdventureRestoreRemapper({
          schemaVersion: 1,
          jobToken: request.jobToken,
          sourceAdventureId: reader.sourceAdventureId,
          adventureId: reader.adventureId,
        }),
        index = initial.pending
          ? initial.pending.data.sourceIndex - 1
          : preparedStaging.storageIndex;
      if (index >= reader.itemCount) inconsistent();
      source = await readImageStorageSource(reader, mapper, index);
      native = await store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken);
        available(loaded, request);
        assertAdventureValidationPin(loaded, initial.loaded);
        return observeImageStorageSource(store, tx, loaded, source);
      });
      if (initial.pending) {
        if (
          !source.asset ||
          digest(initial.pending.data.asset) !== digest(source.asset) ||
          digest(initial.pending.data.binding) !== digest(source.value)
        )
          inconsistent();
        if (typeof assets?.stage !== 'function' || typeof assets?.verify !== 'function')
          restoreFail('failed-precondition', 'image-storage-unavailable');
        const image = await readPreparedImageBuffer(store, initial.loaded, source.asset, (loaded) =>
          available(loaded, request),
        );
        frames = image.proofs;
        const replay = await store.db.runTransaction(async (tx) => {
          const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
            result = await resolved(tx, loaded, request);
          if (result) return result;
          available(loaded, request);
          await initial.pending.verify(tx, loaded);
          await verifySource(tx, loaded, source, native, frames);
          return null;
        });
        if (replay) return replay;
        storage = bookRestoreStorageProof(
          await assets.stage(
            adventureImageStorageContext(initial.loaded, source.asset),
            image.bytes,
          ),
        );
        await assets.verify(adventureImageStorageContext(initial.loaded, source.asset), storage);
      } else if (source.unit.record.kind === 'adventure-images') {
        if (
          source.value.bindings !== preparedStaging.storageBindings ||
          source.value.assets !== preparedStaging.storagePrepared ||
          source.value.bytes !== preparedStaging.imageBytes ||
          preparedStaging.storageIntents !== preparedStaging.imageAssets ||
          preparedStaging.storageIndex + 1 !== reader.itemCount
        )
          inconsistent();
        preparedStaging.phase = 'image-storage-ready';
        preparedStaging.storageIndex++;
      }
    } catch (error) {
      return replayAfterFailure(uid, request, error);
    }
    return store.db.runTransaction(async (tx) => {
      // Firestore may retry this callback before either concurrent request commits.
      const staging = structuredClone(preparedStaging);
      const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
        replay = await resolved(tx, loaded, request);
      if (replay) return replay;
      available(loaded, request);
      assertAdventureValidationPin(loaded, initial.loaded);
      await readAdventureRestorePersonaBatch(store, tx, loaded, 'preparing');
      await verifySource(tx, loaded, source, native, frames);
      const writes = [];
      if (initial.pending) {
        await initial.pending.verify(tx, loaded);
        staging.storagePending = false;
        staging.storageAssetId = null;
        staging.storagePrepared = sum(staging.storagePrepared, 1);
        writes.push({
          address: imageStorageAddress(source.asset.assetId),
          mode: 'update',
          update: (old) => {
            if (digest(old) !== digest(initial.pending.data)) inconsistent();
            return { ...old, state: 'prepared', storage };
          },
        });
      } else if (source.unit.record.kind !== 'adventure-images') {
        staging.storageBindings = sum(staging.storageBindings, 1);
        staging.storageIndex++;
        if (source.asset) {
          const id = source.asset.assetId;
          staging.storageIntents = sum(staging.storageIntents, 1);
          staging.storagePending = true;
          staging.storageAssetId = id;
          staging.storageIndex++;
          writes.push({
            address: imageStorageAddress(id),
            value: {
              schemaVersion: 1,
              ownerId: uid,
              kind: 'adventure-restore-image-storage',
              sourceIndex: staging.storageIndex - 1,
              asset: source.asset,
              binding: source.value,
              state: 'reserved',
              storage: null,
              fence: null,
            },
          });
        }
      }
      const artifacts = await prepareAdventureStageArtifacts(
          store,
          tx,
          loaded,
          request.operationId,
          writes,
          digest({
            source: source.proofs.map((p) => p.sourceToken),
            native: native.map((p) => p.token),
            storage,
          }),
        ),
        next = { ...staging, artifactCount: sum(staging.artifactCount, artifacts.count) },
        record = store.next(loaded, request, action, { staging: next });
      artifacts.commit();
      return store.commit(tx, loaded, request, action, record, artifacts.effects);
    });
  }
  async function prepareCleanup(tx, loaded, request) {
    if (!imageStoragePhase(loaded.job.staging ?? {})) return null;
    if (!loaded.job.staging.personaLibraryRevoked) inconsistent();
    let query = store.db
      .collection(loaded.ref.path + '/preparedRoot')
      .where('kind', '==', 'adventure-restore-image-storage')
      .select()
      .orderBy('__name__')
      .limit(1);
    if (loaded.job.staging.storageFenceAfter !== null)
      query = query.startAfter(loaded.job.staging.storageFenceAfter);
    const page = await tx.get(query);
    if (!page.docs.length) {
      if (loaded.job.staging.storageFenced !== loaded.job.staging.storageIntents) inconsistent();
      return null;
    }
    const snap = page.docs[0],
      id = snap.id.slice('image-storage-'.length),
      observed = await intent(tx, loaded, id),
      value = checkedStorageIntent(loaded, observed, id);
    if (
      !['reserved', 'prepared'].includes(value.state) ||
      nativeToken(snap) !==
        nativeToken(await tx.get(store.db.doc(loaded.ref.path + '/preparedRoot/' + snap.id)))
    )
      inconsistent();
    if (typeof assets?.fence !== 'function')
      restoreFail('failed-precondition', 'image-storage-unavailable');
    return { loaded, observed, value, id, request };
  }
  async function finishCleanup(uid, request, plan) {
    const method = 'advanceAdventureRestoreCleanup';
    let fence;
    try {
      fence = bookRestoreStorageProof(
        await assets.fence(
          adventureImageStorageContext(plan.loaded, plan.value.asset),
          plan.value.storage,
        ),
      );
    } catch (error) {
      return replayAfterFailure(uid, request, error, method);
    }
    return store.db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
        replay = await resolved(tx, loaded, request, method);
      if (replay) return replay;
      if (
        loaded.job.state !== 'cancelling' ||
        loaded.job.checkpoint !== request.expectedCheckpoint ||
        !loaded.job.staging.personaLibraryRevoked
      )
        restoreFail('failed-precondition', 'state-conflict');
      await plan.observed.verify(tx, loaded);
      const staging = {
        ...loaded.job.staging,
        storageFenced: sum(loaded.job.staging.storageFenced, 1),
        storageFenceAfter: 'image-storage-' + plan.id,
      };
      if (staging.storageAssetId === plan.id) {
        staging.storagePending = false;
        staging.storageAssetId = null;
      }
      const artifacts = await prepareAdventureStageArtifacts(
          store,
          tx,
          loaded,
          request.operationId,
          [
            {
              address: imageStorageAddress(plan.id),
              mode: 'update',
              update: (old) => {
                if (digest(old) !== digest(plan.value)) inconsistent();
                return { ...old, state: 'fenced', fence };
              },
            },
          ],
          digest({ domain: 'adventure-image-fence-v1', intent: plan.observed.token, fence }),
        ),
        record = store.next(loaded, request, method, { staging });
      if (artifacts.count !== 0) inconsistent();
      artifacts.commit();
      return store.commit(tx, loaded, request, method, record, artifacts.effects);
    });
  }
  return { advance, prepareCleanup, finishCleanup };
}
