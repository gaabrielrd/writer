export function validateBookRestorePersonaLibrary(value) {
  const keys = ['schemaVersion', 'installed', 'after', 'revoked'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.installed) ||
    value.installed < 0 ||
    typeof value.revoked !== 'boolean' ||
    (value.installed === 0
      ? value.after !== null
      : typeof value.after !== 'string' || !/^custom-[a-f0-9]{64}$/.test(value.after))
  )
    throw new TypeError('Progresso da biblioteca restaurada inválido.');
  return { ...value };
}
