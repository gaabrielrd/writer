import {
  closed,
  inconsistent,
  nativeToken,
  bornEqual,
  born,
  updated,
  digest,
  compareStamp,
} from './adventureRestoreContracts.mjs';
import {
  readAdventureRestoreValidationSnapshot,
  ADVENTURE_VALIDATION_SNAPSHOT_BYTES,
} from './adventureRestoreValidationStep.mjs';
export const validationFrames = (state) => state.parser?.container.records ?? 0;
export function assertAdventureValidationPin(current, initial) {
  if (
    current.uid !== initial.uid ||
    current.id !== initial.id ||
    current.view.jobToken !== initial.view.jobToken ||
    nativeToken(current.snapshot) !== nativeToken(initial.snapshot)
  )
    inconsistent();
}
export async function readAdventureValidationState(store, tx, loaded) {
  const meta = loaded.job.validation,
    pointer = meta?.snapshot;
  if (!pointer || !meta.stateCreated || meta.cleanedState) inconsistent();
  const ref = store.db.doc(loaded.ref.path + '/validationState/current'),
    snapshot = await tx.get(ref),
    value = snapshot.data();
  if (!snapshot.exists || snapshot.id !== 'current') inconsistent();
  closed(value, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'createdByOperationId',
    'updatedByOperationId',
    'checkpoint',
    'stateJSON',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== loaded.uid ||
    value.restoreId !== loaded.id ||
    value.jobToken !== loaded.view.jobToken ||
    value.createdByOperationId !== pointer.birthOperationId ||
    value.updatedByOperationId !== pointer.operationId ||
    value.checkpoint !== pointer.checkpoint ||
    digest(value) !== pointer.hash ||
    typeof value.stateJSON !== 'string' ||
    Buffer.byteLength(value.stateJSON) > ADVENTURE_VALIDATION_SNAPSHOT_BYTES
  )
    inconsistent();
  const first = await tx.get(store.refs.op(loaded.uid, pointer.birthOperationId)),
    last =
      first.id === pointer.operationId
        ? first
        : await tx.get(store.refs.op(loaded.uid, pointer.operationId));
  if (
    !first.exists ||
    !last.exists ||
    !bornEqual(first, snapshot) ||
    digest(born(last)) !== digest(updated(snapshot)) ||
    compareStamp(born(first), born(last)) > 0
  )
    inconsistent();
  const a = store.operation(first, loaded),
    b = store.operation(last, loaded);
  if (
    a.action !== 'advanceAdventureRestoreValidation' ||
    b.action !== a.action ||
    a.checkpoint > b.checkpoint ||
    b.checkpoint !== pointer.checkpoint ||
    !first.data().effects.some((e) => e.collection === 'validationState' && e.id === 'current') ||
    !last
      .data()
      .effects.some(
        (e) => e.collection === 'validationState' && e.id === 'current' && e.hash === digest(value),
      )
  )
    inconsistent();
  let state;
  try {
    state = readAdventureRestoreValidationSnapshot(JSON.parse(value.stateJSON));
    if (JSON.stringify(state) !== value.stateJSON) inconsistent();
  } catch {
    inconsistent();
  }
  if (
    state.items !== meta.items ||
    validationFrames(state) !== meta.frames ||
    state.sourceSize !== loaded.job.source.byteLength ||
    (meta.phase === 'frames' && state.phase !== 'frames') ||
    (meta.phase === 'semantic' && state.phase !== 'semantic') ||
    (['recheck', 'verified'].includes(meta.phase) && state.phase !== 'done')
  )
    inconsistent();
  return { ref, snapshot, value, state };
}
