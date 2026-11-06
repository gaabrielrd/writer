// Pure policy: the author's publication unit, never a publication or execution grant.
export const LITERARY_PUBLICATION_UNITS = Object.freeze(['chapter', 'act', 'book']);
export function normalizeLiteraryPublicationPolicy(value) {
  if (value === undefined) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !['version', 'unit', 'requirePreviousPublication'].includes(key),
    ) ||
    !Object.hasOwn(value, 'version') ||
    !Object.hasOwn(value, 'unit') ||
    value.version !== 1 ||
    !LITERARY_PUBLICATION_UNITS.includes(value.unit) ||
    (Object.hasOwn(value, 'requirePreviousPublication') &&
      typeof value.requirePreviousPublication !== 'boolean') ||
    (value.unit === 'book' && value.requirePreviousPublication === true)
  )
    throw new TypeError('Unidade de publicação inválida.');
  return {
    version: 1,
    unit: value.unit,
    ...(Object.hasOwn(value, 'requirePreviousPublication')
      ? { requirePreviousPublication: value.requirePreviousPublication }
      : {}),
  };
}
