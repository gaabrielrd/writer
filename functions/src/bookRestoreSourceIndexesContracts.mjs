export function validateBookRestoreSourceIndexes(value) {
  const keys = ['schemaVersion', 'scanned', 'backfilled', 'after', 'complete'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.scanned) ||
    value.scanned < 0 ||
    !Number.isSafeInteger(value.backfilled) ||
    value.backfilled < 0 ||
    value.backfilled > value.scanned ||
    typeof value.complete !== 'boolean' ||
    (value.scanned === 0
      ? value.after !== null
      : typeof value.after !== 'string' || !/^restore-[a-f0-9]{64}$/.test(value.after))
  )
    throw new TypeError('Progresso dos índices das fontes inválido.');
  return { ...value };
}
