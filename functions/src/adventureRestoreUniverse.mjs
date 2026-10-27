import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail,
  inconsistent,
  digest,
  nativeToken,
  sum,
} from './adventureRestoreContracts.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
import { createVerifiedAdventureRestoreContent } from './adventureRestoreContentRead.mjs';
import {
  adventureStageArtifactId,
  readAdventureStageArtifact,
  prepareAdventureStageArtifacts,
} from './adventureRestoreArtifacts.mjs';
import { inspectPortableRestoreUniverse } from './portableUniverseRestore.mjs';
import { validatePortableUniverseOrigin } from './portableUniverseOrigin.mjs';
import { prepareUniverseProjectLink } from './universes.mjs';

async function inspectUniverse(tx, db, uid, origin) {
  try {
    return await inspectPortableRestoreUniverse(tx, db, uid, origin);
  } catch (error) {
    if (error instanceof TypeError) inconsistent();
    throw error;
  }
}
const address = (id) => ({ scope: 'job', path: ['preparedRoot', id] });
async function prepared(store, tx, loaded, id) {
  return readAdventureStageArtifact(
    store,
    tx,
    loaded,
    await tx.get(
      store.db.doc(loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address(id))),
    ),
    { withValue: true },
  );
}
function original(loaded, root, item) {
  if (
    typeof item?.verify !== 'function' ||
    item.index !== loaded.job.staging.historyStartIndex ||
    item.record?.kind !== 'adventure-universe' ||
    item.record.id !== root.sourceAdventureId ||
    root.schemaVersion !== 1 ||
    root.kind !== 'adventure-restore-definition' ||
    root.ownerId !== loaded.uid ||
    root.value.id !== loaded.job.adventureId
  )
    inconsistent();
  try {
    return validatePortableUniverseOrigin(item.value.origin);
  } catch {
    inconsistent();
  }
}
function candidateValue(origin, index, observed) {
  return { schemaVersion: 1, origin, pendingAuthorization: false, itemIndex: index, observed };
}
/** Reauthorize in the activation transaction. Use the returned universeId on its root and commit together. */
export async function prepareAdventureRestoreUniverseLink(tx, store, loaded, item) {
  authorize(loaded?.uid);
  if (
    loaded.job?.state !== 'content-verified' ||
    typeof item?.verify !== 'function' ||
    !Object.hasOwn(loaded.job.staging ?? {}, 'universeOutcome') ||
    loaded.ref?.path !== 'users/' + loaded.uid + '/adventureRestores/' + loaded.id
  )
    inconsistent();
  const snapshot = await tx.get(loaded.ref);
  if (
    !snapshot.exists ||
    digest(snapshot.data()) !== digest(loaded.job) ||
    nativeToken(snapshot) !== nativeToken(loaded.snapshot)
  )
    inconsistent();
  await item.verify(tx);
  const root = await prepared(store, tx, loaded, 'current'),
    candidate = await prepared(store, tx, loaded, 'universe-candidate'),
    origin = original(loaded, root.data, item),
    observed = loaded.job.staging.universeOutcome;
  if (
    candidate.value.sourceToken !== item.sourceToken ||
    digest(candidate.data) !==
      digest(candidateValue(origin, loaded.job.staging.historyStartIndex, observed)) ||
    (origin.kind === 'none') !== (observed === 'none') ||
    (observed === 'available' && origin.kind !== 'reference') ||
    (root.data.value.universeId ?? null) !== (observed === 'available' ? origin.id : null)
  )
    inconsistent();
  const inspected = await inspectUniverse(tx, store.db, loaded.uid, origin),
    plan =
      inspected.universeId === null
        ? { commit() {} }
        : await prepareUniverseProjectLink(
            tx,
            store.db,
            loaded.uid,
            { kind: 'adventure', id: loaded.job.adventureId },
            null,
            inspected.universeId,
            store.now,
            { strict: true },
          );
  return { ...inspected, commit: plan.commit };
}

export function createAdventureRestoreUniverseService(store) {
  const action = 'advanceAdventureRestoreUniverse';
  function available(loaded, request) {
    if (
      loaded.job.state !== 'content-verified' ||
      loaded.job.staging?.phase !== 'draft-ready' ||
      loaded.job.checkpoint !== request.expectedCheckpoint
    )
      restoreFail('failed-precondition', 'state-conflict');
  }
  return {
    async advanceAdventureRestoreUniverse(uid, input) {
      authorize(uid);
      const request = Object.freeze(mutationInput(input)),
        fingerprint = requestHash(action, request),
        initial = await store.db.runTransaction(async (tx) => {
          const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
            op = await tx.get(store.refs.op(uid, request.operationId));
          if (op.exists)
            return { replay: store.confirm(loaded, store.operation(op, loaded, fingerprint)) };
          available(loaded, request);
          return { loaded };
        });
      if (initial.replay) return initial.replay;
      let item;
      try {
        const reader = await createVerifiedAdventureRestoreContent({
          db: store.db,
          uid,
          restoreId: request.restoreId,
          jobToken: request.jobToken,
        });
        item = await reader.readItem(initial.loaded.job.staging.historyStartIndex);
      } catch (error) {
        let replay = null;
        try {
          replay = await store.db.runTransaction(async (tx) => {
            const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
              op = await tx.get(store.refs.op(uid, request.operationId));
            return op.exists
              ? store.confirm(loaded, store.operation(op, loaded, fingerprint))
              : null;
          });
        } catch {
          /* Preserve the original preparation error. */
        }
        if (replay) return replay;
        throw error;
      }
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(store.refs.op(uid, request.operationId));
        if (op.exists) return store.confirm(loaded, store.operation(op, loaded, fingerprint));
        available(loaded, request);
        assertAdventureValidationPin(loaded, initial.loaded);
        await item.verify(tx);
        const root = await prepared(store, tx, loaded, 'current'),
          candidate = await prepared(store, tx, loaded, 'universe-candidate'),
          origin = original(loaded, root.data, item);
        if (
          digest(candidate.data) !==
          digest({
            schemaVersion: 1,
            origin,
            pendingAuthorization: true,
          })
        )
          inconsistent();
        const inspected = await inspectUniverse(tx, store.db, uid, origin),
          writes = [
            {
              address: address('universe-candidate'),
              mode: 'update',
              update: () =>
                candidateValue(origin, loaded.job.staging.historyStartIndex, inspected.observed),
            },
            {
              address: address('current'),
              mode: 'update',
              update: () => ({
                ...root.data,
                value: { ...root.data.value, universeId: inspected.universeId },
              }),
            },
          ],
          artifacts = await prepareAdventureStageArtifacts(
            store,
            tx,
            loaded,
            request.operationId,
            writes,
            item.sourceToken,
          ),
          staging = {
            ...loaded.job.staging,
            phase: 'universe-ready',
            universeOutcome: inspected.observed,
            artifactCount: sum(loaded.job.staging.artifactCount, artifacts.count),
          },
          record = store.next(loaded, request, action, { staging });
        artifacts.commit();
        return store.commit(tx, loaded, request, action, record, artifacts.effects);
      });
    },
  };
}
