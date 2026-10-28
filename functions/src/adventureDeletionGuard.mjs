import { GenerationError } from './generation.mjs';
export const adventureReservationPath = (adventureId) =>
  'adventureDeletionReservations/' + adventureId;
export const adventureDeletionReservationFields = Object.freeze([
  'schemaVersion',
  'ownerId',
  'adventureId',
  'adventureToken',
  'deletionId',
  'state',
  'createdAt',
  'updatedAt',
]);
const nativeId = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  Buffer.byteLength(value, 'utf8') <= 1500 &&
  !value.includes('/') &&
  !['.', '..'].includes(value);
const invalid = () => {
  throw new GenerationError('failed-precondition', 'A reserva da aventura está inconsistente.');
};
export const isAdventureDeletionError = (error) =>
  ['adventure-deleting', 'adventure-deleted'].includes(error?.details?.reason);
export async function readAdventureDeletionReservation(tx, db, adventureId) {
  if (!nativeId(adventureId))
    throw new GenerationError('invalid-argument', 'Identidade de aventura inválida.');
  const ref = db.doc(adventureReservationPath(adventureId));
  const snap =
    typeof tx.getAll === 'function'
      ? (await tx.getAll(ref, { fieldMask: [...adventureDeletionReservationFields] }))[0]
      : await tx.get(ref);
  if (!snap.exists) return { ref, record: null };
  const record = snap.data();
  if (
    !record ||
    record.schemaVersion !== 1 ||
    record.adventureId !== adventureId ||
    !nativeId(record.ownerId) ||
    !nativeId(record.deletionId) ||
    typeof record.adventureToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.adventureToken) ||
    !['deleting', 'deleted'].includes(record.state) ||
    ![record.createdAt, record.updatedAt].every(
      (v) => Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000000,
    ) ||
    record.updatedAt < record.createdAt
  )
    invalid();
  return { ref, record };
}
export function deletedAdventureError(record, uid) {
  if (record.ownerId !== uid) throw new GenerationError('not-found', 'Aventura indisponível.');
  const error = new GenerationError(
    'failed-precondition',
    'Esta aventura foi reservada para exclusão.',
  );
  error.details = {
    reason: record.state === 'deleted' ? 'adventure-deleted' : 'adventure-deleting',
    adventureId: record.adventureId,
    deletionId: record.deletionId,
  };
  throw error;
}
export async function assertAdventureNotDeleted(tx, db, uid, adventureId) {
  const { record } = await readAdventureDeletionReservation(tx, db, adventureId);
  if (record) deletedAdventureError(record, uid);
}
export async function assertAdventureControlNotDeleted(tx, db, uid, ref) {
  const snap =
    typeof tx.getAll === 'function'
      ? (await tx.getAll(ref, { fieldMask: ['ownerId', 'adventureId'] }))[0]
      : await tx.get(ref);
  const control = snap.data();
  if (control?.ownerId === uid && typeof control.adventureId === 'string')
    await assertAdventureNotDeleted(tx, db, uid, control.adventureId);
}
