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
function origin(value) {
  if (
    !closed(value, ['schemaVersion', 'bookId', 'restoreId', 'jobToken']) ||
    value.schemaVersion !== 1 ||
    typeof value.bookId !== 'string' ||
    !/^restore-[a-f0-9]{64}$/.test(value.bookId) ||
    !id(value.restoreId) ||
    typeof value.jobToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.jobToken)
  )
    throw new TypeError('Origem de persona restaurada inválida.');
  return { ...value };
}
export function projectPersonaRestoreOrigin(record) {
  if (!object(record)) throw new TypeError('Registro de persona inválido.');
  if (!Object.hasOwn(record, 'restoreOrigin')) return null;
  if (typeof record.id !== 'string' || !/^custom-[a-f0-9]{64}$/.test(record.id))
    throw new TypeError('Identidade de persona restaurada inválida.');
  return origin(record.restoreOrigin);
}
export function projectPersonaRestoreBatch(value) {
  const keys = [
    'schemaVersion',
    'ownerId',
    'bookId',
    'restoreId',
    'jobToken',
    'state',
    'profileCount',
    'createdByOperationId',
    'lastOperationId',
  ];
  if (
    !closed(value, keys) ||
    value.schemaVersion !== 1 ||
    !owner(value.ownerId) ||
    !['preparing', 'active', 'cancelled'].includes(value.state) ||
    !Number.isSafeInteger(value.profileCount) ||
    value.profileCount < 0 ||
    !id(value.createdByOperationId) ||
    !id(value.lastOperationId)
  )
    throw new TypeError('Lote de personas inválido.');
  origin({
    schemaVersion: value.schemaVersion,
    bookId: value.bookId,
    restoreId: value.restoreId,
    jobToken: value.jobToken,
  });
  return { ...value };
}
export function isPersonaRestoreBatchAvailable(ownerId, value, batch) {
  if (value === null) return true;
  try {
    const o = origin(value),
      b = projectPersonaRestoreBatch(batch);
    return (
      owner(ownerId) &&
      b.ownerId === ownerId &&
      b.bookId === o.bookId &&
      b.restoreId === o.restoreId &&
      b.jobToken === o.jobToken &&
      b.state === 'active'
    );
  } catch {
    return false;
  }
}
