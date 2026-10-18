import { GenerationError } from './generation.mjs';

export const campaignReservationPath = (campaignId) => `campaignDeletionReservations/${campaignId}`;
export const reservationFields = [
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'deletionId',
  'state',
  'createdAt',
  'updatedAt',
];
export const isCampaignDeletionError = (error) =>
  ['campaign-deleting', 'campaign-deleted'].includes(error?.details?.reason);
const bad = () => {
  throw new GenerationError('failed-precondition', 'A reserva da campanha está inconsistente.');
};
export async function readCampaignDeletionReservation(tx, db, campaignId) {
  const ref = db.doc(campaignReservationPath(campaignId));
  const snap =
    typeof tx.getAll === 'function'
      ? (await tx.getAll(ref, { fieldMask: reservationFields }))[0]
      : await tx.get(ref);
  const record = snap.data();
  if (
    record &&
    (record.schemaVersion !== 1 ||
      record.campaignId !== campaignId ||
      typeof record.ownerId !== 'string' ||
      !record.ownerId ||
      !/^[a-f0-9]{64}$/.test(record.campaignToken) ||
      typeof record.deletionId !== 'string' ||
      !record.deletionId ||
      record.deletionId.includes('/') ||
      ![record.createdAt, record.updatedAt].every(
        (v) => Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000000,
      ) ||
      record.updatedAt < record.createdAt ||
      !['deleting', 'deleted'].includes(record.state))
  )
    bad();
  return { ref, record };
}
export function deletedCampaignError(record, uid) {
  if (record.ownerId !== uid) throw new GenerationError('not-found', 'Campanha indisponível.');
  const reason = record.state === 'deleted' ? 'campaign-deleted' : 'campaign-deleting';
  const error = new GenerationError(
    'failed-precondition',
    'Esta campanha foi reservada para exclusão.',
  );
  error.details = { reason, campaignId: record.campaignId, deletionId: record.deletionId };
  throw error;
}
export async function assertCampaignNotDeleted(tx, db, uid, campaignId) {
  const { record } = await readCampaignDeletionReservation(tx, db, campaignId);
  if (record) deletedCampaignError(record, uid);
}
// Job-only APIs first discover their own routing through a metadata projection.
export async function assertCampaignControlNotDeleted(tx, db, uid, ref) {
  const snap =
    typeof tx.getAll === 'function'
      ? (await tx.getAll(ref, { fieldMask: ['ownerId', 'campaignId'] }))[0]
      : await tx.get(ref);
  const control = snap.data();
  if (control?.ownerId === uid && typeof control.campaignId === 'string')
    await assertCampaignNotDeleted(tx, db, uid, control.campaignId);
}
