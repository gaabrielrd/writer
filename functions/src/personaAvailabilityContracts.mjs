const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const closed = (v, keys) =>
  object(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(v);
const owner = (v) =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 128 &&
  v.isWellFormed() &&
  !v.includes('/') &&
  !v.includes('\\') &&
  !['.', '..'].includes(v) &&
  ![...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
export function parsePersonaRestoreOrigin(value) {
  if (
    !(
      (closed(value, ['schemaVersion', 'bookId', 'restoreId', 'jobToken']) &&
        value.schemaVersion === 1 &&
        typeof value.bookId === 'string' &&
        /^restore-[a-f0-9]{64}$/.test(value.bookId)) ||
      (closed(value, ['schemaVersion', 'target', 'restoreId', 'jobToken']) &&
        value.schemaVersion === 2 &&
        closed(value.target, ['kind', 'id']) &&
        value.target.kind === 'adventure' &&
        typeof value.target.id === 'string' &&
        /^restore-a-[a-f0-9]{64}$/.test(value.target.id))
    ) ||
    !id(value.restoreId) ||
    typeof value.jobToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.jobToken)
  )
    throw new TypeError('Origem de persona restaurada inválida.');
  return value.schemaVersion === 1 ? { ...value } : { ...value, target: { ...value.target } };
}
export function personaRestoreProjectId(value) {
  const origin = parsePersonaRestoreOrigin(value);
  return origin.schemaVersion === 1 ? origin.bookId : origin.target.id;
}
export function projectPersonaRestoreOrigin(record) {
  if (!object(record)) throw new TypeError('Registro de persona inválido.');
  if (!Object.hasOwn(record, 'restoreOrigin')) return null;
  if (typeof record.id !== 'string' || !/^custom-[a-f0-9]{64}$/.test(record.id))
    throw new TypeError('Identidade de persona restaurada inválida.');
  return parsePersonaRestoreOrigin(record.restoreOrigin);
}
export function projectPersonaRestoreBatch(value) {
  const keys = [
    'schemaVersion',
    'ownerId',
    value?.schemaVersion === 2 ? 'target' : 'bookId',
    'restoreId',
    'jobToken',
    'state',
    'profileCount',
    'createdByOperationId',
    'lastOperationId',
  ];
  if (
    !closed(value, keys) ||
    ![1, 2].includes(value.schemaVersion) ||
    !owner(value.ownerId) ||
    !['preparing', 'active', 'cancelled'].includes(value.state) ||
    !Number.isSafeInteger(value.profileCount) ||
    value.profileCount < 0 ||
    !id(value.createdByOperationId) ||
    !id(value.lastOperationId)
  )
    throw new TypeError('Lote de personas inválido.');
  const origin = parsePersonaRestoreOrigin({
    schemaVersion: value.schemaVersion,
    ...(value.schemaVersion === 1 ? { bookId: value.bookId } : { target: value.target }),
    restoreId: value.restoreId,
    jobToken: value.jobToken,
  });
  return { ...value, ...origin };
}
export function isPersonaRestoreBatchAvailable(ownerId, value, batch) {
  if (value === null) return true;
  try {
    const o = parsePersonaRestoreOrigin(value),
      b = projectPersonaRestoreBatch(batch);
    return (
      owner(ownerId) &&
      b.ownerId === ownerId &&
      b.schemaVersion === o.schemaVersion &&
      (b.schemaVersion === 1 ? b.bookId : b.target.id) === personaRestoreProjectId(o) &&
      b.restoreId === o.restoreId &&
      b.jobToken === o.jobToken &&
      b.state === 'active'
    );
  } catch {
    return false;
  }
}
