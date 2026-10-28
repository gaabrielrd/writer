import {
  closed,
  inconsistent,
  digest,
  born,
  updated,
  immutable,
  bornEqual,
  compareStamp,
  restoreId,
  restoreHash,
} from './adventureRestoreContracts.mjs';
import {
  mediaIdentity,
  mediaFingerprint,
  initialMediaControl,
  validateMediaControl,
  validateMediaOutcome,
  mediaView,
  MEDIA_ACTION,
} from './adventureRestoreMediaContracts.mjs';
export function createAdventureRestoreMediaStore(store) {
  const controlRef = (l) => store.db.doc(l.ref.path + '/activationMedia/current'),
    outcomeRef = (l, id) => store.db.doc(l.ref.path + '/activationMediaItems/' + id),
    opRef = (l, id) => store.db.doc('users/' + l.uid + '/adventureRestoreMediaOperations/' + id);
  function operation(snapshot, loaded, request = null) {
    if (!snapshot.exists) inconsistent();
    immutable(snapshot);
    const v = closed(snapshot.data(), [
      'schemaVersion',
      'ownerId',
      'restoreId',
      'jobToken',
      'operationId',
      'action',
      'requestHash',
      'control',
      'assetId',
      'outcomeHash',
    ]);
    restoreId(v.operationId);
    const c = validateMediaControl(v.control, loaded),
      expected = {
        restoreId: loaded.id,
        jobToken: loaded.view.jobToken,
        operationId: snapshot.id,
        expectedCheckpoint: c.checkpoint - 1,
      };
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== loaded.uid ||
      v.restoreId !== loaded.id ||
      v.jobToken !== loaded.view.jobToken ||
      v.operationId !== snapshot.id ||
      v.action !== MEDIA_ACTION ||
      v.requestHash !== mediaFingerprint(expected) ||
      c.checkpoint < 1 ||
      c.lastOperationId !== snapshot.id ||
      (request && v.requestHash !== mediaFingerprint(request)) ||
      compareStamp(born(snapshot), updated(loaded.snapshot)) <= 0
    )
      inconsistent();
    if (c.complete) {
      if (v.assetId !== null || v.outcomeHash !== null) inconsistent();
    } else {
      restoreHash(v.assetId);
      restoreHash(v.outcomeHash);
      if (c.cursor !== 'image-storage-' + v.assetId) inconsistent();
    }
    return v;
  }
  async function readOutcome(tx, loaded, op, record) {
    if (record.assetId === null) return null;
    const snapshot = await tx.get(outcomeRef(loaded, record.assetId));
    if (!snapshot.exists) inconsistent();
    immutable(snapshot);
    const outcome = validateMediaOutcome(snapshot.data(), loaded),
      c = record.control;
    if (
      !bornEqual(snapshot, op) ||
      outcome.assetId !== record.assetId ||
      outcome.operationId !== op.id ||
      outcome.checkpoint !== c.checkpoint ||
      outcome.completedAt !== c.updatedAt ||
      digest(outcome) !== record.outcomeHash
    )
      inconsistent();
    return outcome;
  }
  async function load(tx, loaded) {
    const ref = controlRef(loaded),
      snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      const [items, ops] = await Promise.all([
        tx.get(
          store.db
            .collection(loaded.ref.path + '/activationMediaItems')
            .select()
            .limit(1),
        ),
        tx.get(
          store.db
            .collection('users/' + loaded.uid + '/adventureRestoreMediaOperations')
            .where('restoreId', '==', loaded.id)
            .select()
            .limit(1),
        ),
      ]);
      if (items.docs.length || ops.docs.length) inconsistent();
      return { ref, snapshot, value: initialMediaControl(loaded) };
    }
    const value = validateMediaControl(snapshot.data(), loaded);
    if (value.checkpoint < 1) inconsistent();
    const first = await tx.get(opRef(loaded, value.firstOperationId)),
      last =
        first.id === value.lastOperationId
          ? first
          : await tx.get(opRef(loaded, value.lastOperationId)),
      a = operation(first, loaded),
      b = operation(last, loaded);
    await readOutcome(tx, loaded, first, a);
    if (last.id !== first.id) await readOutcome(tx, loaded, last, b);
    if (
      !bornEqual(snapshot, first) ||
      digest(updated(snapshot)) !== digest(born(last)) ||
      compareStamp(born(first), born(last)) > 0 ||
      a.control.checkpoint !== 1 ||
      a.control.firstOperationId !== first.id ||
      value.firstOperationId !== b.control.firstOperationId ||
      digest(b.control) !== digest(value)
    )
      inconsistent();
    return { ref, snapshot, value };
  }
  async function replay(tx, loaded, current, request) {
    const op = await tx.get(opRef(loaded, request.operationId));
    if (!op.exists) return null;
    const record = operation(op, loaded, request),
      c = record.control;
    if (
      !current.snapshot.exists ||
      c.checkpoint > current.value.checkpoint ||
      c.firstOperationId !== current.value.firstOperationId ||
      ['processed', 'ready', 'unavailable'].some((k) => c[k] > current.value[k])
    )
      inconsistent();
    const outcome = await readOutcome(tx, loaded, op, record);
    return {
      schemaVersion: 1,
      kind: 'confirmed',
      receipt: {
        operationId: op.id,
        action: MEDIA_ACTION,
        checkpoint: c.checkpoint,
        assetId: outcome?.assetId ?? null,
        imageId: outcome?.imageId ?? null,
        state: outcome?.state ?? 'complete',
        completedAt: c.updatedAt,
      },
      media: mediaView(current.value),
    };
  }
  function commit(tx, loaded, current, request, next, pending, storage, accepted) {
    const outcome = pending
      ? validateMediaOutcome(
          {
            ...mediaIdentity(loaded),
            operationId: request.operationId,
            checkpoint: next.checkpoint,
            assetId: pending.assetId,
            imageId: pending.imageId,
            state: pending.unavailable ? 'unavailable' : 'ready',
            sourceProof: pending.sourceProof,
            storageProof: storage,
            urlHash: accepted ? digest(accepted.url) : null,
            completedAt: next.updatedAt,
          },
          loaded,
        )
      : null;
    if (pending && !pending.unavailable)
      tx.update(pending.imageRef, {
        state: 'active',
        url: accepted.url,
        restoreStorage: { ...pending.image.data().restoreStorage, publishedProof: storage },
      });
    if (outcome) tx.create(outcomeRef(loaded, pending.assetId), outcome);
    if (current.snapshot.exists) tx.update(current.ref, next);
    else tx.create(current.ref, next);
    tx.create(opRef(loaded, request.operationId), {
      schemaVersion: 1,
      ownerId: loaded.uid,
      restoreId: loaded.id,
      jobToken: loaded.view.jobToken,
      operationId: request.operationId,
      action: MEDIA_ACTION,
      requestHash: mediaFingerprint(request),
      control: next,
      assetId: pending?.assetId ?? null,
      outcomeHash: outcome ? digest(outcome) : null,
    });
    return {
      schemaVersion: 1,
      kind: 'confirmed',
      receipt: {
        operationId: request.operationId,
        action: MEDIA_ACTION,
        checkpoint: next.checkpoint,
        assetId: pending?.assetId ?? null,
        imageId: pending?.imageId ?? null,
        state: outcome?.state ?? 'complete',
        completedAt: next.updatedAt,
      },
      media: mediaView(next),
    };
  }
  return { load, replay, commit };
}
