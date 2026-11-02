import {
  closed,
  inconsistent,
  immutable,
  born,
  updated,
  bornEqual,
  compareStamp,
  digest,
} from './adventureRestoreContracts.mjs';
import {
  ARCHIVE_ACTION,
  validateArchive,
  archiveFingerprint,
  archiveHistory,
  archiveView,
} from './adventureRestoreArchiveContracts.mjs';
export function createAdventureRestoreArchiveStore(store) {
  const opRef = (l, id) =>
    store.db.doc('users/' + l.uid + '/adventureRestoreArchiveOperations/' + id);
  function operation(snapshot, loaded, media, request = null) {
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
      'progress',
    ]);
    const p = validateArchive(v.progress, loaded, media),
      original = {
        restoreId: loaded.id,
        jobToken: loaded.view.jobToken,
        operationId: snapshot.id,
        expectedCheckpoint: p.checkpoint - 1,
      };
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== loaded.uid ||
      v.restoreId !== loaded.id ||
      v.jobToken !== loaded.view.jobToken ||
      v.operationId !== snapshot.id ||
      v.action !== ARCHIVE_ACTION ||
      p.checkpoint < 1 ||
      p.lastOperationId !== snapshot.id ||
      v.requestHash !== archiveFingerprint(original) ||
      (request && v.requestHash !== archiveFingerprint(request)) ||
      compareStamp(born(snapshot), updated(media.snapshot)) <= 0
    )
      inconsistent();
    return v;
  }
  async function load(tx, loaded, media) {
    const ref = store.db.doc(loaded.ref.path + '/archiveCleanup/current'),
      snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      const orphan = await tx.get(
        store.db
          .collection('users/' + loaded.uid + '/adventureRestoreArchiveOperations')
          .where('restoreId', '==', loaded.id)
          .select()
          .limit(1),
      );
      if (orphan.docs.length) inconsistent();
      return { ref, snapshot, value: null };
    }
    if (!media.value.complete) inconsistent();
    const value = validateArchive(snapshot.data(), loaded, media);
    if (value.checkpoint < 1) inconsistent();
    const first = await tx.get(opRef(loaded, value.firstOperationId)),
      last =
        first.id === value.lastOperationId
          ? first
          : await tx.get(opRef(loaded, value.lastOperationId)),
      a = operation(first, loaded, media),
      b = operation(last, loaded, media);
    if (
      !bornEqual(snapshot, first) ||
      digest(updated(snapshot)) !== digest(born(last)) ||
      compareStamp(born(first), born(last)) > 0 ||
      a.progress.checkpoint !== 1 ||
      a.progress.firstOperationId !== first.id ||
      digest(b.progress) !== digest(value)
    )
      inconsistent();
    archiveHistory(a.progress, value);
    return { ref, snapshot, value };
  }
  async function replay(tx, l, media, control, request) {
    const snap = await tx.get(opRef(l, request.operationId));
    if (!snap.exists) return null;
    if (!control.value) inconsistent();
    const op = operation(snap, l, media, request);
    archiveHistory(op.progress, control.value);
    return {
      schemaVersion: 1,
      kind: 'confirmed',
      receipt: structuredClone(op.progress),
      progress: archiveView(control.value, true),
    };
  }
  function commit(tx, l, control, request, value) {
    if (control.value) tx.update(control.ref, value);
    else tx.create(control.ref, value);
    tx.create(opRef(l, request.operationId), {
      schemaVersion: 1,
      ownerId: l.uid,
      restoreId: l.id,
      jobToken: l.view.jobToken,
      operationId: request.operationId,
      action: ARCHIVE_ACTION,
      requestHash: archiveFingerprint(request),
      progress: value,
    });
    return {
      schemaVersion: 1,
      kind: 'confirmed',
      receipt: structuredClone(value),
      progress: structuredClone(value),
    };
  }
  return { load, replay, commit };
}
