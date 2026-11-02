import { validateBookBackupUniverseOrigin } from './bookBackupUniverse.mjs';
export function validateBookRestoreUniverseSelection(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    !['schemaVersion', 'itemIndex', 'origin', 'observed'].every((key) =>
      Object.hasOwn(value, key),
    ) ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.itemIndex) ||
    value.itemIndex < 0
  )
    throw new TypeError('Seleção de universo inválida.');
  const origin = validateBookBackupUniverseOrigin(value.origin);
  if (
    !['none', 'available', 'unavailable'].includes(value.observed) ||
    (origin.kind === 'none') !== (value.observed === 'none') ||
    (value.observed === 'available' && origin.kind !== 'reference')
  )
    throw new TypeError('Observação de universo inválida.');
  return { schemaVersion: 1, itemIndex: value.itemIndex, origin, observed: value.observed };
}
