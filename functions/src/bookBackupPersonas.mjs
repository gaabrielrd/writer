import { validatePersona } from './personaProfile.mjs';
import { encodeBookBackupJSON } from './bookBackupStructure.mjs';
export const BOOK_PERSONA_SCOPES = Object.freeze(['book', 'chapter', 'scene-source']);
const pick = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
export function projectBookBackupPersona(value) {
  const result = {
    ...pick(value, [
      'id',
      'schemaVersion',
      'name',
      'description',
      'instructions',
      'revision',
      'archived',
      'createdAt',
      'updatedAt',
    ]),
    traits: value.traits.map((trait) =>
      pick(trait, ['id', 'name', 'description', 'low', 'high', 'value']),
    ),
  };
  validatePersona(result);
  return result;
}
export function serializeBookBackupPersona(scope, ownerId, personaId, profile) {
  return encodeBookBackupJSON({
    schemaVersion: 1,
    scope,
    ownerId,
    personaId,
    profile: projectBookBackupPersona(profile),
  });
}
