import { projectPortablePersonaProfile as projectBookBackupPersona } from './portablePersonaProfile.mjs';
export { projectBookBackupPersona };
import { encodeBookBackupJSON } from './bookBackupStructure.mjs';
export const BOOK_PERSONA_SCOPES = Object.freeze(['book', 'chapter', 'scene-source']);
export function serializeBookBackupPersona(scope, ownerId, personaId, profile) {
  return encodeBookBackupJSON({
    schemaVersion: 1,
    scope,
    ownerId,
    personaId,
    profile: projectBookBackupPersona(profile),
  });
}
