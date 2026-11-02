import { projectBookBackupPersona } from './bookBackupPersonas.mjs';
import { encodeBookBackupJSON } from './bookBackupStructure.mjs';
export const BOOK_DRAFT_PROFILE_BYTES = 262144;
export function encodeBookBackupDraftPersona(value) {
  const profile = projectBookBackupPersona(value),
    encoded = encodeBookBackupJSON(profile);
  if (encoded.bytes.length > BOOK_DRAFT_PROFILE_BYTES)
    throw new RangeError('Perfil excede o contrato do rascunho.');
  return { profile, ...encoded };
}
