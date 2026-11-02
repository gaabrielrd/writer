function closed(value, keys) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key)),
  );
}
export function validatePortableUniverseOrigin(value) {
  if (closed(value, ['kind']) && value.kind === 'none') return { kind: 'none' };
  if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id))
    throw new TypeError('Origem de universo inválida.');
  if (closed(value, ['kind', 'id']) && value.kind === 'unavailable')
    return { kind: 'unavailable', id: value.id };
  const created = value.created;
  if (
    !closed(value, ['kind', 'id', 'created']) ||
    value.kind !== 'reference' ||
    !closed(created, ['seconds', 'nanoseconds']) ||
    !Number.isSafeInteger(created.seconds) ||
    created.seconds < 0 ||
    !Number.isInteger(created.nanoseconds) ||
    created.nanoseconds < 0 ||
    created.nanoseconds >= 1e9
  )
    throw new TypeError('Identidade de universo inválida.');
  return {
    kind: 'reference',
    id: value.id,
    created: { seconds: created.seconds, nanoseconds: created.nanoseconds },
  };
}
