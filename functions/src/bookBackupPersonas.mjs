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
  const strings = [
    result.id,
    result.name,
    result.description,
    result.instructions,
    ...result.traits.flatMap((trait) => [
      trait.id,
      trait.name,
      trait.description,
      trait.low,
      trait.high,
    ]),
  ];
  if (!Number.isSafeInteger(result.revision) || strings.some((value) => !value.isWellFormed()))
    throw new TypeError('Snapshot de persona não pode ser representado sem perda.');
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
