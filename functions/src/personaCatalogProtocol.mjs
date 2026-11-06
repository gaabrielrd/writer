// Shared browser/server metadata contract. No database, credentials or profiles.
export function normalizePersonaCatalogState(value) {
  if (value === null) return { schemaVersion: 1, revision: 0 };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== 2 ||
    !['schemaVersion', 'revision'].every(
      (key) =>
        Object.hasOwn(value, key) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'),
    ) ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  )
    throw new TypeError(
      'O controle da biblioteca de personas é inválido. Preserve os dados antes de tentar novamente.',
    );
  return { schemaVersion: 1, revision: value.revision };
}
export function nextPersonaCatalogState(value) {
  const current = normalizePersonaCatalogState(value),
    revision = current.revision + 1;
  if (!Number.isSafeInteger(revision))
    throw new TypeError('O limite de revisão da biblioteca de personas foi atingido.');
  return { schemaVersion: 1, revision };
}
