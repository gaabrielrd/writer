import { GenerationError } from './generationError.mjs';
export const campaignRestoreReservationPath = (cid) => 'campaignRestoreReservations/' + cid;
export const RESTORE_RESERVATION_FIELDS = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'startFingerprint',
  'kind',
];
export async function assertCampaignRestoreNotReserved(tx, db, uid, cid) {
  const ref = db.doc(campaignRestoreReservationPath(cid));
  const snap =
    typeof tx.getAll === 'function'
      ? (await tx.getAll(ref, { fieldMask: RESTORE_RESERVATION_FIELDS }))[0]
      : await tx.get(ref);
  if (snap.exists) {
    const e = new GenerationError(
      'failed-precondition',
      'Identificador reservado para uma restauração.',
    );
    e.details = { reason: 'campaign-restore-reserved' };
    throw e;
  }
}
