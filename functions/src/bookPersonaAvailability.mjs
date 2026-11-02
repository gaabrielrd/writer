/** Portable absence metadata only. It never resolves or authorizes a profile. */
export function readBookPersonaAvailability(value) {
  if (value === undefined) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    !['schemaVersion', 'personaId', 'reason'].every((k) => Object.hasOwn(value, k)) ||
    value.schemaVersion !== 1 ||
    typeof value.personaId !== 'string' ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(value.personaId) ||
    !['profile-not-recorded', 'legacy-overrides'].includes(value.reason)
  )
    throw new TypeError('Disponibilidade de persona inválida.');
  return { schemaVersion: 1, personaId: value.personaId, reason: value.reason };
}
export function currentBookPersonaAvailability(value, personaId) {
  const marker = readBookPersonaAvailability(value);
  return marker && marker.personaId === personaId ? marker : null;
}
