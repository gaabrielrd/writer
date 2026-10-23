export const BOOK_RESTORE_HISTORY_HASH = 'sha256/hash-wasm@4.12.0';
const closed = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const integer = (v, min = 0) => Number.isSafeInteger(v) && v >= min;
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function validateBookRestoreRawPosition(value) {
  if (
    !closed(value, [
      'schemaVersion',
      'size',
      'offset',
      'records',
      'payloadBytes',
      'previous',
      'done',
    ]) ||
    value.schemaVersion !== 1 ||
    !integer(value.size, 16) ||
    !integer(value.offset, 16) ||
    value.offset > value.size ||
    !integer(value.records) ||
    value.records > 0xffffffff ||
    !integer(value.payloadBytes) ||
    !hash(value.previous) ||
    value.done !== false
  )
    throw new TypeError('Invalid private raw position.');
  return structuredClone(value);
}
export function validateBookRestoreHistory(value) {
  if (
    !closed(value, [
      'schemaVersion',
      'startIndex',
      'versions',
      'byteLength',
      'sourceChunks',
      'bodyCount',
      'pending',
    ]) ||
    value.schemaVersion !== 1 ||
    ['startIndex', 'versions', 'byteLength', 'sourceChunks', 'bodyCount'].some(
      (k) => !integer(value[k]),
    ) ||
    value.versions > value.sourceChunks ||
    value.versions > value.bodyCount
  )
    throw new TypeError('Invalid private history progress.');
  const p = value.pending;
  if (p !== null) {
    if (
      !closed(p, ['id', 'part', 'bytes', 'chunkCount', 'algorithm', 'hashState', 'cursor']) ||
      typeof p.id !== 'string' ||
      !/^restore-[a-f0-9]{64}$/.test(p.id) ||
      !integer(p.part, 1) ||
      !integer(p.bytes, 1) ||
      !integer(p.chunkCount, p.part) ||
      p.algorithm !== BOOK_RESTORE_HISTORY_HASH ||
      typeof p.hashState !== 'string' ||
      p.hashState.length > 1024 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(p.hashState)
    )
      throw new TypeError('Invalid pending history version.');
    validateBookRestoreRawPosition(p.cursor);
  }
  return structuredClone(value);
}
