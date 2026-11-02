import { closed, integer } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { loreGenerationStorage } from './bookLoreGenerationContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { editReservationConflict as conflict } from './bookLoreEditReservationContracts.mjs';
export function adoptionPrivacy(p) {
  closed(p, ['present', 'value']);
  if (
    typeof p.present !== 'boolean' ||
    (p.present ? typeof p.value !== 'boolean' : p.value !== null)
  )
    conflict();
  return p;
}
export function editAdoption(a, generationId) {
  closed(a, [
    'schemaVersion',
    'operationId',
    'generationRevision',
    'storage',
    'timestamp',
    'localLoreVersion',
    'publicationPrivacyVersion',
    'revoked',
    'privacy',
  ]);
  if (a.schemaVersion !== 1 || a.generationRevision !== 1 || typeof a.revoked !== 'boolean')
    conflict();
  bookContentId(a.operationId);
  integer(a.timestamp);
  integer(a.localLoreVersion, 1);
  integer(a.publicationPrivacyVersion);
  if (!Number.isFinite(new Date(a.timestamp).getTime())) conflict();
  const s = loreGenerationStorage(a.storage);
  if (s.schemaVersion !== 2 || s.generationId !== generationId || s.dates.updatedAt !== a.timestamp)
    conflict();
  closed(a.privacy, ['before', 'after']);
  adoptionPrivacy(a.privacy.before);
  adoptionPrivacy(a.privacy.after);
  if (
    a.revoked !==
    (a.privacy.before.present &&
      a.privacy.before.value === true &&
      !(a.privacy.after.present && a.privacy.after.value === true))
  )
    conflict();
  return a;
}
export const editAdoptionView = (a) => ({
  operationId: a.operationId,
  timestamp: a.timestamp,
  localLoreVersion: a.localLoreVersion,
  publicationPrivacyVersion: a.publicationPrivacyVersion,
  revoked: a.revoked,
  storageHash: digest(a.storage),
});
